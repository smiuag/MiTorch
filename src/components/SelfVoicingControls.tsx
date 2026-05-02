import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  TouchableOpacity,
  TextInput,
  View,
  Switch,
  PanResponder,
  TouchableOpacityProps,
  TextInputProps,
} from 'react-native';
import { selfVoicingPress, buttonRegistry, remeasureBus, blindNav } from '../utils/selfVoicingPress';
import { speechQueue } from '../services/speechQueueService';
import { announceTyping } from '../utils/typingAnnounce';

// Wrappers que aplican el modelo de self-voicing a controles de UI dentro
// de modales (ButtonEditModal, SettingsScreen abierto desde Terminal). Cada
// uno toma `svScope` (string) que determina en qué grupo se registra para
// drag-explore — el `buttonRegistry.activeScope` debe coincidir para que
// `findAtPoint` los devuelva. La key registrada incluye el scope como
// prefijo (`scope:key`) para evitar colisiones con scope='default' del
// grid del Terminal.
//
// Cuando `svActive=false`, la API es transparente — el componente envuelto
// se comporta como su contraparte nativa.

interface SelfVoicingTouchableProps extends Omit<TouchableOpacityProps, 'onPress'> {
  svActive: boolean;
  svScope: string;
  svKey: string;
  svLabel: string;
  // Si false, no aparece en navegación secuencial (swipe). Pasar false
  // cuando el touchable es un sub-control dentro de un row navegable
  // (botones +/− dentro del row "Velocidad TTS"). Default true.
  svSequential?: boolean;
  onPress: () => void;
}

export function SelfVoicingTouchable({
  svActive,
  svScope,
  svKey,
  svLabel,
  svSequential = true,
  onPress,
  onLayout,
  children,
  ...rest
}: SelfVoicingTouchableProps) {
  const ref = useRef<View>(null);
  const fullKey = `${svScope}:${svKey}`;

  const handleLayout = useCallback((e: any) => {
    onLayout?.(e);
    if (!svActive) return;
    ref.current?.measure((_x, _y, w, h, pageX, pageY) => {
      buttonRegistry.register(fullKey, { x: pageX, y: pageY, w, h }, svLabel, undefined, svScope, svSequential);
    });
  }, [svActive, fullKey, svLabel, svScope, svSequential, onLayout]);

  useEffect(() => {
    return () => buttonRegistry.unregister(fullKey);
  }, [fullKey]);

  // Re-medir tras scroll del ScrollView padre (los pageY cambian con scroll
  // y el registry quedaría con coordenadas obsoletas).
  useEffect(() => {
    if (!svActive) return;
    return remeasureBus.subscribe(() => handleLayout(undefined));
  }, [svActive, handleLayout]);

  return (
    <TouchableOpacity
      {...rest}
      ref={ref as any}
      onLayout={handleLayout}
      onPress={() => selfVoicingPress.tap(svActive, fullKey, svLabel, onPress)}
    >
      {children}
    </TouchableOpacity>
  );
}

// TextInput auto-anuncia su label al enfocarse. No participa del modelo
// de doble-tap (los inputs reciben tap simple para abrir teclado, lo cual
// es UX nativa) — solo registramos su rect para drag-explore (anuncia
// al pasar el dedo por encima) y emitimos el label al focus.
//
// `svValueRead` opcional: cuando se enfoca, también anuncia el valor
// actual del input (útil para que el usuario blind sepa qué tiene escrito
// antes de teclear nada).

interface SelfVoicingTextInputProps extends TextInputProps {
  svActive: boolean;
  svScope: string;
  svKey: string;
  svLabel: string;
  svValueRead?: boolean;
  // Callback opcional para que el padre obtenga el TextInput y pueda llamar
  // focus() al activar un row contenedor (modelo BlindNav: tap en el row
  // enfoca el input). Recibe null al desmontar.
  svInputRef?: (node: TextInput | null) => void;
}

