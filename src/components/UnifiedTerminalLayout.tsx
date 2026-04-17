import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  useWindowDimensions,
  Keyboard,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MudLine, OrientationLayout } from '../types';
import { ChannelMessage } from './ChannelPanel';
import { MapRoom } from '../services/mapService';
import { TerminalSection, TerminalSectionHandle } from './TerminalSection';
import { ChatSection } from './ChatSection';
import { FloatingButtonsOverlay } from './FloatingButtonsOverlay';
import { ButtonLayout } from '../storage/layoutStorage';

interface UnifiedTerminalLayoutProps {
  lines: MudLine[];
  inputText: string;
  connected: boolean;
  channels: string[];
  channelMessages: ChannelMessage[];
  channelAliases: Record<string, string>;
  activeChannel: string | null;
  unreadCounts: Record<string, number>;
  hp: number;
  hpMax: number;
  energy: number;
  energyMax: number;
  fontSize: number;
  currentRoom: MapRoom | null;
  nearbyRooms: MapRoom[];
  mapVisible: boolean;
  commandHistory?: string[];
  buttonLayout: ButtonLayout | null;
  walking?: boolean;
  onInputChange: (text: string) => void;
  onSend: () => void;
  onSendCommand: (command: string) => void;
  onSelectChannel: (ch: string | null) => void;
  onAliasChange: (ch: string, alias: string) => void;
  onToggleMap: () => void;
  onStop?: () => void;
}

