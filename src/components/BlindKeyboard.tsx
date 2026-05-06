import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Vibration } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { speechQueue } from '../services/speechQueueService';
import { selfVoicingPress, buttonRegistry } from '../utils/selfVoicingPress';
import { getSuggestions } from '../services/suggestionEngine';

// Teclado QWERTY custom para modo blind con self-voicing TTS. Modelo
// drag-and-lift: el dedo arrastra sobre las teclas (cada cruce vibra y
// anuncia el carácter), al levantar se "tipa" la tecla en foco.
//
// Layout:
//   1 2 3 4 5 6 7 8 9 0
//   q w e r t y u i o p
//   a s d f g h j k l ñ
//   ⇧  z x c v b n m  ⌫
//   123  espacio (grande)  ⏎
//
// Long-press en vocal → acento (á é í ó ú).
// Doble-tap en Shift → caps lock (suelta con otro tap).
// Tap en 123 → cambia a capa de símbolos.
// Long-press en ⌫ → borra palabra entera.
//
// IMPORTANTE — modelo de touch (Android):
// `onTouchEnd` en una View dispara donde EMPEZÓ el touch, no donde
// terminó. Por eso TODA la lógica de drag-explore + lift-to-type vive
// en el container raíz; las teclas individuales solo se registran en
// `buttonRegistry` (rect + label + activate + longpress) y el container
// hace el dispatch al `getFocusedKey()` actual cuando se levanta el dedo.

export interface BlindKeyboardHandlers {
  onKey: (char: string) => void;
  onBackspaceLetter: () => void;
  onBackspaceWord: () => void;
  onEnter: () => void;
}

interface BlindKeyboardProps extends BlindKeyboardHandlers {
  onLayout?: (height: number) => void;
  // Valor actual del input. Usado para extraer la palabra que se está
  // tipeando y filtrar las sugerencias por prefix.
  value?: string;
  // Historial de comandos del personaje (cmd más reciente primero).
  // Una de las fuentes del suggestion engine.
  history?: string[];
  // Confirmación de una sugerencia: reemplaza el último token del input
  // por `replacement` + espacio. El consumer (vía hook) lo proporciona.
  onReplaceCurrentWord?: (replacement: string) => void;
}

const KB_SCOPE = 'blind-keyboard';
const LONG_PRESS_MS = 600;
const DOUBLE_TAP_MS = 300;

const ROW_LETTERS_1 = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const ROW_LETTERS_2 = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'];
const ROW_LETTERS_3 = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ñ'];
const ROW_LETTERS_4 = ['z', 'x', 'c', 'v', 'b', 'n', 'm'];

const SYM_ROW_1 = ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')'];
const SYM_ROW_2 = ['+', '-', '=', '_', '/', '\\', ':', ';', '"', "'"];
const SYM_ROW_3 = ['{', '}', '[', ']', '<', '>', '|', '~', '`', '?'];
const SYM_ROW_4 = [',', '.', '!', '?', '¡', '¿', '€'];

const ACCENT_MAP: Record<string, string> = {
  a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú',
};

const SHIFT_MAP_NUMBERS: Record<string, string> = {
  '1': '!', '2': '@', '3': '#', '4': '$', '5': '%',
  '6': '^', '7': '&', '8': '*', '9': '(', '0': ')',
};

type ShiftState = 'off' | 'oneshot' | 'lock';

