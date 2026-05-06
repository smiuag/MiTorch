import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CountdownTimer, useCountdownTimers } from '../contexts/CountdownTimersContext';
import { FloatingMessageLevel } from '../types';

// Diseño:
// - Cada timer es una "barra container" SIEMPRE de ancho completo y altura
//   fija. Color base oscuro (palette.outer).
// - Dentro hay una "barra de relleno" más clara (palette.fill) que se va
//   acortando: 100% mientras quedan >5s, luego decrece linealmente hasta 0.
// - Encima, una fila con el label (izquierda) y el tiempo (derecha) que
//   nunca se mueve ni desaparece — siempre legible aunque la barra interior
//   se haya retraído.
//
// zIndex 999 (uno por debajo de FloatingMessages 1000) — si coinciden en y,
// los floatings ganan visibilidad. Es lo correcto: un aviso transitorio es
// más urgente que un contador en curso.

const SHRINK_THRESHOLD_S = 5;
const ITEM_HEIGHT = 22;
const ITEM_GAP = 3;

export function CountdownTimers() {
  const { timers } = useCountdownTimers();
  const insets = useSafeAreaInsets();

  if (timers.length === 0) return null;

  return (
    <View
      style={[
        styles.container,
        { top: Math.max(insets.top, 8) + 4 },
      ]}
      pointerEvents="none"
    >
      {timers.map((t) => (
        <CountdownItem key={t.id} timer={t} />
      ))}
    </View>
  );
}

function CountdownItem({ timer }: { timer: CountdownTimer }) {
  const [, force] = useState(0);

  useEffect(() => {
    // Tick de 100ms — suficiente para animación visual fluida (10 fps) y
    // para mostrar décimas en el último segundo. Cada item tiene su propio
    // interval; con 1-3 timers activos el coste es trivial. Si en el futuro
    // surgen timers densos (>10 simultáneos), considerar consolidar a un
    // único interval compartido + Animated.Value.
    const id = setInterval(() => force((n) => n + 1), 100);
    return () => clearInterval(id);
  }, []);

  const now = Date.now();
  const remaining = Math.max(0, (timer.startedAt + timer.durationMs - now) / 1000);
  const fillPct = Math.min(1, remaining / SHRINK_THRESHOLD_S) * 100;
  const display = formatRemaining(remaining);
  const palette = getPalette(timer.level);

  return (
    <View
      style={[
        styles.outer,
        { height: ITEM_HEIGHT, backgroundColor: palette.outer },
      ]}
      accessible={false}
    >
      <View
        style={[
          styles.fill,
          { width: `${fillPct}%`, backgroundColor: palette.fill },
        ]}
      />
      <View style={styles.row}>
        <Text
          style={[styles.label, { color: palette.text }]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {timer.label}
        </Text>
        <Text style={[styles.time, { color: palette.text }]}>{display}</Text>
      </View>
    </View>
  );
}

function formatRemaining(remaining: number): string {
  if (remaining <= 0) return '0.0s';
  if (remaining > 1) return `${Math.ceil(remaining)}s`;
  return `${(Math.ceil(remaining * 10) / 10).toFixed(1)}s`;
}

function getPalette(level: FloatingMessageLevel): { outer: string; fill: string; text: string } {
  // Pares oscuro/claro de la misma tonalidad. `outer` es el fondo permanente
  // de la barra; `fill` es el relleno interior que se va retrayendo. Texto
  // blanco lee bien sobre ambos en todos los pares.
  switch (level) {
    case 'success':
      return { outer: '#0a4a0a', fill: '#22aa22', text: '#fff' };
    case 'warning':
      return { outer: '#5c3a00', fill: '#cc8800', text: '#fff' };
    case 'error':
      return { outer: '#5c0000', fill: '#cc0000', text: '#fff' };
    case 'info':
    default:
      return { outer: '#15294f', fill: '#3a5a99', text: '#fff' };
  }
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 999,
  },
  outer: {
    borderRadius: 0,
    marginBottom: ITEM_GAP,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
  },
  row: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    flex: 1,
    marginRight: 8,
  },
  time: {
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    minWidth: 32,
    textAlign: 'right',
  },
});
