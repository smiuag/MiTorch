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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { ConfigProfileModal } from '../components/ConfigProfileModal';
import { MapService, MapRoom } from '../services/mapService';
import { loadFKeys, saveFKeys } from '../storage/fkeyStorage';
import { loadExtraButtons, saveExtraButtons } from '../storage/extraButtonStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'Terminal'>;

const MAX_LINES = 2000;
let lineIdCounter = 0;

export function TerminalScreen({ route, navigation }: Props) {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
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
  const walkTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
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
    mapServiceRef.current.load();
  }, [server.id]);

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

  const walkTo = useCallback((targetRoom: MapRoom) => {
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
    addSystemLine(`--- Caminando a "${targetRoom.n}" (${path.length} pasos) ---`);
    setWalking(true);
    setSearchVisible(false);
    const STEP_DELAY = 300;
    walkTimers.current = [];
    for (let i = 0; i < path.length; i++) {
      const t = setTimeout(() => {
        if (telnetRef.current) {
          telnetRef.current.send(path[i]);
        }
        if (i === path.length - 1) {
          setWalking(false);
          addSystemLine('--- Llegaste a tu destino ---');
        }
      }, i * STEP_DELAY);
      walkTimers.current.push(t);
    }
  }, [addSystemLine]);

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
            mapSvc.setCurrentRoom(0);
            const room = mapSvc.findRoom(roomName);
            if (room) foundRoom = room;
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
    const commands = command.split(';');
    for (const cmd of commands) {
      telnetRef.current.send(cmd.trim());
    }
  }, []);

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
        pendingText.current += text;
        const parts = pendingText.current.split('\n');
        pendingText.current = parts.pop() ?? '';
        for (const part of parts) {
          if (part.length > 0) {
            addLine(part);
            // Keep recent raw lines for LOC
            const clean = part.replace(/\x1b\[[0-9;]*m/g, '').trim();
            recentLinesRef.current.push(clean);
            if (recentLinesRef.current.length > 30) {
              recentLinesRef.current = recentLinesRef.current.slice(-30);
            }
          }
        }
      },
      onConnect: () => {
        setConnected(true);
        addSystemLine(`--- Connected to ${server.name} (${server.host}:${server.port}) ---`);
      },
      onClose: () => {
        if (pendingText.current) {
          addLine(pendingText.current);
          pendingText.current = '';
        }
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
        } else if ((module === 'Comm.MensajeCanal' || module === 'Comm.MensajeCanalHistorico') && data?.canal && data?.mensaje) {
          const spans = parseAnsi(data.mensaje);
          setChannelMessages(prev => {
            const updated = [...prev, { id: nextMsgId(), channel: data.canal, spans }];
            return updated.length > 500 ? updated.slice(-500) : updated;
          });
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
      addLine(`> ${text}`);
      setInputText('');
      return;
    }

    // Intercept "parar" to stop walking
    if (text.toLowerCase() === 'parar' && walking) {
      stopWalk();
      addSystemLine('--- Movimiento cancelado ---');
      setInputText('');
      return;
    }

    if (telnetRef.current) {
      telnetRef.current.send(text);
    }
    addLine(`> ${text}`);
    setCommandHistory(prev => [...prev.slice(-100), text]);
    setInputText('');
    // Always scroll to bottom when sending
    isAtBottomRef.current = true;
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 50);
  }, [inputText, walking, stopWalk, walkTo]);

  const renderLine = useCallback(({ item }: { item: MudLine }) => (
    <AnsiText line={item} />
  ), []);

  const keyExtractor = useCallback((item: MudLine) => String(item.id), []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Status bar */}
      <View style={styles.statusBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>{'<'}</Text>
        </TouchableOpacity>
        <View style={[styles.statusDot, connected ? styles.connected : styles.disconnected]} />
        <Text style={styles.statusName} numberOfLines={1}>{server.name}</Text>
        <Text style={styles.statusHost}>{server.host}:{server.port}</Text>
        {!connected && (
          <TouchableOpacity
            style={styles.reconnectBtn}
            onPress={() => {
              telnetRef.current?.disconnect();
              const telnet = new TelnetService(server, {
                onData: (text: string) => {
                  pendingText.current += text;
                  const parts = pendingText.current.split('\n');
                  pendingText.current = parts.pop() ?? '';
                  for (const part of parts) {
                    if (part.length > 0) addLine(part);
                  }
                },
                onConnect: () => {
                  setConnected(true);
                  addSystemLine(`--- Reconnected to ${server.name} ---`);
                },
                onClose: () => {
                  if (pendingText.current) {
                    addLine(pendingText.current);
                    pendingText.current = '';
                  }
                  setConnected(false);
                  addSystemLine('--- Connection closed ---');
                },
                onError: (error: string) => addSystemLine(`--- Error: ${error} ---`),
                onGMCP: (module: string, data: any) => {
                  if (module === 'Comm.Canales' && data && typeof data === 'object') {
                    setChannels(Object.keys(data));
                  } else if ((module === 'Comm.MensajeCanal' || module === 'Comm.MensajeCanalHistorico') && data?.canal && data?.mensaje) {
                    const spans = parseAnsi(data.mensaje);
                    setChannelMessages(prev => {
                      const updated = [...prev, { id: nextMsgId(), channel: data.canal, spans }];
                      return updated.length > 500 ? updated.slice(-500) : updated;
                    });
                  }
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
                    const room = mapSvc.findRoom(typeof data === 'string' ? data : String(data));
                    if (room) updateMapPosition(room);
                  } else if (module === 'Room.Movimiento') {
                    const room = mapSvc.moveByDirection(typeof data === 'string' ? data : String(data));
                    if (room) updateMapPosition(room);
                  }
                },
              });
              telnetRef.current = telnet;
              telnet.connect();
            }}
          >
            <Text style={styles.reconnectText}>Reconnect</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Main content area */}
      <View style={isLandscape ? styles.landscapeBody : styles.portraitBody}>

      {/* Left side: output only (landscape) or output+input (portrait) */}
      <View style={isLandscape ? styles.landscapeLeft : styles.portraitLeft}>
      <View style={styles.outputWrapper} onTouchStart={() => {
        if (activeChannel) {
          setActiveChannel(null);
          Keyboard.dismiss();
        }
      }}>
      <MiniMap
        currentRoom={currentRoom}
        nearbyRooms={nearbyRooms}
        visible={mapVisible}
        onToggle={() => setMapVisible(v => !v)}
      />
      <FlatList
        ref={flatListRef}
        data={lines}
        renderItem={renderLine}
        keyExtractor={keyExtractor}
        style={styles.output}
        contentContainerStyle={styles.outputContent}
        onContentSizeChange={() => {
          if (isAtBottomRef.current) {
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 50);
          }
        }}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
          isAtBottomRef.current = distanceFromBottom < 50;
        }}
        scrollEventThrottle={100}
        removeClippedSubviews={false}
        maxToRenderPerBatch={30}
        windowSize={21}
        keyboardShouldPersistTaps="always"
      />
      </View>

      {/* In portrait: vital bars + input below output */}
      {!isLandscape && <VitalBars hp={hp} hpMax={hpMax} energy={energy} energyMax={energyMax} />}
      {!isLandscape && channels.length > 0 && <ChannelTabs
        channels={channels}
        aliases={channelAliases}
        activeChannel={activeChannel}
        onSelectChannel={setActiveChannel}
        onAliasChange={(ch, alias) => {
          const updated = { ...channelAliases, [ch]: alias };
          setChannelAliases(updated);
          saveChannelAliases(updated);
        }}
        onConfigPress={() => setConfigModalVisible(true)}
      />}
      {!isLandscape && !activeChannel && (
        <View style={styles.inputContainer}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleSend}
            placeholder="Enter command..."
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            returnKeyType="send"
            blurOnSubmit={false}
            disableFullscreenUI={true}
            keyboardAppearance="dark"
            onFocus={() => setKeyboardVisible(true)}
            onBlur={() => setKeyboardVisible(false)}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
            <Text style={styles.sendText}>Send</Text>
          </TouchableOpacity>
        </View>
      )}
      </View>

      {/* Right side (landscape) or bottom (portrait): buttons - hidden when channel active */}
      {(!keyboardVisible || isLandscape) && !activeChannel && <View style={isLandscape ? styles.landscapeRight : styles.portraitBottom}>

      {isLandscape ? (
        <LandscapeButtons
          fkeys={fkeys}
          extraButtons={extraButtons}
          onFKeyPress={(macro) => sendCommand(macro.command)}
          onFKeyLongPress={(index) => {
            setEditingTarget({ type: 'fkey', index });
            setEditingMacro(fkeys[index]);
            setMacroEditorVisible(true);
          }}
          onExtraPress={(macro) => sendCommand(macro.command)}
          onExtraLongPress={(index) => {
            setEditingTarget({ type: 'extra', index });
            setEditingMacro(extraButtons[index]);
            setMacroEditorVisible(true);
          }}
          onDirection={sendCommand}
          onLocate={handleLocate}
        />
      ) : (
        <>
          <FKeyBar
            macros={fkeys}
            onPress={(macro) => macro && sendCommand(macro.command)}
            onLongPress={(_macro, index) => {
              setEditingTarget({ type: 'fkey', index });
              setEditingMacro(fkeys[index]);
              setMacroEditorVisible(true);
            }}
          />
          <DirectionPad
            onDirection={sendCommand}
            extraButtons={extraButtons}
            onExtraLongPress={(index) => {
              setEditingTarget({ type: 'extra', index });
              setEditingMacro(extraButtons[index]);
              setMacroEditorVisible(true);
            }}
            fkeys={fkeys}
            onFKeyPress={(macro) => sendCommand(macro.command)}
            onLocate={handleLocate}
            onFKeyLongPress={(index) => {
              setEditingTarget({ type: 'fkey', index });
              setEditingMacro(fkeys[index]);
              setMacroEditorVisible(true);
            }}
          />
        </>
      )}

      {/* In landscape: vital bars + input below buttons */}
      {isLandscape && <VitalBars hp={hp} hpMax={hpMax} energy={energy} energyMax={energyMax} />}
      {isLandscape && channels.length > 0 && <ChannelTabs
        channels={channels}
        aliases={channelAliases}
        activeChannel={activeChannel}
        onSelectChannel={setActiveChannel}
        onAliasChange={(ch: string, alias: string) => {
          const updated = { ...channelAliases, [ch]: alias };
          setChannelAliases(updated);
          saveChannelAliases(updated);
        }}
        onConfigPress={() => setConfigModalVisible(true)}
      />}
      {isLandscape && !activeChannel && (
        <View style={styles.inputContainer}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleSend}
            placeholder="Enter command..."
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            returnKeyType="send"
            blurOnSubmit={false}
            disableFullscreenUI={true}
            keyboardAppearance="dark"
            onFocus={() => setKeyboardVisible(true)}
            onBlur={() => setKeyboardVisible(false)}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
            <Text style={styles.sendText}>Send</Text>
          </TouchableOpacity>
        </View>
      )}
      </View>}

      </View>

      {/* Active channel panel - replaces buttons when a channel is selected */}
      <ChannelActivePanel
        messages={channelMessages}
        channel={activeChannel}
        alias={activeChannel ? (channelAliases[activeChannel] || activeChannel) : ''}
        visible={activeChannel !== null}
        onSendMessage={(cmd) => {
          if (telnetRef.current) telnetRef.current.send(cmd);
          addLine(`> ${cmd}`);
        }}
        onClose={() => setActiveChannel(null)}
      />

      {!keyboardVisible && !isLandscape && !activeChannel && <SafeAreaView edges={['bottom']} style={styles.safeBottom} />}

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
