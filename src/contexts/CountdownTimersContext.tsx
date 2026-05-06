import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { FloatingMessageLevel } from '../types';

// Cuenta atrás visual: barra que aparece arriba al disparar un trigger
// `start_timer`, decrece según el tiempo restante y se borra sola al expirar.
// Diferencia clave con FloatingMessages: vida larga (decenas de segundos),
// con UI animada (texto que cambia + barra que se acorta), y dedup por label
// — re-cast del mismo buff reinicia el contador en lugar de apilar uno
// nuevo. No se anuncia con el screen reader (visual-only por ahora).

export interface CountdownTimer {
  id: number;
  label: string;
  level: FloatingMessageLevel;
  startedAt: number;
  durationMs: number;
}

interface ContextValue {
  timers: CountdownTimer[];
  start: (label: string, seconds: number, level?: FloatingMessageLevel) => void;
  clearAll: () => void;
}

const Ctx = createContext<ContextValue | null>(null);
let nextId = 1;

export function CountdownTimersProvider({ children }: { children: React.ReactNode }) {
  const [timers, setTimers] = useState<CountdownTimer[]>([]);
  // Map keyed by label para poder cancelar el timeout previo cuando se
  // reinicia el mismo timer.
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const start = useCallback(
    (label: string, seconds: number, level: FloatingMessageLevel = 'info') => {
      const trimmed = label?.trim();
      if (!trimmed || seconds <= 0) return;
      const durationMs = Math.round(seconds * 1000);
      const startedAt = Date.now();

      setTimers((prev) => {
        const existing = prev.find((t) => t.label === trimmed);
        if (existing) {
          return prev.map((t) =>
            t.label === trimmed ? { ...t, startedAt, durationMs, level } : t,
          );
        }
        return [...prev, { id: nextId++, label: trimmed, level, startedAt, durationMs }];
      });

      const prevTimeout = timeoutsRef.current.get(trimmed);
      if (prevTimeout) clearTimeout(prevTimeout);
      const timeout = setTimeout(() => {
        setTimers((prev) => prev.filter((t) => t.label !== trimmed));
        timeoutsRef.current.delete(trimmed);
      }, durationMs);
      timeoutsRef.current.set(trimmed, timeout);
    },
    [],
  );

  const clearAll = useCallback(() => {
    for (const t of timeoutsRef.current.values()) clearTimeout(t);
    timeoutsRef.current.clear();
    setTimers([]);
  }, []);

  useEffect(() => {
    return () => {
      for (const t of timeoutsRef.current.values()) clearTimeout(t);
      timeoutsRef.current.clear();
    };
  }, []);

  return <Ctx.Provider value={{ timers, start, clearAll }}>{children}</Ctx.Provider>;
}

export function useCountdownTimers(): ContextValue {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error('useCountdownTimers must be used within CountdownTimersProvider');
  }
  return v;
}
