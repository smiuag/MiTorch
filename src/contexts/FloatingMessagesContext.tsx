import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { FloatingMessageLevel } from '../types';
import { speechQueue } from '../services/speechQueueService';

export interface FloatingMessage {
  id: number;
  text: string;
  level: FloatingMessageLevel;
  leaving: boolean;
  // Optional per-message overrides — when set, take precedence over the
  // level palette in the renderer. Either or both may be present.
  fg?: string;
  bg?: string;
}

export interface FloatingColors {
  fg?: string;
  bg?: string;
}

interface ContextValue {
  messages: FloatingMessage[];
  push: (text: string, level?: FloatingMessageLevel, durationMs?: number, colors?: FloatingColors) => void;
}

const Ctx = createContext<ContextValue | null>(null);
let nextId = 1;

const DEFAULT_DURATION_MS = 4000;
export const FLOATING_FADE_OUT_MS = 220;

export function FloatingMessagesProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<FloatingMessage[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>[]>>(new Map());

  const push = useCallback(
    (text: string, level: FloatingMessageLevel = 'info', durationMs: number = DEFAULT_DURATION_MS, colors?: FloatingColors) => {
      const trimmed = text?.trim();
      if (!trimmed) return;
      const id = nextId++;
      setMessages((prev) => [...prev, { id, text: trimmed, level, leaving: false, fg: colors?.fg, bg: colors?.bg }]);
      // Delegamos en speechQueue la decisión de hablar o no — gatea
      // internamente según backend activo (TalkBack o TTS propio). Antes
      // teníamos un cache local de `screenReaderEnabled` para evitar el
      // JNI bridge, pero rompía self-voicing: con TalkBack off el cache
      // era false y los floatings nunca se anunciaban aunque el TTS
      // estuviera disponible. Coste de una llamada en frío: trim + early
      // return = trivial.
      speechQueue.enqueue(trimmed);

      // Two-phase removal: flag `leaving` first so FloatingItem can fade out,
      // then drop from the array so the LayoutAnimation slides remaining
      // messages up.
      const fadeStartDelay = Math.max(0, durationMs - FLOATING_FADE_OUT_MS);
      const fadeStart = setTimeout(() => {
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, leaving: true } : m)));
      }, fadeStartDelay);
      const remove = setTimeout(() => {
        setMessages((prev) => prev.filter((m) => m.id !== id));
        timersRef.current.delete(id);
      }, durationMs);
      timersRef.current.set(id, [fadeStart, remove]);
    },
    [],
  );

  useEffect(() => {
    return () => {
      for (const timers of timersRef.current.values()) {
        for (const t of timers) clearTimeout(t);
      }
      timersRef.current.clear();
    };
  }, []);

  return <Ctx.Provider value={{ messages, push }}>{children}</Ctx.Provider>;
}

export function useFloatingMessages(): ContextValue {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error('useFloatingMessages must be used within FloatingMessagesProvider');
  }
  return v;
}
