import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { TextInput } from 'react-native';
import { BlindKeyboard, BlindKeyboardHandlers } from '../components/BlindKeyboard';

// Provider del teclado custom blind. Cada TextInput en blind+selfVoicing
// llama a `useBlindKeyboardActivation()` que registra/desregistra
// handlers según foco. Mientras hay un consumer activo, el overlay
// renderiza el `BlindKeyboard` en la zona inferior y los keypresses
// fluyen al consumer.
//
// Diseñado SOLO para uiMode === 'blind' && useSelfVoicing. Si esos no
// están activos, los hooks son no-ops y el TextInput se comporta normal
// (teclado nativo).

interface ConsumerHandlers extends BlindKeyboardHandlers {
  id: number;
  // Reemplaza la "palabra actual" (el último token tras el último
  // espacio) por `replacement` + espacio. Usado por la confirmación
  // de proposal mode.
  onReplaceCurrentWord: (replacement: string) => void;
}

interface LiveState {
  value: string;
  history?: string[];
}

// Dos contexts SEPARADOS para que cada keystroke NO re-renderice el
// árbol de navegación entero. ConsumerCtx contiene activeConsumer (cambia
// solo en focus/blur) + los setters (estables por ser de useState). El
// hook consume solo este — re-renderiza el TerminalScreen únicamente
// cuando cambia el foco. LiveCtx contiene `live` (cambia en cada
// keystroke) y solo lo consume el BlindKeyboardOverlay.
interface ConsumerCtxValue {
  activeConsumer: ConsumerHandlers | null;
  setActiveConsumer: (c: ConsumerHandlers | null) => void;
  setLive: (s: LiveState) => void;
  // True cuando un componente externo (típicamente dentro de otro Modal)
  // está renderizando el slot del teclado por su cuenta. El overlay por
  // defecto del provider devuelve null en ese caso, para que no haya dos
  // instancias del BlindKeyboard registradas a la vez.
  externalSlotMounted: boolean;
  setExternalSlotMounted: (v: boolean) => void;
}

interface LiveCtxValue {
  live: LiveState;
}

const ConsumerCtx = createContext<ConsumerCtxValue | null>(null);
const LiveCtx = createContext<LiveCtxValue | null>(null);
let nextConsumerId = 1;

export function BlindKeyboardProvider({ children }: { children: React.ReactNode }) {
  const [activeConsumer, setActiveConsumer] = useState<ConsumerHandlers | null>(null);
  const [live, setLive] = useState<LiveState>({ value: '', history: undefined });
  const [externalSlotMounted, setExternalSlotMounted] = useState(false);

  // setActiveConsumer y setLive son estables por contrato de useState —
  // no incluirlos en deps del useMemo evita re-crear el value innecesariamente.
  const consumerVal = useMemo<ConsumerCtxValue>(
    () => ({ activeConsumer, setActiveConsumer, setLive, externalSlotMounted, setExternalSlotMounted }),
    [activeConsumer, externalSlotMounted],
  );
  const liveVal = useMemo<LiveCtxValue>(
    () => ({ live }),
    [live],
  );

  return (
    <ConsumerCtx.Provider value={consumerVal}>
      <LiveCtx.Provider value={liveVal}>
        {children}
        <BlindKeyboardOverlay />
      </LiveCtx.Provider>
    </ConsumerCtx.Provider>
  );
}

// Renderiza el teclado custom como View absoluto con pointerEvents="box-none"
// para que los toques sobre la zona vacía pasen al view de debajo (el
// terminal). NO usamos <Modal> porque la ventana nativa del Modal absorbe
// TODOS los toques en su área, bloqueando interacción con el contenido
// arriba del teclado.
function KeyboardView() {
  const consumerCtx = useContext(ConsumerCtx);
  const liveCtx = useContext(LiveCtx);
  if (!consumerCtx?.activeConsumer || !liveCtx) return null;
  const c = consumerCtx.activeConsumer;
  const live = liveCtx.live;
  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.keyboardWrapper}>
        <BlindKeyboard
          value={live.value}
          history={live.history}
          onKey={c.onKey}
          onBackspaceLetter={c.onBackspaceLetter}
          onBackspaceWord={c.onBackspaceWord}
          onEnter={c.onEnter}
          onClose={c.onClose}
          onReplaceCurrentWord={c.onReplaceCurrentWord}
        />
      </View>
    </View>
  );
}

