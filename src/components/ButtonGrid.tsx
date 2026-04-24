import React, { useState, useRef, useMemo, useEffect } from 'react';
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
  onEditButton: () => void;
  onSwapButtons?: () => void;
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
          // Enable PanResponder in all modes (needed for longpress)
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
              onEditButton();
            }
          }, 800);
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
            const secondaryCmd = button?.secondaryCommand || button?.alternativeCommands?.[0];
            if (secondaryCmd) {
              onSecondaryCommand(secondaryCmd);
            }
          } else {
            // Tap - execute primary command or moveMode swap
            if (moveMode && onSwapButtons && !button?.locked) {
              onSwapButtons();
            } else if (button?.command) {
              // In blind mode: execute primary command directly (longpress for config)
              // In completo mode: execute primary command (drag handles secondary)
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
    if (!button || !button.command) return;

    // Execute primary command (same as tap)
    if (button.addText) {
      onAddTextButton(button.command);
    } else {
      onSendCommand(button.command);
    }
  };

  const buildAccessibilityHint = () => {
    if (!button) return 'Ranura de botón vacía';

    // In blind mode: only announce the label
    if (uiMode === 'blind') {
      return button.label;
    }

    const allCommands = [
      button.command,
      ...(button.alternativeCommands || (button.secondaryCommand ? [button.secondaryCommand] : []))
    ];

    if (uiMode === 'completo' && allCommands.length > 1) {
      return `${button.addText ? 'Escribir' : 'Ejecutar'}: ${button.command}. Arrastra para: ${allCommands[1]}`;
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
      onAccessibilityAction={handleAccessibilityAction}
      importantForAccessibility={button ? 'yes' : 'no'}
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
  const verticalCols = minimalista ? BLIND_MODE.vertical.cols : NORMAL_MODE.vertical.cols;

  // Inverse of additionalTransforms: visual final → swapped intermediate
  const inverseAdditionalTransforms = useMemo(() => {
    const inv: { [key: string]: { col: number; row: number } } = {};
    for (const [swappedKey, finalPos] of Object.entries(additionalTransforms)) {
      const [swCol, swRow] = swappedKey.split(',').map(Number);
      inv[`${finalPos.col},${finalPos.row}`] = { col: swCol, row: swRow };
    }
    return inv;
  }, [additionalTransforms]);

  // Storage (col, row) → visual final (col, row)
  const storageToVisual = (sCol: number, sRow: number): { col: number; row: number } => {
    if (!horizontalMode) return { col: sCol, row: sRow };
    const swCol = sRow;
    const swRow = (verticalCols - 1) - sCol;
    const t = additionalTransforms[`${swCol},${swRow}`];
    return t ? { col: t.col, row: t.row } : { col: swCol, row: swRow };
  };

  // Visual (col, row) → storage (col, row) — inverse of the above
  const visualToStorage = (vCol: number, vRow: number): { col: number; row: number } => {
    if (!horizontalMode) return { col: vCol, row: vRow };
    const inv = inverseAdditionalTransforms[`${vCol},${vRow}`];
    const swCol = inv ? inv.col : vCol;
    const swRow = inv ? inv.row : vRow;
    return { col: (verticalCols - 1) - swRow, row: swCol };
  };

  const buttonLookup = new Map<string, LayoutButton>();
  buttons.forEach((btn) => {
    const v = storageToVisual(btn.col, btn.row);
    buttonLookup.set(`${v.col},${v.row}`, btn);
  });

  // Convert source storage coords to visual for the move-mode highlight
  const sourceVisual = sourceCol !== undefined && sourceRow !== undefined
    ? storageToVisual(sourceCol, sourceRow)
    : { col: -1, row: -1 };

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
            const isSource = moveMode && col === sourceVisual.col && row === sourceVisual.row;
            const storage = visualToStorage(col, row);
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
                onEditButton={() => onEditButton(storage.col, storage.row)}
                onSwapButtons={onSwapButtons ? () => onSwapButtons(storage.col, storage.row) : undefined}
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