export function BlindKeyboard({
  onKey,
  onBackspaceLetter,
  onBackspaceWord,
  onEnter,
  onLayout,
  value = '',
  history,
  onReplaceCurrentWord,
}: BlindKeyboardProps) {
  const [shift, setShift] = useState<ShiftState>('off');
  const [symbolLayer, setSymbolLayer] = useState(false);
  const insets = useSafeAreaInsets();

  // Palabra actual = último token tras el último espacio del input.
  const currentWord = useMemo(() => {
    const lastSpace = value.lastIndexOf(' ');
    return lastSpace === -1 ? value : value.slice(lastSpace + 1);
  }, [value]);

  // Estado de PROPOSAL: candidatos snapshot + índice actual.
  // null = IDLE.
  const [proposalMode, setProposalMode] = useState<{
    candidates: string[];
    idx: number;
  } | null>(null);

  // Candidatos para mostrar en la SuggestionsBar en IDLE. En PROPOSAL
  // usamos los del snapshot. Recompute solo cuando NO estamos en
  // PROPOSAL — el snapshot es fijo durante PROPOSAL.
  const idleCandidates = useMemo(() => {
    if (proposalMode || !currentWord) return [];
    return getSuggestions(currentWord, { history });
  }, [currentWord, history, proposalMode]);

  // Activación de la SuggestionsBar (lift sobre la barra cuando
  // hay candidatos). Snapshot + entrar a PROPOSAL.
  const handleActivateSuggestionsBar = useCallback(() => {
    if (idleCandidates.length === 0) return; // no-op
    setProposalMode({ candidates: idleCandidates, idx: 0 });
    speechQueue.enqueue(`${idleCandidates[0]}, 1 de ${idleCandidates.length}`, 'high');
    Vibration.vibrate(20);
  }, [idleCandidates]);

  // Activamos el scope del keyboard al montar; restauramos al desmontar.
  useEffect(() => {
    const prev = buttonRegistry.getActiveScope();
    buttonRegistry.setActiveScope(KB_SCOPE);
    return () => { buttonRegistry.setActiveScope(prev); };
  }, []);

  const wordBufferRef = useRef('');
  // Ref al value actual para poder leer el char/palabra que se va a
  // borrar antes de que se actualice el state. Refresco en useEffect
  // para evitar capturar valor estale en los handlers memoizados.
  const valueRef = useRef(value);
  useEffect(() => { valueRef.current = value; }, [value]);
  // Estado del touch a nivel del container (drag-explore + lift-to-type).
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Acción "armada" cuando el timer del longpress cumple — NO se ejecuta
  // automáticamente. Al soltar la tecla, si sigue siendo la misma, se
  // ejecuta esta acción (acento, borrar palabra, etc.). Si el dedo se mueve
  // a otra tecla antes de soltar, se cancela.
  const armedLongPressRef = useRef<(() => void) | null>(null);
  const lastFocusKeyRef = useRef<string | null>(null);

  // --- Handlers de teclas ---

  const applyShiftIfNeeded = (c: string): string => {
    if (shift !== 'off') {
      if (/[a-zñ]/.test(c)) return c.toUpperCase();
      if (SHIFT_MAP_NUMBERS[c]) return SHIFT_MAP_NUMBERS[c];
    }
    return c;
  };

  const consumeShiftOneshot = () => {
    if (shift === 'oneshot') setShift('off');
  };

  const handleKey = useCallback((rawChar: string) => {
    const char = applyShiftIfNeeded(rawChar);
    onKey(char);
    speechQueue.enqueue(char, 'high');
    wordBufferRef.current += char;
    consumeShiftOneshot();
  }, [shift, onKey]);

  const handleAccent = useCallback((vowel: string) => {
    const accented = ACCENT_MAP[vowel] || vowel;
    const final = shift !== 'off' ? accented.toUpperCase() : accented;
    onKey(final);
    speechQueue.enqueue(final, 'high');
    wordBufferRef.current += final;
    consumeShiftOneshot();
  }, [shift, onKey]);

  const handleSpace = useCallback(() => {
    onKey(' ');
    const word = wordBufferRef.current.trim();
    if (word) speechQueue.enqueue(word, 'high');
    wordBufferRef.current = '';
    consumeShiftOneshot();
  }, [onKey, shift]);

  const handleEnter = useCallback(() => {
    const word = wordBufferRef.current.trim();
    if (word) speechQueue.enqueue(word, 'high');
    wordBufferRef.current = '';
    onEnter();
  }, [onEnter]);

  const handleBackspaceLetter = useCallback(() => {
    const v = valueRef.current;
    const deleted = v.length > 0 ? v.slice(-1) : '';
    onBackspaceLetter();
    if (wordBufferRef.current.length > 0) {
      wordBufferRef.current = wordBufferRef.current.slice(0, -1);
    }
    speechQueue.enqueue(deleted ? `${deleted} borrada` : 'nada que borrar', 'high');
  }, [onBackspaceLetter]);

  const handleBackspaceWord = useCallback(() => {
    const v = valueRef.current;
    // La palabra que se va a borrar es el último token tras el último
    // espacio (ignorando trailing spaces, mismo criterio que la lógica
    // del hook).
    const trimmed = v.replace(/\s+$/, '');
    const lastSpace = trimmed.lastIndexOf(' ');
    const deleted = lastSpace === -1 ? trimmed : trimmed.slice(lastSpace + 1);
    onBackspaceWord();
    wordBufferRef.current = '';
    speechQueue.enqueue(deleted ? `${deleted} borrada` : 'nada que borrar', 'high');
  }, [onBackspaceWord]);

  // Shift: tap = one-shot. Doble-tap (<300ms) = lock. Otro tap sobre lock
  // = off. La detección de doble-tap se hace dentro del activate callback
  // porque el container despacha por focused-key al levantar el dedo.
  const lastShiftTapRef = useRef(0);
  const handleShiftActivate = useCallback(() => {
    const now = Date.now();
    if (now - lastShiftTapRef.current < DOUBLE_TAP_MS) {
      lastShiftTapRef.current = 0;
      setShift('lock');
      speechQueue.enqueue('bloqueo mayúsculas', 'high');
      return;
    }
    lastShiftTapRef.current = now;
    setShift((s) => {
      const next = s === 'off' ? 'oneshot' : 'off';
      speechQueue.enqueue(next === 'off' ? 'minúsculas' : 'mayúsculas', 'high');
      return next;
    });
  }, []);

  const handleSymToggle = useCallback(() => {
    setSymbolLayer((v) => {
      const next = !v;
      speechQueue.enqueue(next ? 'símbolos' : 'letras', 'high');
      return next;
    });
  }, []);

  // --- Touch handling (a nivel del container) ---
  // Tracking del touch para swipe detection en PROPOSAL.
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback((evt: any) => {
    const t = evt.nativeEvent.touches?.[0];
    if (!t) return;
    swipeStartRef.current = { x: t.pageX, y: t.pageY };
    if (proposalMode) return; // teclado congelado en PROPOSAL
    handleTouchPos(evt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalMode]);

  const handleTouchPos = useCallback((evt: any) => {
    if (proposalMode) return; // drag-explore desactivado en PROPOSAL
    const t = evt.nativeEvent.touches?.[0];
    if (!t) return;
    const hit = buttonRegistry.findAtPoint(t.pageX, t.pageY);
    if (!hit) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      return;
    }
    const focusChanged = lastFocusKeyRef.current !== hit.key;
    selfVoicingPress.setFocusFromHover(hit.key, hit.label);
    if (!focusChanged) return;
    lastFocusKeyRef.current = hit.key;

    // Cambio de tecla: cancelar timer + acción armada de la tecla anterior.
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    armedLongPressRef.current = null;
    const entry = buttonRegistry.getEntry(hit.key);
    if (entry?.onLongPress) {
      const cb = entry.onLongPress;
      const announceLabel = entry.onLongPressLabel;
      const delayMs = entry.onLongPressDelayMs ?? LONG_PRESS_MS;
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        // Armar la acción alternativa para esta tecla. NO se ejecuta
        // hasta que el usuario suelte el dedo aquí mismo. Vibración +
        // anuncio (si la tecla provee uno) para que sepa que la
        // alternativa está disponible.
        armedLongPressRef.current = cb;
        Vibration.vibrate(40);
        if (announceLabel) speechQueue.enqueue(announceLabel, 'high');
      }, delayMs);
    }
  }, [proposalMode]);

  const handleTouchEnd = useCallback((evt: any) => {
    // En PROPOSAL: detectar dirección del swipe y aplicar.
    if (proposalMode) {
      const start = swipeStartRef.current;
      swipeStartRef.current = null;
      if (!start) return;
      const t = evt.nativeEvent.changedTouches?.[0];
      if (!t) return;
      const dx = t.pageX - start.x;
      const dy = t.pageY - start.y;
      const adx = Math.abs(dx), ady = Math.abs(dy);
      // Mínimo 30px y eje dominante claro. Si no, lift sin swipe = no-op.
      if (Math.hypot(dx, dy) < 30 || (adx <= 1.5 * ady && ady <= 1.5 * adx)) return;

      const dir = adx > ady ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      handleProposalSwipe(dir);
      return;
    }

    // IDLE: lift-to-type tradicional. Si hay acción long-press armada
    // (porque el timer cumplió y el dedo no se ha movido), ejecutar esa
    // EN LUGAR de la activate normal.
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    const armed = armedLongPressRef.current;
    armedLongPressRef.current = null;
    lastFocusKeyRef.current = null;
    if (armed) {
      armed();
      return;
    }
    const focusedKey = selfVoicingPress.getFocusedKey();
    if (!focusedKey) return;
    const entry = buttonRegistry.getEntry(focusedKey);
    entry?.onActivate?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalMode]);

  // Resolver swipe en PROPOSAL.
  const handleProposalSwipe = useCallback((dir: 'up' | 'down' | 'left' | 'right') => {
    if (!proposalMode) return;
    if (dir === 'right' || dir === 'left') {
      const len = proposalMode.candidates.length;
      const newIdx = dir === 'right'
        ? (proposalMode.idx + 1) % len
        : (proposalMode.idx - 1 + len) % len;
      setProposalMode({ ...proposalMode, idx: newIdx });
      Vibration.vibrate(20);
      speechQueue.enqueue(`${proposalMode.candidates[newIdx]}, ${newIdx + 1} de ${len}`, 'high');
      return;
    }
    if (dir === 'down') {
      // Confirma — reemplaza la palabra actual por el candidato + espacio.
      const picked = proposalMode.candidates[proposalMode.idx];
      onReplaceCurrentWord?.(picked);
      setProposalMode(null);
      Vibration.vibrate(40);
      speechQueue.enqueue(`${picked} confirmado`, 'high');
      return;
    }
    if (dir === 'up') {
      // Cancela — vuelve a IDLE sin tocar el input.
      setProposalMode(null);
      Vibration.vibrate(20);
      speechQueue.enqueue('cancelado', 'high');
      return;
    }
  }, [proposalMode, onReplaceCurrentWord]);

  const displayChar = (raw: string): string => {
    if (symbolLayer) return raw;
    if (shift !== 'off') {
      if (/[a-zñ]/.test(raw)) return raw.toUpperCase();
      if (SHIFT_MAP_NUMBERS[raw]) return SHIFT_MAP_NUMBERS[raw];
    }
    return raw;
  };

  const row1 = symbolLayer ? SYM_ROW_1 : ROW_LETTERS_1;
  const row2 = symbolLayer ? SYM_ROW_2 : ROW_LETTERS_2;
  const row3 = symbolLayer ? SYM_ROW_3 : ROW_LETTERS_3;
  const row4 = symbolLayer ? SYM_ROW_4 : ROW_LETTERS_4;

  // Lo que se muestra en la SuggestionsBar.
  const barLabel = proposalMode
    ? `${proposalMode.candidates[proposalMode.idx]}  ${proposalMode.idx + 1}/${proposalMode.candidates.length}`
    : (idleCandidates.length > 0
        ? `Sugerencia: ${idleCandidates[0]}`
        : (currentWord ? 'Sin sugerencias' : ''));
  const barAnnounce = proposalMode
    ? `${proposalMode.candidates[proposalMode.idx]}, ${proposalMode.idx + 1} de ${proposalMode.candidates.length}`
    : (idleCandidates.length > 0
        ? idleCandidates[0]
        : (currentWord ? 'Sin sugerencias' : ''));

  return (
    <View
      style={[
        styles.container,
        {
          // Respeta safe areas en las cuatro direcciones — en landscape
          // el gesture indicator y los notches viven en los laterales.
          paddingLeft: 4 + insets.left,
          paddingRight: 4 + insets.right,
          paddingBottom: 4 + insets.bottom,
        },
      ]}
      onLayout={(e) => onLayout?.(e.nativeEvent.layout.height)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchPos}
      onTouchEnd={handleTouchEnd}
    >
      {/* Siempre renderizamos la barra para que la altura del teclado sea
          constante. Cuando no hay palabra parcial mostramos placeholder
          en gris; al tipear la primera letra solo cambia el contenido,
          no el layout. */}
      <SuggestionsBar
        label={currentWord ? barLabel : '—'}
        announceLabel={currentWord ? barAnnounce : ''}
        onActivate={handleActivateSuggestionsBar}
        highlighted={!!proposalMode}
        dim={!currentWord}
      />
      <Row keys={row1} onKey={handleKey} displayChar={displayChar} accentMap={!symbolLayer ? ACCENT_MAP : {}} onAccent={handleAccent} />
      <Row keys={row2} onKey={handleKey} displayChar={displayChar} accentMap={!symbolLayer ? ACCENT_MAP : {}} onAccent={handleAccent} />
      <Row keys={row3} onKey={handleKey} displayChar={displayChar} accentMap={!symbolLayer ? ACCENT_MAP : {}} onAccent={handleAccent} />

      <View style={styles.row}>
        <SpecialKey
          label={shift === 'lock' ? '⇧⇧' : '⇧'}
          announceLabel={shift === 'lock' ? 'bloqueo mayúsculas' : 'mayúsculas'}
          onActivate={handleShiftActivate}
          flex={1.5}
          highlighted={shift !== 'off'}
        />
        {row4.map((c) => (
          <Key
            key={c}
            char={c}
            display={displayChar(c)}
            onTap={handleKey}
            onLongPress={ACCENT_MAP[c] && !symbolLayer ? () => handleAccent(c) : undefined}
          />
        ))}
        <SpecialKey
          label="⌫"
          announceLabel="borrar"
          onActivate={handleBackspaceLetter}
          onLongPress={handleBackspaceWord}
          onLongPressLabel="borrar palabra"
          flex={1.5}
        />
      </View>

      <View style={styles.row}>
        <SpecialKey
          label={symbolLayer ? 'abc' : '!@#'}
          announceLabel={symbolLayer ? 'letras' : 'símbolos'}
          onActivate={handleSymToggle}
          flex={1.5}
        />
        <SpecialKey
          label="espacio"
          announceLabel="espacio"
          onActivate={handleSpace}
          flex={6}
        />
        <SpecialKey
          label="⏎"
          announceLabel="enter"
          onActivate={handleEnter}
          flex={1.5}
        />
      </View>
    </View>
  );
}

