import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureConfig } from '../types';

const SETTINGS_KEY = 'aljhtar_settings';

export type LogsMaxLines = 5000 | 10000 | 20000 | 50000 | 100000;

export interface AppSettings {
  fontSize: number;
  uiMode: 'completo' | 'blind';
  onboardingDone: boolean;
  encoding: string;
  gesturesEnabled: boolean;
  gestures: GestureConfig[];
  soundsEnabled: boolean;
  keepAwakeEnabled: boolean;
  backgroundConnectionEnabled: boolean;
  notificationsEnabled: boolean;
  logsEnabled: boolean;
  logsMaxLines: LogsMaxLines;
  speechCharDurationMs: number;
  // Música ambiental por tipo de sala. `ambientEnabled` es el toggle del
  // usuario (botón en TerminalScreen); el kill-switch global de sonido
  // (`soundsEnabled`) sigue mandando — si está OFF, el ambient tampoco
  // suena. `ambientVolume` y `effectsVolume` son sliders 0..1; los wavs
  // del ambient se reproducen al primero, los `play_sound` de triggers al
  // segundo. Defaults: 0.4 ambient (sutil de fondo), 0.7 efectos (claros).
  ambientEnabled: boolean;
  ambientVolume: number;
  effectsVolume: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  fontSize: 14,
  uiMode: 'completo',
  onboardingDone: false,
  encoding: 'utf8',
  gesturesEnabled: true,
  soundsEnabled: false,
  keepAwakeEnabled: true,
  backgroundConnectionEnabled: true,
  notificationsEnabled: false,
  logsEnabled: false,
  logsMaxLines: 20000,
  speechCharDurationMs: 20,
  ambientEnabled: true,
  ambientVolume: 0.4,
  effectsVolume: 0.7,
  gestures: [
    { type: 'doubletap', enabled: true, command: 'responder ', opensKeyboard: true },
    { type: 'swipe_up', enabled: true, command: 'norte', opensKeyboard: false },
    { type: 'swipe_down', enabled: true, command: 'sur', opensKeyboard: false },
    { type: 'swipe_left', enabled: true, command: 'oeste', opensKeyboard: false },
    { type: 'swipe_right', enabled: true, command: 'este', opensKeyboard: false },
    { type: 'swipe_up_right', enabled: true, command: 'noreste', opensKeyboard: false },
    { type: 'swipe_up_left', enabled: true, command: 'noroeste', opensKeyboard: false },
    { type: 'swipe_down_right', enabled: true, command: 'sudeste', opensKeyboard: false },
    { type: 'swipe_down_left', enabled: true, command: 'sudoeste', opensKeyboard: false },
    { type: 'twofingers_up', enabled: true, command: 'arriba', opensKeyboard: false },
    { type: 'twofingers_down', enabled: true, command: 'abajo', opensKeyboard: false },
    { type: 'twofingers_left', enabled: false, command: '', opensKeyboard: false },
    { type: 'twofingers_right', enabled: false, command: '', opensKeyboard: false },
    { type: 'twofingers_up_right', enabled: false, command: 'noreste', opensKeyboard: false },
    { type: 'twofingers_up_left', enabled: false, command: 'noroeste', opensKeyboard: false },
    { type: 'twofingers_down_right', enabled: false, command: 'sudeste', opensKeyboard: false },
    { type: 'twofingers_down_left', enabled: false, command: 'sudoeste', opensKeyboard: false },
    { type: 'pinch_in', enabled: true, command: 'dentro', opensKeyboard: false },
    { type: 'pinch_out', enabled: true, command: 'fuera', opensKeyboard: false },
  ],
};

export async function loadSettings(): Promise<AppSettings> {
  const json = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!json) return { ...DEFAULT_SETTINGS };
  // Strip the obsolete enabledSounds field (replaced by per-trigger.enabled in
  // the seeded "Sonidos del MUD" pack) so it doesn't linger in saved state.
  const parsed = JSON.parse(json) as Partial<AppSettings> & { enabledSounds?: unknown };
  delete parsed.enabledSounds;
  return { ...DEFAULT_SETTINGS, ...parsed };
}

export function rebuildGestures(settings: AppSettings): AppSettings {
  const savedGestureMap = new Map(settings.gestures.map(g => [g.type, g]));

  const rebuilt = DEFAULT_SETTINGS.gestures.map(defaultGesture => {
    const saved = savedGestureMap.get(defaultGesture.type);
    if (saved) {
      return { ...defaultGesture, enabled: saved.enabled, command: saved.command, opensKeyboard: saved.opensKeyboard };
    }
    return defaultGesture;
  });

  return { ...settings, gestures: rebuilt };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
