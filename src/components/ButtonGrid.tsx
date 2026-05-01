import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
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
import { speechQueue } from '../services/speechQueueService';
import { selfVoicingPress, buttonRegistry } from '../utils/selfVoicingPress';

export const GRID_COLS = NORMAL_MODE.vertical.cols;
export const GRID_ROWS = NORMAL_MODE.vertical.rows;

interface ButtonGridProps {
  buttons: LayoutButton[];
  onSendCommand: (command: string) => void;
  onAddTextButton: (command: string) => void;
  onShowFloating?: (text: string) => void;
  onEditButton: (col: number, row: number) => void;
  moveMode?: boolean;
  sourceCol?: number;
  sourceRow?: number;
  onSwapButtons?: (targetCol: number, targetRow: number) => void;
  horizontalMode?: { cols: number; cellSize: number };
  uiMode?: 'completo' | 'blind';
  // Self-voicing on (TalkBack desactivado por el usuario): tap = anuncia
  // label, doble-tap = primary, drag-1-finger = secondary, long-press = edit.
  // Off: comportamiento legacy (TalkBack maneja tap/double-tap, drag-2-finger
  // = secondary, long-press = edit).
  selfVoicingActive?: boolean;
  minimalista?: boolean;
  minCols?: number;
  minRows?: number;
  // Server con layoutKind='custom': el render NO transpone ni reorganiza
  // direcciones al pivotar — solo recorta lo que cabe en el rectángulo
  // visible (cellSize × minCols × minRows). Las coords de almacenamiento y
  // visuales coinciden 1:1.
  disableTransforms?: boolean;
  // Override del cellSize en vertical (cuando no hay horizontalMode). Por
  // defecto el grid calcula `width / displayCols`, que en custom haría
  // botones gigantes (porque displayCols es la dim visible recortada). El
  // padre puede pasar el cellSize calculado a partir del grid lógico para
  // que los botones tengan el tamaño físico esperado.
  verticalCellSize?: number;
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
  selfVoicingActive,
  onSendCommand,
  onAddTextButton,
  onShowFloating,
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
  selfVoicingActive?: boolean;
  onSendCommand: (command: string) => void;
  onAddTextButton: (command: string) => void;
  onShowFloating?: (text: string) => void;
  onEditButton: () => void;
  onSwapButtons?: () => void;
  onSecondaryCommand: (command: string) => void;
}) {
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startPosRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const isLongPressTriggeredRef = useRef(false);
  const cellViewRef = useRef<View>(null);
  // Key estable para el registro global usado por drag-explore. Prefijo
  // `default:` indica que pertenece al scope principal del Terminal — los
  // modales (ButtonEditModal, SettingsScreen) usan otros prefijos para
  // evitar colisiones y filtrarse correctamente cuando ese modal está
  // activo (`buttonRegistry.activeScope`).
  const registryKey = button ? `default:cell-${col}-${row}-${button.label || button.command || ''}` : null;

  // Registro/desregistro en buttonRegistry para que el drag-explore del
  // SafeAreaView del TerminalScreen pueda anunciar este botón al pasar el
  // dedo encima. Solo registramos si self-voicing está activo Y la celda
  // tiene botón. measureInWindow da coordenadas absolutas de pantalla.
  useEffect(() => {
    if (!selfVoicingActive || !registryKey || !button) return;
    return () => buttonRegistry.unregister(registryKey);
  }, [selfVoicingActive, registryKey, button]);

  const handleLayoutForRegistry = useCallback(() => {
    if (!selfVoicingActive || !registryKey || !button) return;
    // Usamos `measure` y los valores `pageX/pageY` que devuelve, no
    // `measureInWindow`. Los `pageX/pageY` están documentados para
    // coincidir con los del MotionEvent (`evt.nativeEvent.pageX/pageY`)
    // que recibe el `onTouchMove` del SafeAreaView. `measureInWindow`
    // puede divergir en Android con la status bar oculta o flag
    // translúcido — coordenadas window vs page no son idénticas.
    cellViewRef.current?.measure((_x, _y, w, h, pageX, pageY) => {
      // Pasamos `onEditButton` como `onLongPress` (a no ser que el botón
      // sea fixed) para que el SafeAreaView pueda disparar longpress por
      // hover-hold sobre este botón cuando el usuario llega vía drag y se
      // queda quieto sobre él 800 ms.
      const longPressAction = !button.fixed ? () => onEditButton() : undefined;
      buttonRegistry.register(
        registryKey,
        { x: pageX, y: pageY, w, h },
        button.label || button.command || '',
        longPressAction,
        'default',
      );
    });
  }, [selfVoicingActive, registryKey, button, onEditButton]);

  // Suscripción al foco para dibujar borde amarillo cuando esta celda tiene
  // foco. Solo aplica en self-voicing — en otros modos el estado es siempre
  // false y no se renderea el borde.
  const [hasSelfVoicingFocus, setHasSelfVoicingFocus] = useState(false);
  useEffect(() => {
    if (!selfVoicingActive || !registryKey) {
      setHasSelfVoicingFocus(false);
      return;
    }
    const update = (key: string | null) => setHasSelfVoicingFocus(key === registryKey);
    update(selfVoicingPress.getFocusedKey());
    return selfVoicingPress.subscribe(update);
  }, [selfVoicingActive, registryKey]);

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
            // 800 ms cumplidos: ARMAMOS el longpress. NO abrimos el editor
            // todavía — el editor se abre en `onPanResponderRelease` solo
            // si el usuario suelta sin haberse movido. Si se mueve antes de
            // soltar, en `onPanResponderMove` se cancela el flag.
            isLongPressTriggeredRef.current = true;
            // Audio cue del cruce del umbral: el usuario sabe que ya puede
            // soltar para confirmar (o moverse para cancelar).
            if (selfVoicingActive) {
              if (registryKey && button) {
                selfVoicingPress.setFocusFromHover(registryKey, button.label || button.command || '');
                speechQueue.enqueue(`Suelta para editar ${button.label || button.command || ''}`, 'high');
              } else {
                speechQueue.enqueue('Suelta para crear botón nuevo', 'high');
              }
            }
          }, 800);
        },
        onPanResponderMove: (evt) => {
          // Si el dedo se mueve más allá del umbral, cancelamos tanto el
          // timer (no llega a disparar) como el flag (si ya disparó —
          // queremos que el editor NO se abra al soltar). El usuario está
          // arrastrando, no manteniendo. Aplicable en ambos modos.
          const dx = evt.nativeEvent.pageX - startPosRef.current.x;
          const dy = evt.nativeEvent.pageY - startPosRef.current.y;
          const distance = Math.hypot(dx, dy);
          const moveThreshold = selfVoicingActive ? 12 : 8;

          if (distance > moveThreshold) {
            if (longPressTimerRef.current) {
              clearTimeout(longPressTimerRef.current);
              longPressTimerRef.current = null;
            }
            isLongPressTriggeredRef.current = false;

            if (selfVoicingActive) {
              isDraggingRef.current = true;
              return;
            }
            // Modo no-self-voicing: blind+TalkBack requiere 2 dedos para
            // drag (TalkBack consume 1-dedo); completo permite 1 dedo.
            if (uiMode === 'blind' && evt.nativeEvent.touches?.length < 2) {
              return;
            }
            isDraggingRef.current = true;
          }
        },
        onPanResponderRelease: () => {
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }

          if (isLongPressTriggeredRef.current) {
            // Longpress confirmado: el timer disparó el flag y el dedo no
            // se movió antes del release. Disparamos el callback AHORA en
            // el release. El padre decide qué hacer: editor normal, modal
            // de gestión de paneles para el switch del modo completo, o
            // ignorar para otros fixed. Antes filtrábamos `fixed` aquí;
            // eso bloqueaba el long-press en el switch.
            isLongPressTriggeredRef.current = false;
            onEditButton();
            return;
          }

          if (isDraggingRef.current) {
            // En self-voicing el drag es para explore — no disparar el
            // secondary command ni la lógica de tap. El foco ya se quedó
            // en el último botón hovered vía `setFocusFromHover` desde el
            // SafeAreaView padre. Saltamos sin hacer nada más.
            if (selfVoicingActive) {
              return;
            }
            // Modo completo / blind+TalkBack: drag = secondary command.
            const secondaryCmd = button?.secondaryCommand || button?.alternativeCommands?.[0];
            if (secondaryCmd) {
              onSecondaryCommand(secondaryCmd);
            }
          } else {
            // Tap path. En self-voicing: emulamos modelo TalkBack — primer
            // tap anuncia el label (atropellando con prioridad alta), segundo
            // tap dentro de 350 ms ejecuta el primary. Sin self-voicing
            // (modo legacy con TalkBack o modo completo): tap = primary
            // directo, ya que en completo no hay anuncio y en blind+TalkBack
            // el propio TalkBack maneja el anuncio + delega doble-tap.
            const executePrimary = () => {
              if (moveMode && onSwapButtons && !button?.locked) {
                onSwapButtons();
              } else if (button?.command) {
                if (button.kind === 'floating') {
                  onShowFloating?.(button.command);
                } else if (button.addText) {
                  onAddTextButton(button.command);
                } else {
                  onSendCommand(button.command);
                }
              }
            };

            // Modelo de foco: tap en botón sin foco da foco + anuncia;
            // tap en botón con foco ejecuta. El doble-tap rápido cae como
            // primer tap (foco) + segundo tap (ejecuta) automáticamente.
            // El foco también se mueve por drag-explore (ver buttonRegistry
            // y onTouchMove del SafeAreaView de TerminalScreen).
            if (selfVoicingActive && button && registryKey) {
              selfVoicingPress.tap(true, registryKey, button.label || button.command || '', executePrimary);
            } else {
              executePrimary();
            }
          }
        },
      }),
    [col, row, button, moveMode, horizontalMode, uiMode, selfVoicingActive, onSendCommand, onAddTextButton, onShowFloating, onEditButton, onSwapButtons, onSecondaryCommand]
  );

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (!button || !button.command) return;

    // Execute primary command (same as tap)
    if (button.kind === 'floating') {
      onShowFloating?.(button.command);
    } else if (button.addText) {
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

    if (button.kind === 'floating') {
      return `Aviso: ${button.command}`;
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
      ref={cellViewRef}
      onLayout={handleLayoutForRegistry}
      {...panResponder.panHandlers}
      style={[
        styles.cell,
        {
          width: cellSize,
          height: cellSize,
          backgroundColor: button ? button.color : '#222',
          // Prioridad de borde:
          //   - moveMode source (amarillo grueso) > self-voicing focus (cian
          //     grueso) > default. Cian para no chocar con el amarillo del
          //     moveMode (no son estados que se solapen, pero por claridad).
          borderWidth: isSource || hasSelfVoicingFocus ? 3 : 1,
          borderColor: isSource ? '#ffff00' : (hasSelfVoicingFocus ? '#00ffff' : '#444'),
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
  onShowFloating,
  onEditButton,
  moveMode,
  sourceCol,
  sourceRow,
  onSwapButtons,
  horizontalMode,
  uiMode,
  selfVoicingActive,
  minimalista = false,
  minCols = GRID_COLS,
  minRows = GRID_ROWS,
  disableTransforms = false,
  verticalCellSize,
}: ButtonGridProps) {
  const { width } = useWindowDimensions();

  // Use blind mode dimensions if enabled, otherwise honor minCols/minRows
  // from parent (allows custom layouts to pass display dims).
  const blindConfig = BLIND_MODE.vertical;
  const displayCols = minimalista ? blindConfig.cols : minCols;
  const displayRows = minimalista ? blindConfig.rows : minRows;

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

  const additionalTransforms = disableTransforms
    ? {}
    : (minimalista ? blindModeTransforms : normalModeTransforms);
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

  // Storage (col, row) → visual final (col, row).
  // En custom (disableTransforms=true) no transponemos al pivotar — las
  // coords de almacenamiento y visuales coinciden 1:1 en ambas orientaciones,
  // y el grid simplemente recorta los botones que caen fuera de gridCols/Rows.
  const storageToVisual = (sCol: number, sRow: number): { col: number; row: number } => {
    if (!horizontalMode || disableTransforms) return { col: sCol, row: sRow };
    const swCol = sRow;
    const swRow = (verticalCols - 1) - sCol;
    const t = additionalTransforms[`${swCol},${swRow}`];
    return t ? { col: t.col, row: t.row } : { col: swCol, row: swRow };
  };

  const visualToStorage = (vCol: number, vRow: number): { col: number; row: number } => {
    if (!horizontalMode || disableTransforms) return { col: vCol, row: vRow };
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
  const cellSize = horizontalMode
    ? horizontalMode.cellSize
    : (verticalCellSize ?? width / displayCols);

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
                selfVoicingActive={selfVoicingActive}
                onSendCommand={onSendCommand}
                onAddTextButton={onAddTextButton}
                onShowFloating={onShowFloating}
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