// --- Sub-componentes ---

function Row({ keys, onKey, displayChar, accentMap, onAccent }: {
  keys: string[];
  onKey: (c: string) => void;
  displayChar: (c: string) => string;
  accentMap: Record<string, string>;
  onAccent: (c: string) => void;
}) {
  return (
    <View style={styles.row}>
      {keys.map((c) => {
        const isVowel = !!accentMap[c];
        return (
          <Key
            key={c}
            char={c}
            display={displayChar(c)}
            onTap={onKey}
            onLongPress={isVowel ? () => onAccent(c) : undefined}
            onLongPressLabel={isVowel ? 'con tilde' : undefined}
            // Delay extra largo en vocales para evitar tildes accidentales
            // al cruzar el dedo despacio sobre una vocal en drag-explore.
            onLongPressDelayMs={isVowel ? 1200 : undefined}
          />
        );
      })}
    </View>
  );
}

interface KeyProps {
  char: string;
  display: string;
  onTap: (c: string) => void;
  onLongPress?: () => void;
  // Texto que se anuncia por TTS al "armar" el long-press. P.ej.
  // "con tilde" en vocales. Si no se pasa, no se anuncia nada.
  onLongPressLabel?: string;
  // Delay específico para esta tecla. Útil para vocales donde queremos
  // que tarde más en activar el modo acento (no provocar tildes
  // accidentales al pasar el dedo). Default = LONG_PRESS_MS.
  onLongPressDelayMs?: number;
}

