import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Text,
  useWindowDimensions,
  GestureResponderEvent,
  PanResponder,
} from 'react-native';
import { LayoutButton } from '../storage/layoutStorage';

export const GRID_COLS = 9;
export const GRID_ROWS = 6;

interface ButtonGridProps {
  buttons: LayoutButton[];
  onSendCommand: (command: string) => void;
  onAddTextButton: (command: string) => void;
  onEditButton: (col: number, row: number) => void;
  moveMode?: boolean;
  sourceCol?: number;
  sourceRow?: number;
  onSwapButtons?: (targetCol: number, targetRow: number) => void;
  horizontalMode?: { cols: number; cellSize: number };
  uiMode?: 'completo' | 'blind';
  minimalista?: boolean;
  minCols?: number;
  minRows?: number;
}

function ButtonCell({
  col,
  row,
  button,
  cellSize,
  moveMode,
  isSource,
  horizontalMode,
  uiMode,
  onSendCommand,
  onAddTextButton,
  onEditButton,
  onSwapButtons,
  onSecondaryCommand,
}: {
  col: number;
  row: number;
  button: LayoutButton | undefined;
  cellSize: number;
  moveMode?: boolean;
  isSource?: boolean;
  horizontalMode?: any;
  uiMode?: 'completo' | 'blind';
  onSendCommand: (command: string) => void;
  onAddTextButton: (command: string) => void;
  onEditButton: (col: number, row: number) => void;
  onSwapButtons?: (targetCol: number, targetRow: number) => void;
  onSecondaryCommand: (command: string) => void;
}) {
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startPosRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const isLongPressTriggeredRef = useRef(false);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (evt) => {
          // En blind mode: aceptar 1+ dedos (longpress para editar, drag solo con 2+)
          // Esto permite que screen reader use gestos de 1 dedo para otras interacciones
          if (uiMode === 'blind') {
            return evt.nativeEvent.touches?.length >= 1;
          }
          // Modo normal: 1 dedo funciona
          return true;
        },
        onMoveShouldSetPanResponder: () => isDraggingRef.current,
        onPanResponderGrant: (evt) => {
          startPosRef.current = { x: evt.nativeEvent.pageX, y: evt.nativeEvent.pageY };
          isDraggingRef.current = false;
          isLongPressTriggeredRef.current = false;

          longPressTimerRef.current = setTimeout(() => {
            isLongPressTriggeredRef.current = true;
            onEditButton(col, row);
          }, 500);
        },
        onPanResponderMove: (evt) => {
          if (isLongPressTriggeredRef.current) return;

          // In blind mode: drag only with 2+ fingers (allow longpress with 1 finger)
          if (uiMode === 'blind' && evt.nativeEvent.touches?.length < 2) {
            return;
          }

          const dx = evt.nativeEvent.pageX - startPosRef.current.x;
          const dy = evt.nativeEvent.pageY - startPosRef.current.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance > 8) {
            isDraggingRef.current = true;
            if (longPressTimerRef.current) {
              clearTimeout(longPressTimerRef.current);
              longPressTimerRef.current = null;
            }
          }
        },
        onPanResponderRelease: () => {
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }

          if (isLongPressTriggeredRef.current) {
            // Long press already triggered edit, do nothing
            return;
          }

          if (isDraggingRef.current) {
            // Drag gesture - execute secondary command
            if (button?.secondaryCommand) {
              onSecondaryCommand(button.secondaryCommand);
            }
          } else {
            // Tap - execute primary command or moveMode swap
            if (moveMode && onSwapButtons && !button?.locked) {
              if (horizontalMode) {
                onSwapButtons(row, col);
              } else {
                onSwapButtons(col, row);
              }
            } else if (button?.command) {
              if (button.addText) {
                onAddTextButton(button.command);
              } else {
                onSendCommand(button.command);
              }
            }
          }
        },
      }),
    [col, row, button, moveMode, horizontalMode, uiMode, onSendCommand, onAddTextButton, onEditButton, onSwapButtons, onSecondaryCommand]
  );

  return (
    <View
      {...panResponder.panHandlers}
      style={[
        styles.cell,
        {
          width: cellSize,
          height: cellSize,
          backgroundColor: button ? button.color : '#222',
          borderWidth: isSource ? 3 : 1,
          borderColor: isSource ? '#ffff00' : '#444',
        },
      ]}
      accessible={!!button}
      accessibilityLabel={button ? button.label : ''}
      accessibilityRole="button"
      accessibilityHint={button ? (button.addText ? `Type: ${button.command}` : `Execute: ${button.command}`) : 'Empty button slot'}
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
    </View>
  );
}

