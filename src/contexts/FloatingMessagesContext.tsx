import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { FloatingMessageLevel } from '../types';

export interface FloatingMessage {
  id: number;
  text: string;
  level: FloatingMessageLevel;
}

interface ContextValue {
  messages: FloatingMessage[];
  push: (text: string, level?: FloatingMessageLevel, durationMs?: number) => void;
}

const Ctx = createContext<ContextValue | null>(null);
let nextId = 1;

const DEFAULT_DURATION_MS = 4000;

export function FloatingMessagesProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<FloatingMessage[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const push = useCallback(
    (text: string, level: FloatingMessageLevel = 'info', durationMs: number = DEFAULT_DURATION_MS) => {
      const trimmed = text?.trim();
      if (!trimmed) return;
      const id = nextId++;
      setMessages((prev) => [...prev, { id, text: trimmed, level }]);
      AccessibilityInfo.announceForAccessibility(trimmed);
      const t = setTimeout(() => {
        setMessages((prev) => prev.filter((m) => m.id !== id));
        timersRef.current.delete(id);
      }, durationMs);
      timersRef.current.set(id, t);
    },
    [],
  );

  useEffect(() => {
    return () => {
      for (const t of timersRef.current.values()) clearTimeout(t);
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
