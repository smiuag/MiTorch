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
  onSelectChannel: (ch: string | null) => void;
  onAliasChange: (ch: string, alias: string) => void;
  onInputChange: (text: string) => void;
  onSend: () => void;
  onConfigPress: () => void;
  onScrollTerminalToBottom?: () => void;
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
  onSelectChannel,
  onAliasChange,
  onInputChange,
  onSend,
  onConfigPress,
  onScrollTerminalToBottom,
}: ChatSectionProps) {
  const { width } = useWindowDimensions();
  const inputRef = useRef<TextInput>(null);
  const messagesListRef = useRef<FlatList>(null);
  const [filteredMessages, setFilteredMessages] = useState<ChannelMessage[]>([]);

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

  const handleSend = () => {
    if (inputText.trim()) {
      let message = inputText;
      // Add channel alias prefix if not in "Todos"
      if (activeChannel && activeChannel !== 'Todos') {
        const alias = channelAliases[activeChannel] || activeChannel;
        message = `${alias} ${message}`;
      }
      onSendCommand(message);
      onInputChange('');
      // Auto-scroll terminal to bottom when sending
      onScrollTerminalToBottom?.();
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
          onConfigPress={onConfigPress}
          unreadCounts={unreadCounts}
          allMessages={channelMessages}
          fontSize={fontSize}
        />
      </View>

      {/* Messages List */}
      <FlatList
        ref={messagesListRef}
        data={filteredMessages}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.messageContainer}>
            <AnsiText spans={item.spans} fontSize={fontSize - 2} />
          </View>
        )}
        style={styles.messagesList}
        scrollEventThrottle={250}
        removeClippedSubviews={true}
        maxToRenderPerBatch={30}
        updateCellsBatchingPeriod={50}
      />

      {/* Vital Bars */}
      <View style={styles.vitalBarsContainer}>
        <VitalBars hp={hp} hpMax={hpMax} energy={energy} energyMax={energyMax} />
      </View>

      {/* Input */}
      <View style={styles.inputContainer}>
        <TextInput
          ref={inputRef}
          style={[styles.input, { fontSize }]}
          value={inputText}
          onChangeText={onInputChange}
          placeholder="Say something..."
          placeholderTextColor="#666"
          multiline={false}
          onSubmitEditing={handleSend}
        />
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
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  sendButton: {
    backgroundColor: '#3399cc',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
});