export function ButtonGrid({
  buttons,
  onSendCommand,
  onAddTextButton,
  onEditButton,
  moveMode,
  sourceCol,
  sourceRow,
  onSwapButtons,
  horizontalMode,
  uiMode,
  minimalista = false,
  minCols = GRID_COLS,
  minRows = GRID_ROWS,
}: ButtonGridProps) {
  const { width } = useWindowDimensions();

  // Use minimalist dimensions if enabled
  const displayCols = minimalista ? minCols : GRID_COLS;
  const displayRows = minimalista ? minRows : GRID_ROWS;

  // Additional transformations in horizontal mode (after swap col/row and row inversion)
  const additionalTransforms: { [key: string]: { col: number; row: number } } = {
    '2,2': { col: 5, row: 2 }, // AR → FU
    '3,2': { col: 5, row: 3 }, // AB → 3
    '4,2': { col: 5, row: 4 }, // DE → 2
    '5,2': { col: 5, row: 5 }, // FU → 1
    '5,3': { col: 4, row: 5 }, // 3 → SO
    '5,4': { col: 3, row: 5 }, // 2 → O
    '5,5': { col: 2, row: 5 }, // 1 → NO
    '2,5': { col: 2, row: 2 }, // NO → AR
    '2,4': { col: 3, row: 2 }, // N → AB
    '2,3': { col: 4, row: 2 }, // NE → DE
    '3,3': { col: 4, row: 3 }, // E → SE
    '4,3': { col: 4, row: 4 }, // SE → S
    '3,4': { col: 3, row: 3 }, // 4 → E
    '4,4': { col: 3, row: 4 }, // S → 4
    '4,5': { col: 2, row: 4 }, // SO → N
    '3,5': { col: 2, row: 3 }, // O → NE
  };

  const buttonLookup = new Map<string, LayoutButton>();
  buttons.forEach((btn) => {
    // In horizontal mode, swap col/row for lookup (rotate 90°) and reverse row order
    if (horizontalMode) {
      const newCol = btn.row;
      const newRow = 8 - btn.col; // Invert row order (9 rows: 0-8)
      const key = `${newCol},${newRow}`;

      let finalCol = newCol;
      let finalRow = newRow;

      // Apply additional transformations only for non-blind mode (not 3 cols)
      if (horizontalMode.cols !== 3 && additionalTransforms[key]) {
        const transform = additionalTransforms[key];
        finalCol = transform.col;
        finalRow = transform.row;
      }

      buttonLookup.set(`${finalCol},${finalRow}`, btn);
    } else {
      buttonLookup.set(`${btn.col},${btn.row}`, btn);
    }
  });

  const handleSecondaryCommand = (command: string) => {
    onSendCommand(command);
  };

  // Grid dimensions: horizontal mode or vertical
  const gridCols = horizontalMode ? horizontalMode.cols : displayCols;
  const gridRows = horizontalMode ? minRows : displayRows;
  const cellSize = horizontalMode ? horizontalMode.cellSize : width / displayCols;

  return (
    <View style={styles.container}>
      {Array.from({ length: gridRows }).map((_, row) => (
        <View key={`row-${row}`} style={[styles.row, { height: cellSize }]}>
          {Array.from({ length: gridCols }).map((_, col) => {
            const button = buttonLookup.get(`${col},${row}`);
            const isSource = moveMode && col === sourceCol && row === sourceRow;
            return (
              <ButtonCell
                key={`cell-${col}-${row}`}
                col={col}
                row={row}
                button={button}
                cellSize={cellSize}
                moveMode={moveMode}
                isSource={isSource}
                horizontalMode={horizontalMode}
                uiMode={uiMode}
                onSendCommand={onSendCommand}
                onAddTextButton={onAddTextButton}
                onEditButton={onEditButton}
                onSwapButtons={onSwapButtons}
                onSecondaryCommand={handleSecondaryCommand}
              />
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
