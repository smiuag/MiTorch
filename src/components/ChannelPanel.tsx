import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
} from 'react-native';
import { AnsiSpan } from '../types';

export interface ChannelMessage {
  id: number;
  channel: string;
  spans: AnsiSpan[];
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

let msgId = 0;
export function nextMsgId() { return msgId++; }

// ── Channel tabs (always visible) ──
interface ChannelTabsProps {
  channels: string[];
  aliases: Record<string, string>;
  activeChannel: string | null;
  onSelectChannel: (channel: string | null) => void;
  onAliasChange: (channel: string, alias: string) => void;
  unreadCounts: Record<string, number>;
  allMessages: ChannelMessage[];
  fontSize?: number;
  useCustomKeyboard?: boolean;
}

export function ChannelTabs({
  channels, aliases, activeChannel,
  onSelectChannel, onAliasChange,
  unreadCounts, allMessages, fontSize = 14,
  useCustomKeyboard = false,
}: ChannelTabsProps) {
  const [editingChannel, setEditingChannel] = useState<string | null>(null);
  const [editAlias, setEditAlias] = useState('');
  const sortedChannels = sortChannels(channels);

  // Add "Botones", "Todos" as first channels and "Mapa" as the last
  const allChannels = ['Botones', 'Todos', ...sortedChannels, 'Mapa'];

  return (
    <>
      <View style={styles.tabRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabBar}
          contentContainerStyle={styles.tabBarContent}
          keyboardShouldPersistTaps="always"
        >
          {allChannels.map(ch => (
            <TouchableOpacity
              key={ch}
              style={[styles.tab, activeChannel === ch && styles.activeTab]}
              onPress={() => onSelectChannel(activeChannel === ch ? null : ch)}
              onLongPress={() => {
                // Only allow alias editing for non-Todos and non-Mapa channels
                if (ch !== 'Todos' && ch !== 'Mapa') {
                  setEditingChannel(ch);
                  setEditAlias(aliases[ch] || ch);
                }
              }}
              activeOpacity={0.6}
            >
              <Text style={[styles.tabText, activeChannel === ch && styles.activeTabText]}>
                {ch}
              </Text>
              {ch !== 'Todos' && ch !== 'Mapa' && (unreadCounts[ch] || 0) > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadCounts[ch]}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <Modal
        visible={editingChannel !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingChannel(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Comando para "{editingChannel}"</Text>
            <Text style={styles.modalHint}>
              El comando que se envía al MUD. Ej: "ch" en vez de "chat"
            </Text>
            <TextInput
              style={styles.modalInput}
              value={editAlias}
              onChangeText={setEditAlias}
              autoCapitalize="none"
              autoCorrect={false}
              placeholderTextColor="#666"
              showSoftInputOnFocus={!useCustomKeyboard}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingChannel(null)}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={() => {
                if (editingChannel && editAlias.trim()) onAliasChange(editingChannel, editAlias.trim());
                setEditingChannel(null);
              }}>
                <Text style={styles.saveText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ── Active channel panel (messages + input, placed at bottom) ──
interface ChannelActivePanelProps {
  messages: ChannelMessage[];
  channel: string | null;
  alias: string;
  visible: boolean;
  onSendMessage: (cmd: string) => void;
  onClose: () => void;
  fontSize?: number;
  useCustomKeyboard?: boolean;
  onInputFocus?: () => void;
  onInputBlur?: () => void;
}

export function ChannelActivePanel({
  messages, channel, alias, visible, onSendMessage, onClose, fontSize = 14,
  useCustomKeyboard = false,
  onInputFocus,
  onInputBlur,
}: ChannelActivePanelProps) {
  const flatListRef = useRef<FlatList>(null);

  // If channel is "Todos", show all messages; otherwise filter by channel
  const filtered = channel ? (channel === 'Todos' ? messages : messages.filter(m => m.channel === channel)) : [];
  const reversed = useMemo(() => [...filtered].reverse(), [filtered]);

  const renderMessage = useCallback(({ item }: { item: ChannelMessage }) => (
    <View style={styles.message}>
      <Text style={[styles.messageText, { fontSize }]}>
        {item.spans.map((span, i) => (
          <Text
            key={i}
            style={[
              span.fg ? { color: span.fg } : null,
              span.bold ? { fontWeight: 'bold' } : null,
            ]}
          >
            {span.text}
          </Text>
        ))}
      </Text>
    </View>
  ), [fontSize]);

  if (!visible || !channel) return null;

  return (
    <View style={styles.activePanelContainer}>
      <FlatList
        ref={flatListRef}
        data={reversed}
        renderItem={renderMessage}
        keyExtractor={item => String(item.id)}
        style={styles.messageList}
        inverted
        keyboardShouldPersistTaps="always"
        ListEmptyComponent={
          <Text style={styles.emptyText}>Sin mensajes</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#111',
    alignItems: 'center',
  },
  tabBar: {
    flex: 1,
    maxHeight: 30,
  },
  tabBarContent: {
    paddingHorizontal: 3,
    paddingVertical: 2,
    gap: 2,
    alignItems: 'center',
  },
  tab: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 3,
    backgroundColor: '#1a1a2a',
  },
  activeTab: {
    backgroundColor: '#2a2a5a',
    borderWidth: 1,
    borderColor: '#55f',
  },
  tabText: {
    color: '#666',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  activeTabText: {
    color: '#aaf',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#cc0000',
    borderRadius: 7,
    minWidth: 14,
    height: 14,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: 'bold',
  },
  configBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    backgroundColor: '#1a1a1a',
  },
  configIcon: {
    fontSize: 14,
    color: '#666',
  },
  activePanelContainer: {
    flex: 1,
    backgroundColor: 'rgba(5, 5, 20, 0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(100, 100, 255, 0.3)',
  },
  messageList: {
    flex: 1,
    paddingHorizontal: 8,
    paddingTop: 4,
  },
  message: {
    paddingVertical: 1,
  },
  messageText: {
    color: '#ccc',
    fontSize: 12,
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  emptyText: {
    color: '#555',
    fontSize: 11,
    fontFamily: 'monospace',
    textAlign: 'center',
    marginTop: 20,
  },
  chatInputContainer: {
    flexDirection: 'row',
    backgroundColor: '#0a0a1a',
    borderTopWidth: 1,
    borderTopColor: '#2a2a4a',
    alignItems: 'center',
  },
  chatChannelLabel: {
    color: '#88f',
    fontSize: 10,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    paddingLeft: 8,
  },
  chatInput: {
    flex: 1,
    color: '#fff',
    fontFamily: 'monospace',
    fontSize: 14,
    paddingHorizontal: 8,
    paddingVertical: 8,
    minHeight: 40,
  },
  chatSendBtn: {
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  chatSendText: {
    color: '#88f',
    fontWeight: 'bold',
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: '#333',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    fontFamily: 'monospace',
  },
  modalHint: {
    color: '#888',
    fontSize: 11,
    marginBottom: 12,
    fontFamily: 'monospace',
  },
  modalInput: {
    backgroundColor: '#0a0a0a',
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 6,
    padding: 12,
    fontSize: 16,
    fontFamily: 'monospace',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
    gap: 12,
  },
  cancelBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: '#2a2a2a',
  },
  cancelText: {
    color: '#999',
    fontSize: 14,
  },
  saveBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: '#00cc00',
  },
  saveText: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