export function SelfVoicingTextInput({
  svActive,
  svScope,
  svKey,
  svLabel,
  svValueRead = true,
  svInputRef,
  onLayout,
  onFocus,
  onChangeText,
  value,
  ...rest
}: SelfVoicingTextInputProps) {
  const ref = useRef<TextInput>(null);
  const fullKey = `${svScope}:${svKey}`;
  const lastValueRef = useRef<string>(typeof value === 'string' ? value : '');

  // Notificar al padre el TextInput montado (para focus() programático).
  useEffect(() => {
    svInputRef?.(ref.current);
    return () => svInputRef?.(null);
  }, [svInputRef]);

  const handleChangeText = useCallback((text: string) => {
    if (svActive) announceTyping(lastValueRef.current, text);
    lastValueRef.current = text;
    onChangeText?.(text);
  }, [svActive, onChangeText]);

  const handleLayout = useCallback((e: any) => {
    onLayout?.(e);
    if (!svActive) return;
    // measure() en TextInput devuelve callback igual que en View — usamos
    // pageX/pageY para coordenadas absolutas.
    (ref.current as any)?.measure?.((_x: number, _y: number, w: number, h: number, pageX: number, pageY: number) => {
      buttonRegistry.register(fullKey, { x: pageX, y: pageY, w, h }, svLabel, undefined, svScope);
    });
  }, [svActive, fullKey, svLabel, svScope, onLayout]);

  useEffect(() => {
    return () => buttonRegistry.unregister(fullKey);
  }, [fullKey]);

  useEffect(() => {
    if (!svActive) return;
    return remeasureBus.subscribe(() => handleLayout(undefined));
  }, [svActive, handleLayout]);

  const handleFocus = useCallback((e: any) => {
    onFocus?.(e);
    if (!svActive) return;
    const announceText = svValueRead && value
      ? `${svLabel}: ${value}`
      : svLabel;
    speechQueue.enqueue(announceText, 'high');
  }, [svActive, svLabel, svValueRead, value, onFocus]);

  return (
    <TextInput
      {...rest}
      ref={ref}
      value={value}
      onLayout={handleLayout}
      onFocus={handleFocus}
      onChangeText={handleChangeText}
    />
  );
}

// Switch envuelto. Cuando svActive=true: tap simple = mueve foco + anuncia
// "Label: activado/desactivado"; segundo tap (= doble-tap) ejecuta toggle.
// Internamente envolvemos el Switch nativo con un TouchableOpacity y le
// quitamos los toques al Switch (pointerEvents="none") para que todos los
// tap pasen por el wrapper. Cuando svActive=false delega al Switch nativo
// con onValueChange directo.

interface SelfVoicingSwitchProps {
  svActive: boolean;
  svScope: string;
  svKey: string;
  svLabel: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  trackColor?: { false?: string; true?: string };
  thumbColor?: string;
  disabled?: boolean;
}

export function SelfVoicingSwitch({
  svActive, svScope, svKey, svLabel, value, onValueChange,
  trackColor, thumbColor, disabled,
}: SelfVoicingSwitchProps) {
  const ref = useRef<View>(null);
  const fullKey = `${svScope}:${svKey}`;
  const fullLabel = `${svLabel}: ${value ? 'activado' : 'desactivado'}`;

  const measureAndRegister = useCallback(() => {
    if (!svActive) return;
    ref.current?.measure?.((_x, _y, w, h, pageX, pageY) => {
      buttonRegistry.register(fullKey, { x: pageX, y: pageY, w, h }, fullLabel, undefined, svScope);
    });
  }, [svActive, fullKey, fullLabel, svScope]);

  // Re-registrar cuando cambia value: el label hablado tiene que reflejar
  // el nuevo estado. Sin esto, drag-explore seguiría diciendo el estado
  // viejo hasta el siguiente layout.
  useEffect(() => {
    measureAndRegister();
  }, [measureAndRegister]);

  useEffect(() => () => buttonRegistry.unregister(fullKey), [fullKey]);

  // Re-medir tras scroll para mantener coordenadas page actualizadas.
  useEffect(() => {
    if (!svActive) return;
    return remeasureBus.subscribe(measureAndRegister);
  }, [svActive, measureAndRegister]);

  if (!svActive) {
    return (
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={trackColor}
        thumbColor={thumbColor}
        disabled={disabled}
      />
    );
  }

  return (
    <TouchableOpacity
      ref={ref as any}
      onLayout={measureAndRegister}
      activeOpacity={1}
      disabled={disabled}
      onPress={() => selfVoicingPress.tap(svActive, fullKey, fullLabel, () => onValueChange(!value))}
    >
      <View pointerEvents="none">
        <Switch
          value={value}
          trackColor={trackColor}
          thumbColor={thumbColor}
          disabled={disabled}
        />
      </View>
    </TouchableOpacity>
  );
}

// Row navegable en modelo BlindNav (audiogame-style). Cada fila registra
// su rect+label+callbacks en `buttonRegistry`; los gestos los maneja
// `BlindGestureContainer` a nivel de pantalla, no este componente.
//
// El row es solo una View (NUNCA TouchableOpacity en self-voicing) — el
// dedo del usuario nunca apunta a él directamente. children se renderizan
// con `pointerEvents="none"` en self-voicing para que ningún tap llegue
// a controles internos (no hay "tap directo" en este modelo).
//
// Props:
//   - svActive: si false, renderiza View transparente con children intactos
//     (modo nativo). Si true, activa registro y bloquea pointer en children.
//   - svLabel: lo que se anuncia al recibir foco. Construir como
//     "Título. Descripción. Estado actual." para máxima utilidad.
//   - onActivate: opcional, qué hacer al "tap" (tap del container = activar
//     el row con foco). Si undefined, el row es informativo (anuncia pero
//     no se puede activar).
//   - onAdjust: opcional, qué hacer al swipe horizontal (inc/dec). Solo
//     para rows con valor numérico (Velocidad, Tono, Volumen).