export function UnifiedTerminalLayout({
  lines,
  inputText,
  connected,
  channels,
  channelMessages,
  channelAliases,
  activeChannel,
  unreadCounts,
  hp,
  hpMax,
  energy,
  energyMax,
  fontSize,
  currentRoom,
  nearbyRooms,
  mapVisible,
  commandHistory,
  buttonLayout,
  walking,
  onInputChange,
  onSend,
  onSendCommand,
  onSelectChannel,
  onAliasChange,
  onToggleMap,
  onStop,
}: UnifiedTerminalLayoutProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLandscape = width > height;
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [orientationLayout, setOrientationLayout] = useState<OrientationLayout | null>(null);
  const translateYRef = useRef(new Animated.Value(0));
  const terminalSectionRef = useRef<TerminalSectionHandle>(null);

  const FIXED_SECTION_PERCENT = 0.4;
  const FLEXIBLE_SECTION_PERCENT = 0.6;

  const availableHeight = height - insets.top - insets.bottom;
  const fixedHeight = availableHeight * FIXED_SECTION_PERCENT;
  const flexibleHeight = availableHeight * FLEXIBLE_SECTION_PERCENT;
  const flexibleWidth = isLandscape ? width * FLEXIBLE_SECTION_PERCENT : width;

  const handleScrollTerminalToBottom = () => {
    terminalSectionRef.current?.scrollToBottom();
  };

  useEffect(() => {
    if (buttonLayout) {
      setOrientationLayout({
        orientation: isLandscape ? 'landscape' : 'portrait',
        floatingButtons: buttonLayout.buttons.map(btn => ({
          id: btn.id,
          label: btn.label,
          command: btn.command,
          color: btn.color,
          gridX: btn.col,
          gridRow: btn.row,
          opacity: btn.opacity,
        })),
      });
    } else {
      setOrientationLayout(null);
    }
  }, [buttonLayout, isLandscape]);

  // Keyboard handling
  useEffect(() => {
    const keyboardShowListener = Keyboard.addListener('keyboardDidShow', (e) => {
      const kbHeight = e.endCoordinates.height;
      setKeyboardHeight(kbHeight);

      Animated.timing(translateYRef.current, {
        toValue: -kbHeight,
        duration: 250,
        useNativeDriver: true,
      }).start();
    });

    const keyboardHideListener = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);

      Animated.timing(translateYRef.current, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    });

    return () => {
      keyboardShowListener.remove();
      keyboardHideListener.remove();
    };
  }, []);

  if (isLandscape) {
    // Horizontal layout: 60% left (terminal) | 40% right (chat)
    return (
      <Animated.View
        style={[
          styles.landscapeContainer,
          {
            transform: [{ translateY: translateYRef.current }],
          },
        ]}
      >
        <View style={[styles.flexibleSection, { width: `${FLEXIBLE_SECTION_PERCENT * 100}%` }]}>
          <TerminalSection
            ref={terminalSectionRef}
            lines={lines}
            fontSize={fontSize}
            mapVisible={mapVisible}
            onToggleMap={onToggleMap}
            currentRoom={currentRoom}
            nearbyRooms={nearbyRooms}
            height={availableHeight}
          />
          {orientationLayout && orientationLayout.floatingButtons.length > 0 && buttonLayout && (
            <FloatingButtonsOverlay
              buttons={orientationLayout.floatingButtons}
              orientation="landscape"
              onSendCommand={onSendCommand}
              availableHeight={availableHeight}
              availableWidth={flexibleWidth}
              gridSize={buttonLayout.gridSize}
            />
          )}
        </View>

        <View style={[styles.fixedSection, { width: `${FIXED_SECTION_PERCENT * 100}%` }]}>
          <ChatSection
            height={availableHeight}
            channels={channels}
            channelMessages={channelMessages}
            channelAliases={channelAliases}
            activeChannel={activeChannel}
            unreadCounts={unreadCounts}
            inputText={inputText}
            fontSize={fontSize}
            hp={hp}
            hpMax={hpMax}
            energy={energy}
            energyMax={energyMax}
            currentRoom={currentRoom}
            nearbyRooms={nearbyRooms}
            onSelectChannel={onSelectChannel}
            onAliasChange={onAliasChange}
            onInputChange={onInputChange}
            onSend={onSend}
            onSendCommand={onSendCommand}
            onScrollTerminalToBottom={handleScrollTerminalToBottom}
            commandHistory={commandHistory}
            walking={walking}
            onStop={onStop}
          />
        </View>
      </Animated.View>
    );
  } else {
    // Vertical layout: 60% top (terminal) | 40% bottom (chat)
    return (
      <Animated.View
        style={[
          styles.portraitContainer,
          {
            transform: [{ translateY: translateYRef.current }],
          },
        ]}
      >
        <View style={[styles.flexibleSection, { height: flexibleHeight }]}>
          <TerminalSection
            ref={terminalSectionRef}
            lines={lines}
            fontSize={fontSize}
            mapVisible={mapVisible}
            onToggleMap={onToggleMap}
            currentRoom={currentRoom}
            nearbyRooms={nearbyRooms}
            height={flexibleHeight}
          />
          {orientationLayout && orientationLayout.floatingButtons.length > 0 && buttonLayout && (
            <FloatingButtonsOverlay
              buttons={orientationLayout.floatingButtons}
              orientation="portrait"
              onSendCommand={onSendCommand}
              availableHeight={flexibleHeight}
              availableWidth={width}
              gridSize={buttonLayout.gridSize}
            />
          )}
        </View>

        <View style={[styles.fixedSection, { height: fixedHeight }]}>
          <ChatSection
            height={fixedHeight}
            channels={channels}
            channelMessages={channelMessages}
            channelAliases={channelAliases}
            activeChannel={activeChannel}
            unreadCounts={unreadCounts}
            inputText={inputText}
            fontSize={fontSize}
            hp={hp}
            hpMax={hpMax}
            energy={energy}
            energyMax={energyMax}
            currentRoom={currentRoom}
            nearbyRooms={nearbyRooms}
            onSelectChannel={onSelectChannel}
            onAliasChange={onAliasChange}
            onInputChange={onInputChange}
            onSend={onSend}
            onSendCommand={onSendCommand}
            onScrollTerminalToBottom={handleScrollTerminalToBottom}
            commandHistory={commandHistory}
            walking={walking}
            onStop={onStop}
          />
        </View>
      </Animated.View>
    );
  }
}

const styles = StyleSheet.create({
  portraitContainer: {
    flex: 1,
    flexDirection: 'column',
    overflow: 'hidden',
  },
  landscapeContainer: {
    flex: 1,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  flexibleSection: {
    flex: 0,
    overflow: 'hidden',
  },
  fixedSection: {
    flex: 0,
    overflow: 'hidden',
  },
});
