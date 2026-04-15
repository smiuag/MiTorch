import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  TextInput,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
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
import { MiniMap } from '../components/MiniMap';
import { MapService, MapRoom } from '../services/mapService';
import { loadFKeys, saveFKeys } from '../storage/fkeyStorage';
import { loadExtraButtons, saveExtraButtons } from '../storage/extraButtonStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'Terminal'>;

const MAX_LINES = 2000;
let lineIdCounter = 0;

export function TerminalScreen({ route, navigation }: Props) {
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
  const flatListRef = useRef<FlatList>(null);
  const telnetRef = useRef<TelnetService | null>(null);
  const inputRef = useRef<TextInput>(null);
  const pendingText = useRef('');
  const mapServiceRef = useRef(new MapService());
  const locatingRef = useRef(false);
  const recentLinesRef = useRef<string[]>([]);

  const addLine = useCallback((text: string) => {
    if (text.trim().length === 0) return;

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
    loadFKeys(server.id).then(setFkeys);
    loadExtraButtons(server.id).then(setExtraButtons);
    mapServiceRef.current.load();
  }, [server.id]);

  const updateMapPosition = useCallback((room: MapRoom) => {
    setCurrentRoom(room);
    mapServiceRef.current.setCurrentRoom(room.id);
    const nearby = mapServiceRef.current.getNearbyRooms(room.x, room.y, room.z, 15);
    setNearbyRooms(nearby);
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
    if (telnetRef.current) {
      telnetRef.current.send(text);
    }
    addLine(`> ${text}`);
    setCommandHistory(prev => [...prev.slice(-100), text]);
    setInputText('');
  }, [inputText]);

  const renderLine = useCallback(({ item }: { item: MudLine }) => (
    <AnsiText line={item} />
  ), []);

  const keyExtractor = useCallback((item: MudLine) => String(item.id), []);

  return (
    <View style={styles.container}>
      {/* Status bar */}
      <View style={styles.statusBar}>
        <View style={[styles.statusDot, connected ? styles.connected : styles.disconnected]} />
        <Text style={styles.statusText}>
          {connected ? `${server.host}:${server.port}` : 'Disconnected'}
        </Text>
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

      {/* Output area with map overlay */}
      <View style={styles.outputWrapper}>
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
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 50);
        }}
        onLayout={() => {
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 50);
        }}
        removeClippedSubviews={false}
        maxToRenderPerBatch={30}
        windowSize={21}
        keyboardShouldPersistTaps="always"
        maintainVisibleContentPosition={undefined}
      />
      </View>

      {/* Command input */}
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
        />
        <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>

      {/* F1-F7 macros */}
      <FKeyBar
        macros={fkeys}
        onPress={(macro) => macro && sendCommand(macro.command)}
        onLongPress={(_macro, index) => {
          setEditingTarget({ type: 'fkey', index });
          setEditingMacro(fkeys[index]);
          setMacroEditorVisible(true);
        }}
      />

      {/* Direction pad with F8-F10 */}
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
        onLocate={() => {
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
        }}
        onFKeyLongPress={(index) => {
          setEditingTarget({ type: 'fkey', index });
          setEditingMacro(fkeys[index]);
          setMacroEditorVisible(true);
        }}
      />

      <SafeAreaView edges={['bottom']} style={styles.safeBottom} />

      {/* Macro editor modal */}
      <MacroEditor
        visible={macroEditorVisible}
        macro={editingMacro}
        onSave={handleMacroSave}
        onDelete={handleMacroDelete}
        onClose={() => setMacroEditorVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  connected: {
    backgroundColor: '#00cc00',
  },
  disconnected: {
    backgroundColor: '#cc0000',
  },
  statusText: {
    color: '#999',
    fontSize: 12,
    fontFamily: 'monospace',
    flex: 1,
  },
  reconnectBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#333',
    borderRadius: 4,
  },
  reconnectText: {
    color: '#cccccc',
    fontSize: 12,
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
