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
  onConfigureButtons: () => void;
  onCloseKeyboard?: () => void;
  showConfigureButton: boolean;
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
  onConfigureButtons,
  onCloseKeyboard,
  showConfigureButton,
}: UnifiedTerminalLayoutProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLandscape = width > height;
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [orientationLayout, setOrientationLayout] = useState<OrientationLayout | null>(null);
  const translateYRef = useRef(new Animated.Value(0));
  const terminalSectionRef = useRef<TerminalSectionHandle>(null);

  // Fixed sizes for ChatSection components
  const TABS_HEIGHT = 40;
  const MESSAGES_MAX_HEIGHT = 150;
  const VITALS_HEIGHT = 40;
  const INPUT_HEIGHT = 60;
  const KEYBOARD_HEIGHT_PORTRAIT = 180;
  const KEYBOARD_HEIGHT_LANDSCAPE = 110;
  const KEYBOARD_HEIGHT = isLandscape ? KEYBOARD_HEIGHT_LANDSCAPE : KEYBOARD_HEIGHT_PORTRAIT;
  const CHAT_WIDTH_LANDSCAPE = 320;

  const availableHeight = height - insets.top - insets.bottom;
  const chatSectionHeight = TABS_HEIGHT + MESSAGES_MAX_HEIGHT + VITALS_HEIGHT + INPUT_HEIGHT + KEYBOARD_HEIGHT;
  const terminalSectionHeight = availableHeight - chatSectionHeight;
  const flexibleWidth = isLandscape ? width - CHAT_WIDTH_LANDSCAPE : width;

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
        <View style={[styles.flexibleSection, { flex: 1 }]}>
          <TerminalSection
            ref={terminalSectionRef}
            lines={lines}
            fontSize={fontSize}
            mapVisible={mapVisible}
            onToggleMap={onToggleMap}
            currentRoom={currentRoom}
            nearbyRooms={nearbyRooms}
            height={availableHeight}
            onConfigureButtons={onConfigureButtons}
            showConfigureButton={showConfigureButton}
            onPress={onCloseKeyboard}
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

        <View style={[styles.fixedSection, { width: CHAT_WIDTH_LANDSCAPE }]}>
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
            panelButtons={buttonLayout?.panelButtons}
            gridSize={buttonLayout?.gridSize}
            onSelectChannel={onSelectChannel}
            onAliasChange={onAliasChange}
            onInputChange={onInputChange}
            onSend={onSend}
            onSendCommand={onSendCommand}
            onScrollTerminalToBottom={handleScrollTerminalToBottom}
            commandHistory={commandHistory}
            walking={walking}
            onStop={onStop}
            useCustomKeyboard={true}
            onCloseKeyboard={onCloseKeyboard}
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
        <View style={[styles.flexibleSection, { flex: 1 }]}>
          <TerminalSection
            ref={terminalSectionRef}
            lines={lines}
            fontSize={fontSize}
            mapVisible={mapVisible}
            onToggleMap={onToggleMap}
            currentRoom={currentRoom}
            nearbyRooms={nearbyRooms}
            height={terminalSectionHeight}
            onConfigureButtons={onConfigureButtons}
            showConfigureButton={showConfigureButton}
            onPress={onCloseKeyboard}
          />
          {orientationLayout && orientationLayout.floatingButtons.length > 0 && buttonLayout && (
            <FloatingButtonsOverlay
              buttons={orientationLayout.floatingButtons}
              orientation="portrait"
              onSendCommand={onSendCommand}
              availableHeight={terminalSectionHeight}
              availableWidth={width}
              gridSize={buttonLayout.gridSize}
            />
          )}
        </View>

        <View style={[styles.fixedSection, { height: chatSectionHeight }]}>
          <ChatSection
            height={chatSectionHeight}
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
            panelButtons={buttonLayout?.panelButtons}
            gridSize={buttonLayout?.gridSize}
            onSelectChannel={onSelectChannel}
            onAliasChange={onAliasChange}
            onInputChange={onInputChange}
            onSend={onSend}
            onSendCommand={onSendCommand}
            onScrollTerminalToBottom={handleScrollTerminalToBottom}
            commandHistory={commandHistory}
            walking={walking}
            onStop={onStop}
            useCustomKeyboard={true}
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
