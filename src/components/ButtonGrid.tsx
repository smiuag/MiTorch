import React, { useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Text,
  useWindowDimensions,
  GestureResponderEvent,
} from 'react-native';
import { LayoutButton } from '../storage/layoutStorage';

export const GRID_COLS = 9;
export const GRID_ROWS = 6;

interface ButtonGridProps {
  buttons: LayoutButton[];
  onSendCommand: (command: string) => void;
  onEditButton: (col: number, row: number) => void;
}

export function ButtonGrid({
  buttons,
  onSendCommand,
  onEditButton,
}: ButtonGridProps) {
  const { width } = useWindowDimensions();
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const buttonLookup = new Map<string, LayoutButton>();
  buttons.forEach((btn) => {
    buttonLookup.set(`${btn.col},${btn.row}`, btn);
  });

  const handleButtonPressIn = (col: number, row: number) => {
    longPressTimerRef.current = setTimeout(() => {
      onEditButton(col, row);
    }, 500);
  };

  const handleButtonPressOut = (col: number, row: number, button: LayoutButton | undefined) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (button && button.command) {
      onSendCommand(button.command);
    }
  };

  const cellSize = width / GRID_COLS;

  return (
    <View style={styles.container}>
      {Array.from({ length: GRID_ROWS }).map((_, row) => (
        <View key={`row-${row}`} style={[styles.row, { height: cellSize }]}>
          {Array.from({ length: GRID_COLS }).map((_, col) => {
            const button = buttonLookup.get(`${col},${row}`);
            return (
              <TouchableOpacity
                key={`cell-${col}-${row}`}
                style={[
                  styles.cell,
                  {
                    width: cellSize,
                    height: cellSize,
                    backgroundColor: button ? button.color : '#222',
                  },
                ]}
                onPressIn={() => handleButtonPressIn(col, row)}
                onPressOut={() => handleButtonPressOut(col, row, button)}
                activeOpacity={0.7}
              >
                {button && (
                  <Text
                    style={[
                      styles.buttonLabel,
                      { color: button.textColor || '#fff', fontSize: cellSize * 0.25 },
                    ]}
                    numberOfLines={1}
                  >
                    {button.label}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingHorizontal: 4,
    paddingVertical: 3,
    gap: 3,
  },
  row: {
    flexDirection: 'row',
    gap: 3,
  },
  cell: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 4,
    minHeight: 38,
  },
  buttonLabel: {
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: 'monospace',
    fontSize: 11,
  },
});
