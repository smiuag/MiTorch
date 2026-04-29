import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  StyleSheet,
  ScrollView,
  Keyboard,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  channelOrder: string[];
  channelMessages: ChannelMessage[];
  onSendMessage: (cmd: string) => void;
  onAliasChange: (channel: string, alias: string) => void;
  onOrderChange: (order: string[]) => void;
  fontSize: number;
}

const DEFAULT_CHANNEL_ORDER = ['chat', 'grupo', 'bando', 'gremio', 'familia', 'clan'];

function sortChannels(channels: string[], savedOrder: string[]): string[] {
  const sorted: string[] = [];
  const baseOrder = savedOrder.length > 0 ? savedOrder : DEFAULT_CHANNEL_ORDER;
  for (const ch of baseOrder) {
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
  channelOrder,
  channelMessages,
  onSendMessage,
  onAliasChange,
  onOrderChange,
  fontSize,
}: BlindChannelModalProps) {
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [editingChannel, setEditingChannel] = useState<string | null>(null);
  const [editAlias, setEditAlias] = useState('');
  const [askingAliasForChannel, setAskingAliasForChannel] = useState<string | null>(null);
  const [newAlias, setNewAlias] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const aliasInputRef = useRef<TextInput>(null);

  const sortedChannels = useMemo(() => sortChannels(channels, channelOrder), [channels, channelOrder]);

  const moveChannel = useCallback((channel: string, direction: 'left' | 'right') => {
    const current = sortedChannels;
    const idx = current.indexOf(channel);
    if (idx < 0) return;
    const targetIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= current.length) return;
    const next = [...current];
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    onOrderChange(next);
  }, [sortedChannels, onOrderChange]);

  const filteredMessages = useMemo(() => {
    if (!activeChannel) return [];
    return channelMessages.filter(m => m.channel === activeChannel);
  }, [channelMessages, activeChannel]);

  // FlatList renders with `inverted` and the data reversed: newest message at
  // index 0, oldest at the end. The `scaleY(-1)` that `inverted` applies then
  // places newest at the visual bottom. New messages prepend to data[0]
  // automatically, so the user stays pinned to the latest — no manual
  // scrollToEnd needed when messages arrive, channel changes, or modal opens.
  const reversedMessages = useMemo(() => [...filteredMessages].reverse(), [filteredMessages]);

  const currentAlias = activeChannel ? (channelAliases[activeChannel] || activeChannel) : '';

  const handleSelectChannel = useCallback((ch: string) => {
    setActiveChannel(ch);
    setInputText('');

    // Si no tiene alias configurado, pedir que lo configure
    if (!channelAliases[ch]) {
      setAskingAliasForChannel(ch);
      setNewAlias(''); // Input vacío
    }
  }, [channelAliases]);

  // Open keyboard when asking for alias
  useEffect(() => {
    if (askingAliasForChannel && aliasInputRef.current) {
      // Dismiss any previous keyboard first
      Keyboard.dismiss();

      // Open keyboard with a longer delay to ensure modal is fully rendered
      const timer = setTimeout(() => {
        aliasInputRef.current?.focus();
      }, Platform.OS === 'android' ? 500 : 300);

      return () => clearTimeout(timer);
    }
  }, [askingAliasForChannel]);

  // Track keyboard height so the modal can pad its bottom edge while the
  // keyboard is up. Scrolling is no longer needed: the inverted FlatList
  // keeps the newest message pinned at offset 0 automatically.
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKeyboardHeight(e.endCoordinates.height),
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
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

  const handleSaveNewAlias = useCallback(() => {
    if (askingAliasForChannel && newAlias.trim()) {
      onAliasChange(askingAliasForChannel, newAlias.trim());
    }
    setAskingAliasForChannel(null);
    setNewAlias('');
  }, [askingAliasForChannel, newAlias, onAliasChange]);

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
      <SafeAreaView style={[styles.container, { paddingBottom: keyboardHeight }]}>
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
            data={reversedMessages}
            inverted
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
              maxLength={200}
              returnKeyType="send"
              blurOnSubmit={false}
              onSubmitEditing={handleSendMessage}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
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

        {/* New alias prompt modal */}
        <Modal
          visible={askingAliasForChannel !== null}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setAskingAliasForChannel(null);
            setNewAlias('');
          }}
        >
          <TouchableOpacity
            style={styles.editModalOverlay}
            activeOpacity={1}
            onPress={() => {
              setAskingAliasForChannel(null);
              setNewAlias('');
            }}
          >
            <View style={styles.editModalContent}>
              <Text style={styles.editModalTitle}>Introduce el alias que utilizas para el canal</Text>
              <Text style={styles.editModalHint}>{askingAliasForChannel}</Text>
              <Text style={styles.editModalSubhint}>
                Por ejemplo, "ch" en lugar de "chat"
              </Text>
              <TextInput
                ref={aliasInputRef}
                style={styles.editModalInput}
                value={newAlias}
                onChangeText={setNewAlias}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                placeholderTextColor="#555"
                accessibilityLabel="Alias del canal"
              />
              <View style={styles.editModalButtons}>
                <TouchableOpacity
                  style={styles.editSaveBtn}
                  onPress={handleSaveNewAlias}
                  accessibilityLabel="Guardar"
                >
                  <Text style={styles.editSaveText}>Guardar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>

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
                spellCheck={false}
                placeholderTextColor="#555"
                accessibilityLabel="Nuevo alias"
              />
              {editingChannel && (() => {
                const idx = sortedChannels.indexOf(editingChannel);
                const canLeft = idx > 0;
                const canRight = idx >= 0 && idx < sortedChannels.length - 1;
                return (
                  <View style={styles.reorderRow}>
                    <Text style={styles.reorderLabel}>Posición:</Text>
                    <TouchableOpacity
                      style={[styles.reorderBtn, !canLeft && styles.reorderBtnDisabled]}
                      onPress={() => canLeft && moveChannel(editingChannel, 'left')}
                      disabled={!canLeft}
                      accessibilityLabel="Mover a la izquierda"
                      accessibilityRole="button"
                    >
                      <Text style={styles.reorderBtnText}>← Izquierda</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.reorderBtn, !canRight && styles.reorderBtnDisabled]}
                      onPress={() => canRight && moveChannel(editingChannel, 'right')}
                      disabled={!canRight}
                      accessibilityLabel="Mover a la derecha"
                      accessibilityRole="button"
                    >
                      <Text style={styles.reorderBtnText}>Derecha →</Text>
                    </TouchableOpacity>
                  </View>
                );
              })()}
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
      </SafeAreaView>
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
    height: 44,
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: '#0a0a0a',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  channelSelectorContent: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
    alignItems: 'center',
  },
  channelButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 30,
    justifyContent: 'center',
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
    alignItems: 'center',
    padding: 20,
  },
  editModalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 20,
    borderWidth: 1,
    borderColor: '#333',
    maxWidth: 400,
    width: '90%',
  },
  editModalTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    fontFamily: 'monospace',
  },
  editModalHint: {
    color: '#aaf',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    fontFamily: 'monospace',
  },
  editModalSubhint: {
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
    marginRight: 0,
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
  reorderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  reorderLabel: {
    color: '#aaa',
    fontSize: 12,
  },
  reorderBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: '#334466',
    borderWidth: 1,
    borderColor: '#556688',
  },
  reorderBtnDisabled: {
    backgroundColor: '#222',
    borderColor: '#333',
    opacity: 0.4,
  },
  reorderBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