interface SelfVoicingRowProps {
  svActive: boolean;
  svScope: string;
  svKey: string;
  svLabel: string;
  onActivate?: () => void;
  onAdjust?: (direction: 'inc' | 'dec') => void;
  style?: any;
  children: React.ReactNode;
}

export function SelfVoicingRow({
  svActive, svScope, svKey, svLabel, onActivate, onAdjust,
  style, children,
}: SelfVoicingRowProps) {
  const ref = useRef<View>(null);
  const fullKey = `${svScope}:${svKey}`;

  const measureAndRegister = useCallback(() => {
    if (!svActive) return;
    ref.current?.measure?.((_x, _y, w, h, pageX, pageY) => {
      buttonRegistry.register(fullKey, { x: pageX, y: pageY, w, h }, svLabel, undefined, svScope, true);
      buttonRegistry.setActions(fullKey, { onActivate, onAdjust });
    });
  }, [svActive, fullKey, svLabel, svScope, onActivate, onAdjust]);

  useEffect(() => { measureAndRegister(); }, [measureAndRegister]);
  useEffect(() => () => buttonRegistry.unregister(fullKey), [fullKey]);
  useEffect(() => {
    if (!svActive) return;
    return remeasureBus.subscribe(measureAndRegister);
  }, [svActive, measureAndRegister]);

  if (!svActive) {
    return <View style={style}>{children}</View>;
  }

  return (
    <View ref={ref} onLayout={measureAndRegister} style={style}>
      <View pointerEvents="none">{children}</View>
    </View>
  );
}

// BlindGestureContainer envuelve la pantalla blind y captura todos los
// gestos del usuario, despachándolos al `blindNav` singleton:
//
//   - Tap (sin movimiento, <500ms)        → activate
//   - Long-press (>600ms sin movimiento)  → repeat
//   - Swipe vertical >50px                → next (dy>0) / prev (dy<0)
//   - Swipe horizontal >50px              → adjustInc (dx>0) / adjustDec (dx<0)
//
// Cuando active=false delega los children sin tocar — comportamiento normal
// de TalkBack/táctil estándar.
//
// El `welcomeMessage` se anuncia al montar y enfoca el primer ítem tras un
// pequeño delay para que los SelfVoicingRow tengan tiempo de medirse.

interface BlindGestureContainerProps {
  active: boolean;
  welcomeMessage: string;
  style?: any;
  children: React.ReactNode;
}

const TAP_MAX_MOVE = 10;
const SWIPE_MIN = 50;
const LONG_PRESS_MS = 600;

export function BlindGestureContainer({ active, welcomeMessage, style, children }: BlindGestureContainerProps) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  useEffect(() => {
    if (!active) return;
    blindNav.enter(welcomeMessage);
    return () => blindNav.exit();
    // welcomeMessage intencionalmente fuera de deps — no queremos re-entrar
    // si el padre re-renderiza con el mismo welcome.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => active,
    onMoveShouldSetPanResponder: () => active,
    onPanResponderGrant: () => {
      if (!active) return;
      longPressFired.current = false;
      longPressTimer.current = setTimeout(() => {
        longPressFired.current = true;
        blindNav.repeat();
        longPressTimer.current = null;
      }, LONG_PRESS_MS);
    },
    onPanResponderMove: (_e, g) => {
      // Cualquier movimiento significativo cancela el long-press.
      if (longPressTimer.current && (Math.abs(g.dx) > TAP_MAX_MOVE || Math.abs(g.dy) > TAP_MAX_MOVE)) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    },
    onPanResponderRelease: (_e, g) => {
      if (!active) return;
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      if (longPressFired.current) return; // Ya disparó repeat al cumplir el timer.

      const absDx = Math.abs(g.dx);
      const absDy = Math.abs(g.dy);

      if (absDx < TAP_MAX_MOVE && absDy < TAP_MAX_MOVE) {
        blindNav.activate();
        return;
      }
      if (absDy > absDx && absDy > SWIPE_MIN) {
        if (g.dy > 0) blindNav.next();
        else blindNav.prev();
        return;
      }
      if (absDx > absDy && absDx > SWIPE_MIN) {
        if (g.dx > 0) blindNav.adjustInc();
        else blindNav.adjustDec();
      }
    },
    onPanResponderTerminate: () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      longPressFired.current = false;
    },
  }), [active]);

  // Cuando no está activo devolvemos children sin envolver — meter un
  // <View style={style}> intermedio rompía el layout de modales (un
  // ScrollView sin flex propio se colapsa cuando su padre directo es un
  // View flex:1, y las secciones siguientes desaparecen). El style solo
  // se aplica cuando estamos en modo activo, donde sí hace falta una View
  // concreta para enganchar el PanResponder.
  if (!active) {
    return <>{children}</>;
  }

  return (
    <View style={style} {...panResponder.panHandlers}>
      {children}
    </View>
  );
}
