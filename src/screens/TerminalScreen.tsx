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
  AppState,
  Keyboard,
  BackHandler,
  Pressable,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { startBackgroundConnection, stopBackgroundConnection } from '../services/foregroundService';
import TorchZhylaForeground, { addWalkStepListener, addWalkDoneListener } from '../../modules/torchzhyla-foreground';
import { fireNotification, stripAnsi } from '../services/notificationService';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, MudLine, GestureConfig, GestureType } from '../types';
import { TelnetService, TelnetEventHandler } from '../services/telnetService';
import { SettingsScreen } from './SettingsScreen';
import { parseAnsi } from '../utils/ansiParser';
import { AnsiText } from '../components/AnsiText';
import { MiniMap, MiniMapHandle } from '../components/MiniMap';
import { VitalBars } from '../components/VitalBars';
import { ButtonGrid, GRID_COLS, GRID_ROWS } from '../components/ButtonGrid';
import { ButtonEditModal } from '../components/ButtonEditModal';
import { RoomSearchResults } from '../components/RoomSearchResults';
import { loadSettings } from '../storage/settingsStorage';
import { MapService, MapRoom } from '../services/mapService';
import { ButtonLayout, createDefaultLayout, createBlindModeLayout, loadLayout, saveLayout, loadServerLayout, saveServerLayout } from '../storage/layoutStorage';
import { loadServers, saveServers } from '../storage/serverStorage';
import { getTriggersForServer } from '../storage/triggerStorage';
import { triggerEngine } from '../services/triggerEngine';
import { blindModeService } from '../services/blindModeService';
import { logService } from '../services/logService';
import { playerStatsService } from '../services/playerStatsService';
import { useSounds } from '../contexts/SoundContext';
import { useFloatingMessages } from '../contexts/FloatingMessagesContext';
import { FloatingMessages } from '../components/FloatingMessages';
import { NORMAL_MODE, BLIND_MODE } from '../config/gridConfig';
import { BlindChannelModal, ChannelMessage, nextMsgId } from '../components/BlindChannelModal';
import { loadChannelAliases, saveChannelAliases, loadChannelOrder, saveChannelOrder } from '../storage/channelStorage';
import { loadNicks, recordNickSeen, filterNicks } from '../storage/nickStorage';
import { NickAutocomplete } from '../components/NickAutocomplete';

type Props = NativeStackScreenProps<RootStackParamList, 'Terminal'>;

const MAX_LINES = 2000;
let lineIdCounter = 0;

