import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Text,
  FlatList,
  Keyboard,
  useWindowDimensions,
} from 'react-native';
import { AnsiText } from './AnsiText';
import { ChannelMessage, ChannelTabs } from './ChannelPanel';
import { VitalBars } from './VitalBars';
import { MiniMap } from './MiniMap';
import { MapRoom } from '../services/mapService';

interface ChatSectionProps {
  height: number;
  channels: string[];
  channelMessages: ChannelMessage[];
  channelAliases: Record<string, string>;
  activeChannel: string | null;
  unreadCounts: Record<string, number>;
  inputText: string;
  fontSize: number;
  hp: number;
  hpMax: number;
  energy: number;
  energyMax: number;
  currentRoom: MapRoom | null;
  nearbyRooms: MapRoom[];
  onSelectChannel: (ch: string | null) => void;
  onAliasChange: (ch: string, alias: string) => void;
  onInputChange: (text: string) => void;
  onSend: () => void;
  onSendCommand: (command: string) => void;
  onScrollTerminalToBottom?: () => void;
  commandHistory?: string[];
  onHistoryNavigate?: (command: string) => void;
}

export function ChatSection({
  height,
  channels,
  channelMessages,
  channelAliases,
  activeChannel,
  unreadCounts,
  inputText,
  fontSize,
  hp,
  hpMax,
  energy,
  energyMax,
  currentRoom,
  nearbyRooms,
  onSelectChannel,
  onAliasChange,
  onInputChange,
  onSend,
  onSendCommand,
  onScrollTerminalToBottom,
  commandHistory = [],
  onHistoryNavigate,
}: ChatSectionProps) {
  const { width } = useWindowDimensions();
  const inputRef = useRef<TextInput>(null);
  const messagesListRef = useRef<FlatList>(null);
  const [filteredMessages, setFilteredMessages] = useState<ChannelMessage[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);

  // Filter messages based on active channel
  useEffect(() => {
    if (activeChannel === 'Todos') {
      // Show all messages chronologically
      setFilteredMessages(
        channelMessages.sort((a, b) => a.id - b.id)
      );
    } else if (activeChannel) {
      // Show messages from specific channel
      setFilteredMessages(
        channelMessages
          .filter((msg) => msg.channel === activeChannel)
          .sort((a, b) => a.id - b.id)
      );
    } else {
      setFilteredMessages([]);
    }
  }, [activeChannel, channelMessages]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (filteredMessages.length > 0) {
      setTimeout(() => {
        messagesListRef.current?.scrollToEnd({ animated: false });
      }, 0);
    }
  }, [filteredMessages]);

  // Auto-scroll to bottom when changing channels
  useEffect(() => {
    if (filteredMessages.length > 0) {
      setTimeout(() => {
        messagesListRef.current?.scrollToEnd({ animated: false });
      }, 0);
    }
  }, [activeChannel]);

  const handleSend = () => {
    if (inputText.trim()) {
      let message = inputText;
      // Add channel alias prefix if not in "Todos" or "Mapa"
      if (activeChannel && activeChannel !== 'Todos' && activeChannel !== 'Mapa') {
        const alias = channelAliases[activeChannel] || activeChannel;
        message = `${alias} ${message}`;
      }
      onSendCommand(message);
      onInputChange('');
      setHistoryIndex(null);
      // Auto-scroll terminal to bottom when sending
      onScrollTerminalToBottom?.();
    }
  };

  const handleHistoryPrev = () => {
    let nextIndex = historyIndex === null ? commandHistory.length - 1 : historyIndex - 1;
    if (nextIndex < 0) nextIndex = commandHistory.length - 1;
    if (commandHistory[nextIndex]) {
      setHistoryIndex(nextIndex);
      onHistoryNavigate?.(commandHistory[nextIndex]);
      onInputChange(commandHistory[nextIndex]);
    }
  };

  const handleHistoryNext = () => {
    if (historyIndex === null) return;
    let nextIndex = historyIndex + 1;
    if (nextIndex >= commandHistory.length) {
      nextIndex = 0;
    }
    if (commandHistory[nextIndex]) {
      setHistoryIndex(nextIndex);
      onHistoryNavigate?.(commandHistory[nextIndex]);
      onInputChange(commandHistory[nextIndex]);
    }
  };

  return (
    <View style={[styles.container, { height }]}>
      {/* Channel Tabs */}
      <View style={styles.tabsWrapper}>
        <ChannelTabs
          channels={channels}
          aliases={channelAliases}
          activeChannel={activeChannel}
          onSelectChannel={onSelectChannel}
          onAliasChange={onAliasChange}
          unreadCounts={unreadCounts}
          allMessages={channelMessages}
          fontSize={fontSize}
        />
      </View>

      {/* Messages List or Map */}
      <View style={styles.messagesList}>
        {activeChannel === 'Mapa' ? (
          <MiniMap
            currentRoom={currentRoom}
            nearbyRooms={nearbyRooms}
            visible={true}
            onToggle={() => {}}
            inlineMode={true}
          />
        ) : (
          <FlatList
            ref={messagesListRef}
            data={filteredMessages}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <View style={styles.messageContainer}>
                <AnsiText spans={item.spans} fontSize={fontSize - 2} addNewline={false} />
              </View>
            )}
            scrollEventThrottle={250}
            removeClippedSubviews={true}
            maxToRenderPerBatch={30}
            updateCellsBatchingPeriod={50}
          />
        )}
      </View>

      {/* Vital Bars */}
      <View style={styles.vitalBarsContainer}>
        <VitalBars hp={hp} hpMax={hpMax} energy={energy} energyMax={energyMax} />
      </View>

      {/* Input */}
      <View style={styles.inputContainer}>
        <TouchableOpacity style={styles.historyButton} onPress={handleHistoryPrev}>
          <Text style={styles.historyButtonText}>▲</Text>
        </TouchableOpacity>
        <TextInput
          ref={inputRef}
          style={[styles.input, { fontSize }]}
          value={inputText}
          onChangeText={onInputChange}
          placeholder="Say something..."
          placeholderTextColor="#666"
          multiline={false}
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
          returnKeyType="send"
        />
        <TouchableOpacity style={styles.historyButton} onPress={handleHistoryNext}>
          <Text style={styles.historyButtonText}>▼</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
          <Text style={styles.sendButtonText}>›</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: '#333',
    overflow: 'hidden',
  },
  tabsWrapper: {
    minHeight: 40,
  },
  messagesList: {
    flexGrow: 1,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  messageContainer: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  vitalBarsContainer: {
    backgroundColor: '#0a0a0a',
    borderTopWidth: 1,
    borderTopColor: '#333',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: 'center',
    zIndex: 10,
  },
  input: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    color: '#fff',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#333',
    height: 40,
  },
  historyButton: {
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 40,
    height: 40,
  },
  historyButtonText: {
    color: '#888',
    fontSize: 12,
    fontWeight: 'bold',
  },
  sendButton: {
    backgroundColor: '#3399cc',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    height: 40,
    marginLeft: 6,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 26,
    fontWeight: 'bold',
    lineHeight: 26,
  },
});
