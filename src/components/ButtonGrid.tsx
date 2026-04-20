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
  AccessibilityActionEvent,
} from 'react-native';
import { LayoutButton } from '../storage/layoutStorage';
import { NORMAL_MODE, BLIND_MODE } from '../config/gridConfig';

export const GRID_COLS = NORMAL_MODE.vertical.cols;
export const GRID_ROWS = NORMAL_MODE.vertical.rows;

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
            // Don't allow editing fixed buttons
            if (!button?.fixed) {
              onEditButton(col, row);
            }
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

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (!button) return;

    const actionNames = ['activate', 'secondary', 'tertiary', 'quaternary', 'quinary'];
    const allCommands = [
      button.command,
      ...(button.alternativeCommands || (button.secondaryCommand ? [button.secondaryCommand] : []))
    ];

    const actionIndex = actionNames.indexOf(event.nativeEvent.actionName);
    if (actionIndex >= 0 && actionIndex < allCommands.length) {
      const command = allCommands[actionIndex];
      if (button.addText) {
        onAddTextButton(command);
      } else {
        onSecondaryCommand(command);
      }
    }
  };

  const buildAccessibilityActions = () => {
    if (uiMode !== 'blind') return undefined;

    const allCommands = [
      button?.command,
      ...(button?.alternativeCommands || (button?.secondaryCommand ? [button?.secondaryCommand] : []))
    ].filter(Boolean);

    if (allCommands.length <= 1) return undefined;

    const actionNames = ['activate', 'secondary', 'tertiary', 'quaternary', 'quinary'];
    return allCommands.map((cmd, idx) => ({
      name: actionNames[idx],
      label: idx === 0 ? button?.label : `${button?.label} (${idx})`
    }));
  };

  const accessibilityActions = buildAccessibilityActions();

  const buildAccessibilityHint = () => {
    if (!button) return 'Ranura de botón vacía';

    const allCommands = [
      button.command,
      ...(button.alternativeCommands || (button.secondaryCommand ? [button.secondaryCommand] : []))
    ];

    if (uiMode === 'blind' && allCommands.length > 1) {
      return `${button.addText ? 'Escribir' : 'Ejecutar'}: ${allCommands.join(', ')}`;
    }
    return button.addText ? `Escribir: ${button.command}` : `Ejecutar: ${button.command}`;
  };

  const accessibilityHint = buildAccessibilityHint();

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
      accessibilityHint={accessibilityHint}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={handleAccessibilityAction}
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

  // Use blind mode dimensions if enabled, otherwise use normal mode
  const blindConfig = BLIND_MODE.vertical;
  const displayCols = minimalista ? blindConfig.cols : GRID_COLS;
  const displayRows = minimalista ? blindConfig.rows : GRID_ROWS;

  // Additional transformations in horizontal mode (after swap col/row and row inversion)
  // Normal mode: complex rearrangement of directions
  const normalModeTransforms: { [key: string]: { col: number; row: number } } = {
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

  // Blind mode: 90-degree rotation of directions
  const blindModeTransforms: { [key: string]: { col: number; row: number } } = {
    '1,4': { col: 1, row: 2 }, // NO → NE position
    '1,3': { col: 2, row: 2 }, // N → E position
    '1,2': { col: 3, row: 2 }, // NE → SE position
    '2,2': { col: 3, row: 3 }, // E → S position
    '3,2': { col: 3, row: 4 }, // SE → SO position
    '3,3': { col: 2, row: 4 }, // S → O position
    '3,4': { col: 1, row: 4 }, // SO → NO position
    '2,4': { col: 1, row: 3 }, // O → N position
    '1,1': { col: 3, row: 0 }, // AR → FU position
    '2,1': { col: 3, row: 1 }, // AB → DE position
    '3,1': { col: 1, row: 1 }, // DE → AR position
    '3,0': { col: 2, row: 1 }, // FU → AB position
  };

  const additionalTransforms = minimalista ? blindModeTransforms : normalModeTransforms;

  const buttonLookup = new Map<string, LayoutButton>();
  buttons.forEach((btn) => {
    // In horizontal mode, swap col/row for lookup (rotate 90°) and reverse row order
    if (horizontalMode) {
      const newCol = btn.row;
      // Invert row order based on vertical grid width
      const verticalCols = minimalista ? BLIND_MODE.vertical.cols : NORMAL_MODE.vertical.cols;
      const newRow = (verticalCols - 1) - btn.col;
      const key = `${newCol},${newRow}`;

      let finalCol = newCol;
      let finalRow = newRow;

      // Apply additional transformations for both modes (different tables per mode)
      if (additionalTransforms[key]) {
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