function Key({ char, display, onTap, onLongPress, onLongPressLabel, onLongPressDelayMs }: KeyProps) {
  const ref = useRef<View>(null);
  const fullKey = `${KB_SCOPE}:${char}`;
  const [hasFocus, setHasFocus] = useState(false);

  useEffect(() => {
    const update = (key: string | null) => setHasFocus(key === fullKey);
    update(selfVoicingPress.getFocusedKey());
    return selfVoicingPress.subscribe(update);
  }, [fullKey]);

  const handleLayout = useCallback(() => {
    ref.current?.measure((_x, _y, w, h, pageX, pageY) => {
      buttonRegistry.register(
        fullKey,
        { x: pageX, y: pageY, w, h },
        display,
        onLongPress,
        KB_SCOPE,
      );
      buttonRegistry.setActions(fullKey, {
        onActivate: () => onTap(char),
        onLongPressLabel,
        onLongPressDelayMs,
      });
    });
  }, [fullKey, display, onLongPress, onTap, char, onLongPressLabel, onLongPressDelayMs]);

  useEffect(() => () => buttonRegistry.unregister(fullKey), [fullKey]);

  return (
    <View
      ref={ref}
      onLayout={handleLayout}
      style={[styles.key, hasFocus && styles.keyFocused]}
    >
      <Text style={styles.keyText} numberOfLines={1}>{display}</Text>
    </View>
  );
}

