import React, { useState, useEffect, useRef, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, MudLine } from '../types';
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
import { ButtonLayout, createDefaultLayout, loadLayout, saveLayout } from '../storage/layoutStorage';
import { loadServers, saveServers } from '../storage/serverStorage';
import { blindModeService } from '../services/blindModeService';

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

  const fontSizeRef = useRef(14);
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
  const isLocatingRef = useRef(false);
  const textInputRef = useRef<TextInput>(null);

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
      })();

      // Reset blind mode service history periodically
      const historyResetInterval = setInterval(() => {
        blindModeService.resetHistory();
      }, 60000); // Every minute

      return () => clearInterval(historyResetInterval);
    }, [])
  );

  useEffect(() => {
    (async () => {
      const layout = await loadLayout();
      // Replace LOGIN_NAME placeholder with actual server name
      const buttons = layout.buttons.map(btn =>
        btn.command === '__LOGIN_NAME__'
          ? { ...btn, command: server.name }
          : btn
      );
      setButtonLayout({ buttons });
      if (server.buttonLayout) {
        const serverButtons = (server.buttonLayout as ButtonLayout).buttons.map(btn =>
          btn.command === '__LOGIN_NAME__'
            ? { ...btn, command: server.name }
            : btn
        );
        setButtonLayout({ buttons: serverButtons });
      }

      // Load map for locate command
      await mapServiceRef.current.load();
    })();
  }, [server]);

  const addLine = (text: string) => {
    // Skip lines that don't contain any letters or numbers
    if (!/[a-z0-9]/i.test(text)) return;

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

    if (uiMode === 'blind') {
      const result = blindModeService.processLine(text);

      // Skip line if filter says to silence it
      if (!result.shouldDisplay) return;

      displayText = result.modifiedText;

      // Handle announcements from filters
      if (result.announcement) {
        shouldAnnounce = true;
        announcementText = result.announcement;
      }
    }

    const spans = parseAnsi(displayText);
    const newLine: MudLine = { id: lineIdCounter++, spans };
    linesRef.current = [...linesRef.current, newLine];
    if (linesRef.current.length > MAX_LINES) {
      linesRef.current = linesRef.current.slice(-MAX_LINES);
    }
    setLines([...linesRef.current]);

    // Announce filtered content in blind mode
    if (shouldAnnounce && uiMode === 'blind') {
      blindModeService.announceMessage(announcementText, 'normal');
    }

    if (isAtBottomRef.current) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 50);
    }
  };

  const addMultipleLines = (texts: string[]) => {
    let hasAdded = false;
    texts.forEach(text => {
      const cleanForLog = text.replace(/\x1b/g, '\\x1b').replace(/\n/g, '\\n');
      console.log(`[TERMINAL] Recibida (len=${text.length}): "${cleanForLog}"`);

      // Remove ANSI codes first, then check if there are letters or numbers
      const withoutAnsi = text.replace(/\x1b\[[0-9;]*m/g, '');
      if (!/[a-z0-9]/i.test(withoutAnsi)) {
        console.log(`[TERMINAL] ✗ Filtrada: sin letras/números (después remover ANSI)`);
        return;
      }

      // Skip empty lines if last line was also empty
      const isBlank = text.trim().length === 0;
      if (isBlank) {
        if (lastLineBlankRef.current) {
          console.log(`[TERMINAL] ✗ Filtrada (línea en blanco repetida)`);
          return;
        }
        lastLineBlankRef.current = true;
      } else {
        lastLineBlankRef.current = false;
      }

      // Skip lines that are only ">" or whitespace + ">"
      const cleanText = text.trim();
      if (cleanText === '>' || cleanText.endsWith('>')) {
        if (/^\s*>\s*$/.test(text)) {
          console.log(`[TERMINAL] ✗ Filtrada (solo ">")`);
          return;
        }
      }

      // Skip lines that are only template variables like <VERSION>, <NAME>, etc
      if (/^\s*<[A-Z_]+>\s*$/.test(text)) {
        console.log(`[TERMINAL] ✗ Filtrada: template variable`);
        return;
      }

      console.log(`[TERMINAL] ✓ Mostrada (len=${text.length}): "${cleanForLog}"`);
      const spans = parseAnsi(text);
      const newLine: MudLine = { id: lineIdCounter++, spans };
      linesRef.current.push(newLine);
      hasAdded = true;
    });
    if (linesRef.current.length > MAX_LINES) {
      linesRef.current = linesRef.current.slice(-MAX_LINES);
    }
    if (hasAdded) {
      setLines([...linesRef.current]);
    }

    if (isAtBottomRef.current && hasAdded) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 150);
    }
  };

  const telnetRef = useRef<TelnetService | null>(null);

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
              if (isLocatingRef.current) {
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
                          `Localización encontrada. Sala: ${room.n}. Salidas: ${exits || 'ninguna'}`
                        );
                      }

                      isLocatingRef.current = false;
                    } else {
                      console.log('[LOCATE] ✗ No encontrada en mapa');
                      setLocateFeedback('failed');
                      setTimeout(() => setLocateFeedback(null), 2000);

                      // Blind mode: announce failure
                      if (uiMode === 'blind') {
                        AccessibilityInfo.announceForAccessibility(
                          `No se encontró la sala: ${roomName}`
                        );
                      }
                    }
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
        if (uiMode === 'blind') {
          AccessibilityInfo.announceForAccessibility(
            `Conectado a ${server.name}. Comando listo para enviar.`
          );
        }
      },
      onClose: () => {
        setConnected(false);
        if (uiMode === 'blind') {
          AccessibilityInfo.announceForAccessibility('Desconectado del servidor');
        }
      },
      onError: (err: string) => {
        Alert.alert('Error de conexión', err);
        if (uiMode === 'blind') {
          AccessibilityInfo.announceForAccessibility(`Error: ${err}`);
        }
      },
      onGMCP: (module: string, data: any) => {
        if (module === 'Room.Actual') {
          const roomName = typeof data === 'string' ? data : String(data);
          const room = mapServiceRef.current.findRoom(roomName);
          if (room) {
            mapServiceRef.current.setCurrentRoom(room.id);
            setCurrentRoom(room);
            const nearby = mapServiceRef.current.getNearbyRooms(room.x, room.y, room.z, 15);
            setNearbyRooms(nearby);
          }
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
                `Entraste a ${room.n}. Salidas disponibles: ${exits || 'ninguna'}`
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
        } else if (module === 'Comm.Vitals') {
          if (data.hp !== undefined) setHp(data.hp);
          if (data.hpMax !== undefined) setHpMax(data.hpMax);
          if (data.hp_max !== undefined) setHpMax(data.hp_max);
          if (data.energy !== undefined) setEnergy(data.energy);
          if (data.energyMax !== undefined) setEnergyMax(data.energyMax);
          if (data.energy_max !== undefined) setEnergyMax(data.energy_max);
        }
      },
    });

    telnetRef.current = telnet;
    telnet.connect();

    return () => {
      telnet.disconnect();
    };
  }, [server]);

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

  const updateMapPosition = useCallback((room: MapRoom) => {
    setCurrentRoom(room);
    mapServiceRef.current.setCurrentRoom(room.id);
    const nearby = mapServiceRef.current.getNearbyRooms(room.x, room.y, room.z, 15);
    setNearbyRooms(nearby);
  }, []);

  const handleLocate = useCallback(() => {
    if (!telnetRef.current) return;
    recentLinesRef.current = [];
    isLocatingRef.current = true;
    telnetRef.current.send('ojear');
  }, []);

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

    if (connected) {
      telnetRef.current.send(command);
      setCommandHistory([command, ...commandHistory]);
    }

    // Cancel walk if any other command is sent
    if (walking) {
      stopWalk();
      addLine('--- Movimiento cancelado ---');
    }
  }, [connected, commandHistory, walking, stopWalk, walkTo, handleLocate, addLine]);

  const handleSendInput = () => {
    if (inputText.trim()) {
      sendCommand(inputText);
      setInputText('');
    }
  };

  const handleCaptureAliases = () => {
    isCapturingAliasRef.current = true;
    aliasBufferRef.current = [];
    sendCommand('alias');
  };

  const handleEditButton = (col: number, row: number) => {
    setEditButtonCol(col);
    setEditButtonRow(row);
    setEditButtonVisible(true);
  };

  const handleSaveEditButton = async (btn: any) => {
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
    if (btn.label && btn.label !== '—') {
      updated.push(btn);
    }

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
      const sourceBtn = buttonLayout.buttons.find(b => b.col === sourceCol && b.row === sourceRow);
      const targetBtn = buttonLayout.buttons.find(b => b.col === targetCol && b.row === targetRow);

      const updated = buttonLayout.buttons.map(b => {
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

      setMoveMode(false);
    }
  };

  const handleFlatListScroll = (event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
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

  const isHorizontal = width > height;
  const availableHeight = height - insets.top - insets.bottom;
  const vitalsHeight = 35;
  const inputHeight = 30;

  // Grid dimensions - change for minimalist mode
  const isMinimalista = uiMode === 'blind';
  const gridCols = isMinimalista ? 2 : GRID_COLS;
  const gridRows = isMinimalista ? 4 : GRID_ROWS;
  const cellSize = width / gridCols;
  const BUTTON_PADDING_VERTICAL = 3 * 2;
  const BUTTON_GAP = 3;
  const BUTTON_GAPS_TOTAL = (gridRows - 1) * BUTTON_GAP;
  const buttonGridHeight = gridRows * cellSize + BUTTON_GAPS_TOTAL + BUTTON_PADDING_VERTICAL;

  // Horizontal layout dimensions
  const vitalsWidth = 30;
  const horizontalCellSize = (availableHeight - inputHeight) / 9; // 9 rows in horizontal, accounting for input
  const horizontalButtonGridWidth = isMinimalista ? 2 * horizontalCellSize + BUTTON_GAP : 6 * horizontalCellSize + (6 - 1) * BUTTON_GAP;
  const horizontalRightPanelWidth = isMinimalista ? horizontalButtonGridWidth + 6 : vitalsWidth + horizontalButtonGridWidth + 10;
  const horizontalTerminalWidth = width - horizontalRightPanelWidth - insets.left - insets.right;

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

  return (
    <SafeAreaView style={styles.safeArea}>
      {!isHorizontal ? (
      // VERTICAL LAYOUT
      <View style={styles.container}>
        {/* Terminal (flex 1 - takes remaining space) */}
        <View
          style={[styles.terminalSection, { flex: 1 }]}
          accessible={true}
          accessibilityLabel="Terminal output"
          accessibilityRole="list"
          accessibilityLiveRegion={uiMode === 'blind' ? 'polite' : 'none'}
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
            scrollEventThrottle={16}
            onScroll={handleFlatListScroll}
            onScrollEndDrag={handleFlatListScroll}
            style={styles.flatList}
          />

          {/* Scroll to bottom button */}
          {showScrollToBottom && (
            <TouchableOpacity
              style={styles.scrollToBottomButton}
              onPress={handleScrollToBottom}
              accessible={true}
              accessibilityLabel="Scroll to bottom"
              accessibilityRole="button"
              accessibilityHint="Scroll terminal to latest message"
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
              accessibilityLabel={locateFeedback === 'success' ? 'Location found' : 'Location not found'}
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
          <TouchableOpacity
            style={styles.arrowButton}
            onPress={handleUpArrow}
            accessible={true}
            accessibilityLabel="Previous command"
            accessibilityRole="button"
            accessibilityHint="Navigate to previous command in history"
          >
            <Text style={styles.arrowText}>▲</Text>
          </TouchableOpacity>

          {connected ? (
            <>
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
                accessible={true}
                accessibilityLabel="Command input"
                accessibilityHint="Type a command and press send or return"
              />

              <TouchableOpacity
                style={styles.sendButton}
                onPress={handleSendInput}
                accessible={true}
                accessibilityLabel="Send command"
                accessibilityRole="button"
                accessibilityHint="Send the current command to the server"
              >
                <Text style={styles.sendButtonText}>›</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.input, styles.reconnectButton]}
              onPress={() => telnetRef.current?.connect()}
              accessible={true}
              accessibilityLabel="Reconnect"
              accessibilityRole="button"
              accessibilityHint="Reconnect to the server"
            >
              <Text style={styles.reconnectText}>Reconectar</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.arrowButton}
            onPress={handleDownArrow}
            accessible={true}
            accessibilityLabel="Next command"
            accessibilityRole="button"
            accessibilityHint="Navigate to next command in history"
          >
            <Text style={styles.arrowText}>▼</Text>
          </TouchableOpacity>
        </View>

        {/* ButtonGrid - Hidden in minimalist mode */}
        {uiMode === 'completo' && (
          <View style={[styles.buttonGridSection, { height: buttonGridHeight, paddingBottom: insets.bottom }]}>
            <ButtonGrid
              buttons={buttonLayout?.buttons || []}
              onSendCommand={sendCommand}
              onAddTextButton={handleAddTextButton}
              onEditButton={handleEditButton}
              moveMode={moveMode}
              sourceCol={sourceCol}
              sourceRow={sourceRow}
              onSwapButtons={handleSwapButtons}
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
        {/* Terminal Left */}
        <View style={[styles.terminalSection, { width: horizontalTerminalWidth, flex: 0 }]}>
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
            scrollEventThrottle={16}
            onScroll={handleFlatListScroll}
            onScrollEndDrag={handleFlatListScroll}
            style={styles.flatList}
          />

          {showScrollToBottom && (
            <TouchableOpacity style={styles.scrollToBottomButton} onPress={handleScrollToBottom}>
              <Text style={styles.scrollToBottomText}>↓</Text>
            </TouchableOpacity>
          )}

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
        </View>

        {/* VitalBars Vertical */}
        <View style={{ width: vitalsWidth, height: availableHeight }}>
          <VitalBars
            hp={hp}
            hpMax={hpMax}
            energy={energy}
            energyMax={energyMax}
            orientation="vertical"
          />
        </View>

        {/* Right Panel - ButtonGrid only - Hidden in minimalist mode */}
        {uiMode === 'completo' && (
          <View style={{ flex: 1, flexDirection: 'column' }}>
            {/* ButtonGrid Horizontal (5 cols x 9 rows) */}
            <View style={[styles.buttonGridSection, { flex: 1, paddingBottom: insets.bottom }]}>
              <ButtonGrid
                buttons={buttonLayout?.buttons || []}
                onSendCommand={sendCommand}
                onAddTextButton={handleAddTextButton}
                onEditButton={handleEditButton}
                moveMode={moveMode}
                sourceCol={sourceCol}
                sourceRow={sourceRow}
                onSwapButtons={handleSwapButtons}
                horizontalMode={{cols: isMinimalista ? 2 : 6, cellSize: horizontalCellSize}}
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
            button={buttonLayout?.buttons.find(b => b.col === searchCol && b.row === searchRow) || null}
            onSave={handleSaveEditButton}
            onDelete={handleDeleteButton}
            onMove={handleMoveButton}
            onClose={() => setEditButtonVisible(false)}
          />
        );
      })()}

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
});
