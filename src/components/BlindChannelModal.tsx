import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { AnsiSpan } from '../types';

export interface ChannelMessage {
  id: number;
  channel: string;
  spans: AnsiSpan[];
}

let msgId = 0;
export function nextMsgId() { return msgId++; }

interface BlindChannelModalProps {
  visible: boolean;
  onClose: () => void;
  channels: string[];
  channelAliases: Record<string, string>;
  channelMessages: ChannelMessage[];
  onSendMessage: (cmd: string) => void;
  onAliasChange: (channel: string, alias: string) => void;
  fontSize: number;
}

const CHANNEL_ORDER = ['chat', 'grupo', 'bando', 'gremio', 'familia', 'clan'];

function sortChannels(channels: string[]): string[] {
  const sorted: string[] = [];
  for (const ch of CHANNEL_ORDER) {
    if (channels.includes(ch)) sorted.push(ch);
  }
  for (const ch of channels) {
    if (!sorted.includes(ch)) sorted.push(ch);
  }
  return sorted;
}

export function BlindChannelModal({
  visible,
  onClose,
  channels,
  channelAliases,
  channelMessages,
  onSendMessage,
  onAliasChange,
  fontSize,
}: BlindChannelModalProps) {
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [editingChannel, setEditingChannel] = useState<string | null>(null);
  const [editAlias, setEditAlias] = useState('');

  const sortedChannels = useMemo(() => sortChannels(channels), [channels]);

  const filteredMessages = useMemo(() => {
    if (!activeChannel) return [];
    return channelMessages.filter(m => m.channel === activeChannel);
  }, [channelMessages, activeChannel]);

  const currentAlias = activeChannel ? (channelAliases[activeChannel] || activeChannel) : '';

  const handleSelectChannel = useCallback((ch: string) => {
    setActiveChannel(ch);
    setInputText('');
  }, []);

  const handleSendMessage = useCallback(() => {
    if (!inputText.trim() || !activeChannel) return;
    const cmd = `${currentAlias} ${inputText.trim()}`;
    onSendMessage(cmd);
    setInputText('');
  }, [inputText, activeChannel, currentAlias, onSendMessage]);

  const handleSaveAlias = useCallback(() => {
    if (editingChannel && editAlias.trim()) {
      onAliasChange(editingChannel, editAlias.trim());
    }
    setEditingChannel(null);
  }, [editingChannel, editAlias, onAliasChange]);

  const renderChannelButton = useCallback(({ item: ch }: { item: string }) => (
    <TouchableOpacity
      style={[styles.channelButton, activeChannel === ch && styles.channelButtonActive]}
      onPress={() => handleSelectChannel(ch)}
      onLongPress={() => {
        setEditingChannel(ch);
        setEditAlias(channelAliases[ch] || ch);
      }}
      activeOpacity={0.7}
      accessibilityRole="tab"
      accessibilityState={{ selected: activeChannel === ch }}
      accessibilityLabel={`Canal ${ch}`}
      accessibilityHint="Presiona para seleccionar, toca largo para editar alias"
    >
      <Text style={[styles.channelButtonText, activeChannel === ch && styles.channelButtonTextActive]}>
        {ch}
      </Text>
    </TouchableOpacity>
  ), [activeChannel, channelAliases, handleSelectChannel]);

  const renderMessage = useCallback(({ item }: { item: ChannelMessage }) => (
    <View style={styles.messageRow}>
      <Text style={[styles.messageText, { fontSize: Math.max(fontSize, 12) }]} selectable>
        {item.spans.map((span, i) => (
          <Text
            key={i}
            style={[
              span.fg ? { color: span.fg } : null,
              span.bold ? { fontWeight: 'bold' } : null,
              span.italic ? { fontStyle: 'italic' } : null,
              span.underline ? { textDecorationLine: 'underline' } : null,
            ]}
          >
            {span.text}
          </Text>
        ))}
      </Text>
    </View>
  ), [fontSize]);

  if (!visible) return null;

  return (
    <Modal visible={true} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Canales</Text>
          <TouchableOpacity
            onPress={onClose}
            accessibilityLabel="Cerrar canales"
            style={styles.closeButton}
          >
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Channel selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.channelSelectorScroll}
          contentContainerStyle={styles.channelSelectorContent}
          keyboardShouldPersistTaps="always"
        >
          {sortedChannels.map(ch => (
            <React.Fragment key={ch}>
              {renderChannelButton({ item: ch })}
            </React.Fragment>
          ))}
        </ScrollView>

        {/* Messages list */}
        {activeChannel ? (
          <FlatList
            data={filteredMessages}
            renderItem={renderMessage}
            keyExtractor={item => String(item.id)}
            style={styles.messagesList}
            contentContainerStyle={styles.messagesContent}
            keyboardShouldPersistTaps="always"
            ListEmptyComponent={
              <Text style={styles.emptyText}>Sin mensajes en este canal</Text>
            }
          />
        ) : (
          <View style={styles.noChannelSelected}>
            <Text style={styles.noChannelText}>Selecciona un canal</Text>
          </View>
        )}

        {/* Input section */}
        {activeChannel ? (
          <View style={styles.inputSection}>
            <Text style={styles.aliasPrefix} accessibilityLabel={`Alias: ${currentAlias}`}>
              {currentAlias}:{' '}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Mensaje..."
              placeholderTextColor="#555"
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={200}
              accessibilityLabel="Escribir mensaje"
              accessibilityHint={`Mensaje para canal ${activeChannel}`}
            />
            <TouchableOpacity
              style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
              onPress={handleSendMessage}
              disabled={!inputText.trim()}
              accessibilityLabel="Enviar"
              accessibilityRole="button"
            >
              <Text style={styles.sendButtonText}>›</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Alias edit modal */}
        <Modal
          visible={editingChannel !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setEditingChannel(null)}
        >
          <View style={styles.editModalOverlay}>
            <View style={styles.editModalContent}>
              <Text style={styles.editModalTitle}>Editar alias de "{editingChannel}"</Text>
              <Text style={styles.editModalHint}>
                Comando que se envía al MUD (ej: "ch" en vez de "chat")
              </Text>
              <TextInput
                style={styles.editModalInput}
                value={editAlias}
                onChangeText={setEditAlias}
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor="#555"
                accessibilityLabel="Nuevo alias"
              />
              <View style={styles.editModalButtons}>
                <TouchableOpacity
                  style={styles.editCancelBtn}
                  onPress={() => setEditingChannel(null)}
                  accessibilityLabel="Cancelar"
                >
                  <Text style={styles.editCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.editSaveBtn}
                  onPress={handleSaveAlias}
                  accessibilityLabel="Guardar"
                >
                  <Text style={styles.editSaveText}>Guardar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    color: '#aaa',
    fontSize: 24,
  },
  channelSelectorScroll: {
    maxHeight: 50,
    backgroundColor: '#0a0a0a',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  channelSelectorContent: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
  },
  channelButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: '#1a1a2a',
    borderWidth: 1,
    borderColor: '#333',
  },
  channelButtonActive: {
    backgroundColor: '#2a3a5a',
    borderColor: '#55f',
  },
  channelButtonText: {
    color: '#666',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  channelButtonTextActive: {
    color: '#aaf',
  },
  messagesList: {
    flex: 1,
    backgroundColor: '#000',
  },
  messagesContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  messageRow: {
    marginBottom: 8,
    paddingVertical: 4,
  },
  messageText: {
    color: '#ccc',
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  emptyText: {
    color: '#555',
    fontSize: 14,
    fontFamily: 'monospace',
    textAlign: 'center',
    marginTop: 32,
  },
  noChannelSelected: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  noChannelText: {
    color: '#555',
    fontSize: 14,
    fontFamily: 'monospace',
  },
  inputSection: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 8,
    alignItems: 'flex-end',
  },
  aliasPrefix: {
    color: '#88f',
    fontWeight: 'bold',
    fontFamily: 'monospace',
    fontSize: 12,
    paddingBottom: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    color: '#fff',
    fontFamily: 'monospace',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    maxHeight: 80,
  },
  sendButton: {
    backgroundColor: '#336699',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#444',
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  editModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    padding: 20,
  },
  editModalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  editModalTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    fontFamily: 'monospace',
  },
  editModalHint: {
    color: '#888',
    fontSize: 12,
    marginBottom: 12,
    fontFamily: 'monospace',
  },
  editModalInput: {
    backgroundColor: '#0a0a0a',
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 4,
    padding: 10,
    fontSize: 14,
    fontFamily: 'monospace',
    marginBottom: 16,
  },
  editModalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  editCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
    backgroundColor: '#2a2a2a',
  },
  editCancelText: {
    color: '#999',
    fontSize: 13,
  },
  editSaveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
    backgroundColor: '#00cc00',
  },
  editSaveText: {
    color: '#000',
    fontSize: 13,
    fontWeight: 'bold',
  },
});