// Barra de sugerencias arriba del teclado. Es una "tecla" más en
// `buttonRegistry` para que drag-explore la pueda enfocar y leer. Al
// hacer lift-to-type sobre ella se entra al modo PROPOSAL (si hay
// candidatos). Si no hay candidatos, lift es no-op (lee "Sin
// sugerencias" al pasar el dedo, pero no hace nada al soltar).
interface SuggestionsBarProps {
  label: string;
  announceLabel: string;
  onActivate: () => void;
  highlighted?: boolean;
  // Cuando true, la barra se pinta en gris y no se registra como
  // navegable (no aparece al drag-explore ni al lift-to-type). Sirve
  // para reservar espacio sin ruido cuando aún no hay palabra parcial.
  dim?: boolean;
}

function SuggestionsBar({ label, announceLabel, onActivate, highlighted, dim }: SuggestionsBarProps) {
  const ref = useRef<View>(null);
  const fullKey = `${KB_SCOPE}:suggestions-bar`;
  const [hasFocus, setHasFocus] = useState(false);

  useEffect(() => {
    const update = (key: string | null) => setHasFocus(key === fullKey);
    update(selfVoicingPress.getFocusedKey());
    return selfVoicingPress.subscribe(update);
  }, [fullKey]);

  const handleLayout = useCallback(() => {
    if (dim) {
      // No registrar como navegable cuando está en estado vacío.
      buttonRegistry.unregister(fullKey);
      return;
    }
    ref.current?.measure((_x, _y, w, h, pageX, pageY) => {
      buttonRegistry.register(
        fullKey,
        { x: pageX, y: pageY, w, h },
        announceLabel,
        undefined,
        KB_SCOPE,
      );
      buttonRegistry.setActions(fullKey, { onActivate });
    });
  }, [fullKey, announceLabel, onActivate, dim]);

  // Re-registrar / desregistrar al cambiar `dim` u onActivate.
  useEffect(() => {
    handleLayout();
  }, [handleLayout]);

  useEffect(() => () => buttonRegistry.unregister(fullKey), [fullKey]);

  return (
    <View
      ref={ref}
      onLayout={handleLayout}
      style={[
        styles.suggestionsBar,
        hasFocus && styles.keyFocused,
        highlighted && styles.suggestionsBarActive,
        dim && styles.suggestionsBarDim,
      ]}
    >
      <Text style={[styles.suggestionsText, dim && styles.suggestionsTextDim]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

interface SpecialKeyProps {
  label: string;
  announceLabel: string;
  onActivate: () => void;
  onLongPress?: () => void;
  onLongPressLabel?: string;
  onLongPressDelayMs?: number;
  flex?: number;
  highlighted?: boolean;
}

function SpecialKey({ label, announceLabel, onActivate, onLongPress, onLongPressLabel, onLongPressDelayMs, flex = 1, highlighted }: SpecialKeyProps) {
  const ref = useRef<View>(null);
  const fullKey = `${KB_SCOPE}:special-${label}`;
  const [hasFocus, setHasFocus] = useState(false);

  useEffect(() => {
    const update = (key: string | null) => setHasFocus(key === fullKey);
    update(selfVoicingPress.getFocusedKey());
    return selfVoicingPress.subscribe(update);
  }, [fullKey]);

  const handleLayout = useCallback(() => {
    ref.current?.measure((_x, _y, w, h, pageX, pageY) => {
      buttonRegistry.register(
        fullKey,
        { x: pageX, y: pageY, w, h },
        announceLabel,
        onLongPress,
        KB_SCOPE,
      );
      buttonRegistry.setActions(fullKey, {
        onActivate,
        onLongPressLabel,
        onLongPressDelayMs,
      });
    });
  }, [fullKey, announceLabel, onLongPress, onActivate, onLongPressLabel, onLongPressDelayMs]);

  useEffect(() => () => buttonRegistry.unregister(fullKey), [fullKey]);

  return (
    <View
      ref={ref}
      onLayout={handleLayout}
      style={[styles.specialKey, { flex }, hasFocus && styles.keyFocused, highlighted && styles.keyHighlighted]}
    >
      <Text style={styles.keyText} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0d0d0d',
    paddingHorizontal: 4,
    paddingVertical: 4,
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  row: {
    flexDirection: 'row',
    gap: 4,
    height: 44,
  },
  key: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  specialKey: {
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyText: {
    color: '#ccc',
    fontSize: 16,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  keyFocused: {
    borderColor: '#00ffff',
    borderWidth: 2,
  },
  keyHighlighted: {
    backgroundColor: '#0a3a0a',
    borderColor: '#0c0',
  },
  suggestionsBar: {
    height: 44,
    backgroundColor: '#15294f',
    borderWidth: 1,
    borderColor: '#3a5a99',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  suggestionsBarActive: {
    backgroundColor: '#3a5a99',
    borderColor: '#7aaaff',
  },
  suggestionsBarDim: {
    backgroundColor: '#1a1a1a',
    borderColor: '#2a2a2a',
  },
  suggestionsText: {
    color: '#cce5ff',
    fontSize: 13,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  suggestionsTextDim: {
    color: '#444',
  },
});
