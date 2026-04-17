import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  TextInput,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  Keyboard,
  useWindowDimensions,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, MudLine, Macro } from '../types';
import { TelnetService } from '../services/telnetService';
import { parseAnsi } from '../utils/ansiParser';
import { AnsiText } from '../components/AnsiText';
import { FKeyBar } from '../components/FKeyBar';
import { MacroEditor } from '../components/MacroEditor';
import { DirectionPad } from '../components/DirectionPad';
import { LandscapeButtons } from '../components/LandscapeButtons';
import { MiniMap } from '../components/MiniMap';
import { VitalBars } from '../components/VitalBars';
import { RoomSearchResults } from '../components/RoomSearchResults';
import { ChannelTabs, ChannelActivePanel, ChannelMessage, nextMsgId } from '../components/ChannelPanel';
import { loadChannelAliases, saveChannelAliases } from '../storage/channelStorage';
import { loadSettings } from '../storage/settingsStorage';
import { ConfigProfileModal } from '../components/ConfigProfileModal';
import { MapService, MapRoom } from '../services/mapService';
import { loadFKeys, saveFKeys } from '../storage/fkeyStorage';
import { loadExtraButtons, saveExtraButtons } from '../storage/extraButtonStorage';
import { FloatingLayout } from '../components/FloatingLayout';
import { TerminalPanel } from '../components/TerminalPanel';
import { UnifiedTerminalLayout } from '../components/UnifiedTerminalLayout';

type Props = NativeStackScreenProps<RootStackParamList, 'Terminal'>;

const MAX_LINES = 2000;
let lineIdCounter = 0;

