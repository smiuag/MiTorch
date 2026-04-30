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
}

export const AVAILABLE_SOUNDS = {
  'bloqueos/bloqueo-termina.wav': 'Bloqueo termina',
  'combate/pierdes-concentracion.wav': 'Pierdes concentración',
  'hechizos/preparas.wav': 'Preparas hechizo',
  'hechizos/formulando.wav': 'Formulando',
  'hechizos/resiste.wav': 'Resiste',
  'hechizos/fuera-rango.wav': 'Fuera de rango',
  'hechizos/imagenes-off.wav': 'Imágenes desactivadas',
  'hechizos/imagenes-up.wav': 'Imágenes activadas',
  'hechizos/piel-piedra-on.wav': 'Piel de piedra',
  'combate/impacto.wav': 'Impacto',
  'combate/esquivado.wav': 'Esquivado',
  'combate/bloqueado.wav': 'Bloqueado',
  'combate/objetivo-perdido.wav': 'Objetivo perdido',
  'combate/interrumpido.wav': 'Interrumpido',
  'combate/critico.wav': 'Crítico',
  'combate/golpe-lanzas.wav': 'Golpe que lanzas',
  'combate/golpe-recibes.wav': 'Golpe que recibes',
  'combate/muerte-propia.wav': 'Muerte propia',
  'combate/muerte-otro.wav': 'Muerte de otro',
  'combate/hemorragia.wav': 'Hemorragia',
  'combate/cicatrizar.wav': 'Cicatrizar',
  'combate/incapacitado.wav': 'Incapacitado',
  'combate/alerta.wav': 'Alerta',
  'combate/alerta-vida-50.wav': 'Alerta vida 50%',
  'combate/alerta-vida-30.wav': 'Alerta vida 30%',
  'combate/alerta-vida-10.wav': 'Alerta vida 10%',
  'eventos/muerte.wav': 'Muerte',
  'eventos/victoria.wav': 'Victoria',
  'eventos/xp.wav': 'XP',
  'eventos/curacion.wav': 'Curación',
} as const;

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
