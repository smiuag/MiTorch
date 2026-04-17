import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, useWindowDimensions } from 'react-native';
import { FloatingLayout as FloatingLayoutType, LayoutItem, MudLine } from '../types';
import { loadLayout } from '../storage/layoutStorage';
import { computeGridMetrics } from '../utils/gridUtils';
import { VitalBars } from './VitalBars';
import { ChannelTabs, ChannelActivePanel } from './ChannelPanel';
import { TerminalPanel } from './TerminalPanel';
import { MapRoom } from '../services/mapService';

interface FloatingLayoutProps {
  orientation: 'portrait' | 'landscape';
  layoutVersion: number;
  hp: number;
  hpMax: number;
  energy: number;
  energyMax: number;
  inputText: string;
  onInputChange: (text: string) => void;
  onSend: () => void;
  onSendCommand: (command: string) => void;
  channels: string[];
  channelMessages: any[];
  channelAliases: Record<string, string>;
  activeChannel: string | null;
  onSelectChannel: (ch: string | null) => void;
  unreadCounts: Record<string, number>;
  onAliasChange: (ch: string, alias: string) => void;
  fontSize: number;
  onConfigPress: () => void;
  lines: MudLine[];
  mapVisible: boolean;
  onToggleMap: () => void;
  currentRoom: MapRoom | null;
  nearbyRooms: MapRoom[];
}

export function FloatingLayout({
  orientation,
  layoutVersion,
  hp,
  hpMax,
  energy,
  energyMax,
  inputText,
  onInputChange,
  onSend,
  onSendCommand,
  channels,
  channelMessages,
  channelAliases,
  activeChannel,
  onSelectChannel,
  unreadCounts,
  onAliasChange,
  fontSize,
  onConfigPress,
  lines,
  mapVisible,
  onToggleMap,
  currentRoom,
  nearbyRooms,
}: FloatingLayoutProps) {
  const [layout, setLayout] = useState<FloatingLayoutType | null>(null);
  const { width, height } = useWindowDimensions();

  useEffect(() => {
    loadLayout().then(setLayout);
  }, [layoutVersion]);

  if (!layout) return null;

  // Detect actual device orientation from dimensions
  const actualOrientation = width > height ? 'landscape' : 'portrait';

  // Use the gridCols from the saved layout to calculate metrics
  // This ensures the grid size matches what was configured in the editor
  const metrics = computeGridMetrics(width, height, actualOrientation, layout.gridCols);

  // Render terminal items first (at bottom), then other items on top
  const terminalItems = layout.items.filter(item => item.type === 'terminal');
  const otherItems = layout.items.filter(item => item.type !== 'terminal');
  const sortedItems = [...terminalItems, ...otherItems];

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      {sortedItems.map(item => {
        const style = {
          position: 'absolute' as const,
          left: metrics.offsetX + item.col * metrics.cellSize,
          top: metrics.offsetY + item.row * metrics.cellSize,
          width: item.colSpan * metrics.cellSize,
          height: item.rowSpan * metrics.cellSize,
        };

        if (item.type === 'button') {
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.button, style, { backgroundColor: item.color, opacity: item.opacity || 1 }]}
              onPress={() => {
                if (item.command) {
                  onSendCommand(item.command);
                }
              }}
            >
              <Text style={styles.buttonText} numberOfLines={2}>
                {item.label || 'Botón'}
              </Text>
            </TouchableOpacity>
          );
        } else if (item.type === 'vitalbars') {
          return (
            <View key={item.id} style={[styles.widget, style, { opacity: item.opacity || 1 }]}>
              <VitalBars hp={hp} hpMax={hpMax} energy={energy} energyMax={energyMax} />
            </View>
          );
        } else if (item.type === 'input') {
          return (
            <View key={item.id} style={[styles.inputWidget, style, { opacity: item.opacity || 1 }]}>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  value={inputText}
                  onChangeText={onInputChange}
                  placeholder="Enter command..."
                  placeholderTextColor="#666"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="send"
                  onSubmitEditing={onSend}
                />
                <TouchableOpacity style={styles.sendBtn} onPress={onSend}>
                  <Text style={styles.sendBtnText}>Send</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        } else if (item.type === 'chat') {
          const activeAlias = activeChannel && channelAliases[activeChannel] ? channelAliases[activeChannel] : activeChannel || '';
          return (
            <View key={item.id} style={[styles.chatWidget, style, { opacity: item.opacity || 1 }]}>
              {channels.length > 0 && (
                <>
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
                  <ChannelActivePanel
                    messages={channelMessages}
                    channel={activeChannel}
                    alias={activeAlias}
                    visible={activeChannel !== null}
                    onSendMessage={onSendCommand}
                    onClose={() => onSelectChannel(null)}
                    fontSize={fontSize}
                  />
                </>
              )}
            </View>
          );
        } else if (item.type === 'terminal') {
          return (
            <View key={item.id} style={[styles.terminalWidget, style, { opacity: item.opacity || 1 }]}>
              <TerminalPanel
                lines={lines}
                fontSize={fontSize}
                mapVisible={mapVisible}
                onToggleMap={onToggleMap}
                currentRoom={currentRoom}
                nearbyRooms={nearbyRooms}
                activeChannel={activeChannel}
                onSelectChannel={onSelectChannel}
              />
            </View>
          );
        }

        return null;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#0c0',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 4,
  },
  buttonText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: 'monospace',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  widget: {
    borderRadius: 4,
    backgroundColor: '#000',
    justifyContent: 'center',
    padding: 4,
  },
  inputWidget: {
    borderRadius: 4,
    backgroundColor: '#000',
    padding: 4,
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 12,
    fontFamily: 'monospace',
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  sendBtn: {
    backgroundColor: '#0a2a0a',
    borderWidth: 1,
    borderColor: '#0c0',
    borderRadius: 3,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnText: {
    color: '#0c0',
    fontSize: 11,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  chatWidget: {
    borderRadius: 4,
    backgroundColor: '#000',
    overflow: 'hidden',
    flexDirection: 'column',
  },
  terminalWidget: {
    borderRadius: 4,
    backgroundColor: '#000',
    overflow: 'hidden',
    flexDirection: 'column',
  },
});