export function TerminalScreen({ route, navigation }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLandscape = width > height;
  const [customKeyboardActive, setCustomKeyboardActive] = useState(false);
  const keyboardHeight = isLandscape ? 273 : 182;
  const chatHeightCompressed = isLandscape ? 150 : 180;
  const availableHeight = height - insets.top - insets.bottom - (customKeyboardActive ? Math.max(0, keyboardHeight - chatHeightCompressed) : 0);
  const { server } = route.params;
  const [lines, setLines] = useState<MudLine[]>([]);
  const [inputText, setInputText] = useState('');
  const [connected, setConnected] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [fkeys, setFkeys] = useState<(Macro | null)[]>([null, null, null, null, null, null, null, null, null, null]);
  const [extraButtons, setExtraButtons] = useState<(Macro | null)[]>([null]);
  const [macroEditorVisible, setMacroEditorVisible] = useState(false);
  const [editingMacro, setEditingMacro] = useState<Macro | null>(null);
  const [editingTarget, setEditingTarget] = useState<{ type: 'fkey' | 'extra'; index: number }>({ type: 'fkey', index: 0 });
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
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [channelMessages, setChannelMessages] = useState<ChannelMessage[]>([]);
  const [channels, setChannels] = useState<string[]>([]);
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [channelAliases, setChannelAliases] = useState<Record<string, string>>({});
  const [configModalVisible, setConfigModalVisible] = useState(false);
  const [currentProfile, setCurrentProfile] = useState('');
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [useChannels, setUseChannels] = useState(true);
  const [fontSize, setFontSize] = useState(14);
  const [useFloatingButtons, setUseFloatingButtons] = useState(false);
  const [floatingOrientation, setFloatingOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [useCustomKeyboard, setUseCustomKeyboard] = useState(true);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const useChannelsRef = useRef(true);
  const fontSizeRef = useRef(14);
  const useFloatingButtonsRef = useRef(false);
  const useFloatingButtonsOrientationRef = useRef<'portrait' | 'landscape'>('portrait');
  const walkTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const activeChannelRef = useRef<string | null>(null);
  const lastSentChannelTime = useRef(0);

  const handleSelectChannel = useCallback((ch: string | null) => {
    setActiveChannel(ch);
    activeChannelRef.current = ch;
    if (ch && ch !== 'Todos') {
      setUnreadCounts(prev => ({ ...prev, [ch]: 0 }));
    }
  }, []);
  const flatListRef = useRef<FlatList>(null);
  const telnetRef = useRef<TelnetService | null>(null);
  const inputRef = useRef<TextInput>(null);
  const pendingText = useRef('');
  const mapServiceRef = useRef(new MapService());
  const locatingRef = useRef(false);
  const recentLinesRef = useRef<string[]>([]);
  const isAtBottomRef = useRef(true);

  const lastLineBlankRef = useRef(false);

  const addLine = useCallback((text: string) => {
    const isBlank = text.trim().length === 0;
    if (isBlank) {
      if (lastLineBlankRef.current) return; // skip consecutive blanks
      lastLineBlankRef.current = true;
    } else {
      lastLineBlankRef.current = false;
    }

    const spans = parseAnsi(text);
    const newLine: MudLine = { id: lineIdCounter++, spans };
    setLines(prev => {
      const updated = [...prev, newLine];
      if (updated.length > MAX_LINES) {
        return updated.slice(updated.length - MAX_LINES);
      }
      return updated;
    });
  }, []);

  const addMultipleLines = useCallback((texts: string[]) => {
    const newLines: MudLine[] = [];
    const channelMessagesToAdd: ChannelMessage[] = [];

    for (const text of texts) {
      const isBlank = text.trim().length === 0;
      if (isBlank) {
        if (lastLineBlankRef.current) continue; // skip consecutive blanks
        lastLineBlankRef.current = true;
      } else {
        lastLineBlankRef.current = false;
      }

      // Try to detect channel messages from text patterns if useChannels is enabled
      let channelName: string | null = null;
      let messageText = text;

      if (useChannelsRef.current && channels.length > 0) {
        // Try to match patterns like "[canal]:", "canal:", or similar
        const patterns = [
          new RegExp(`^\\[(${channels.join('|')})\\]\\s+(.+)$`, 'i'),
          new RegExp(`^(${channels.join('|')}):\\s+(.+)$`, 'i'),
        ];

        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match) {
            channelName = match[1].toLowerCase();
            messageText = match[2];
            break;
          }
        }
      }

      const spans = parseAnsi(messageText);

      if (channelName && channels.includes(channelName)) {
        // Add to channel messages instead of main display
        channelMessagesToAdd.push({
          id: nextMsgId(),
          channel: channelName,
          spans,
        });
        // Still track unread count - also consider reading if in "Todos" channel
        const isReading = activeChannelRef.current === channelName || activeChannelRef.current === 'Todos';
        if (!isReading) {
          setUnreadCounts(prev => ({ ...prev, [channelName]: (prev[channelName] || 0) + 1 }));
        }
      } else {
        // Add to main display
        const newLine: MudLine = { id: lineIdCounter++, spans };
        newLines.push(newLine);
      }
    }

    // Add main display lines
    if (newLines.length > 0) {
      setLines(prev => {
        const updated = [...prev, ...newLines];
        if (updated.length > MAX_LINES) {
          return updated.slice(updated.length - MAX_LINES);
        }
        return updated;
      });
    }

    // Add channel messages
    if (channelMessagesToAdd.length > 0) {
      setChannelMessages(prev => {
        const updated = [...prev, ...channelMessagesToAdd];
        return updated.length > 500 ? updated.slice(-500) : updated;
      });
    }
  }, [channels]);

  const addSystemLine = useCallback((text: string) => {
    const newLine: MudLine = {
      id: lineIdCounter++,
      spans: [{ text, fg: '#ffcc00', bold: true }],
    };
    setLines(prev => [...prev, newLine]);
  }, []);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  useEffect(() => {
    loadFKeys(server.id).then(setFkeys);
    loadExtraButtons(server.id).then(setExtraButtons);
    loadChannelAliases().then(setChannelAliases);
    loadSettings().then(s => {
      setUseChannels(s.useChannels);
      useChannelsRef.current = s.useChannels;
      setFontSize(s.fontSize);
      fontSizeRef.current = s.fontSize;
      setUseFloatingButtons(s.useFloatingButtons);
      useFloatingButtonsRef.current = s.useFloatingButtons;
      setFloatingOrientation(s.floatingOrientation);
      useFloatingButtonsOrientationRef.current = s.floatingOrientation;
      setUseCustomKeyboard(s.useCustomKeyboard);
    });

    // Only load map for the default server (Reinos de Leyenda)
    const isDefaultServer = server.name === 'Reinos de Leyenda';
    if (isDefaultServer) {
      mapServiceRef.current.load();
      setMapVisible(true);
    } else {
      setMapVisible(false);
    }
  }, [server.id, server.name]);

  useFocusEffect(useCallback(() => {
    setLayoutVersion(v => v + 1);
  }, []));

  const updateMapPosition = useCallback((room: MapRoom) => {
    setCurrentRoom(room);
    mapServiceRef.current.setCurrentRoom(room.id);
    const nearby = mapServiceRef.current.getNearbyRooms(room.x, room.y, room.z, 15);
    setNearbyRooms(nearby);
  }, []);

  const stopWalk = useCallback(() => {
    for (const t of walkTimers.current) clearTimeout(t);
    walkTimers.current = [];
    setWalking(false);
  }, []);

  const walkTo = useCallback(async (targetRoom: MapRoom) => {
    const mapSvc = mapServiceRef.current;
    const current = mapSvc.getCurrentRoom();
    if (!current) {
      addSystemLine('--- No se conoce tu posición actual. Usa LOC primero ---');
      return;
    }
    const path = mapSvc.findPath(current.id, targetRoom.id);
    if (!path || path.length === 0) {
      addSystemLine('--- No se encuentra camino ---');
      return;
    }
    setWalking(true);
    setSearchVisible(false);

    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    const STEP_DELAY = 500;

    for (const direction of path) {
      if (!walking) break;  // Check if walk was cancelled
      if (telnetRef.current) {
        telnetRef.current.send(direction);
      }
      await sleep(STEP_DELAY);
    }

    setWalking(false);
  }, [addSystemLine, walking]);

  const handleLocate = useCallback(() => {
    recentLinesRef.current = [];
    sendCommand('ojear');
    setTimeout(() => {
      let foundRoom: MapRoom | null = null;
      for (const line of recentLinesRef.current) {
        if (line.match(/\[.*\]\s*$/)) {
          const bracketIdx = line.lastIndexOf('[');
          let roomName = line.substring(0, bracketIdx).trim();
          roomName = roomName.replace(/^[>\]]\s*/, '');
          const mapSvc = mapServiceRef.current;
          if (mapSvc.isLoaded && roomName) {
            const room = mapSvc.findRoom(roomName);
            if (room) {
              mapSvc.setCurrentRoom(room.id);
              foundRoom = room;
            }
          }
        }
      }
      if (foundRoom) {
        updateMapPosition(foundRoom);
      }
    }, 1500);
  }, []);

  const sendCommand = useCallback((command: string) => {
    if (!telnetRef.current) return;

    // Intercept "parar" or "stop" to stop walking
    if ((command.toLowerCase() === 'parar' || command.toLowerCase() === 'stop') && walking) {
      stopWalk();
      return;
    }

    // Intercept LOCATE command
    if (command.toLowerCase() === 'locate') {
      handleLocate();
      return;
    }

    // Intercept irsala command
    const irsalaMatch = command.match(/^irsala\s+(.+)$/i);
    if (irsalaMatch) {
      Keyboard.dismiss();
      const query = irsalaMatch[1];
      const mapSvc = mapServiceRef.current;
      if (mapSvc.isLoaded) {
        const results = mapSvc.searchRooms(query);
        if (results.length === 0) {
          addSystemLine(`--- No se encontró ninguna sala con "${query}" ---`);
        } else if (results.length === 1) {
          walkTo(results[0]);
        } else {
          setSearchResults(results);
          setSearchVisible(true);
        }
      }
      return;
    }

    const commands = command.split(';');
    for (const cmd of commands) {
      telnetRef.current.send(cmd.trim());
    }
    // Add to command history (max 50)
    setCommandHistory(prev => [...prev.slice(-49), command]);
  }, [addSystemLine, walkTo, handleLocate]);

  const handleMacroSave = useCallback(async (macro: Macro) => {
    if (editingTarget.type === 'fkey') {
      setFkeys(prev => {
        const updated = [...prev];
        updated[editingTarget.index] = macro;
        saveFKeys(server.id, updated);
        return updated;
      });
    } else {
      setExtraButtons(prev => {
        const updated = [...prev];
        updated[editingTarget.index] = macro;
        saveExtraButtons(server.id, updated);
        return updated;
      });
    }
    setMacroEditorVisible(false);
  }, [server.id, editingTarget]);

  const handleMacroDelete = useCallback(async (_macroId: string) => {
    if (editingTarget.type === 'fkey') {
      setFkeys(prev => {
        const updated = [...prev];
        updated[editingTarget.index] = null;
        saveFKeys(server.id, updated);
        return updated;
      });
    } else {
      setExtraButtons(prev => {
        const updated = [...prev];
        updated[editingTarget.index] = null;
        saveExtraButtons(server.id, updated);
        return updated;
      });
    }
    setMacroEditorVisible(false);
  }, [server.id, editingTarget]);

  useEffect(() => {
    navigation.setOptions({ title: server.name });

    const telnet = new TelnetService(server, {
      onData: (text: string) => {
        // Skip empty text
        if (!text || text.length === 0) return;

        console.log('[onData] Raw text received:', JSON.stringify(text.slice(0, 200)));
        console.log('[onData] Text length:', text.length, 'lines count:', (text.match(/\n/g) || []).length);

        pendingText.current += text;
        // Split by \n, but also handle \r\n and \r variants
        // First normalize: replace \r\n with \n, and standalone \r with \n
        const normalized = pendingText.current.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const parts = normalized.split('\n');
        // Keep last part (possibly incomplete) in pending
        pendingText.current = parts.pop() ?? '';

        console.log('[onData] After split - parts count:', parts.length, 'pending buffer length:', pendingText.current.length);

        // Collect lines to add and recent raw lines
        const linesToAdd: string[] = [];
        for (const part of parts) {
          // Keep the original line (with spaces), don't trim
          if (part.length > 0) {
            linesToAdd.push(part);
            // Keep recent raw lines for LOC (trimmed and without ANSI codes)
            const clean = part.replace(/\x1b\[[0-9;]*m/g, '').trim();
            recentLinesRef.current.push(clean);
            if (recentLinesRef.current.length > 30) {
              recentLinesRef.current = recentLinesRef.current.slice(-30);
            }
          }
        }

        // Add all lines at once to avoid multiple re-renders
        if (linesToAdd.length > 0) {
          console.log('[onData] Adding', linesToAdd.length, 'lines. useChannels:', useChannelsRef.current, 'First line:', JSON.stringify(linesToAdd[0].slice(0, 100)));
          addMultipleLines(linesToAdd);
        }
      },
      onConnect: () => {
        setConnected(true);
        addSystemLine(`--- Connected to ${server.name} (${server.host}:${server.port}) ---`);
      },
      onClose: () => {
        if (pendingText.current && pendingText.current.trim().length > 0) {
          addLine(pendingText.current.trim());
        }
        pendingText.current = '';
        setConnected(false);
        addSystemLine('--- Connection closed ---');
      },
      onError: (error: string) => {
        addSystemLine(`--- Error: ${error} ---`);
      },
      onGMCP: (module: string, data: any) => {
        // Comm: channels
        if (module === 'Comm.Canales' && data && typeof data === 'object') {
          setChannels(Object.keys(data));
        } else if (module === 'Comm.EnciendeCanal' && data?.canal) {
          setChannels(prev => prev.includes(data.canal) ? prev : [...prev, data.canal]);
        } else if (module === 'Comm.ApagaCanal' && data?.canal) {
          setChannels(prev => prev.filter(ch => ch !== data.canal));
          if (activeChannelRef.current === data.canal) {
            handleSelectChannel(null);
          }
        } else if ((module === 'Comm.MensajeCanal' || module === 'Comm.MensajeCanalHistorico') && data?.canal && data?.mensaje) {
          const rawMsg = data.mensaje;
          console.log('[GMCP]', module, 'canal:', data.canal);
          console.log('[GMCP] Raw message (first 150 chars):', JSON.stringify(rawMsg.slice(0, 150)));
          console.log('[GMCP] Message length:', rawMsg.length, 'Contains \\n:', rawMsg.includes('\n'), 'Contains \\r:', rawMsg.includes('\r'));
          console.log('[GMCP] Char codes at position 0-10:', Array.from(rawMsg.slice(0, 10)).map(c => c.charCodeAt(0)));

          if (!useChannelsRef.current) {
            // No channel management: show in main output
            console.log('[GMCP] useChannels=false, calling addLine');
            addLine(rawMsg);
          } else {
            console.log('[GMCP] useChannels=true, parsing ANSI');
            const spans = parseAnsi(rawMsg);
            console.log('[GMCP] After parseAnsi - spans count:', spans.length, 'first span text:', JSON.stringify(spans[0]?.text.slice(0, 50)));

            setChannelMessages(prev => {
              const updated = [...prev, { id: nextMsgId(), channel: data.canal, spans }];
              console.log('[GMCP] setChannelMessages called, total messages:', updated.length);
              return updated.length > 500 ? updated.slice(-500) : updated;
            });
            const isOwnEcho = Date.now() - lastSentChannelTime.current < 1000;
            const isReading = activeChannelRef.current === data.canal || activeChannelRef.current === 'Todos';
            if (!isOwnEcho && !isReading) {
              setUnreadCounts(prev => ({ ...prev, [data.canal]: (prev[data.canal] || 0) + 1 }));
            }
          }
        }

        // Char.Status: vitals (pvs, pe, xp)
        if (module === 'Char.Status' && data && typeof data === 'object') {
          if (data.pvs) {
            if (data.pvs.min !== undefined) setHp(data.pvs.min);
            if (data.pvs.max !== undefined) setHpMax(data.pvs.max);
          }
          if (data.pe) {
            if (data.pe.min !== undefined) setEnergy(data.pe.min);
            if (data.pe.max !== undefined) setEnergyMax(data.pe.max);
          }
        }

        const mapSvc = mapServiceRef.current;
        if (!mapSvc.isLoaded) return;

        if (module === 'Room.Actual') {
          const roomName = typeof data === 'string' ? data : String(data);
          const room = mapSvc.findRoom(roomName);
          if (room) {
            updateMapPosition(room);
          }
        } else if (module === 'Room.Movimiento') {
          const dir = typeof data === 'string' ? data : String(data);
          const room = mapSvc.moveByDirection(dir);
          if (room) {
            updateMapPosition(room);
          }
        }
      },
    });

    telnetRef.current = telnet;
    telnet.connect();

    return () => {
      telnet.disconnect();
    };
  }, [server]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text) {
      setInputText('');
      return;
    }

    // Cancel walk if any command is sent
    if (walking) {
      stopWalk();
      addSystemLine('--- Movimiento cancelado ---');
    }

    // Intercept irsala command
    const irsalaMatch = text.match(/^irsala\s+(.+)$/i);
    if (irsalaMatch) {
      const query = irsalaMatch[1];
      const mapSvc = mapServiceRef.current;
      if (mapSvc.isLoaded) {
        const results = mapSvc.searchRooms(query);
        if (results.length === 0) {
          addSystemLine(`--- No se encontró ninguna sala con "${query}" ---`);
        } else if (results.length === 1) {
          walkTo(results[0]);
        } else {
          setSearchResults(results);
          setSearchVisible(true);
        }
      }
      setInputText('');
      return;
    }

    // Intercept "parar" or "stop" to stop walking
    if ((text.toLowerCase() === 'parar' || text.toLowerCase() === 'stop') && walking) {
      stopWalk();
      setInputText('');
      return;
    }

    if (telnetRef.current) {
      telnetRef.current.send(text);
    }
    setCommandHistory(prev => [...prev.slice(-49), text]);
    setInputText('');
    // Always scroll to bottom when sending
    isAtBottomRef.current = true;
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 50);
  }, [inputText, walking, stopWalk, walkTo]);

  // Scroll to end when layout changes (keyboard, channel, orientation, buttons appear/disappear)
  useEffect(() => {
    isAtBottomRef.current = true;
    const scrollToBottom = () => flatListRef.current?.scrollToEnd({ animated: false });
    setTimeout(scrollToBottom, 200);
    setTimeout(scrollToBottom, 500);
    setTimeout(scrollToBottom, 1000);
  }, [keyboardVisible, activeChannel, isLandscape]);

  const renderLine = useCallback(({ item }: { item: MudLine }) => (
    <AnsiText line={item} fontSize={fontSize} />
  ), [fontSize]);

  const keyExtractor = useCallback((item: MudLine) => String(item.id), []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      {/* New unified layout */}
      <UnifiedTerminalLayout
        lines={lines}
        inputText={inputText}
        connected={connected}
        channels={channels}
        channelMessages={channelMessages}
        channelAliases={channelAliases}
        activeChannel={activeChannel}
        unreadCounts={unreadCounts}
        hp={hp}
        hpMax={hpMax}
        energy={energy}
        energyMax={energyMax}
        fontSize={fontSize}
        currentRoom={currentRoom}
        nearbyRooms={nearbyRooms}
        mapVisible={mapVisible}
        commandHistory={commandHistory}
        onInputChange={setInputText}
        onSend={handleSend}
        onSendCommand={sendCommand}
        onSelectChannel={handleSelectChannel}
        onAliasChange={(ch, alias) => {
          const updated = { ...channelAliases, [ch]: alias };
          setChannelAliases(updated);
          saveChannelAliases(updated);
        }}
        onToggleMap={() => setMapVisible(v => !v)}
        onConfigPress={() => setConfigModalVisible(true)}
      />

      {/* Old layouts kept for backwards compatibility - commented out */}
      {false && useFloatingButtons && (
        <FloatingLayout
          key={layoutVersion}
          orientation={floatingOrientation}
          availableHeight={availableHeight}
          layoutVersion={layoutVersion}
          onInputActiveChange={setCustomKeyboardActive}
          hp={hp}
          hpMax={hpMax}
          energy={energy}
          energyMax={energyMax}
          inputText={inputText}
          onInputChange={setInputText}
          onSend={handleSend}
          onSendCommand={sendCommand}
          channels={channels}
          channelMessages={channelMessages}
          channelAliases={channelAliases}
          activeChannel={activeChannel}
          onSelectChannel={handleSelectChannel}
          unreadCounts={unreadCounts}
          onAliasChange={(ch, alias) => {
            const updated = { ...channelAliases, [ch]: alias };
            setChannelAliases(updated);
            saveChannelAliases(updated);
          }}
          fontSize={fontSize}
          onConfigPress={() => setConfigModalVisible(true)}
          lines={lines}
          mapVisible={mapVisible}
          onToggleMap={() => setMapVisible(v => !v)}
          currentRoom={currentRoom}
          nearbyRooms={nearbyRooms}
          useCustomKeyboard={useCustomKeyboard}
        />
      )}

      {/* Old UI commented out - using UnifiedTerminalLayout instead */}

      {/* Active channel panel handled by UnifiedTerminalLayout now */}

      {/* Room search results */}
      <RoomSearchResults
        rooms={searchResults}
        visible={searchVisible}
        onSelect={(room) => walkTo(room)}
        onClose={() => setSearchVisible(false)}
      />

      {/* Macro editor modal */}
      <MacroEditor
        visible={macroEditorVisible}
        macro={editingMacro}
        onSave={handleMacroSave}
        onDelete={handleMacroDelete}
        onClose={() => setMacroEditorVisible(false)}
      />

      {/* Config profile modal */}
      <ConfigProfileModal
        visible={configModalVisible}
        serverId={server.id}
        currentProfile={currentProfile}
        onClose={() => setConfigModalVisible(false)}
        onLoaded={(name) => {
          setCurrentProfile(name);
          loadFKeys(server.id).then(setFkeys);
          loadExtraButtons(server.id).then(setExtraButtons);
          loadChannelAliases().then(setChannelAliases);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  portraitBody: {
    flex: 1,
  },
  landscapeBody: {
    flex: 1,
    flexDirection: 'row',
  },
  portraitLeft: {
    flex: 1,
  },
  landscapeLeft: {
    flex: 1,
  },
  portraitBottom: {
  },
  landscapeRight: {
    width: 280,
    backgroundColor: '#111',
    borderLeftWidth: 1,
    borderLeftColor: '#333',
  },
  safeTop: {
    backgroundColor: '#111',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  backText: {
    color: '#00cc00',
    fontSize: 16,
    fontWeight: 'bold',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusName: {
    color: '#00cc00',
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: 'bold',
    marginRight: 6,
    flexShrink: 1,
  },
  statusHost: {
    color: '#666',
    fontSize: 10,
    fontFamily: 'monospace',
    flex: 1,
  },
  connected: {
    backgroundColor: '#00cc00',
  },
  disconnected: {
    backgroundColor: '#cc0000',
  },
  reconnectBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#333',
    borderRadius: 3,
  },
  reconnectText: {
    color: '#cccccc',
    fontSize: 10,
  },
  outputWrapper: {
    flex: 1,
    position: 'relative',
  },
  output: {
    flex: 1,
    backgroundColor: '#000000',
  },
  outputContent: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  safeBottom: {
    backgroundColor: '#111',
  },
  inputContainer: {
    flexDirection: 'row',
    backgroundColor: '#111',
    paddingHorizontal: 4,
    paddingTop: 2,
    paddingBottom: 2,
  },
  input: {
    flex: 1,
    color: '#ffffff',
    fontFamily: 'monospace',
    fontSize: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 40,
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 4,
  },
  sendBtn: {
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#2a2a2a',
  },
  sendText: {
    color: '#00cc00',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
