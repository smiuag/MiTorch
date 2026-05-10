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
  // Cuando se renderiza el grid horizontal (móvil tumbado): el padre indica
  // las cols visibles + cellSize; el ButtonGrid solo aplica el transform
  // (swap+blindModeTransforms) cuando estamos en modo BLIND. En modo completo
  // los botones ya vienen filtrados por orientation desde el padre y no se
  // transforma nada.
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
  // Override de las dimensiones del cell. cellWidth aplica al ancho de cada
  // celda; cellHeight a la altura. Si no se pasan, el ButtonGrid los calcula
  // como `width/displayCols` (cuadrados). El padre los pasa cuando quiere
  // forzar un cell rectangular o un tamaño específico.
  cellWidth?: number;
  cellHeight?: number;
}

function ButtonCell({
  col,
  row,
  button,
  cellWidth,
  cellHeight,
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
  cellWidth: number;
  cellHeight: number;
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
  // Modo self-voicing: para abrir el editor exigimos doble-tap+mantener
  // (chord) en vez de longpress simple. `firstTapAtRef` guarda el ts del
  // primer tap (solo si fue un tap "limpio" — sin drag, sin armar). El
  // siguiente Grant en este mismo cell dentro de la ventana lo trata como
  // segundo tap y arma el timer del hold.
  const firstTapAtRef = useRef<number | null>(null);
  // Anuncio diferido del primer tap. Sin esto, el primer tap del chord
  // doble-tap+hold lee el label inmediatamente — el usuario que sí va a
  // editar oye el nombre antes de que sepamos si es chord. Con timer:
  // esperamos la ventana de doble-tap; si llega un segundo Grant, el
  // anuncio se cancela. Si no llega, el timer dispara el anuncio.
  const pendingTapAnnounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Marca en Grant cuando detectamos que esta es la segunda pulsación
  // del chord. En Release lo usamos para saltar el delay del anuncio
  // (segundo tap NO debe anunciar — fue parte de chord).
  const isSecondTapRef = useRef(false);
  // Ventana entre el primer lift y el segundo grant del chord. 500 ms da
  // margen cómodo a usuarios ciegos que necesitan localizar la celda; bajar
  // de aquí hace que se sienta exigente (reportado por el usuario).
  const DOUBLE_TAP_WINDOW_MS = 500;
  const SECOND_TAP_HOLD_MS = 600;
  const LEGACY_LONGPRESS_MS = 800;
  // Key estable para el registro global usado por drag-explore. Prefijo
  // `default:` indica que pertenece al scope principal del Terminal — los
  // modales (ButtonEditModal, SettingsScreen) usan otros prefijos para
  // evitar colisiones y filtrarse correctamente cuando ese modal está
  // activo (`buttonRegistry.activeScope`).
  // Registramos TODAS las celdas (con o sin botón) cuando self-voicing
  // está activo. Esto permite que swipes y drag-explore sobre la botonera
  // funcionen también sobre huecos vacíos — el chord doble-tap+hold sobre
  // un hueco abre el editor para crear un botón nuevo en esa posición.
  // Las celdas vacías se anuncian como "vacío".
  const registryKey = button
    ? `default:cell-${col}-${row}-${button.label || button.command || ''}`
    : `default:cell-${col}-${row}-empty`;

  useEffect(() => {
    if (!selfVoicingActive || !registryKey) return;
    return () => buttonRegistry.unregister(registryKey);
  }, [selfVoicingActive, registryKey]);

  const handleLayoutForRegistry = useCallback(() => {
    if (!selfVoicingActive || !registryKey) return;
    // Usamos `measure` y los valores `pageX/pageY` que devuelve, no
    // `measureInWindow`. Los `pageX/pageY` están documentados para
    // coincidir con los del MotionEvent (`evt.nativeEvent.pageX/pageY`)
    // que recibe el `onTouchMove` del SafeAreaView. `measureInWindow`
    // puede divergir en Android con la status bar oculta o flag
    // translúcido — coordenadas window vs page no son idénticas.
    cellViewRef.current?.measure((_x, _y, w, h, pageX, pageY) => {
      // onLongPress (= chord doble-tap+hold disparado por el SafeAreaView):
      // abre el editor. Botones `fixed` lo bloquean (p.ej. el switch de
      // paneles); huecos vacíos siempre lo aceptan (sirve para crear).
      const longPressAction = (!button || !button.fixed) ? () => onEditButton() : undefined;
      const label = button ? (button.label || button.command || '') : 'vacío';
      buttonRegistry.register(
        registryKey,
        { x: pageX, y: pageY, w, h },
        label,
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

  // Limpiar timers pendientes al desmontar para no disparar callbacks
  // sobre props/state stale.
  useEffect(() => {
    return () => {
      if (pendingTapAnnounceTimerRef.current) {
        clearTimeout(pendingTapAnnounceTimerRef.current);
        pendingTapAnnounceTimerRef.current = null;
      }
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };
  }, []);

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

          // Cualquier Grant cancela el anuncio diferido del tap previo —
          // si el usuario está volviendo a tocar este (o cualquier) cell,
          // ya no queremos que aparezca el anuncio del tap 1.
          if (pendingTapAnnounceTimerRef.current) {
            clearTimeout(pendingTapAnnounceTimerRef.current);
            pendingTapAnnounceTimerRef.current = null;
          }

          // Detección del segundo tap del chord (self-voicing). Si el
          // primer tap fue reciente sobre esta misma celda, este Grant es
          // el "tap 2": arrancamos el timer del hold (más corto que el
          // longpress legacy porque el gesto ya es deliberado).
          const now = Date.now();
          const isSecondTap =
            selfVoicingActive &&
            firstTapAtRef.current !== null &&
            (now - firstTapAtRef.current) < DOUBLE_TAP_WINDOW_MS;
          if (isSecondTap) {
            firstTapAtRef.current = null;
          }
          isSecondTapRef.current = isSecondTap;

          // En self-voicing solo arrancamos el hold-timer en el segundo
          // tap. En modos no-self-voicing, longpress simple legacy de
          // 800ms (sin cambio).
          const shouldStartHoldTimer = !selfVoicingActive || isSecondTap;
          if (!shouldStartHoldTimer) return;

          const holdMs = isSecondTap ? SECOND_TAP_HOLD_MS : LEGACY_LONGPRESS_MS;
          longPressTimerRef.current = setTimeout(() => {
            // Hold cumplido: ARMAMOS el longpress. NO abrimos el editor
            // todavía — el editor se abre en `onPanResponderRelease` solo
            // si el usuario suelta sin haberse movido. Si se mueve antes
            // de soltar, en `onPanResponderMove` se cancela el flag.
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
          }, holdMs);
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
              // Drag invalida el primer tap del chord — el usuario no está
              // haciendo doble-tap.
              firstTapAtRef.current = null;
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
            //
            // Las celdas VACÍAS también participan en el ciclo de chord —
            // primer tap enfoca + anuncia "vacío", chord (doble-tap+hold)
            // abre el editor para crear un botón. La diferencia con celdas
            // con botón es que las vacías no tienen primary que ejecutar.
            if (selfVoicingActive && registryKey) {
              const isSecondTap = isSecondTapRef.current;
              isSecondTapRef.current = false;
              const cellLabel = button ? (button.label || button.command || '') : 'vacío';
              const tapAction = button ? executePrimary : () => {};
              if (isSecondTap) {
                // Segundo tap del chord pero release rápido (no llegó al
                // hold). Para celdas con botón = ejecutar primary; para
                // huecos vacíos = no-op (no hay primary). El chord real
                // ya se habría disparado vía hold timer + onEditButton.
                tapAction();
              } else if (selfVoicingPress.getFocusedKey() === registryKey) {
                // Foco coincide → execute (no-op si vacía) sin re-anuncio.
                // ADEMÁS registramos firstTap para que un siguiente tap+hold
                // pueda disparar el chord. Antes el foco previo (p.ej. tras
                // navegar por swipe a la celda) bloqueaba el ciclo: primer
                // tap caía aquí sin armar firstTap, y el chord nunca llegaba.
                tapAction();
                const ts = Date.now();
                firstTapAtRef.current = ts;
                setTimeout(() => {
                  if (firstTapAtRef.current === ts) firstTapAtRef.current = null;
                }, DOUBLE_TAP_WINDOW_MS);
              } else {
                // Primer tap sobre celda no enfocada. NO anunciamos todavía
                // — esperamos la ventana de doble-tap por si llega un
                // segundo Grant que dispare el chord. Si pasa la ventana
                // sin más toques, el timer hace `selfVoicingPress.tap`
                // (que entonces solo enfoca + anuncia, ya que en ese
                // momento el foco no es esta key).
                if (pendingTapAnnounceTimerRef.current) {
                  clearTimeout(pendingTapAnnounceTimerRef.current);
                }
                pendingTapAnnounceTimerRef.current = setTimeout(() => {
                  pendingTapAnnounceTimerRef.current = null;
                  selfVoicingPress.tap(true, registryKey, cellLabel, tapAction);
                }, DOUBLE_TAP_WINDOW_MS);
                // Marcamos como primer tap del chord. PanResponderGrant
                // del próximo touch dentro de la ventana lo detectará como
                // segundo tap; al hacerlo, también cancela el timer de
                // arriba (cancelando el anuncio).
                const ts = Date.now();
                firstTapAtRef.current = ts;
                setTimeout(() => {
                  if (firstTapAtRef.current === ts) firstTapAtRef.current = null;
                }, DOUBLE_TAP_WINDOW_MS);
              }
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
          width: cellWidth,
          height: cellHeight,
          minHeight: cellHeight < 38 ? cellHeight : undefined,
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
            // Escalar la fuente por la dimensión menor para que quepa
            // siempre — útil cuando reducido produce cells rectangulares.
            { color: button.textColor || '#fff', fontSize: Math.min(cellWidth, cellHeight) * 0.25 },
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
  cellWidth: cellWidthProp,
  cellHeight: cellHeightProp,
}: ButtonGridProps) {
  const { width } = useWindowDimensions();

  // Use blind mode dimensions if enabled, otherwise honor minCols/minRows
  // from parent (allows custom layouts to pass display dims).
  const blindConfig = BLIND_MODE.vertical;
  const displayCols = minimalista ? blindConfig.cols : minCols;
  const displayRows = minimalista ? blindConfig.rows : minRows;

  // === Transforms al pivotar ===
  //
  // Modo completo (v3+): SIN transforms en runtime. Cada botón vive en una
  // orientación; el padre filtra antes de pasarlo. Las coords de almacenamiento
  // = coords visuales 1:1.
  //
  // Modo blind: aplica `blindModeTransforms` legacy — el modo blind sigue con
  // un único layout (5×4 vertical / 4×5 horizontal) y los transforms viejos.

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

  // Modo completo: sin transforms (v3+ usa orientation per-botón). Modo blind:
  // mantiene los transforms legacy.
  const additionalTransforms = minimalista ? blindModeTransforms : {};
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
  // - Modo completo: 1:1 (los botones ya están filtrados por orientation, sin
  //   transforms en runtime).
  // - Modo blind horizontal: swap + blindModeTransforms.
  const storageToVisual = (sCol: number, sRow: number): { col: number; row: number } => {
    if (!horizontalMode || !minimalista) return { col: sCol, row: sRow };
    const swCol = sRow;
    const swRow = (verticalCols - 1) - sCol;
    const t = additionalTransforms[`${swCol},${swRow}`];
    return t ? { col: t.col, row: t.row } : { col: swCol, row: swRow };
  };

  const visualToStorage = (vCol: number, vRow: number): { col: number; row: number } => {
    if (!horizontalMode || !minimalista) return { col: vCol, row: vRow };
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

  // Grid dimensions: horizontal mode (blind) o vertical.
  const gridCols = horizontalMode ? horizontalMode.cols : displayCols;
  const gridRows = horizontalMode ? minRows : displayRows;
  // Cell dims: si el padre pasa cellWidth/cellHeight, los usamos directamente;
  // si no, fallback a cuadrado (legacy / blind). En blind horizontal se usa
  // horizontalMode.cellSize como ancho y alto.
  const fallbackCell = horizontalMode ? horizontalMode.cellSize : width / displayCols;
  const cellWidth = cellWidthProp ?? fallbackCell;
  const cellHeight = cellHeightProp ?? fallbackCell;

  return (
    <View style={styles.container}>
      {Array.from({ length: gridRows }).map((_, row) => (
        <View key={`row-${row}`} style={[styles.row, { height: cellHeight }]}>
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
                cellWidth={cellWidth}
                cellHeight={cellHeight}
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
