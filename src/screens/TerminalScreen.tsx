import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  TextInput,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Text,
  TouchableOpacity,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, MudLine, Macro } from '../types';
import { TelnetService } from '../services/telnetService';
import { parseAnsi } from '../utils/ansiParser';
import { AnsiText } from '../components/AnsiText';
import { MacroBar } from '../components/MacroBar';
import { MacroEditor } from '../components/MacroEditor';
import { loadMacros, saveMacros } from '../storage/macroStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'Terminal'>;

const MAX_LINES = 2000;
let lineIdCounter = 0;

export function TerminalScreen({ route, navigation }: Props) {
  const { server } = route.params;
  const [lines, setLines] = useState<MudLine[]>([]);
  const [inputText, setInputText] = useState('');
  const [connected, setConnected] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [macros, setMacros] = useState<Macro[]>([]);
  const [macroEditorVisible, setMacroEditorVisible] = useState(false);
  const [editingMacro, setEditingMacro] = useState<Macro | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const telnetRef = useRef<TelnetService | null>(null);
  const inputRef = useRef<TextInput>(null);
  const pendingText = useRef('');

  const addLine = useCallback((text: string) => {
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
    loadMacros(server.id).then(setMacros);
  }, [server.id]);

  const handleMacroPress = useCallback((macro: Macro) => {
    if (!telnetRef.current) return;
    // Support ; as command separator
    const commands = macro.command.split(';');
    for (const cmd of commands) {
      telnetRef.current.send(cmd.trim());
    }
  }, []);

  const handleMacroSave = useCallback(async (macro: Macro) => {
    setMacros(prev => {
      const idx = prev.findIndex(m => m.id === macro.id);
      const updated = idx >= 0
        ? prev.map(m => m.id === macro.id ? macro : m)
        : [...prev, macro];
      saveMacros(server.id, updated);
      return updated;
    });
    setMacroEditorVisible(false);
  }, [server.id]);

  const handleMacroDelete = useCallback(async (macroId: string) => {
    setMacros(prev => {
      const updated = prev.filter(m => m.id !== macroId);
      saveMacros(server.id, updated);
      return updated;
    });
    setMacroEditorVisible(false);
  }, [server.id]);

  useEffect(() => {
    navigation.setOptions({ title: server.name });

    const telnet = new TelnetService(server, {
      onData: (text: string) => {
        // Buffer text and split by newlines
        pendingText.current += text;
        const parts = pendingText.current.split('\n');
        // Keep the last part as pending (might be incomplete)
        pendingText.current = parts.pop() ?? '';
        // Add complete lines
        for (const part of parts) {
          if (part.length > 0) {
            addLine(part);
          }
        }
      },
      onConnect: () => {
        setConnected(true);
        addSystemLine(`--- Connected to ${server.name} (${server.host}:${server.port}) ---`);
      },
      onClose: () => {
        // Flush any pending text
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
    });

    telnetRef.current = telnet;
    telnet.connect();

    return () => {
      telnet.disconnect();
    };
  }, [server]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (telnetRef.current) {
      telnetRef.current.send(inputText);
    }
    if (text) {
      setCommandHistory(prev => [...prev.slice(-100), text]);
    }
    setInputText('');
    inputRef.current?.focus();
  }, [inputText]);

  const renderLine = useCallback(({ item }: { item: MudLine }) => (
    <AnsiText line={item} />
  ), []);

  const keyExtractor = useCallback((item: MudLine) => String(item.id), []);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
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
              });
              telnetRef.current = telnet;
              telnet.connect();
            }}
          >
            <Text style={styles.reconnectText}>Reconnect</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        ref={flatListRef}
        data={lines}
        renderItem={renderLine}
        keyExtractor={keyExtractor}
        style={styles.output}
        contentContainerStyle={styles.outputContent}
        onContentSizeChange={() => {
          flatListRef.current?.scrollToEnd({ animated: false });
        }}
        removeClippedSubviews={true}
        maxToRenderPerBatch={20}
        windowSize={15}
      />

      <MacroBar
        macros={macros}
        onPress={handleMacroPress}
        onLongPress={(macro) => {
          setEditingMacro(macro);
          setMacroEditorVisible(true);
        }}
        onAddPress={() => {
          setEditingMacro(null);
          setMacroEditorVisible(true);
        }}
      />

      <MacroEditor
        visible={macroEditorVisible}
        macro={editingMacro}
        onSave={handleMacroSave}
        onDelete={handleMacroDelete}
        onClose={() => setMacroEditorVisible(false)}
      />

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
    </KeyboardAvoidingView>
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
  output: {
    flex: 1,
    backgroundColor: '#000000',
  },
  outputContent: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#333',
    backgroundColor: '#1a1a1a',
  },
  input: {
    flex: 1,
    color: '#ffffff',
    fontFamily: 'monospace',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