export function TerminalScreen({ route, navigation }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { playSound } = useSounds();
  const { push: pushFloating } = useFloatingMessages();
  const { server: initialServer } = route.params;

  const [server, setServer] = useState(initialServer);
  const [lines, setLines] = useState<MudLine[]>([]);
  const [inputText, setInputText] = useState('');
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [keepAwakeEnabled, setKeepAwakeEnabled] = useState(true);
  const [backgroundConnectionEnabled, setBackgroundConnectionEnabled] = useState(true);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [mapVisible, setMapVisible] = useState(true);
  const [currentRoom, setCurrentRoom] = useState<MapRoom | null>(null);
  const [hp, setHp] = useState(0);
  const [hpMax, setHpMax] = useState(0);
  const [energy, setEnergy] = useState(0);
  const [energyMax, setEnergyMax] = useState(0);
  const [searchResults, setSearchResults] = useState<MapRoom[]>([]);
  const [searchVisible, setSearchVisible] = useState(false);
  const [previewRoomId, setPreviewRoomId] = useState<number | null>(null);
  const [walking, setWalking] = useState(false);
  const [selectionAnchorId, setSelectionAnchorId] = useState<number | null>(null);
  const [selectionTargetId, setSelectionTargetId] = useState<number | null>(null);
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
  const [silentModeEnabled, setSilentModeEnabled] = useState(false);
  const [loginFailed, setLoginFailed] = useState(false);
  const [channels, setChannels] = useState<string[]>([]);
  const [channelMessages, setChannelMessages] = useState<ChannelMessage[]>([]);
  const [channelAliases, setChannelAliases] = useState<Record<string, string>>({});
  const [channelOrder, setChannelOrder] = useState<string[]>([]);
  const [blindChannelModalVisible, setBlindChannelModalVisible] = useState(false);
  const [playerXP, setPlayerXP] = useState(0);
  const [roomEnemies, setRoomEnemies] = useState('');
  const [roomAllies, setRoomAllies] = useState('');
  const [hpHistory, setHpHistory] = useState<{ delta: number; label: string }[]>([]);
  const [currentBlindPanel, setCurrentBlindPanel] = useState(1);
  const [currentCompletoPanel, setCurrentCompletoPanel] = useState(1);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [inputSelection, setInputSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [inputFocused, setInputFocused] = useState(false);
  const [nickSuggestions, setNickSuggestions] = useState<string[]>([]);
  const [exitConfirmVisible, setExitConfirmVisible] = useState(false);
  const [exitToastVisible, setExitToastVisible] = useState(false);

  const fontSizeRef = useRef(14);
  const telnetRef = useRef<TelnetService | null>(null);
  const linesRef = useRef<MudLine[]>([]);
  const isCapturingAliasRef = useRef(false);
  const aliasBufferRef = useRef<string[]>([]);
  const aliasTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const walkPathRef = useRef<string[]>([]);
  const playSoundRef = useRef(playSound);
  const walkStepRef = useRef(0);
  const walkActiveRef = useRef(false);
  const pendingStealthSearchRef = useRef(false);
  const flatListRef = useRef<FlatList<MudLine>>(null);
  const lastLineBlankRef = useRef(false);
  const recentLinesRef = useRef<string[]>([]);
  const intentionalLocateRef = useRef(false);
  const waitingForIrsalaAfterLocateRef = useRef(false);
  const autoLoginRef = useRef<boolean | string>(false);
  const textInputRef = useRef<TextInput>(null);
  const lastSentChannelTime = useRef(0);
  const silentModeEnabledRef = useRef(false);
  const gesturesEnabledRef = useRef(false);
  const gesturesRef = useRef<GestureConfig[]>([]);
  const notificationsEnabledRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const exitPendingRef = useRef(false);
  const exitToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set true right before a programmatic blur so the keyboardDidHide
  // listener does not also wipe the input.
  const suppressClearOnHideRef = useRef(false);
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
  const pendingTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const isMountedRef = useRef(true);
  const inWhoBlockRef = useRef(false);

  // Cleanup all pending timeouts on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      pendingTimeoutsRef.current.forEach(id => clearTimeout(id));
      pendingTimeoutsRef.current.clear();
    };
  }, []);

  // Track app foreground/background state so notifications only fire when not active
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      appStateRef.current = state;
    });
    return () => sub.remove();
  }, []);

  // Native walk: each tick from the foreground module triggers a telnet send.
  // Living in native (Handler.postDelayed) keeps the cadence even when JS
  // setTimeout is paused while the app is backgrounded.
  useEffect(() => {
    const stepSub = addWalkStepListener((e) => {
      if (!walkActiveRef.current) return;
      walkStepRef.current = e.index + 1;
      telnetRef.current?.send(e.command);
    });
    const doneSub = addWalkDoneListener(() => {
      walkPathRef.current = [];
      walkStepRef.current = 0;
      walkActiveRef.current = false;
      if (isMountedRef.current) setWalking(false);
    });
    return () => {
      stepSub.remove();
      doneSub.remove();
    };
  }, []);

  // Track soft-keyboard height so we can dock the nick autocomplete bar to
  // its top edge. Hide the bar when the keyboard is dismissed.
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Clear the command input whenever the user dismisses the soft keyboard
  // (tap outside, back button, drag-down). Skipped for programmatic blurs
  // such as the blur+focus dance used to re-pop the keyboard.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      if (suppressClearOnHideRef.current) {
        suppressClearOnHideRef.current = false;
        return;
      }
      setInputText('');
    });
    return () => sub.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const settings = await loadSettings();
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
        if (settings.keepAwakeEnabled !== undefined) {
          setKeepAwakeEnabled(settings.keepAwakeEnabled);
        }
        if (settings.backgroundConnectionEnabled !== undefined) {
          setBackgroundConnectionEnabled(settings.backgroundConnectionEnabled);
        }
        if (settings.gestures) {
          gesturesRef.current = settings.gestures;
        }
        if (settings.notificationsEnabled !== undefined) {
          notificationsEnabledRef.current = settings.notificationsEnabled;
        }
        logService.configure(
          settings.logsEnabled ?? false,
          settings.logsMaxLines ?? 20000
        );
      })();

      // Reset blind mode service history periodically
      const historyResetInterval = setInterval(() => {
        blindModeService.resetHistory();
      }, 60000); // Every minute

      return () => clearInterval(historyResetInterval);
    }, [])
  );

  const confirmExit = useCallback(() => {
    if (exitToastTimeoutRef.current) {
      clearTimeout(exitToastTimeoutRef.current);
      exitToastTimeoutRef.current = null;
    }
    exitPendingRef.current = false;
    setExitConfirmVisible(false);
    setExitToastVisible(false);
    navigation.goBack();
  }, [navigation]);

  const cancelExit = useCallback(() => {
    if (exitToastTimeoutRef.current) {
      clearTimeout(exitToastTimeoutRef.current);
      exitToastTimeoutRef.current = null;
    }
    exitPendingRef.current = false;
    setExitConfirmVisible(false);
    setExitToastVisible(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (exitPendingRef.current) {
          confirmExit();
          return true;
        }
        if (
          settingsModalVisible ||
          editButtonVisible ||
          blindChannelModalVisible ||
          searchVisible
        ) {
          return false;
        }
        exitPendingRef.current = true;
        if (uiMode === 'blind') {
          setExitConfirmVisible(true);
          AccessibilityInfo.announceForAccessibility(
            '¿Salir y desconectar? Pulsa atrás de nuevo para confirmar.'
          );
        } else {
          setExitToastVisible(true);
          exitToastTimeoutRef.current = setTimeout(() => {
            exitPendingRef.current = false;
            setExitToastVisible(false);
            exitToastTimeoutRef.current = null;
          }, 2500);
        }
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => {
        sub.remove();
        if (exitToastTimeoutRef.current) {
          clearTimeout(exitToastTimeoutRef.current);
          exitToastTimeoutRef.current = null;
        }
        exitPendingRef.current = false;
      };
    }, [uiMode, confirmExit, settingsModalVisible, editButtonVisible, blindChannelModalVisible, searchVisible])
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

      // Load channel aliases and order for this server
      const aliases = await loadChannelAliases(server.id);
      setChannelAliases(aliases);
      const order = await loadChannelOrder(server.id);
      setChannelOrder(order);

      // Load map for locate command
      await mapServiceRef.current.load();
    })();
  }, [server, uiMode]);

  // Process a single line with blind mode filters and add to display.
  // Pass `deferSetState=true` when batching multiple lines to avoid N re-renders.
  const processingAndAddLine = (text: string, isChannelMessage: boolean = false, deferSetState: boolean = false) => {
    // Auto-login: Try to log in with saved credentials if available and not yet attempted
    if (!autoLoginRef.current && server.username && server.password) {
      const withoutAnsi = text.replace(/\x1b\[[0-9;]*m/g, '');
      // Detect username prompt: "Introduce el nombre de tu personaje:"
      if (/introduce el nombre de tu personaje/i.test(withoutAnsi)) {
        autoLoginRef.current = 'waiting-for-password';
        const id = setTimeout(() => {
          telnetRef.current?.send(server.username!);
          pendingTimeoutsRef.current.delete(id);
        }, 200);
        pendingTimeoutsRef.current.add(id);
      }
    }

    // Auto-login: After username sent, detect password prompt
    if (autoLoginRef.current === 'waiting-for-password' && server.password && !loginFailed) {
      const withoutAnsi = text.replace(/\x1b\[[0-9;]*m/g, '');
      // Detect password prompt: "Introduce la clave de tu ficha o de tu cuenta:"
      if (/introduce la clave de tu ficha o de tu cuenta/i.test(withoutAnsi)) {
        autoLoginRef.current = false; // Mark as completed before sending
        const id = setTimeout(() => {
          telnetRef.current?.send(server.password!);
          logService.markLoginComplete();
          pendingTimeoutsRef.current.delete(id);
        }, 200);
        pendingTimeoutsRef.current.add(id);
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


    // User-defined triggers run FIRST, on the raw line, so blind-filtered or
    // blind-modified lines still fire sounds/notifications/commands. Captures
    // and side effects are computed against the unmodified text the MUD sent.
    const rawSpans = parseAnsi(text);
    const triggerResult = triggerEngine.process(stripAnsi(text), rawSpans);
    if (triggerResult.gagged) {
      // Total suppression — drop side effects too. A user who wants the side
      // effect AND the gag should split into two triggers.
      return;
    }

    // Fire side effects unconditionally (works even when blind mode silences
    // the line). Sound side effects respect the global silentMode toggle,
    // which is mirrored from settings.soundsEnabled.
    for (const fx of triggerResult.sideEffects) {
      if (fx.type === 'play_sound') {
        if (fx.file && !silentModeEnabledRef.current) playSoundRef.current(fx.file);
      } else if (fx.type === 'send') {
        if (fx.command) telnetRef.current?.send(fx.command);
      } else if (fx.type === 'notify') {
        if (notificationsEnabledRef.current && appStateRef.current !== 'active') {
          fireNotification(fx.title || 'TorchZhyla', fx.message);
        }
      } else if (fx.type === 'floating') {
        pushFloating(fx.message, fx.level);
      }
    }

    // Blind mode: Process with filters
    let displayText = text;
    let shouldAnnounce = false;
    let announcementText = '';

    // Process line with blind mode service to detect patterns and sounds (both modes use this)
    const result = blindModeService.processLine(text);

    if (uiMode === 'blind') {

      // Skip line if filter says to silence it (side effects already fired above)
      if (!result.shouldDisplay) {
        return;
      }

      displayText = result.modifiedText;

      // Handle announcements from filters
      if (result.announcement) {
        shouldAnnounce = true;
        announcementText = result.announcement;
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

    // Spans for display: prefer trigger-mutated spans (color action) when blind
    // didn't modify the text. If blind rewrote the line, re-parse from the
    // modified text (color mutations are dropped — acceptable since blind users
    // don't read the screen).
    const finalSpans = displayText === text ? triggerResult.spans : parseAnsi(displayText);

    const newLine: MudLine = { id: lineIdCounter++, spans: finalSpans };
    linesRef.current.push(newLine);
    if (linesRef.current.length > MAX_LINES) {
      linesRef.current = linesRef.current.slice(-MAX_LINES);
    }
    if (!deferSetState) {
      setLines([...linesRef.current]);
    }

    // Channel messages: always write to terminal, NEVER announce (even if silent mode is off).
    // Auto-scroll is handled by FlatList's onContentSizeChange/onLayout.
    if (isChannelMessage) {
      return;
    }

    // Non-channel messages: Announce filtered content in blind mode (only if silent mode is disabled)
    if (shouldAnnounce && uiMode === 'blind' && !silentModeEnabledRef.current) {
      blindModeService.announceMessage(announcementText, 'normal');
    }

    // Read all messages when silent mode is disabled (if not already announced by filters and not a channel)
    if (!silentModeEnabledRef.current && uiMode === 'blind' && !shouldAnnounce && !isChannelMessage) {
      // Only read if it's not already announced by blind mode filters
      const cleanText = displayText.replace(/\x1b\[[0-9;]*m/g, '').trim();
      if (cleanText.length > 0) {
        blindModeService.announceMessage(cleanText, 'low');
      }
    }
    // Auto-scroll is handled by FlatList's onContentSizeChange/onLayout.
  };

  const addLine = processingAndAddLine;

  const addMultipleLines = (texts: string[]) => {
    texts.forEach(text => {
      processingAndAddLine(text, false, true);
    });
    // Single flush after the batch to avoid N re-renders and mid-batch scrolls.
    setLines([...linesRef.current]);
  };

  const mapServiceRef = useRef(new MapService());
  const miniMapRef = useRef<MiniMapHandle | null>(null);

  useEffect(() => {
    (async () => {
      await mapServiceRef.current.load();
    })();
  }, []);

  // Warm the nick cache so the autocomplete bar is responsive on first keypress.
  useEffect(() => {
    loadNicks();
  }, []);

  // Keep silentModeEnabled ref in sync so processingAndAddLine can read current value
  useEffect(() => {
    silentModeEnabledRef.current = silentModeEnabled;
  }, [silentModeEnabled]);

  // Keep playSound ref in sync so processingAndAddLine always has the latest version
  useEffect(() => {
    playSoundRef.current = playSound;
  }, [playSound]);

  // Load triggers for the active server. Reloads when the server changes or
  // when the settings modal closes (user may have edited triggers from there).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const triggers = await getTriggersForServer(server.id);
      if (!cancelled) triggerEngine.setActiveTriggers(triggers);
    })();
    return () => {
      cancelled = true;
    };
  }, [server.id, settingsModalVisible]);

  useEffect(() => {
    const handler: TelnetEventHandler = {
      onData: (text: string) => {
        logService.appendIncoming(text);
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

              // Nick detection — two sources:
              //  1) WHO block: lines between "] Mortales [" and "[ Hay N mortales en …]"
              //  2) Direct communications: "Nick te dice/pregunta/exclama/susurra/grita/responde"
              if (/\]\s*Mortales\s*\[/i.test(clean)) {
                inWhoBlockRef.current = true;
              } else if (/\[\s*Hay\s+\S+\s+mortales/i.test(clean)) {
                inWhoBlockRef.current = false;
              } else if (inWhoBlockRef.current) {
                const firstToken = clean.split(/\s+/)[0];
                if (firstToken && /^[A-Za-zÀ-ÿ'][A-Za-zÀ-ÿ'0-9]{1,}$/.test(firstToken)) {
                  recordNickSeen(firstToken);
                }
              }
              const dmMatch = clean.match(/([A-Za-zÀ-ÿ'][A-Za-zÀ-ÿ'0-9]+)\s+te\s+(?:dice|pregunta|exclama|susurra|grita|responde)\b/i);
              if (dmMatch) {
                recordNickSeen(dmMatch[1]);
              }

              // Check if we're locating and found the room
              if (intentionalLocateRef.current) {
                if (clean.match(/\[.*\]\s*$/)) {
                  let roomName = clean.replace(/^[>\]]\s*/, '');
                  const mapSvc = mapServiceRef.current;
                  if (mapSvc.isLoaded && roomName) {
                    const room = mapSvc.findRoom(roomName);
                    if (room) {
                      mapSvc.setCurrentRoom(room.id);
                      setCurrentRoom(room);
                      pushFloating('✓ Localizado', 'success', 2000);

                      // Blind mode: announce location
                      if (uiMode === 'blind') {
                        const exits = Object.keys(room.e || {}).sort().join(', ');
                        AccessibilityInfo.announceForAccessibility(
                          `${room.n}. Salidas: ${exits || 'ninguna'}`
                        );
                      }
                    } else {
                      pushFloating('✗ No localizado', 'error', 2000);

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
        setConnecting(false);
        autoLoginRef.current = false;
        setLoginFailed(false);
        logService.logConnect(server.host, server.port);
        if (!server.username || !server.password) {
          logService.markLoginComplete();
        }
        if (uiMode === 'blind') {
          AccessibilityInfo.announceForAccessibility('Conectado');
        }
      },
      onClose: () => {
        setConnected(false);
        setConnecting(false);
        autoLoginRef.current = false;
        setLoginFailed(false);
        logService.logDisconnect();
        if (uiMode === 'blind') {
          AccessibilityInfo.announceForAccessibility('Desconectado');
        }
      },
      onError: (err: string) => {
        setConnecting(false);
        Alert.alert('Error de conexión', err);
        if (uiMode === 'blind') {
          AccessibilityInfo.announceForAccessibility(`Error: ${err}`);
        }
      },
      onGMCP: (module: string, data: any) => {
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
            }
          }
          // If not localized yet: ignore Room.Actual, wait for manual ojear
        } else if (module === 'Room.Movimiento') {
          const dir = typeof data === 'string' ? data : String(data);
          const room = mapServiceRef.current.moveByDirection(dir);
          if (room) {
            setCurrentRoom(room);

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
    };

    logService.setCurrentServer(server.name, server.host, server.password);
    const telnet = new TelnetService(server, handler, encoding);
    telnetRef.current = telnet;
    setConnecting(true);
    telnet.connect();

    return () => {
      telnet.disconnect();
    };
  }, [server, uiMode, encoding]);

  const handleReconnect = useCallback(() => {
    if (connecting) return;
    telnetRef.current?.disconnect();
    setConnecting(true);
    telnetRef.current?.connect();
  }, [connecting]);

  const selectionMode = selectionAnchorId !== null && selectionTargetId !== null;
  const selectionRange = useMemo(() => {
    if (selectionAnchorId == null || selectionTargetId == null) return null;
    const a = Math.min(selectionAnchorId, selectionTargetId);
    const b = Math.max(selectionAnchorId, selectionTargetId);
    return { from: a, to: b };
  }, [selectionAnchorId, selectionTargetId]);

  const handleLineLongPress = useCallback((id: number) => {
    if (uiMode !== 'completo') return;
    setSelectionAnchorId(id);
    setSelectionTargetId(id);
  }, [uiMode]);

  const handleLineTap = useCallback((id: number) => {
    setSelectionTargetId((prev) => (prev == null ? null : id));
  }, []);

  const cancelSelection = useCallback(() => {
    setSelectionAnchorId(null);
    setSelectionTargetId(null);
  }, []);

  const copySelectedAsText = useCallback(async () => {
    if (!selectionRange) {
      cancelSelection();
      return;
    }
    const { from, to } = selectionRange;
    const selected = lines.filter((l) => l.id >= from && l.id <= to);
    const text = selected.map((l) => l.spans.map((s) => s.text).join('')).join('\n');
    if (text) await Clipboard.setStringAsync(text);
    cancelSelection();
  }, [lines, selectionRange, cancelSelection]);

  useEffect(() => {
    if (connected && keepAwakeEnabled) {
      activateKeepAwakeAsync('mud-session');
      return () => {
        deactivateKeepAwake('mud-session');
      };
    }
  }, [connected, keepAwakeEnabled]);

  useEffect(() => {
    if (connected && backgroundConnectionEnabled) {
      startBackgroundConnection(server.name);
      return () => {
        stopBackgroundConnection();
      };
    }
  }, [connected, server.name, backgroundConnectionEnabled]);

  const stopWalk = useCallback(() => {
    if (walkActiveRef.current) {
      TorchZhylaForeground.cancelWalk().catch(() => {});
    }
    walkPathRef.current = [];
    walkStepRef.current = 0;
    walkActiveRef.current = false;
    setWalking(false);
  }, []);

  const walkTo = useCallback((targetRoom: MapRoom, options?: { stealth?: boolean }) => {
    if (walkActiveRef.current) return;

    const mapSvc = mapServiceRef.current;
    const current = mapSvc.getCurrentRoom();
    if (!current) {
      addLine('--- No se conoce tu posición actual. Usa LOC primero ---');
      return;
    }
    const path = mapSvc.findPath(current.id, targetRoom.id);
    if (!path || path.length === 0) {
      addLine('--- No existe un camino conocido hasta la sala indicada ---');
      return;
    }

    walkActiveRef.current = true;
    setWalking(true);
    setSearchVisible(false);
    walkPathRef.current = options?.stealth ? path.map((dir) => `sigilar ${dir}`) : path;
    walkStepRef.current = 0;

    const STEP_DELAY = 1100;
    TorchZhylaForeground.startWalk(walkPathRef.current, STEP_DELAY).catch(() => {
      walkActiveRef.current = false;
      walkPathRef.current = [];
      walkStepRef.current = 0;
      if (isMountedRef.current) setWalking(false);
    });
  }, []);

  const handleLocate = useCallback(() => {
    recentLinesRef.current = [];
    intentionalLocateRef.current = true;
    telnetRef.current?.send('ojear');
  }, []);

  // When locate completes and we're waiting for irsala setup, do it now
  useEffect(() => {
    if (waitingForIrsalaAfterLocateRef.current && currentRoom) {
      waitingForIrsalaAfterLocateRef.current = false;
      const nextText = 'irsala ';
      setInputText(nextText);
      setInputSelection({ start: nextText.length, end: nextText.length });
      const id = setTimeout(() => {
        textInputRef.current?.focus();
        pendingTimeoutsRef.current.delete(id);
      }, 100);
      pendingTimeoutsRef.current.add(id);
    }
  }, [currentRoom]);

  const handleAddTextButton = useCallback((command: string) => {
    const nextText = command + ' ';
    setInputText(nextText);
    setInputSelection({ start: nextText.length, end: nextText.length });
    // blur+focus reliably pops the soft keyboard on Android — calling
    // .focus() alone is a no-op when the input already had logical focus.
    suppressClearOnHideRef.current = true;
    textInputRef.current?.blur();
    const id = setTimeout(() => {
      textInputRef.current?.focus();
      pendingTimeoutsRef.current.delete(id);
    }, 100);
    pendingTimeoutsRef.current.add(id);
  }, []);

  const sendCommand = useCallback((command: string, skipHistory?: boolean) => {
    // ";;" acts as a command separator: split and dispatch each piece in order.
    // Guarded by skipHistory so recursive calls don't re-split or duplicate history.
    if (!skipHistory && command.includes(';;')) {
      const parts = command.split(';;').map((s) => s.trim()).filter(Boolean);
      if (parts.length > 1) {
        if (!skipHistory) setCommandHistory([command, ...commandHistory]);
        for (const part of parts) sendCommand(part, true);
        return;
      }
    }

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
        if (!skipHistory) setCommandHistory([command, ...commandHistory]);
        return;
      }

      // If localized, open input with "irsala " pre-filled (same as completo mode)
      const nextText = 'irsala ';
      setInputText(nextText);
      setInputSelection({ start: nextText.length, end: nextText.length });
      setTimeout(() => {
        textInputRef.current?.focus();
      }, 100);
      if (!skipHistory) setCommandHistory([command, ...commandHistory]);
      return;
    }

    // Intercept irsala / sigilarsala command
    const irsalaMatch = command.match(/^(sigilarsala|irsala)\s+(.+)$/i);
    if (irsalaMatch) {
      const stealth = irsalaMatch[1].toLowerCase() === 'sigilarsala';
      const query = irsalaMatch[2];
      const mapSvc = mapServiceRef.current;
      if (mapSvc.isLoaded) {
        const results = mapSvc.searchRooms(query);
        if (results.length === 0) {
          addLine(`--- No se encontró ninguna sala con "${query}" ---`);
        } else if (results.length === 1) {
          walkTo(results[0], { stealth });
        } else {
          pendingStealthSearchRef.current = stealth;
          setSearchResults(results);
          setSearchVisible(true);
        }
      }
      if (!skipHistory) setCommandHistory([command, ...commandHistory]);
      return;
    }

    // Intercept LOCATE command
    if (command.toLowerCase() === 'locate') {
      if (!skipHistory) setCommandHistory([command, ...commandHistory]);
      handleLocate();
      return;
    }

    // Intercept stat consultation commands
    const cmdLower = command.toLowerCase();

    if (cmdLower === 'consultar vida') {
      pushFloating(`Vida: ${hp}/${hpMax}`, 'info', 2000);
      if (!skipHistory) setCommandHistory([command, ...commandHistory]);
      return;
    }

    if (cmdLower === 'consultar energia') {
      pushFloating(`Energía: ${energy}/${energyMax}`, 'info', 2000);
      if (!skipHistory) setCommandHistory([command, ...commandHistory]);
      return;
    }

    if (cmdLower === 'consultar salidas') {
      const playerVars = blindModeService.getPlayerVariables();
      const exits = playerVars.roomExits || 'ninguna';
      pushFloating(`Salidas: ${exits}`, 'info', 2000);
      if (!skipHistory) setCommandHistory([command, ...commandHistory]);
      return;
    }

    if (cmdLower === 'xp') {
      const playerVars = blindModeService.getPlayerVariables();
      pushFloating(`XP: ${playerVars.playerXP}`, 'info', 2000);
      if (!skipHistory) setCommandHistory([command, ...commandHistory]);
      return;
    }

    if (cmdLower === 'ultimo daño') {
      const playerVars = blindModeService.getPlayerVariables();
      const damageMessage = playerVars.hpHistory.length > 0
        ? playerVars.hpHistory[playerVars.hpHistory.length - 1].label
        : 'Sin registro';
      pushFloating(damageMessage, 'info', 2000);
      if (!skipHistory) setCommandHistory([command, ...commandHistory]);
      return;
    }

    if (cmdLower === 'enemigos') {
      const playerVars = blindModeService.getPlayerVariables();
      const enemiesMessage = playerVars.roomEnemies || 'ninguno';
      pushFloating(`Enemigos: ${enemiesMessage}`, 'info', 2000);
      if (!skipHistory) setCommandHistory([command, ...commandHistory]);
      return;
    }

    // Handle panel switch (blind or completo)
    if (command === '__SWITCH_PANEL__') {
      if (uiMode === 'blind') {
        const nextPanel = currentBlindPanel === 1 ? 2 : 1;
        setCurrentBlindPanel(nextPanel);
        AccessibilityInfo.announceForAccessibility(`Panel ${nextPanel}`);
      } else {
        const nextPanel = currentCompletoPanel === 1 ? 2 : 1;
        setCurrentCompletoPanel(nextPanel);
      }
      return;
    }

    if (connected) {
      telnetRef.current?.send(command);
      if (!skipHistory) setCommandHistory([command, ...commandHistory]);
    }

    // Cancel walk if any other command is sent
    if (walking) {
      stopWalk();
      addLine('--- Movimiento cancelado ---');
    }
  }, [connected, commandHistory, walking, stopWalk, walkTo, handleLocate, addLine, hp, hpMax, energy, energyMax, uiMode, currentBlindPanel, currentCompletoPanel]);

  const handleSendInput = () => {
    if (inputText.trim()) {
      const trimmed = inputText.trim();
      sendCommand(trimmed);
      // Close keyboard on irsala/sigilarsala so the user can see the results list.
      if (/^(irsala|sigilarsala)\s+\S/i.test(trimmed)) {
        Keyboard.dismiss();
      }
      // Preserve common conversation prefixes so the user can keep typing.
      const firstWord = trimmed.split(/\s+/)[0];
      if (firstWord && /^(responder|decir)$/i.test(firstWord)) {
        setInputText(firstWord + ' ');
      } else {
        setInputText('');
      }
    }
  };

  const handleEditButton = (col: number, row: number) => {
    // Don't allow editing fixed buttons (like SWITCH and IR)
    // Filter by current panel for the active mode
    const button = buttonLayout?.buttons.find(b => {
      if (b.col !== col || b.row !== row) return false;
      if (uiMode === 'blind') {
        return !b.blindPanel || b.blindPanel === currentBlindPanel;
      }
      return !b.completoPanel || b.completoPanel === currentCompletoPanel;
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
      const storageCol = editButtonCol;
      const storageRow = editButtonRow;

      const updated = buttonLayout.buttons.filter(b => {
        // Also check panel to avoid removing buttons from other panels in the same slot
        if (uiMode === 'blind') {
          return !(b.col === storageCol && b.row === storageRow && b.blindPanel === currentBlindPanel);
        }
        return !(b.col === storageCol && b.row === storageRow && (b.completoPanel ?? currentCompletoPanel) === currentCompletoPanel);
      });
      if (btn.label && btn.label !== '—') {
        // Ensure the right panel is preserved when saving
        if (uiMode === 'blind') {
          btn.blindPanel = currentBlindPanel;
        } else {
          btn.completoPanel = currentCompletoPanel;
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

    const updated = buttonLayout.buttons.filter(b => {
      if (b.col !== editButtonCol || b.row !== editButtonRow) return true;
      if (uiMode === 'blind') {
        return b.blindPanel !== undefined && b.blindPanel !== currentBlindPanel;
      }
      return b.completoPanel !== undefined && b.completoPanel !== currentCompletoPanel;
    });

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
          return !b.completoPanel || b.completoPanel === currentCompletoPanel;
        });
      };

      const sourceBtn = findButton(sourceCol, sourceRow);
      const targetBtn = findButton(targetCol, targetRow);

      const updated = buttonLayout.buttons.map(b => {
        // Only swap buttons from the same panel as the active one
        if (uiMode === 'blind' && b.blindPanel !== currentBlindPanel) {
          return b;
        }
        if (uiMode !== 'blind' && b.completoPanel !== undefined && b.completoPanel !== currentCompletoPanel) {
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

  // FlatList is rendered with `inverted` and the data reversed: newest line at
  // index 0, oldest at the end. The `scaleY(-1)` that `inverted` applies then
  // places newest at the visual bottom. Offset 0 = newest visible; offset grows
  // as the user scrolls up to see older history. New lines prepend to data[0]
  // automatically, so when the user is at offset 0 they stay pinned to the
  // latest message — no programmatic scroll needed.
  const reversedLines = useMemo(() => [...lines].reverse(), [lines]);

  const handleFlatListScroll = (event: any) => {
    const { contentOffset } = event.nativeEvent;
    currentScrollOffsetRef.current = contentOffset.y;
    const isAtEnd = contentOffset.y <= 50;
    setIsAtBottom(isAtEnd);
    setShowScrollToBottom(!isAtEnd && lines.length > 0);
  };

  const handleScrollToBottom = () => {
    setIsAtBottom(true);
    setShowScrollToBottom(false);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const handleScrollToTop = () => {
    flatListRef.current?.scrollToEnd({ animated: true });
  };

  // Word under cursor for the nick autocomplete.
  const getCurrentWordBounds = (text: string, cursor: number) => {
    let start = cursor;
    while (start > 0 && /\S/.test(text[start - 1])) start--;
    let end = cursor;
    while (end < text.length && /\S/.test(text[end])) end++;
    return { start, end, word: text.slice(start, end) };
  };

  // Recompute suggestions whenever the text, cursor, or mode changes.
  useEffect(() => {
    if (uiMode !== 'blind') {
      setNickSuggestions([]);
      return;
    }
    const { word } = getCurrentWordBounds(inputText, inputSelection.end);
    // Only suggest when at least one character is typed — otherwise the bar
    // would show the full recent list every time the keyboard appears.
    if (word.length < 1) {
      setNickSuggestions([]);
      return;
    }
    const matches = filterNicks(word, 8).map((e) => e.nick);
    // Don't suggest the word itself if it's already a complete match.
    setNickSuggestions(matches.filter((n) => n.toLowerCase() !== word.toLowerCase()));
  }, [inputText, inputSelection, uiMode]);

  const handleSelectNickSuggestion = (nick: string) => {
    const cursor = inputSelection.end;
    const { start, end } = getCurrentWordBounds(inputText, cursor);
    const before = inputText.slice(0, start);
    const after = inputText.slice(end);
    // Insert nick + trailing space so the user can continue typing.
    const insertion = nick + ' ';
    const newText = before + insertion + after;
    const newCursor = start + insertion.length;
    setInputText(newText);
    setInputSelection({ start: newCursor, end: newCursor });
    setHistoryIndex(-1);
    // Defensive: re-focus the input in case the chip tap dropped focus.
    textInputRef.current?.focus();
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
        // FlatList is inverted: dragging finger down (gs.dy > 0) reveals older
        // content, which in inverted coords means INCREASING the offset.
        flatListRef.current?.scrollToOffset({
          offset: scrollStartRef.current.offset + gs.dy,
          animated: false,
        });
        scrollVelocityRef.current = gs.vy * 50;
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

  // Filter buttons by current panel (per mode)
  const filteredButtons = buttonLayout
    ? (uiMode === 'blind'
        ? buttonLayout.buttons.filter(btn => !btn.blindPanel || btn.blindPanel === currentBlindPanel)
        : buttonLayout.buttons.filter(btn => !btn.completoPanel || btn.completoPanel === currentCompletoPanel))
    : [];
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
            ref={flatListRef}
            data={reversedLines}
            inverted
            keyExtractor={item => String(item.id)}
            renderItem={({ item }) => {
              const isSelected =
                selectionRange != null &&
                item.id >= selectionRange.from &&
                item.id <= selectionRange.to;
              return (
                <Pressable
                  key={item.id}
                  onLongPress={uiMode === 'completo' ? () => handleLineLongPress(item.id) : undefined}
                  onPress={selectionMode ? () => handleLineTap(item.id) : undefined}
                  style={[styles.lineContainer, isSelected && styles.lineSelected]}
                >
                  <AnsiText spans={item.spans} fontSize={fontSize} lineId={item.id} />
                </Pressable>
              );
            }}
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
                ref={miniMapRef}
                mapService={mapServiceRef.current}
                currentRoom={currentRoom}
                visible={mapVisible}
                onToggle={() => setMapVisible(!mapVisible)}
                walking={walking}
                onStop={stopWalk}
                selectedRoomId={previewRoomId}
                onSelectRoom={(room) => {
                  if (previewRoomId === room.id) {
                    setPreviewRoomId(null);
                    walkTo(room);
                  } else {
                    setPreviewRoomId(room.id);
                  }
                }}
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

        {/* Nick autocomplete bar (blind mode only) — sits right above the
            input row; adjustResize docks it above the soft keyboard. */}
        <NickAutocomplete
          visible={uiMode === 'blind' && inputFocused}
          suggestions={nickSuggestions}
          onSelect={handleSelectNickSuggestion}
        />

        {/* Input Row */}
        <View style={[styles.inputSection, { height: inputHeight }, uiMode === 'completo' && { marginTop: 2 }]}>
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
                  <Text style={[styles.sendButtonText, { fontSize: 14 }]}>{silentModeEnabled ? 'Silencio' : 'Sonido'}</Text>
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
                  <Text style={[styles.sendButtonText, { fontSize: 14 }]}>Canales</Text>
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
                selection={inputSelection}
                onChangeText={(text) => {
                  setInputText(text);
                  setHistoryIndex(-1);
                }}
                onSelectionChange={(e) => setInputSelection(e.nativeEvent.selection)}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                onSubmitEditing={handleSendInput}
                blurOnSubmit={false}
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
                <Text style={[styles.sendButtonText, uiMode === 'blind' && { fontSize: 14 }]}>
                  {uiMode === 'blind' ? 'Enviar' : '›'}
                </Text>
              </TouchableOpacity>

              {uiMode === 'completo' && (
                <>
                  <TouchableOpacity
                    style={[styles.compactButton, { backgroundColor: '#336699' }]}
                    onPress={() => setBlindChannelModalVisible(true)}
                    accessible={true}
                    accessibilityLabel="Abrir canales"
                    accessibilityRole="button"
                    accessibilityHint="Abre el panel de mensajes de canales"
                  >
                    <Text style={styles.compactButtonText}>💬</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.compactButton, { backgroundColor: silentModeEnabled ? '#ff6600' : '#666666' }]}
                    onPress={() => setSilentModeEnabled(!silentModeEnabled)}
                    accessible={true}
                    accessibilityLabel={`Silenciar sonidos ${silentModeEnabled ? 'desactivado' : 'activado'}`}
                    accessibilityRole="button"
                    accessibilityHint="Activa/desactiva los sonidos de eventos"
                  >
                    <Text style={styles.compactButtonText}>{silentModeEnabled ? '🔇' : '🔊'}</Text>
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity
                style={[
                  styles.compactButton,
                  { backgroundColor: '#663366' },
                  uiMode === 'blind' && styles.blindTextButton,
                ]}
                onPress={() => setSettingsModalVisible(true)}
                accessible={true}
                accessibilityLabel="Configuración"
                accessibilityRole="button"
                accessibilityHint="Abre la configuración de la aplicación"
              >
                <Text style={[styles.compactButtonText, uiMode === 'blind' && { fontSize: 14 }]}>
                  {uiMode === 'blind' ? 'Ajustes' : '⚙️'}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.input, styles.reconnectButton, connecting && { opacity: 0.5 }]}
              onPress={handleReconnect}
              disabled={connecting}
              accessible={true}
              accessibilityLabel={connecting ? 'Conectando' : 'Reconectar'}
              accessibilityRole="button"
              accessibilityState={{ disabled: connecting }}
              accessibilityHint={connecting ? 'Conectando al servidor' : 'Reconéctate al servidor'}
            >
              <Text style={styles.reconnectText}>{connecting ? 'Conectando…' : 'Reconectar'}</Text>
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
              ref={flatListRef}
              data={reversedLines}
              inverted
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
                  ref={miniMapRef}
                  mapService={mapServiceRef.current}
                  currentRoom={currentRoom}
                  visible={mapVisible}
                  onToggle={() => setMapVisible(!mapVisible)}
                  walking={walking}
                  onStop={stopWalk}
                  selectedRoomId={previewRoomId}
                  onSelectRoom={(room) => {
                    if (previewRoomId === room.id) {
                      setPreviewRoomId(null);
                      walkTo(room);
                    } else {
                      setPreviewRoomId(room.id);
                    }
                  }}
                />
              </View>
            )}
          </View>

          {/* Nick autocomplete bar (blind mode only). */}
          <NickAutocomplete
            visible={uiMode === 'blind' && inputFocused}
            suggestions={nickSuggestions}
            onSelect={handleSelectNickSuggestion}
          />

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
                    <Text style={[styles.sendButtonText, { fontSize: 14 }]}>{silentModeEnabled ? 'Silencio' : 'Sonido'}</Text>
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
                    <Text style={[styles.sendButtonText, { fontSize: 14 }]}>Canales</Text>
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
                  selection={inputSelection}
                  onChangeText={(text) => {
                    setInputText(text);
                    setHistoryIndex(-1);
                  }}
                  onSelectionChange={(e) => setInputSelection(e.nativeEvent.selection)}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  onSubmitEditing={handleSendInput}
                  blurOnSubmit={false}
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
                  <Text style={[styles.sendButtonText, uiMode === 'blind' && { fontSize: 14 }]}>
                    {uiMode === 'blind' ? 'Enviar' : '›'}
                  </Text>
                </TouchableOpacity>

                {uiMode === 'completo' && (
                  <>
                    <TouchableOpacity
                      style={[styles.compactButton, { backgroundColor: '#336699' }]}
                      onPress={() => setBlindChannelModalVisible(true)}
                      accessible={true}
                      accessibilityLabel="Abrir canales"
                      accessibilityRole="button"
                      accessibilityHint="Abre el panel de mensajes de canales"
                    >
                      <Text style={styles.compactButtonText}>💬</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.compactButton, { backgroundColor: silentModeEnabled ? '#ff6600' : '#666666' }]}
                      onPress={() => setSilentModeEnabled(!silentModeEnabled)}
                      accessible={true}
                      accessibilityLabel={`Silenciar sonidos ${silentModeEnabled ? 'desactivado' : 'activado'}`}
                      accessibilityRole="button"
                      accessibilityHint="Activa/desactiva los sonidos de eventos"
                    >
                      <Text style={styles.compactButtonText}>{silentModeEnabled ? '🔇' : '🔊'}</Text>
                    </TouchableOpacity>
                  </>
                )}

                <TouchableOpacity
                  style={[
                    styles.compactButton,
                    { backgroundColor: '#663366' },
                    uiMode === 'blind' && styles.blindTextButton,
                  ]}
                  onPress={() => setSettingsModalVisible(true)}
                  accessible={true}
                  accessibilityLabel="Configuración"
                  accessibilityRole="button"
                  accessibilityHint="Abre la configuración de la aplicación"
                >
                  <Text style={[styles.compactButtonText, uiMode === 'blind' && { fontSize: 14 }]}>
                    {uiMode === 'blind' ? 'Ajustes' : '⚙️'}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={[styles.input, styles.reconnectButton, connecting && { opacity: 0.5 }]}
                onPress={handleReconnect}
                disabled={connecting}
                accessible={true}
                accessibilityLabel={connecting ? 'Conectando' : 'Reconectar'}
                accessibilityRole="button"
                accessibilityState={{ disabled: connecting }}
                accessibilityHint={connecting ? 'Conectando al servidor' : 'Reconéctate al servidor'}
              >
                <Text style={styles.reconnectText}>{connecting ? 'Conectando…' : 'Reconectar'}</Text>
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
              />
            </View>
          </View>
        )}
      </View>
      )}

      {/* Alias Wizard Modal */}
      {/* Button Edit Modal */}
      {(() => {
        return (
          <ButtonEditModal
            visible={editButtonVisible}
            col={editButtonCol}
            row={editButtonRow}
            button={buttonLayout?.buttons.find(b => {
              if (b.col !== editButtonCol || b.row !== editButtonRow) return false;
              if (uiMode === 'blind') {
                return !b.blindPanel || b.blindPanel === currentBlindPanel;
              }
              return !b.completoPanel || b.completoPanel === currentCompletoPanel;
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
          channelOrder={channelOrder}
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
          onOrderChange={(order) => {
            setChannelOrder(order);
            saveChannelOrder(server.id, order);
          }}
          fontSize={fontSize}
        />
      )}

      {/* Settings Modal */}
      <Modal
        visible={settingsModalVisible}
        animationType="slide"
        onRequestClose={() => setSettingsModalVisible(false)}
      >
        <View
          style={{
            width: width,
            height: height,
            backgroundColor: '#000',
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#111', borderBottomWidth: 1, borderBottomColor: '#333' }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#00cc00', fontFamily: 'monospace' }}>
              Configuración
            </Text>
            <TouchableOpacity
              onPress={() => setSettingsModalVisible(false)}
              accessible={true}
              accessibilityLabel="Cerrar configuración"
              accessibilityRole="button"
            >
              <Text style={{ fontSize: 24, color: '#00cc00' }}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1, minHeight: 0 }}>
            <SettingsScreen
              navigation={navigation as unknown as NativeStackScreenProps<RootStackParamList, 'Settings'>['navigation']}
              sourceLocation="terminal"
              onFontSizeChange={setFontSize}
              onSoundToggle={(enabled) => silentModeEnabledRef.current = !enabled}
              onGesturesEnabledChange={(enabled) => gesturesEnabledRef.current = enabled}
            />
          </View>
        </View>
      </Modal>

      {/* Room Search Results */}
      <RoomSearchResults
        rooms={searchResults}
        visible={searchVisible}
        highlightedRoomId={previewRoomId}
        uiMode={uiMode}
        onSelect={(room) => {
          if (uiMode === 'completo') {
            if (previewRoomId === room.id) {
              const stealth = pendingStealthSearchRef.current;
              pendingStealthSearchRef.current = false;
              setPreviewRoomId(null);
              setSearchVisible(false);
              miniMapRef.current?.resetView();
              walkTo(room, { stealth });
            } else {
              setPreviewRoomId(room.id);
              miniMapRef.current?.previewRoom(room);
            }
          } else {
            const stealth = pendingStealthSearchRef.current;
            pendingStealthSearchRef.current = false;
            setPreviewRoomId(null);
            setSearchVisible(false);
            walkTo(room, { stealth });
          }
        }}
        onClose={() => {
          pendingStealthSearchRef.current = false;
          setSearchVisible(false);
          setPreviewRoomId(null);
          miniMapRef.current?.resetView();
        }}
      />

      {/* Exit confirmation modal (blind mode) */}
      <Modal
        visible={exitConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={cancelExit}
      >
        <View style={styles.exitModalOverlay}>
          <View style={styles.exitModalBox}>
            <Text style={styles.exitModalTitle} accessibilityRole="header">
              ¿Salir y desconectar?
            </Text>
            <Text style={styles.exitModalDesc}>
              Se cerrará la conexión al servidor.
            </Text>
            <View style={styles.exitModalButtons}>
              <TouchableOpacity
                style={[styles.exitModalButton, styles.exitModalButtonCancel]}
                onPress={cancelExit}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Cancelar, volver al terminal"
              >
                <Text style={styles.exitModalButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.exitModalButton, styles.exitModalButtonConfirm]}
                onPress={confirmExit}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Sí, salir y desconectar"
              >
                <Text style={styles.exitModalButtonText}>Sí, salir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Exit toast (normal mode) */}
      {exitToastVisible && (
        <View
          style={[styles.exitToast, { bottom: insets.bottom + 40 }]}
          pointerEvents="none"
        >
          <Text style={styles.exitToastText}>
            Pulsa atrás de nuevo para salir
          </Text>
        </View>
      )}

      {selectionMode && uiMode === 'completo' && (
        <View style={styles.selectionBar} pointerEvents="box-none">
          <View style={styles.selectionBarInner}>
            <TouchableOpacity onPress={copySelectedAsText} style={styles.selectionBtn}>
              <Text style={styles.selectionBtnText}>Copiar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={cancelSelection} style={[styles.selectionBtn, styles.selectionBtnCancel]}>
              <Text style={styles.selectionBtnText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <FloatingMessages />
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
  lineSelected: {
    backgroundColor: 'rgba(85, 170, 221, 0.3)',
  },
  selectionBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: 8,
  },
  selectionBarInner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    borderRadius: 8,
    padding: 6,
    gap: 6,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  selectionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#2a5a7a',
    borderRadius: 6,
  },
  selectionBtnCancel: {
    backgroundColor: '#5a2a2a',
  },
  selectionBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
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
  compactButton: {
    width: 40,
    alignSelf: 'stretch',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
  },
  compactButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  // Width override for blind-mode "compact" buttons that show text instead of an icon.
  blindTextButton: {
    width: undefined,
    paddingHorizontal: 12,
  },
  exitModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  exitModalBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    padding: 20,
    minWidth: 280,
    maxWidth: 400,
  },
  exitModalTitle: {
    color: '#00cc00',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  exitModalDesc: {
    color: '#ccc',
    fontSize: 14,
    marginBottom: 20,
  },
  exitModalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  exitModalButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 4,
    marginLeft: 8,
  },
  exitModalButtonCancel: {
    backgroundColor: '#333',
  },
  exitModalButtonConfirm: {
    backgroundColor: '#662222',
  },
  exitModalButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  exitToast: {
    position: 'absolute',
    left: 24,
    right: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  exitToastText: {
    color: '#fff',
    fontSize: 14,
  },
});
