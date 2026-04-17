import React from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Dimensions,
  useSafeAreaFrame,
} from 'react-native';
import { FloatingButton } from '../types';

interface FloatingButtonsOverlayProps {
  buttons: FloatingButton[];
  orientation: 'portrait' | 'landscape';
  onSendCommand: (command: string) => void;
  disabled?: boolean;
  availableHeight?: number;
  availableWidth?: number;
}

const GRID_COLS = 11;
const GRID_ROWS = 11;
const GAP = 1;

export function FloatingButtonsOverlay({
  buttons,
  orientation,
  onSendCommand,
  disabled = false,
  availableHeight = 0,
  availableWidth = 0,
}: FloatingButtonsOverlayProps) {
  const { width, height } = Dimensions.get('window');
  const isPortrait = orientation === 'portrait';

  // Determine available space for buttons
  let containerWidth = availableWidth || width;
  let containerHeight = availableHeight || height;

  // In landscape, buttons occupy 60% of width
  if (!isPortrait && !availableWidth) {
    containerWidth = width * 0.6;
  }

  // Calculate cell size to fit 11x11 grid
  const cellWidth = Math.floor((containerWidth - GAP * (GRID_COLS - 1)) / GRID_COLS);
  const cellHeight = Math.floor((containerHeight - GAP * (GRID_ROWS - 1)) / GRID_ROWS);
  const cellSize = Math.min(cellWidth, cellHeight);

  return (
    <View style={styles.container} pointerEvents={disabled ? 'none' : 'auto'}>
      {buttons.map((btn) => {
        const x = btn.gridX * (cellSize + GAP);
        const y = btn.gridRow * (cellSize + GAP);

        return (
          <TouchableOpacity
            key={btn.id}
            style={[
              styles.button,
              {
                width: cellSize,
                height: cellSize,
                left: x,
                top: y,
                backgroundColor: btn.color,
                opacity: disabled ? 0.5 : (btn.opacity ?? 0.5),
              },
            ]}
            onPress={() => onSendCommand(btn.command)}
            activeOpacity={0.7}
            disabled={disabled}
          >
            <Text style={styles.buttonLabel} numberOfLines={2}>
              {btn.label}
            </Text>
          </TouchableOpacity>
        );
      })}
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
    borderRadius: 2,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  buttonLabel: {
    color: '#fff',
    fontSize: 9,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