// Overlay por defecto del provider — sirve para Terminal y cualquier
// pantalla "raíz". Se desactiva cuando un slot externo (dentro de otro
// Modal) lo está renderizando; ver `BlindKeyboardSlot`.
function BlindKeyboardOverlay() {
  const consumerCtx = useContext(ConsumerCtx);
  if (consumerCtx?.externalSlotMounted) return null;
  return <KeyboardView />;
}

// Componente para renderizar el teclado dentro de OTRO Modal (p. ej.
// BlindButtonEditModal). Cuando la ventana nativa del Modal absorbe los
// toques, el teclado debe estar DENTRO de esa misma ventana — no en el
// árbol principal — para ser interactivo. Este slot reclama la
// renderización del teclado mientras está montado, suprimiendo el overlay
// por defecto del provider para que no haya duplicado.
export function BlindKeyboardSlot() {
  const consumerCtx = useContext(ConsumerCtx);
  useEffect(() => {
    consumerCtx?.setExternalSlotMounted(true);
    return () => consumerCtx?.setExternalSlotMounted(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <KeyboardView />;
}

interface UseBlindKeyboardOpts {
  // Sólo se activa cuando este flag es true. Pasar `uiMode === 'blind' &&
  // useSelfVoicing` desde el caller.
  enabled: boolean;
  textInputRef: React.RefObject<TextInput | null>;
  value: string;
  setValue: (v: string) => void;
  // Si el TextInput controla `selection` desde el padre (selection={...}),
  // pasar también el setter aquí para que el cursor se mueva al final tras
  // cada keypress. Sin esto el cursor se queda al inicio y el texto no
  // se ve a partir de cierta longitud.
  setSelection?: (s: { start: number; end: number }) => void;
  // Disparado al pulsar Enter en el teclado custom. Típicamente envía el
  // comando o equivalente.
  onSubmit?: () => void;
  // Historial de comandos para el suggestion engine. Pasar
  // `commandHistory` desde TerminalScreen.
  history?: string[];
}

/**
 * Hook que conecta un TextInput al teclado blind. Devuelve handlers que
 * el TextInput debe enganchar a `onFocus` y `onBlur`. Mientras el input
 * está focused, el overlay muestra el teclado y las pulsaciones fluyen
 * al value via `setValue`.
 *
 * Cuando `enabled=false`, los handlers son no-ops y el TextInput sigue
 * usando teclado nativo del sistema.
 */
export function useBlindKeyboardActivation({
  enabled,
  textInputRef,
  value,
  setValue,
  setSelection,
  onSubmit,
  history,
}: UseBlindKeyboardOpts) {
  const ctx = useContext(ConsumerCtx);
  // Refs para que los handlers (memoizados) lean el valor actual sin
  // recrearse en cada cambio de `value`.
  const valueRef = useRef(value);
  const setValueRef = useRef(setValue);
  const setSelectionRef = useRef(setSelection);
  const onSubmitRef = useRef(onSubmit);
  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { setValueRef.current = setValue; }, [setValue]);
  useEffect(() => { setSelectionRef.current = setSelection; }, [setSelection]);
  useEffect(() => { onSubmitRef.current = onSubmit; }, [onSubmit]);

  // Helper: actualizar texto + selection a la vez.
  // OJO: actualizamos valueRef.current SÍNCRONAMENTE además del setState
  // para que dos handlers consecutivos en el mismo tick (p. ej.
  // onBackspaceLetter() + onKey('á') desde handleAccent del chord) vean el
  // valor coherente. El useEffect que sincroniza valueRef desde la prop
  // `value` correrá después del re-render, pero para entonces el ref ya
  // tendrá el valor correcto y el efecto solo lo confirmará.
  const updateText = (newVal: string) => {
    valueRef.current = newVal;
    setValueRef.current(newVal);
    setSelectionRef.current?.({ start: newVal.length, end: newVal.length });
  };

  const consumerIdRef = useRef<number | null>(null);

  // Sincronizamos `value`/`history` al state `live` del provider. Este
  // state es independiente de `activeConsumer` para que cada keystroke
  // NO re-renderice el árbol entero — solo el overlay del teclado.
  useEffect(() => {
    if (!ctx || consumerIdRef.current === null) return;
    if (ctx.activeConsumer?.id !== consumerIdRef.current) return;
    ctx.setLive({ value, history });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, history]);

  const onFocus = useCallback(() => {
    if (!enabled || !ctx) return;
    // OJO: NO llamar a Keyboard.dismiss() aquí — bluerea el TextInput en
    // Android, lo que dispara nuestro propio onBlur y oculta el blind kb
    // antes de poder escribir. `showSoftInputOnFocus={false}` ya impide
    // que el teclado nativo aparezca.
    const id = nextConsumerId++;
    consumerIdRef.current = id;
    ctx.setLive({ value: valueRef.current, history });
    ctx.setActiveConsumer({
      id,
      onKey: (c: string) => {
        updateText(valueRef.current + c);
      },
      onBackspaceLetter: () => {
        const v = valueRef.current;
        if (v.length === 0) return;
        updateText(v.slice(0, -1));
      },
      onBackspaceWord: () => {
        const v = valueRef.current;
        if (v.length === 0) return;
        // Borra hasta el último espacio (incluyéndolo si lo hay).
        const trimmed = v.replace(/\s+$/, '');
        const lastSpace = trimmed.lastIndexOf(' ');
        const newVal = lastSpace === -1 ? '' : trimmed.slice(0, lastSpace + 1);
        updateText(newVal);
      },
      onEnter: () => {
        onSubmitRef.current?.();
      },
      onClose: () => {
        // Blur del TextInput dueño + desactivar consumer. El check de
        // `ctx.activeConsumer.id` no funciona aquí: el `ctx` capturado por
        // esta closure tiene activeConsumer=null (estado del render donde
        // se creó). `ctx.setActiveConsumer` sí es estable (viene de
        // useState) — lo llamamos directo. El gesto solo dispara desde
        // nuestro propio keyboard, así que no hay riesgo de carrera.
        textInputRef.current?.blur();
        ctx.setActiveConsumer(null);
        consumerIdRef.current = null;
      },
      onReplaceCurrentWord: (replacement: string) => {
        // Reemplaza el último token (después del último espacio) por
        // `replacement` + espacio. Usado al confirmar una sugerencia.
        const v = valueRef.current;
        const lastSpace = v.lastIndexOf(' ');
        const before = lastSpace === -1 ? '' : v.slice(0, lastSpace + 1);
        updateText(before + replacement + ' ');
      },
    });
  }, [enabled, ctx, history]);

  const onBlur = useCallback(() => {
    if (!ctx || consumerIdRef.current === null) return;
    // Solo desactivamos si seguimos siendo el consumer activo (otro input
    // pudo haber tomado el foco mientras tanto).
    if (ctx.activeConsumer?.id === consumerIdRef.current) {
      ctx.setActiveConsumer(null);
    }
    consumerIdRef.current = null;
  }, [ctx]);

  // Cleanup al desmontar.
  useEffect(() => {
    return () => {
      if (ctx && consumerIdRef.current !== null && ctx.activeConsumer?.id === consumerIdRef.current) {
        ctx.setActiveConsumer(null);
      }
    };
  }, [ctx]);

  return {
    onFocus,
    onBlur,
    // El TextInput debe pasar este flag a `showSoftInputOnFocus` para
    // suprimir el teclado nativo cuando estamos en blind+selfVoicing.
    showSoftInputOnFocus: !enabled,
  };
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 998,
  },
  keyboardWrapper: {
    width: '100%',
  },
});
