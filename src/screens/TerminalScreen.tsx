import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  TextInput,
  useWindowDimensions,
  Modal,
  Alert,
  AccessibilityInfo,
  PanResponder,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, MudLine, GestureConfig, GestureType } from '../types';
import { TelnetService } from '../services/telnetService';
import { parseAnsi } from '../utils/ansiParser';
import { AnsiText } from '../components/AnsiText';
import { MiniMap } from '../components/MiniMap';
import { VitalBars } from '../components/VitalBars';
import { ButtonGrid, GRID_COLS, GRID_ROWS } from '../components/ButtonGrid';
import { ButtonEditModal } from '../components/ButtonEditModal';
import { RoomSearchResults } from '../components/RoomSearchResults';
import { loadSettings } from '../storage/settingsStorage';
import { MapService, MapRoom } from '../services/mapService';
import { ButtonLayout, createDefaultLayout, createBlindModeLayout, loadLayout, saveLayout, loadServerLayout, saveServerLayout } from '../storage/layoutStorage';
import { loadServers, saveServers } from '../storage/serverStorage';
import { blindModeService } from '../services/blindModeService';
import { playerStatsService } from '../services/playerStatsService';
import { soundConfigService } from '../services/soundConfigService';
import { NORMAL_MODE, BLIND_MODE } from '../config/gridConfig';
import { BlindChannelModal, ChannelMessage, nextMsgId } from '../components/BlindChannelModal';
import { loadChannelAliases, saveChannelAliases } from '../storage/channelStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'Terminal'>;

const MAX_LINES = 2000;
let lineIdCounter = 0;

