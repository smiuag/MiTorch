import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  ScrollView,
  Dimensions,
} from 'react-native';
import { FloatingButton } from '../types';

interface FloatingButtonsOverlayProps {
  buttons: FloatingButton[];
  orientation: 'portrait' | 'landscape';
  onSendCommand: (command: string) => void;
  disabled?: boolean;
}

export function FloatingButtonsOverlay({
  buttons,
  orientation,
  onSendCommand,
  disabled = false,
}: FloatingButtonsOverlayProps) {
  const { width, height } = Dimensions.get('window');
  const isPortrait = orientation === 'portrait';

  // Grid configuration
  const buttonSize = 60;
  const padding = 8;
  const cols = isPortrait ? Math.floor((width - padding * 2) / (buttonSize + padding)) : Math.floor((width * 0.6 - padding * 2) / (buttonSize + padding));

  const gridLayout = buttons.map((btn, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    return {
      button: btn,
      x: padding + col * (buttonSize + padding),
      y: padding + row * (buttonSize + padding),
    };
  });

  return (
    <View style={styles.container} pointerEvents={disabled ? 'none' : 'auto'}>
      {gridLayout.map((item) => (
        <TouchableOpacity
          key={item.button.id}
          style={[
            styles.button,
            {
              width: buttonSize,
              height: buttonSize,
              left: item.x,
              top: item.y,
              backgroundColor: item.button.color,
              opacity: disabled ? 0.5 : (item.button.opacity ?? 0.85),
            },
          ]}
          onPress={() => onSendCommand(item.button.command)}
          activeOpacity={0.7}
          disabled={disabled}
        >
          <Text style={styles.buttonLabel} numberOfLines={2}>
            {item.button.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'box-none',
  },
  button: {
    position: 'absolute',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  buttonLabel: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