export function TerminalScreen({ route, navigation }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { server: initialServer } = route.params;

  const [server, setServer] = useState(initialServer);
  const [lines, setLines] = useState<MudLine[]>([]);
  const [inputText, setInputText] = useState('');
  const [connected, setConnected] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [mapVisible, setMapVisible] = useState(true);
  const [currentRoom, setCurrentRoom] = useState<MapRoom | null>(null);
  const [nearbyRooms, setNearbyRooms] = useState<MapRoom[]>([]);
  const [hp, setHp] = useState(0);
  const [hpMax, setHpMax] = useState(0);
  const [energy, setEnergy] = useState(0);
  const [energyMax, setEnergyMax] = useState(0);
  const [searchResults, setSearchResults] = useState<MapRoom[]>([]);
  const [searchVisible, setSearchVisible] = useState(false);
  const [walking, setWalking] = useState(false);
  const [fontSize, setFontSize] = useState(14);
  const [uiMode, setUiMode] = useState<'completo' | 'blind'>('completo');
  const [encoding, setEncoding] = useState('utf8');
  const [buttonLayout, setButtonLayout] = useState<ButtonLayout | null>(null);
  const [editButtonVisible, setEditButtonVisible] = useState(false);
  const [editButtonCol, setEditButtonCol] = useState(0);
  const [editButtonRow, setEditButtonRow] = useState(0);
  const [moveMode, setMoveMode] = useState(false);
  const [sourceCol, setSourceCol] = useState(0);
  const [sourceRow, setSourceRow] = useState(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [locateFeedback, setLocateFeedback] = useState<'success' | 'failed' | null>(null);
  const [statFeedback, setStatFeedback] = useState<{ type: string; message: string } | null>(null);
  const [silentModeEnabled, setSilentModeEnabled] = useState(false);
  const [loginFailed, setLoginFailed] = useState(false);
  const [channels, setChannels] = useState<string[]>([]);
  const [channelMessages, setChannelMessages] = useState<ChannelMessage[]>([]);
  const [channelAliases, setChannelAliases] = useState<Record<string, string>>({});
  const [blindChannelModalVisible, setBlindChannelModalVisible] = useState(false);
  const [playerXP, setPlayerXP] = useState(0);
  const [roomEnemies, setRoomEnemies] = useState('');
  const [roomAllies, setRoomAllies] = useState('');
  const [hpHistory, setHpHistory] = useState<{ delta: number; label: string }[]>([]);
  const [currentBlindPanel, setCurrentBlindPanel] = useState(1);

  const fontSizeRef = useRef(14);
  const telnetRef = useRef<TelnetService | null>(null);
  const linesRef = useRef<MudLine[]>([]);
  const isCapturingAliasRef = useRef(false);
  const aliasBufferRef = useRef<string[]>([]);
  const aliasTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const walkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const walkPathRef = useRef<string[]>([]);
  const walkStepRef = useRef(0);
  const walkActiveRef = useRef(false);
  const isAtBottomRef = useRef(true);
  const flatListRef = useRef<FlatList<MudLine>>(null);
  const lastLineBlankRef = useRef(false);
  const recentLinesRef = useRef<string[]>([]);
  const intentionalLocateRef = useRef(false);
  const waitingForIrsalaAfterLocateRef = useRef(false);
  const autoLoginRef = useRef(false);
  const textInputRef = useRef<TextInput>(null);
  const lastSentChannelTime = useRef(0);
  const silentModeEnabledRef = useRef(false);
  const gesturesEnabledRef = useRef(false);
  const gesturesRef = useRef<GestureConfig[]>([]);
  const lastTapRef = useRef(0);
  const pinchStartDistanceRef = useRef(0);
  const pinchAngleRef = useRef(0);
  const pinchActiveRef = useRef(false);
  const twoFingersStartRef = useRef({ x: 0, y: 0 });
  const twoFingersActiveRef = useRef(false);
  const twoFingersMovedRef = useRef(false);
  const scrollStartRef = useRef({ y: 0, offset: 0 });
  const scrollVelocityRef = useRef(0);
  const scrollMomentumRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentScrollOffsetRef = useRef(0);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const settings = await loadSettings();
        soundConfigService.setSettings(settings);
        if (settings.fontSize) {
          setFontSize(settings.fontSize);
          fontSizeRef.current = settings.fontSize;
        }
        if (settings.uiMode) {
          setUiMode(settings.uiMode);
        }
        if (settings.encoding) {
          setEncoding(settings.encoding);
        }
        if (settings.gesturesEnabled !== undefined) {
          gesturesEnabledRef.current = settings.gesturesEnabled;
        }
        if (settings.gestures) {
          gesturesRef.current = settings.gestures;
        }
      })();

      // Reset blind mode service history periodically
      const historyResetInterval = setInterval(() => {
        blindModeService.resetHistory();
      }, 60000); // Every minute

      return () => clearInterval(historyResetInterval);
    }, [])
  );


  // Update button "IR" label dynamically in blind mode
  useEffect(() => {
    if (uiMode !== 'blind' || !buttonLayout) return;

    const updatedButtons = buttonLayout.buttons.map((btn) => {
      // Find IR button at col=1, row=0
      if (btn.col === 1 && btn.row === 0 && btn.command === 'irsala') {
        return {
          ...btn,
          label: walking ? 'STOP' : 'IR',
          color: walking ? '#662222' : '#662266', // Red when stopping, purple when moving
        };
      }
      return btn;
    });

    setButtonLayout({ buttons: updatedButtons });
  }, [walking, uiMode]);

  useEffect(() => {
    // Reset auto-login state when server changes
    autoLoginRef.current = false;
    setLoginFailed(false);

    (async () => {
      // Load server-specific button layout from storage
      const serverLayout = await loadServerLayout(server.id);

      let layout: ButtonLayout;

      if (uiMode === 'blind') {
        // In Blind Mode: use createBlindModeLayout as base + merge any server customizations
        const blindLayout = createBlindModeLayout();

        if (serverLayout.buttons.length > 0) {
          // Merge: replace buttons from blindLayout with their customized versions (by position + panel)
          layout = {
            buttons: blindLayout.buttons.map(btn => {
              const custom = serverLayout.buttons.find(c =>
                c.col === btn.col && c.row === btn.row && c.blindPanel === btn.blindPanel
              );
              return custom || btn;
            })
          };
        } else {
          layout = blindLayout;
        }
      } else {
        // Completo mode: use server-specific layout or default
        layout = serverLayout.buttons.length > 0 ? serverLayout : createDefaultLayout();
      }

      // Replace LOGIN_NAME placeholder with actual server name
      const buttons = layout.buttons.map(btn =>
        btn.command === '__LOGIN_NAME__'
          ? { ...btn, command: server.name }
          : btn
      );
      setButtonLayout({ buttons });

      // Load channel aliases for this server
      const aliases = await loadChannelAliases(server.id);
      setChannelAliases(aliases);

      // Load map for locate command
      await mapServiceRef.current.load();
    })();
  }, [server, uiMode]);

  // Process a single line with blind mode filters and add to display
  const processingAndAddLine = (text: string, isChannelMessage: boolean = false) => {
    // Auto-login: Try to log in with saved credentials if available and not yet attempted
    if (!autoLoginRef.current && server.username && server.password) {
      const withoutAnsi = text.replace(/\x1b\[[0-9;]*m/g, '');
      // Detect username prompt: "Introduce el nombre de tu personaje:"
      if (/introduce el nombre de tu personaje/i.test(withoutAnsi)) {
        console.log('[AUTO-LOGIN] Detected username prompt, sending username...');
        autoLoginRef.current = 'waiting-for-password';
        setTimeout(() => {
          console.log('[AUTO-LOGIN] Sending username:', server.username);
          telnetRef.current?.send(server.username!);
        }, 200);
      }
    }

    // Auto-login: After username sent, detect password prompt
    if (autoLoginRef.current === 'waiting-for-password' && server.password && !loginFailed) {
      const withoutAnsi = text.replace(/\x1b\[[0-9;]*m/g, '');
      // Detect password prompt: "Introduce la clave de tu ficha o de tu cuenta:"
      if (/introduce la clave de tu ficha o de tu cuenta/i.test(withoutAnsi)) {
        console.log('[AUTO-LOGIN] Detected password prompt, sending password...');
        autoLoginRef.current = false; // Mark as completed before sending
        setTimeout(() => {
          console.log('[AUTO-LOGIN] Sending password');
          telnetRef.current?.send(server.password!);
        }, 200);
      }
    }

    // Skip lines that don't contain any letters or numbers
    const withoutAnsi = text.replace(/\x1b\[[0-9;]*m/g, '');
    if (!/[a-z0-9]/i.test(withoutAnsi)) return;

    // Skip empty lines if last line was also empty
    const isBlank = text.trim().length === 0;
    if (isBlank) {
      if (lastLineBlankRef.current) return;
      lastLineBlankRef.current = true;
    } else {
      lastLineBlankRef.current = false;
    }

    // Skip lines that are only ">" or whitespace + ">"
    const cleanText = text.trim();
    if (cleanText === '>' || cleanText.endsWith('>')) {
      if (/^\s*>\s*$/.test(text)) return;
    }

    // Skip lines that are only template variables like <VERSION>, <NAME>, etc
    if (/^\s*<[A-Z_]+>\s*$/.test(text)) return;

    // Blind mode: Process with filters
    let displayText = text;
    let shouldAnnounce = false;
    let announcementText = '';
    let soundPath = '';

    if (text.includes('bloqueo')) {
      console.log(`[CHECK] Procesando bloqueo: uiMode=${uiMode}`);
    }

    if (uiMode === 'blind') {
      const result = blindModeService.processLine(text);

      // Skip line if filter says to silence it
      if (!result.shouldDisplay) {
        return;
      }

      displayText = result.modifiedText;

      // Handle announcements from filters
      if (result.announcement) {
        shouldAnnounce = true;
        announcementText = result.announcement;
      }

      // Get sound from filter if present
      if (result.sound) {
        soundPath = result.sound;
      }

      // Sync captured data to React state and playerStatsService
      if ((result as any).capturedData) {
        const captured = (result as any).capturedData;
        const updates: any = {};

        if (captured.playerXP !== undefined) {
          setPlayerXP(captured.playerXP);
          updates.playerXP = captured.playerXP;
        }
        if (captured.roomEnemies !== undefined) {
          setRoomEnemies(captured.roomEnemies);
          updates.roomEnemies = captured.roomEnemies;
        }
        if (captured.roomAllies !== undefined) {
          setRoomAllies(captured.roomAllies);
          updates.roomAllies = captured.roomAllies;
        }

        if (Object.keys(updates).length > 0) {
          playerStatsService.updatePlayerVariables(updates);
        }
      }

      // Sync HP history from blindModeService
      const playerVars = blindModeService.getPlayerVariables();
      if (playerVars.hpHistory.length > 0) {
        setHpHistory(playerVars.hpHistory);
      }
    }

    // Detect player class from common text patterns
    if (!uiMode || uiMode === 'blind') {
      const classPatterns: Record<string, string[]> = {
        guerreros: ['Soldado', 'Lancero', 'Campeón', 'Guerrero'],
        magos: ['Mago', 'Hechicero', 'Brujo'],
        hibridos: ['Paladín', 'Ranger', 'Druida'],
      };

      for (const [className, patterns] of Object.entries(classPatterns)) {
        for (const pattern of patterns) {
          if (text.includes(pattern)) {
            blindModeService.updatePlayerVariables({ playerClass: className });
            break;
          }
        }
      }
    }

    const spans = parseAnsi(displayText);
    const newLine: MudLine = { id: lineIdCounter++, spans };
    linesRef.current.push(newLine);
    if (linesRef.current.length > MAX_LINES) {
      linesRef.current = linesRef.current.slice(-MAX_LINES);
    }
    setLines([...linesRef.current]);

    // Channel messages: always write to terminal, NEVER announce (even if silent mode is off)
    if (isChannelMessage) {
      if (isAtBottomRef.current) {
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 50);
      }
      return;
    }

    // Non-channel messages: Announce filtered content in blind mode (only if silent mode is disabled)
    if (shouldAnnounce && uiMode === 'blind' && !silentModeEnabledRef.current) {
      blindModeService.announceMessage(announcementText, 'normal');
    }

    // Play sound if configured (independent of UI mode)
    console.log(`[ProcessLine] soundPath="${soundPath}", silentMode=${silentModeEnabledRef.current}`);
    if (soundPath) {
      console.log(`[ProcessLine] soundPath exists, checking config...`);
      if (soundConfigService.shouldPlaySound(soundPath)) {
        console.log(`[ProcessLine] Config allows sound, checking silent mode...`);
        if (!silentModeEnabledRef.current) {
          console.log(`[ProcessLine] ✓ Playing sound: "${soundPath}"`);
          blindModeService.playSound(soundPath);
        } else {
          console.log(`[ProcessLine] ✗ Silent mode is ON`);
        }
      } else {
        console.log(`[ProcessLine] ✗ Sound not configured/enabled`);
      }
    } else {
      console.log(`[ProcessLine] ✗ No soundPath`);
    }

    // Read all messages when silent mode is disabled (if not already announced by filters and not a channel)
    if (!silentModeEnabledRef.current && uiMode === 'blind' && !shouldAnnounce && !isChannelMessage) {
      // Only read if it's not already announced by blind mode filters
      const cleanText = displayText.replace(/\x1b\[[0-9;]*m/g, '').trim();
      if (cleanText.length > 0) {
        blindModeService.announceMessage(cleanText, 'low');
      }
    }

    if (isAtBottomRef.current) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 50);
    }
  };

  const addLine = processingAndAddLine;

  const addMultipleLines = (texts: string[]) => {
    texts.forEach(text => {
      processingAndAddLine(text);
    });
  };

  const mapServiceRef = useRef(new MapService());

  useEffect(() => {
    (async () => {
      await mapServiceRef.current.load();
    })();
  }, []);

  useEffect(() => {
    if (lines.length > 0) {
      setTimeout(() => {
        if (isAtBottomRef.current) {
          flatListRef.current?.scrollToEnd({ animated: false });
        }
      }, 200);
    }
  }, [lines.length]);

  // Keep silentModeEnabled ref in sync so processingAndAddLine can read current value
  useEffect(() => {
    silentModeEnabledRef.current = silentModeEnabled;
  }, [silentModeEnabled]);

  useEffect(() => {
    const telnet = new TelnetService(server, {
      onData: (text: string) => {
        if (isCapturingAliasRef.current) {
          aliasBufferRef.current.push(text);
          if (aliasTimerRef.current) clearTimeout(aliasTimerRef.current);
          isCapturingAliasRef.current = false;
          aliasBufferRef.current = [];
        } else {
          // Capture raw lines for locate command
          const lines = text.split('\n');
          for (const line of lines) {
            if (line.trim().length > 0) {
              const clean = line.replace(/\x1b\[[0-9;]*m/g, '').trim();
              recentLinesRef.current.push(clean);
              if (recentLinesRef.current.length > 30) {
                recentLinesRef.current.shift();
              }

              // Check if we're locating and found the room
              if (intentionalLocateRef.current) {
                if (clean.match(/\[.*\]\s*$/)) {
                  let roomName = clean.replace(/^[>\]]\s*/, '');
                  console.log('[LOCATE] Buscando:', roomName);
                  const mapSvc = mapServiceRef.current;
                  if (mapSvc.isLoaded && roomName) {
                    const room = mapSvc.findRoom(roomName);
                    if (room) {
                      console.log('[LOCATE] ✓ Encontrada:', room.n);
                      mapSvc.setCurrentRoom(room.id);
                      setCurrentRoom(room);
                      const nearby = mapSvc.getNearbyRooms(room.x, room.y, room.z, 15);
                      setNearbyRooms(nearby);
                      setLocateFeedback('success');
                      setTimeout(() => setLocateFeedback(null), 2000);

                      // Blind mode: announce location
                      if (uiMode === 'blind') {
                        const exits = Object.keys(room.e || {}).sort().join(', ');
                        AccessibilityInfo.announceForAccessibility(
                          `${room.n}. Salidas: ${exits || 'ninguna'}`
                        );
                      }
                    } else {
                      console.log('[LOCATE] ✗ No encontrada en mapa');
                      setLocateFeedback('failed');
                      setTimeout(() => setLocateFeedback(null), 2000);

                      // Blind mode: announce failure
                      if (uiMode === 'blind') {
                        AccessibilityInfo.announceForAccessibility('No localizado');
                      }
                    }
                    // Deactivate locate after attempting (success or failure)
                    intentionalLocateRef.current = false;
                  }
                }
              }
            }
          }
          addMultipleLines(lines);
        }
      },
      onConnect: () => {
        setConnected(true);
        autoLoginRef.current = false;
        setLoginFailed(false);
        if (uiMode === 'blind') {
          AccessibilityInfo.announceForAccessibility('Conectado');
        }
      },
      onClose: () => {
        setConnected(false);
        autoLoginRef.current = false;
        setLoginFailed(false);
        if (uiMode === 'blind') {
          AccessibilityInfo.announceForAccessibility('Desconectado');
        }
      },
      onError: (err: string) => {
        Alert.alert('Error de conexión', err);
        if (uiMode === 'blind') {
          AccessibilityInfo.announceForAccessibility(`Error: ${err}`);
        }
      },
      onGMCP: (module: string, data: any) => {
        console.log(`[GMCP] ${module}:`, JSON.stringify(data, null, 2));
        if (module === 'Room.Actual') {
          // Don't auto-locate on Room.Actual. Only manual ojear (locate) can trigger localization.
          // Room.Actual is used to sync movement after successful locate via ojear.
          const roomName = typeof data === 'string' ? data : String(data);
          const currentRoom = mapServiceRef.current.getCurrentRoom();
          if (currentRoom) {
            // Already localized: try to verify we're still in a known location
            const room = mapServiceRef.current.findRoom(roomName);
            if (room) {
              mapServiceRef.current.setCurrentRoom(room.id);
              setCurrentRoom(room);
              const nearby = mapServiceRef.current.getNearbyRooms(room.x, room.y, room.z, 15);
              setNearbyRooms(nearby);
            }
          }
          // If not localized yet: ignore Room.Actual, wait for manual ojear
        } else if (module === 'Room.Movimiento') {
          const dir = typeof data === 'string' ? data : String(data);
          const room = mapServiceRef.current.moveByDirection(dir);
          if (room) {
            setCurrentRoom(room);
            const nearby = mapServiceRef.current.getNearbyRooms(room.x, room.y, room.z, 15);
            setNearbyRooms(nearby);

            // Blind mode: announce room change
            if (uiMode === 'blind') {
              const exits = Object.keys(room.e || {}).sort().join(', ');
              AccessibilityInfo.announceForAccessibility(
                `${room.n}. ${exits || 'ninguna'}`
              );
            }
          }
        } else if (module === 'Char.Status' && data && typeof data === 'object') {
          // HP from Char.Status.pvs (current/max)
          if (data.pvs) {
            if (data.pvs.min !== undefined) setHp(data.pvs.min);
            if (data.pvs.max !== undefined) setHpMax(data.pvs.max);
          }
          // Energy from Char.Status.pe (current/max)
          if (data.pe) {
            if (data.pe.min !== undefined) setEnergy(data.pe.min);
            if (data.pe.max !== undefined) setEnergyMax(data.pe.max);
          }
          // Update blind mode service with player stats
          if (data.pvs || data.pe) {
            blindModeService.updatePlayerVariables({
              playerHP: data.pvs?.min || 0,
              playerMaxHP: data.pvs?.max || 0,
              playerEnergy: data.pe?.min || 0,
              playerMaxEnergy: data.pe?.max || 0,
            });
          }
        } else if (module === 'Comm.Vitals') {
          if (data.hp !== undefined) setHp(data.hp);
          if (data.hpMax !== undefined) setHpMax(data.hpMax);
          if (data.hp_max !== undefined) setHpMax(data.hp_max);
          if (data.energy !== undefined) setEnergy(data.energy);
          if (data.energyMax !== undefined) setEnergyMax(data.energyMax);
          if (data.energy_max !== undefined) setEnergyMax(data.energy_max);
          // Update blind mode service with vitals
          blindModeService.updatePlayerVariables({
            playerHP: data.hp || 0,
            playerMaxHP: data.hpMax || data.hp_max || 0,
            playerEnergy: data.energy || 0,
            playerMaxEnergy: data.energyMax || data.energy_max || 0,
          });
        } else if (module === 'Char.Class' && data) {
          // Player class from GMCP
          const playerClass = typeof data === 'string' ? data : String(data);
          blindModeService.updatePlayerVariables({ playerClass });
        } else if (module === 'Comm.Canales' && data && typeof data === 'object') {
          setChannels(Object.keys(data));
        } else if (module === 'Comm.EnciendeCanal' && data?.canal) {
          setChannels(prev => prev.includes(data.canal) ? prev : [...prev, data.canal]);
        } else if (module === 'Comm.ApagaCanal' && data?.canal) {
          setChannels(prev => prev.filter(ch => ch !== data.canal));
        } else if ((module === 'Comm.MensajeCanal' || module === 'Comm.MensajeCanalHistorico') && data?.canal && data?.mensaje) {
          // Mostrar en terminal (todos los modos), pero marcar como canal para que nunca se anuncie
          addLine(data.mensaje, true);

          // Guardar en state para el modal
          setChannelMessages(prev => {
            const updated = [...prev, { id: nextMsgId(), channel: data.canal, spans: parseAnsi(data.mensaje) }];
            return updated.length > 500 ? updated.slice(-500) : updated;
          });

          // Timestamp para evitar eco propio
          lastSentChannelTime.current = Date.now();
        }
      },
    }, encoding);

    telnetRef.current = telnet;
    telnet.connect();

    return () => {
      telnet.disconnect();
    };
  }, [server, uiMode, encoding]);

  const stopWalk = useCallback(() => {
    if (walkTimeoutRef.current) {
      clearTimeout(walkTimeoutRef.current);
      walkTimeoutRef.current = null;
    }
    walkPathRef.current = [];
    walkStepRef.current = 0;
    walkActiveRef.current = false;
    setWalking(false);
  }, []);

  const walkTo = useCallback((targetRoom: MapRoom) => {
    if (walkActiveRef.current) return;
    if (walkTimeoutRef.current) {
      clearTimeout(walkTimeoutRef.current);
      walkTimeoutRef.current = null;
    }

    const mapSvc = mapServiceRef.current;
    const current = mapSvc.getCurrentRoom();
    if (!current) {
      addLine('--- No se conoce tu posición actual. Usa LOC primero ---');
      return;
    }
    const path = mapSvc.findPath(current.id, targetRoom.id);
    if (!path || path.length === 0) {
      addLine('--- No se encuentra camino ---');
      return;
    }

    walkActiveRef.current = true;
    setWalking(true);
    setSearchVisible(false);
    walkPathRef.current = path;
    walkStepRef.current = 0;

    const STEP_DELAY = 1100;
    const processNextStep = () => {
      const step = walkStepRef.current;
      const allPaths = walkPathRef.current;
      if (step < allPaths.length && walkActiveRef.current) {
        if (telnetRef.current) {
          telnetRef.current.send(allPaths[step]);
        }
        walkStepRef.current = step + 1;
        walkTimeoutRef.current = setTimeout(processNextStep, STEP_DELAY);
      } else {
        walkTimeoutRef.current = null;
        walkPathRef.current = [];
        walkStepRef.current = 0;
        walkActiveRef.current = false;
        setWalking(false);
      }
    };
    processNextStep();
  }, []);

  const handleLocate = useCallback(() => {
    if (!telnetRef.current) return;
    recentLinesRef.current = [];
    intentionalLocateRef.current = true;
    telnetRef.current.send('ojear');
  }, []);

  // When locate completes and we're waiting for irsala setup, do it now
  useEffect(() => {
    if (waitingForIrsalaAfterLocateRef.current && currentRoom) {
      waitingForIrsalaAfterLocateRef.current = false;
      setInputText('irsala ');
      setTimeout(() => {
        textInputRef.current?.focus();
      }, 100);
    }
  }, [currentRoom]);

  const handleAddTextButton = useCallback((command: string) => {
    setInputText(command + ' ');
    setTimeout(() => {
      textInputRef.current?.focus();
    }, 100);
  }, []);

  const sendCommand = useCallback((command: string) => {
    if (!telnetRef.current) return;

    // Intercept "parar" or "stop" to stop walking
    if ((command.toLowerCase() === 'parar' || command.toLowerCase() === 'stop') && walking) {
      stopWalk();
      return;
    }

    // Smart IR button in blind mode: locate → irsala flow
    if (uiMode === 'blind' && command.toLowerCase() === 'irsala') {
      if (walking) {
        // If walking, stop
        stopWalk();
        return;
      }

      // If not localized, try to locate first
      if (!currentRoom) {
        waitingForIrsalaAfterLocateRef.current = true;
        handleLocate();
        setCommandHistory([command, ...commandHistory]);
        return;
      }

      // If localized, open input with "irsala " pre-filled (same as completo mode)
      setInputText('irsala ');
      setTimeout(() => {
        textInputRef.current?.focus();
      }, 100);
      setCommandHistory([command, ...commandHistory]);
      return;
    }

    // Intercept irsala command
    const irsalaMatch = command.match(/^irsala\s+(.+)$/i);
    if (irsalaMatch) {
      const query = irsalaMatch[1];
      const mapSvc = mapServiceRef.current;
      if (mapSvc.isLoaded) {
        const results = mapSvc.searchRooms(query);
        if (results.length === 0) {
          addLine(`--- No se encontró ninguna sala con "${query}" ---`);
        } else if (results.length === 1) {
          walkTo(results[0]);
        } else {
          setSearchResults(results);
          setSearchVisible(true);
        }
      }
      setCommandHistory([command, ...commandHistory]);
      return;
    }

    // Intercept LOCATE command
    if (command.toLowerCase() === 'locate') {
      setCommandHistory([command, ...commandHistory]);
      handleLocate();
      return;
    }

    // Intercept stat consultation commands
    const cmdLower = command.toLowerCase();

    if (cmdLower === 'consultar vida') {
      const message = `Vida: ${hp}/${hpMax}`;
      if (uiMode === 'blind') {
        AccessibilityInfo.announceForAccessibility(message);
      } else {
        setStatFeedback({ type: 'vida', message });
        setTimeout(() => setStatFeedback(null), 2000);
      }
      setCommandHistory([command, ...commandHistory]);
      return;
    }

    if (cmdLower === 'consultar energia') {
      const message = `Energía: ${energy}/${energyMax}`;
      if (uiMode === 'blind') {
        AccessibilityInfo.announceForAccessibility(message);
      } else {
        setStatFeedback({ type: 'energia', message });
        setTimeout(() => setStatFeedback(null), 2000);
      }
      setCommandHistory([command, ...commandHistory]);
      return;
    }

    if (cmdLower === 'consultar salidas') {
      const playerVars = blindModeService.getPlayerVariables();
      const exits = playerVars.roomExits || 'ninguna';
      if (uiMode === 'blind') {
        AccessibilityInfo.announceForAccessibility(exits);
      } else {
        setStatFeedback({ type: 'salidas', message: `Salidas: ${exits}` });
        setTimeout(() => setStatFeedback(null), 2000);
      }
      setCommandHistory([command, ...commandHistory]);
      return;
    }

    if (cmdLower === 'xp') {
      const playerVars = blindModeService.getPlayerVariables();
      const xpMessage = `XP: ${playerVars.playerXP}`;
      if (uiMode === 'blind') {
        AccessibilityInfo.announceForAccessibility(String(playerVars.playerXP));
      } else {
        setStatFeedback({ type: 'xp', message: xpMessage });
        setTimeout(() => setStatFeedback(null), 2000);
      }
      setCommandHistory([command, ...commandHistory]);
      return;
    }

    if (cmdLower === 'ultimo daño') {
      const playerVars = blindModeService.getPlayerVariables();
      const damageMessage = playerVars.hpHistory.length > 0 ? playerVars.hpHistory[playerVars.hpHistory.length - 1].label : 'Sin registro';
      if (uiMode === 'blind') {
        if (playerVars.hpHistory.length > 0) {
          const last = playerVars.hpHistory[playerVars.hpHistory.length - 1];
          AccessibilityInfo.announceForAccessibility(last.label);
        }
      } else {
        setStatFeedback({ type: 'daño', message: damageMessage });
        setTimeout(() => setStatFeedback(null), 2000);
      }
      setCommandHistory([command, ...commandHistory]);
      return;
    }

    if (cmdLower === 'enemigos') {
      const playerVars = blindModeService.getPlayerVariables();
      const enemiesMessage = playerVars.roomEnemies || 'ninguno';
      if (uiMode === 'blind') {
        AccessibilityInfo.announceForAccessibility(enemiesMessage);
      } else {
        setStatFeedback({ type: 'enemigos', message: `Enemigos: ${enemiesMessage}` });
        setTimeout(() => setStatFeedback(null), 2000);
      }
      setCommandHistory([command, ...commandHistory]);
      return;
    }

    // Handle panel switch in blind mode
    if (command === '__SWITCH_PANEL__') {
      const nextPanel = currentBlindPanel === 1 ? 2 : 1;
      setCurrentBlindPanel(nextPanel);
      AccessibilityInfo.announceForAccessibility(`Panel ${nextPanel}`);
      return;
    }

    if (connected) {
      telnetRef.current.send(command);
      setCommandHistory([command, ...commandHistory]);
    }

    // Cancel walk if any other command is sent
    if (walking) {
      stopWalk();
      addLine('--- Movimiento cancelado ---');
    }
  }, [connected, commandHistory, walking, stopWalk, walkTo, handleLocate, addLine, hp, hpMax, energy, energyMax, uiMode, currentBlindPanel]);

  const handleSendInput = () => {
    if (inputText.trim()) {
      sendCommand(inputText);
      setInputText('');
    }
  };

  const handleEditButton = (col: number, row: number) => {
    // Don't allow editing fixed buttons (like SWITCH and IR)
    // In blind mode, filter by current panel
    const button = buttonLayout?.buttons.find(b => {
      if (b.col !== col || b.row !== row) return false;
      if (uiMode === 'blind') {
        return !b.blindPanel || b.blindPanel === currentBlindPanel;
      }
      return true;
    });
    if (button?.fixed) {
      return;
    }
    setEditButtonCol(col);
    setEditButtonRow(row);
    setEditButtonVisible(true);
  };

  const handleSaveEditButton = async (btn: any) => {
    if (!buttonLayout) return;

    try {
      // In horizontal mode, swap coordinates to match storage
      let storageCol = editButtonCol;
      let storageRow = editButtonRow;
      if (isHorizontal) {
        storageCol = editButtonRow;
        storageRow = editButtonCol;
      }

      const updated = buttonLayout.buttons.filter(b => {
        // In blind mode, also check blindPanel to avoid removing buttons from other panels
        if (uiMode === 'blind') {
          return !(b.col === storageCol && b.row === storageRow && b.blindPanel === currentBlindPanel);
        }
        return !(b.col === storageCol && b.row === storageRow);
      });
      if (btn.label && btn.label !== '—') {
        // Ensure blindPanel is preserved when saving
        if (uiMode === 'blind') {
          btn.blindPanel = currentBlindPanel;
        }
        updated.push(btn);
      }

      const newLayout = { buttons: updated };
      setButtonLayout(newLayout);

      // Save to server-specific storage without updating server state (avoids reconnection)
      await saveServerLayout(server.id, newLayout);

      setEditButtonVisible(false);
    } catch (error) {
      console.error('Error al guardar botón:', error);
    }
  };

  const handleDeleteButton = async () => {
    if (!buttonLayout) return;

    // In horizontal mode, swap coordinates to match storage
    let storageCol = editButtonCol;
    let storageRow = editButtonRow;
    if (isHorizontal) {
      storageCol = editButtonRow;
      storageRow = editButtonCol;
    }

    const updated = buttonLayout.buttons.filter(
      b => !(b.col === storageCol && b.row === storageRow)
    );

    const newLayout = { buttons: updated };
    setButtonLayout(newLayout);

    const updatedServer = {
      ...server,
      buttonLayout: newLayout,
    };
    setServer(updatedServer);

    const servers = await loadServers();
    const index = servers.findIndex(s => s.id === server.id);
    if (index >= 0) {
      servers[index] = updatedServer;
      await saveServers(servers);
    }

    setEditButtonVisible(false);
  };

  const handleMoveButton = () => {
    setSourceCol(editButtonCol);
    setSourceRow(editButtonRow);
    setMoveMode(true);
    setEditButtonVisible(false);
  };

  const handleSwapButtons = async (targetCol: number, targetRow: number) => {
    if (moveMode && buttonLayout) {
      const findButton = (col: number, row: number) => {
        return buttonLayout.buttons.find(b => {
          if (b.col !== col || b.row !== row) return false;
          if (uiMode === 'blind') {
            return !b.blindPanel || b.blindPanel === currentBlindPanel;
          }
          return true;
        });
      };

      const sourceBtn = findButton(sourceCol, sourceRow);
      const targetBtn = findButton(targetCol, targetRow);

      const updated = buttonLayout.buttons.map(b => {
        // In blind mode, only swap buttons from the same panel
        if (uiMode === 'blind' && b.blindPanel !== currentBlindPanel) {
          return b;
        }
        if (b.col === sourceCol && b.row === sourceRow) {
          return { ...b, col: targetCol, row: targetRow };
        }
        if (b.col === targetCol && b.row === targetRow) {
          return { ...b, col: sourceCol, row: sourceRow };
        }
        return b;
      });

      const newLayout = { buttons: updated };
      setButtonLayout(newLayout);

      // Save to server-specific storage without updating server state (avoids reconnection)
      await saveServerLayout(server.id, newLayout);

      setMoveMode(false);
    }
  };

  const handleFlatListScroll = (event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    currentScrollOffsetRef.current = contentOffset.y;
    const isAtEnd = contentOffset.y >= contentSize.height - layoutMeasurement.height - 50;
    isAtBottomRef.current = isAtEnd;
    setIsAtBottom(isAtEnd);
    setShowScrollToBottom(!isAtEnd && lines.length > 0);
  };

  const handleScrollToBottom = () => {
    isAtBottomRef.current = true;
    setIsAtBottom(true);
    setShowScrollToBottom(false);
    flatListRef.current?.scrollToEnd({ animated: true });
  };

  const handleScrollToTop = () => {
    flatListRef.current?.scrollToIndex({ index: 0, animated: true });
  };

  const handleUpArrow = () => {
    if (historyIndex < commandHistory.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setInputText(commandHistory[newIndex]);
    }
  };

  const handleDownArrow = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setInputText(commandHistory[newIndex]);
    } else if (historyIndex === 0) {
      setHistoryIndex(-1);
      setInputText('');
    }
  };

  const detectSwipeDirection = (dx: number, dy: number): string => {
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const a = (angle + 360) % 360;

    if (a >= 337.5 || a < 22.5) return 'swipe_right';
    if (a >= 22.5 && a < 67.5) return 'swipe_down_right';
    if (a >= 67.5 && a < 112.5) return 'swipe_down';
    if (a >= 112.5 && a < 157.5) return 'swipe_down_left';
    if (a >= 157.5 && a < 202.5) return 'swipe_left';
    if (a >= 202.5 && a < 247.5) return 'swipe_up_left';
    if (a >= 247.5 && a < 292.5) return 'swipe_up';
    return 'swipe_up_right';
  };

  const triggerGesture = (type: GestureType) => {
    if (!gesturesEnabledRef.current || uiMode !== 'completo') return;
    const gesture = gesturesRef.current.find(g => g.type === type && g.enabled);
    if (!gesture || !gesture.command) return;

    if (gesture.opensKeyboard) {
      setInputText(gesture.command);
      setTimeout(() => textInputRef.current?.focus(), 100);
    } else {
      telnetRef.current?.send(gesture.command);
    }
  };

  const handleDoubleTap = (touchCount: number) => {
    if (!gesturesEnabledRef.current || uiMode !== 'completo' || touchCount !== 1) {
      lastTapRef.current = 0;
      return;
    }
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      triggerGesture('doubletap');
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  };

  const applyScrollMomentum = useCallback((velocity: number) => {
    if (scrollMomentumRef.current) clearInterval(scrollMomentumRef.current);
    let currentVelocity = velocity;
    const friction = 0.95;

    scrollMomentumRef.current = setInterval(() => {
      if (Math.abs(currentVelocity) < 0.5) {
        if (scrollMomentumRef.current) clearInterval(scrollMomentumRef.current);
        return;
      }

      flatListRef.current?.scrollToOffset({
        offset: scrollStartRef.current.offset + currentVelocity,
        animated: false,
      });
      scrollStartRef.current.offset += currentVelocity;
      currentVelocity *= friction;
    }, 16);
  }, []);

  const terminalPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      if (scrollMomentumRef.current) clearInterval(scrollMomentumRef.current);
      scrollStartRef.current = {
        y: evt.nativeEvent.pageY,
        offset: currentScrollOffsetRef.current,
      };
    },
    onMoveShouldSetPanResponder: (_, gs) => {
      if (uiMode !== 'completo') return false;
      const isHorizontal = Math.abs(gs.dx) > Math.abs(gs.dy) && Math.abs(gs.dx) > 30;
      const isFastVertical = Math.abs(gs.dy) > Math.abs(gs.dx) && Math.abs(gs.vy) > 0.8 && Math.abs(gs.dy) > 50;
      const isSlowVertical = Math.abs(gs.dy) > Math.abs(gs.dx) && Math.abs(gs.dy) > 10;
      return isHorizontal || isFastVertical || isSlowVertical;
    },
    onPanResponderMove: (_, gs) => {
      if (uiMode !== 'completo') return;
      const isSlowVertical = Math.abs(gs.dy) > Math.abs(gs.dx) && Math.abs(gs.dy) > 10;
      if (isSlowVertical && Math.abs(gs.vy) < 0.5) {
        flatListRef.current?.scrollToOffset({
          offset: scrollStartRef.current.offset - gs.dy,
          animated: false,
        });
        scrollVelocityRef.current = -gs.vy * 50;
      }
    },
    onPanResponderRelease: (evt, gs) => {
      const { x0, y0 } = gs;
      const screenWidth = Dimensions.get('window').width;
      if (x0 > screenWidth - 200 && y0 < 200) {
        return;
      }

      const absX = Math.abs(gs.dx), absY = Math.abs(gs.dy);
      const isSlowVertical = absY > absX && absY > 10 && Math.abs(gs.vy) < 0.5;

      if (gesturesEnabledRef.current && !isSlowVertical && (absX > 15 || absY > 15)) {
        const swipeDirection = detectSwipeDirection(gs.dx, gs.dy);
        triggerGesture(swipeDirection as GestureType);
      }
    },
  }), [uiMode, applyScrollMomentum]);

  const isHorizontal = width > height;
  const availableHeight = height - insets.top - insets.bottom;
  const vitalsHeight = 35;
  const inputHeight = uiMode === 'blind' ? 60 : 30;

  // Grid dimensions from config
  const isMinimalista = uiMode === 'blind';

  // Filter buttons by current blind panel
  const filteredButtons = uiMode === 'blind' && buttonLayout
    ? buttonLayout.buttons.filter(btn => !btn.blindPanel || btn.blindPanel === currentBlindPanel)
    : buttonLayout?.buttons || [];
  const modeConfig = isMinimalista ? BLIND_MODE : NORMAL_MODE;
  const gridCols = modeConfig.vertical.cols;
  const gridRows = modeConfig.vertical.rows;
  const BUTTON_PADDING_VERTICAL = 3 * 2;
  const BUTTON_GAP = 3;
  const BUTTON_GAPS_TOTAL = (gridRows - 1) * BUTTON_GAP;

  // Calculate cell size for square buttons, fill available space
  const maxCellSizeByWidth = width / gridCols;
  const maxCellSizeByHeight = (availableHeight - inputHeight) / gridRows;
  const cellSize = Math.min(maxCellSizeByWidth, maxCellSizeByHeight);
  const buttonGridHeight = gridRows * cellSize + BUTTON_GAPS_TOTAL + BUTTON_PADDING_VERTICAL;

  // Horizontal layout dimensions
  const vitalsWidth = uiMode === 'blind' ? 0 : 30;
  const horizontalGridCols = modeConfig.horizontal.cols;
  const horizontalGridRows = modeConfig.horizontal.rows;
  const availableHorizontalWidthForButtons = width - vitalsWidth - insets.left - insets.right - 20;
  const maxHorizontalCellSizeByWidth = availableHorizontalWidthForButtons / horizontalGridCols;

  // Height calculation differs by mode
  let maxHorizontalCellSizeByHeight: number;
  const horizontalButtonGapsTotal = (horizontalGridRows - 1) * BUTTON_GAP;

  // Account for internal gaps and padding in ButtonGrid container for both modes
  maxHorizontalCellSizeByHeight = (availableHeight - horizontalButtonGapsTotal - BUTTON_PADDING_VERTICAL) / horizontalGridRows;

  const horizontalCellSize = Math.min(maxHorizontalCellSizeByWidth, maxHorizontalCellSizeByHeight);
  const horizontalButtonGridWidth = horizontalGridCols * horizontalCellSize + (horizontalGridCols - 1) * BUTTON_GAP;
  const horizontalRightPanelWidth = horizontalButtonGridWidth + vitalsWidth + 20;
  const horizontalTerminalWidth = width - horizontalRightPanelWidth - insets.left - insets.right;

  return (
    <SafeAreaView style={styles.safeArea}>
      {!isHorizontal ? (
      // VERTICAL LAYOUT
      <View style={styles.container}>
        {/* Terminal (flex 1 - takes remaining space) */}
        <View
          style={[styles.terminalSection, { flex: 1 }]}
          accessible={true}
          accessibilityLabel="Salida del terminal"
          accessibilityRole="text"
          accessibilityLiveRegion={uiMode === 'blind' ? 'polite' : 'none'}
          accessibilityHint="Ventana de terminal de solo lectura. Usa las flechas o desliza para navegar."
          accessibilityActions={uiMode === 'blind' ? [{ name: 'scroll' }] : undefined}
          {...terminalPanResponder.panHandlers}
          onStartShouldSetResponder={() => false}
          onTouchStart={(evt) => {
            const touchCount = evt.nativeEvent.touches.length;
            if (touchCount === 1) {
              handleDoubleTap(1);
            } else {
              lastTapRef.current = 0;
            }
            if (!gesturesEnabledRef.current || uiMode !== 'completo') return;
            if (touchCount === 2) {
              const [t1, t2] = evt.nativeEvent.touches;
              const dx = t2.pageX - t1.pageX;
              const dy = t2.pageY - t1.pageY;
              twoFingersStartRef.current = {
                x: (t1.pageX + t2.pageX) / 2,
                y: (t1.pageY + t2.pageY) / 2,
              };
              pinchStartDistanceRef.current = Math.hypot(dx, dy);
              pinchAngleRef.current = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
              pinchActiveRef.current = true;
              twoFingersActiveRef.current = true;
              twoFingersMovedRef.current = false;
            }
          }}
          onTouchMove={(evt) => {
            if (!pinchActiveRef.current || evt.nativeEvent.touches.length !== 2) return;
            const [t1, t2] = evt.nativeEvent.touches;
            const centroidX = (t1.pageX + t2.pageX) / 2;
            const centroidY = (t1.pageY + t2.pageY) / 2;
            const centroidDx = centroidX - twoFingersStartRef.current.x;
            const centroidDy = centroidY - twoFingersStartRef.current.y;
            const centroidMove = Math.hypot(centroidDx, centroidDy);

            const newDist = Math.hypot(t2.pageX - t1.pageX, t2.pageY - t1.pageY);
            const pinchDelta = Math.abs(newDist - pinchStartDistanceRef.current);

            if (centroidMove > 30 && !twoFingersMovedRef.current) {
              const direction = detectSwipeDirection(centroidDx, centroidDy) as GestureType;
              const gestureType = direction.replace('swipe_', 'twofingers_') as GestureType;
              triggerGesture(gestureType);
              pinchActiveRef.current = false;
              twoFingersMovedRef.current = true;
            } else if (pinchDelta > 40 && !twoFingersMovedRef.current) {
              const pinchType = newDist > pinchStartDistanceRef.current ? 'pinch_out' : 'pinch_in';
              triggerGesture(pinchType);
              pinchActiveRef.current = false;
              twoFingersMovedRef.current = true;
            }
          }}
          onTouchEnd={() => {
            pinchActiveRef.current = false;
            twoFingersActiveRef.current = false;
            twoFingersMovedRef.current = false;
          }}
        >
          <FlatList
            scrollToEndDelay={100}
            ref={flatListRef}
            data={lines}
            keyExtractor={item => String(item.id)}
            renderItem={({ item }) => (
              <View style={styles.lineContainer} key={item.id}>
                <AnsiText spans={item.spans} fontSize={fontSize} lineId={item.id} />
              </View>
            )}
            scrollEnabled={uiMode === 'blind'}
            scrollEventThrottle={16}
            onScroll={handleFlatListScroll}
            onScrollEndDrag={handleFlatListScroll}
            style={styles.flatList}
            accessible={true}
            accessibilityLabel={`Terminal con ${lines.length} líneas`}
          />

          {/* Scroll to bottom button */}
          {showScrollToBottom && (
            <TouchableOpacity
              style={styles.scrollToBottomButton}
              onPress={handleScrollToBottom}
              accessible={true}
              accessibilityLabel="Ir al final"
              accessibilityRole="button"
              accessibilityHint="Desplázate al último mensaje del terminal"
            >
              <Text style={styles.scrollToBottomText}>↓</Text>
            </TouchableOpacity>
          )}

          {/* Locate Feedback - Show in minimalist mode */}
          {locateFeedback && (
            <View
              style={[
                styles.locateFeedback,
                locateFeedback === 'success' ? styles.locateFeedbackSuccess : styles.locateFeedbackFailed,
              ]}
              accessible={true}
              accessibilityLabel={locateFeedback === 'success' ? 'Localizado' : 'No localizado'}
              accessibilityRole="alert"
            >
              <Text
                style={[
                  styles.locateFeedbackText,
                  locateFeedback === 'success' ? styles.locateFeedbackTextSuccess : styles.locateFeedbackTextFailed,
                ]}
              >
                {locateFeedback === 'success' ? '✓ Localizado' : '✗ No localizado'}
              </Text>
            </View>
          )}

          {/* Stat Feedback - Show stat information */}
          {statFeedback && (
            <View
              style={[styles.locateFeedback, styles.statFeedback]}
              accessible={true}
              accessibilityLabel={statFeedback.message}
              accessibilityRole="alert"
            >
              <Text style={[styles.locateFeedbackText, styles.statFeedbackText]}>
                {statFeedback.message}
              </Text>
            </View>
          )}

          {/* Auto-login Failed Feedback */}
          {loginFailed && (
            <View
              style={[styles.locateFeedback, styles.locateFeedbackFailed]}
              accessible={true}
              accessibilityLabel="Login automático falló"
              accessibilityRole="alert"
            >
              <TouchableOpacity
                style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
                onPress={() => {
                  setLoginFailed(false);
                  autoLoginRef.current = false;
                }}
                accessible={true}
                accessibilityLabel="Reintentar login"
                accessibilityHint="Intenta enviar nuevamente las credenciales"
              >
                <Text
                  style={[
                    styles.locateFeedbackText,
                    styles.locateFeedbackTextFailed,
                  ]}
                >
                  ✗ Login falló - Tap para reintentar
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* MiniMap overlay - Hidden in minimalist mode */}
          {uiMode === 'completo' && (
            <View style={styles.miniMapContainer} pointerEvents="box-none">
              <MiniMap
                currentRoom={currentRoom}
                nearbyRooms={nearbyRooms}
                visible={mapVisible}
                onToggle={() => setMapVisible(!mapVisible)}
                walking={walking}
                onStop={stopWalk}
              />
            </View>
          )}
        </View>

        {/* VitalBars - Hidden in minimalist mode */}
        {uiMode === 'completo' && (
          <View style={[styles.vitalsSection, { height: vitalsHeight }]}>
            <VitalBars
              hp={hp}
              hpMax={hpMax}
              energy={energy}
              energyMax={energyMax}
            />
          </View>
        )}

        {/* Input Row */}
        <View style={[styles.inputSection, { height: inputHeight }]}>
          {connected ? (
            <>
              {uiMode === 'blind' && (
                <TouchableOpacity
                  style={[styles.sendButton, { flex: 0.4, backgroundColor: silentModeEnabled ? '#ff6600' : '#666666' }]}
                  onPress={() => setSilentModeEnabled(!silentModeEnabled)}
                  accessible={true}
                  accessibilityLabel={`Modo Silencio ${silentModeEnabled ? 'activado' : 'desactivado'}`}
                  accessibilityRole="button"
                  accessibilityHint={`Lee los mensajes en voz alta. Estado: ${silentModeEnabled ? 'ON' : 'OFF'}`}
                >
                  <Text style={[styles.sendButtonText, { fontSize: 28 }]}>{silentModeEnabled ? '🔇' : '🔊'}</Text>
                </TouchableOpacity>
              )}

              {uiMode === 'blind' && (
                <TouchableOpacity
                  style={[styles.sendButton, { flex: 0.4, backgroundColor: '#336699' }]}
                  onPress={() => setBlindChannelModalVisible(true)}
                  accessible={true}
                  accessibilityLabel="Abrir canales"
                  accessibilityRole="button"
                >
                  <Text style={[styles.sendButtonText, { fontSize: 28 }]}>💬</Text>
                </TouchableOpacity>
              )}

              {uiMode === 'completo' && (
                <View style={styles.historyArrowsContainer}>
                  <TouchableOpacity
                    style={styles.historyArrowButton}
                    onPress={handleUpArrow}
                    accessible={true}
                    accessibilityLabel="Comando anterior"
                    accessibilityRole="button"
                  >
                    <Text style={styles.historyArrowText}>↑</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.historyArrowButton}
                    onPress={handleDownArrow}
                    accessible={true}
                    accessibilityLabel="Comando siguiente"
                    accessibilityRole="button"
                  >
                    <Text style={styles.historyArrowText}>↓</Text>
                  </TouchableOpacity>
                </View>
              )}

              <TextInput
                ref={textInputRef}
                style={styles.input}
                placeholder="Comando..."
                placeholderTextColor="#888"
                value={inputText}
                onChangeText={(text) => {
                  setInputText(text);
                  setHistoryIndex(-1);
                }}
                onSubmitEditing={handleSendInput}
                returnKeyType="send"
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                accessible={true}
                accessibilityLabel="Entrada de comando"
                accessibilityHint="Escribe un comando y presiona enviar o enter"
              />

              <TouchableOpacity
                style={[
                  styles.sendButton,
                  uiMode === 'blind' && { flex: 0.4 }
                ]}
                onPress={handleSendInput}
                accessible={true}
                accessibilityLabel="Enviar comando"
                accessibilityRole="button"
                accessibilityHint="Envía el comando actual al servidor"
              >
                <Text style={[styles.sendButtonText, uiMode === 'blind' && { fontSize: 28 }]}>›</Text>
              </TouchableOpacity>

              {uiMode === 'completo' && (
                <>
                  <TouchableOpacity
                    style={[styles.sendButton, { backgroundColor: '#336699' }]}
                    onPress={() => setBlindChannelModalVisible(true)}
                    accessible={true}
                    accessibilityLabel="Abrir canales"
                    accessibilityRole="button"
                    accessibilityHint="Abre el panel de mensajes de canales"
                  >
                    <Text style={styles.sendButtonText}>💬</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sendButton, { backgroundColor: silentModeEnabled ? '#ff6600' : '#666666' }]}
                    onPress={() => setSilentModeEnabled(!silentModeEnabled)}
                    accessible={true}
                    accessibilityLabel={`Silenciar sonidos ${silentModeEnabled ? 'desactivado' : 'activado'}`}
                    accessibilityRole="button"
                    accessibilityHint="Activa/desactiva los sonidos de eventos"
                  >
                    <Text style={styles.sendButtonText}>{silentModeEnabled ? '🔇' : '🔊'}</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          ) : (
            <TouchableOpacity
              style={[styles.input, styles.reconnectButton]}
              onPress={() => telnetRef.current?.connect()}
              accessible={true}
              accessibilityLabel="Reconectar"
              accessibilityRole="button"
              accessibilityHint="Reconéctate al servidor"
            >
              <Text style={styles.reconnectText}>Reconectar</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ButtonGrid - Full size in completo mode, compact in blind mode */}
        {(uiMode === 'completo' || uiMode === 'blind') && (
          <View style={[styles.buttonGridSection, { height: buttonGridHeight }]}>
            <ButtonGrid
              buttons={filteredButtons}
              onSendCommand={sendCommand}
              onAddTextButton={handleAddTextButton}
              onEditButton={handleEditButton}
              moveMode={moveMode}
              sourceCol={sourceCol}
              sourceRow={sourceRow}
              onSwapButtons={handleSwapButtons}
              uiMode={uiMode}
              minimalista={isMinimalista}
              minCols={gridCols}
              minRows={gridRows}
            />
          </View>
        )}
      </View>
      ) : (
      // HORIZONTAL LAYOUT
      <View style={[styles.container, styles.containerHorizontal]}>
        {/* Terminal + Input Left Column */}
        <View style={{ width: horizontalTerminalWidth, flex: 0, flexDirection: 'column' }}>
          {/* Terminal */}
          <View
            style={[styles.terminalSection, { flex: 1 }]}
            accessible={true}
            accessibilityLabel="Salida del terminal"
            accessibilityRole="text"
            accessibilityLiveRegion={uiMode === 'blind' ? 'polite' : 'none'}
            accessibilityHint="Ventana de terminal de solo lectura. Usa las flechas o desliza para navegar."
            {...terminalPanResponder.panHandlers}
            onStartShouldSetResponder={() => false}
            onTouchStart={(evt) => {
              const touchCount = evt.nativeEvent.touches.length;
              if (touchCount === 1) {
                handleDoubleTap(1);
              } else {
                lastTapRef.current = 0;
              }
              if (!gesturesEnabledRef.current || uiMode !== 'completo') return;
              if (touchCount === 2) {
                const [t1, t2] = evt.nativeEvent.touches;
                const dx = t2.pageX - t1.pageX;
                const dy = t2.pageY - t1.pageY;
                twoFingersStartRef.current = {
                  x: (t1.pageX + t2.pageX) / 2,
                  y: (t1.pageY + t2.pageY) / 2,
                };
                pinchStartDistanceRef.current = Math.hypot(dx, dy);
                pinchAngleRef.current = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
                pinchActiveRef.current = true;
                twoFingersActiveRef.current = true;
                twoFingersMovedRef.current = false;
              }
            }}
            onTouchMove={(evt) => {
              if (!pinchActiveRef.current || evt.nativeEvent.touches.length !== 2) return;
              const [t1, t2] = evt.nativeEvent.touches;
              const centroidX = (t1.pageX + t2.pageX) / 2;
              const centroidY = (t1.pageY + t2.pageY) / 2;
              const centroidDx = centroidX - twoFingersStartRef.current.x;
              const centroidDy = centroidY - twoFingersStartRef.current.y;
              const centroidMove = Math.hypot(centroidDx, centroidDy);

              const newDist = Math.hypot(t2.pageX - t1.pageX, t2.pageY - t1.pageY);
              const pinchDelta = Math.abs(newDist - pinchStartDistanceRef.current);

              if (centroidMove > 30 && !twoFingersMovedRef.current) {
                const direction = detectSwipeDirection(centroidDx, centroidDy) as GestureType;
                const gestureType = direction.replace('swipe_', 'twofingers_') as GestureType;
                triggerGesture(gestureType);
                pinchActiveRef.current = false;
                twoFingersMovedRef.current = true;
              } else if (pinchDelta > 40 && !twoFingersMovedRef.current) {
                const pinchType = newDist > pinchStartDistanceRef.current ? 'pinch_out' : 'pinch_in';
                triggerGesture(pinchType);
                pinchActiveRef.current = false;
                twoFingersMovedRef.current = true;
              }
            }}
            onTouchEnd={() => {
              pinchActiveRef.current = false;
              twoFingersActiveRef.current = false;
              twoFingersMovedRef.current = false;
            }}
          >
            <FlatList
              scrollToEndDelay={100}
              ref={flatListRef}
              data={lines}
              keyExtractor={item => String(item.id)}
              renderItem={({ item }) => (
                <View style={styles.lineContainer} key={item.id}>
                  <AnsiText spans={item.spans} fontSize={fontSize} lineId={item.id} />
                </View>
              )}
              scrollEnabled={uiMode === 'blind'}
              scrollEventThrottle={16}
              onScroll={handleFlatListScroll}
              onScrollEndDrag={handleFlatListScroll}
              style={styles.flatList}
              accessible={true}
              accessibilityLabel={`Terminal con ${lines.length} líneas`}
            />

            {uiMode === 'completo' && !isAtBottom && (
              <TouchableOpacity style={styles.scrollToTopButton} onPress={handleScrollToTop}>
                <Text style={styles.scrollButtonText}>⬆</Text>
              </TouchableOpacity>
            )}

            {showScrollToBottom && (
              <TouchableOpacity style={styles.scrollToBottomButton} onPress={handleScrollToBottom}>
                <Text style={styles.scrollToBottomText}>⬇</Text>
              </TouchableOpacity>
            )}

            {uiMode === 'completo' && (
              <View style={styles.miniMapContainer} pointerEvents="box-none">
                <MiniMap
                  currentRoom={currentRoom}
                  nearbyRooms={nearbyRooms}
                  visible={mapVisible}
                  onToggle={() => setMapVisible(!mapVisible)}
                  walking={walking}
                  onStop={stopWalk}
                />
              </View>
            )}
          </View>

          {/* Input Row - Horizontal */}
          <View style={[styles.inputSection, { height: inputHeight }]}>
            {connected ? (
              <>
                {uiMode === 'blind' && (
                  <TouchableOpacity
                    style={[styles.sendButton, { flex: 0.4, backgroundColor: silentModeEnabled ? '#ff6600' : '#666666' }]}
                    onPress={() => setSilentModeEnabled(!silentModeEnabled)}
                    accessible={true}
                    accessibilityLabel={`Modo Silencio ${silentModeEnabled ? 'activado' : 'desactivado'}`}
                    accessibilityRole="button"
                    accessibilityHint={`Lee los mensajes en voz alta. Estado: ${silentModeEnabled ? 'ON' : 'OFF'}`}
                  >
                    <Text style={[styles.sendButtonText, { fontSize: 28 }]}>{silentModeEnabled ? '🔇' : '🔊'}</Text>
                  </TouchableOpacity>
                )}

                {uiMode === 'blind' && (
                  <TouchableOpacity
                    style={[styles.sendButton, { flex: 0.4, backgroundColor: '#336699' }]}
                    onPress={() => setBlindChannelModalVisible(true)}
                    accessible={true}
                    accessibilityLabel="Abrir canales"
                    accessibilityRole="button"
                  >
                    <Text style={[styles.sendButtonText, { fontSize: 28 }]}>💬</Text>
                  </TouchableOpacity>
                )}

                {uiMode === 'completo' && (
                  <View style={styles.historyArrowsContainer}>
                    <TouchableOpacity
                      style={styles.historyArrowButton}
                      onPress={handleUpArrow}
                      accessible={true}
                      accessibilityLabel="Comando anterior"
                      accessibilityRole="button"
                    >
                      <Text style={styles.historyArrowText}>↑</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.historyArrowButton}
                      onPress={handleDownArrow}
                      accessible={true}
                      accessibilityLabel="Comando siguiente"
                      accessibilityRole="button"
                    >
                      <Text style={styles.historyArrowText}>↓</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <TextInput
                  ref={textInputRef}
                  style={styles.input}
                  placeholder="Comando..."
                  placeholderTextColor="#888"
                  value={inputText}
                  onChangeText={(text) => {
                    setInputText(text);
                    setHistoryIndex(-1);
                  }}
                  onSubmitEditing={handleSendInput}
                  returnKeyType="send"
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  accessible={true}
                  accessibilityLabel="Entrada de comando"
                  accessibilityHint="Escribe un comando y presiona enviar o enter"
                />

                <TouchableOpacity
                  style={[
                    styles.sendButton,
                    uiMode === 'blind' && { flex: 0.4 }
                  ]}
                  onPress={handleSendInput}
                  accessible={true}
                  accessibilityLabel="Enviar comando"
                  accessibilityRole="button"
                  accessibilityHint="Envía el comando actual al servidor"
                >
                  <Text style={[styles.sendButtonText, uiMode === 'blind' && { fontSize: 28 }]}>›</Text>
                </TouchableOpacity>

                {uiMode === 'completo' && (
                  <>
                    <TouchableOpacity
                      style={[styles.sendButton, { backgroundColor: '#336699' }]}
                      onPress={() => setBlindChannelModalVisible(true)}
                      accessible={true}
                      accessibilityLabel="Abrir canales"
                      accessibilityRole="button"
                      accessibilityHint="Abre el panel de mensajes de canales"
                    >
                      <Text style={styles.sendButtonText}>💬</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.sendButton, { backgroundColor: silentModeEnabled ? '#ff6600' : '#666666' }]}
                      onPress={() => setSilentModeEnabled(!silentModeEnabled)}
                      accessible={true}
                      accessibilityLabel={`Silenciar sonidos ${silentModeEnabled ? 'desactivado' : 'activado'}`}
                      accessibilityRole="button"
                      accessibilityHint="Activa/desactiva los sonidos de eventos"
                    >
                      <Text style={styles.sendButtonText}>{silentModeEnabled ? '🔇' : '🔊'}</Text>
                    </TouchableOpacity>
                  </>
                )}
              </>
            ) : (
              <TouchableOpacity
                style={[styles.input, styles.reconnectButton]}
                onPress={() => telnetRef.current?.connect()}
                accessible={true}
                accessibilityLabel="Reconectar"
                accessibilityRole="button"
                accessibilityHint="Reconéctate al servidor"
              >
                <Text style={styles.reconnectText}>Reconectar</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* VitalBars Vertical - Hidden in blind mode */}
        {uiMode === 'completo' && (
          <View style={{ width: vitalsWidth, height: availableHeight }}>
            <VitalBars
              hp={hp}
              hpMax={hpMax}
              energy={energy}
              energyMax={energyMax}
              orientation="vertical"
            />
          </View>
        )}

        {/* Right Panel - ButtonGrid - Shown in completo and blind modes */}
        {(uiMode === 'completo' || uiMode === 'blind') && (
          <View style={{ flex: 1, flexDirection: 'column' }}>
            {/* ButtonGrid Horizontal */}
            <View style={[styles.buttonGridSection, { flex: 1 }]}>
              <ButtonGrid
                buttons={filteredButtons}
                onSendCommand={sendCommand}
                onAddTextButton={handleAddTextButton}
                onEditButton={handleEditButton}
                moveMode={moveMode}
                sourceCol={sourceCol}
                sourceRow={sourceRow}
                onSwapButtons={handleSwapButtons}
                horizontalMode={{cols: horizontalGridCols, cellSize: horizontalCellSize}}
                uiMode={uiMode}
                minimalista={isMinimalista}
                minCols={gridCols}
                minRows={horizontalGridRows}
                onOpenActionModal={(col, row) => setCurrentActionButton({ col, row })}
              />
            </View>
          </View>
        )}
      </View>
      )}

      {/* Alias Wizard Modal */}
      {/* Button Edit Modal */}
      {(() => {
        // In horizontal mode, swap col/row to find button in layout storage
        let searchCol = editButtonCol;
        let searchRow = editButtonRow;
        if (isHorizontal) {
          searchCol = editButtonRow;
          searchRow = editButtonCol;
        }
        return (
          <ButtonEditModal
            visible={editButtonVisible}
            col={editButtonCol}
            row={editButtonRow}
            button={buttonLayout?.buttons.find(b => {
              if (b.col !== searchCol || b.row !== searchRow) return false;
              if (uiMode === 'blind') {
                return !b.blindPanel || b.blindPanel === currentBlindPanel;
              }
              return true;
            }) || null}
            onSave={handleSaveEditButton}
            onDelete={handleDeleteButton}
            onMove={handleMoveButton}
            onClose={() => setEditButtonVisible(false)}
            uiMode={uiMode}
          />
        );
      })()}

      {/* Channel Modal */}
      {(uiMode === 'blind' || uiMode === 'completo') && (
        <BlindChannelModal
          visible={blindChannelModalVisible}
          onClose={() => setBlindChannelModalVisible(false)}
          channels={channels}
          channelAliases={channelAliases}
          channelMessages={channelMessages}
          onSendMessage={(cmd) => {
            telnetRef.current?.send(cmd);
            lastSentChannelTime.current = Date.now();
          }}
          onAliasChange={(ch, alias) => {
            const updated = { ...channelAliases, [ch]: alias };
            setChannelAliases(updated);
            saveChannelAliases(server.id, updated);
          }}
          fontSize={fontSize}
        />
      )}

      {/* Room Search Results */}
      <RoomSearchResults
        rooms={searchResults}
        visible={searchVisible}
        onSelect={(room) => {
          setSearchVisible(false);
          walkTo(room);
        }}
        onClose={() => setSearchVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    flexDirection: 'column',
  },
  containerHorizontal: {
    flexDirection: 'row',
  },
  terminalSection: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    overflow: 'hidden',
  },
  flatList: {
    flex: 1,
  },
  lineContainer: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  scrollToBottomButton: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: '#3399cc',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollToBottomText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  scrollToTopButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#3399cc',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  miniMapContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 200,
    height: 200,
    zIndex: 100,
  },
  vitalsSection: {
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 0,
    padding: 0,
  },
  inputSection: {
    flexDirection: 'row',
    paddingHorizontal: 2,
    paddingVertical: 0,
    gap: 2,
    backgroundColor: '#222',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  arrowButton: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#333',
    borderRadius: 2,
    paddingHorizontal: 6,
  },
  arrowText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  input: {
    flex: 1,
    backgroundColor: '#333',
    color: '#fff',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 0,
    fontSize: 14,
    textAlignVertical: 'center',
  },
  sendButton: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#3399cc',
    borderRadius: 4,
    paddingHorizontal: 12,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  reconnectButton: {
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
  },
  reconnectText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  buttonGridSection: {
    overflow: 'hidden',
  },
  locateFeedback: {
    position: 'absolute',
    bottom: 50,
    left: 10,
    right: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
  },
  locateFeedbackSuccess: {
    backgroundColor: '#0c0',
  },
  locateFeedbackFailed: {
    backgroundColor: '#c00',
  },
  locateFeedbackText: {
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  locateFeedbackTextSuccess: {
    color: '#000',
  },
  locateFeedbackTextFailed: {
    color: '#fff',
  },
  statFeedback: {
    backgroundColor: '#223366',
  },
  statFeedbackText: {
    color: '#88ccff',
  },
  historyArrowsContainer: {
    flexDirection: 'row',
    gap: 4,
  },
  historyArrowButton: {
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#333',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#555',
  },
  historyArrowText: {
    color: '#0c0',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
