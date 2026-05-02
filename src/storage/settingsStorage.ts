import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureAction, GestureConfig } from '../types';

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
  // Self-voicing (modo blind sin TalkBack). Cuando `useSelfVoicing` es true Y
  // `uiMode === 'blind'`, la app desactiva su árbol de accesibilidad para
  // TalkBack y usa react-native-tts directamente. Los anuncios siguen
  // pasando por `speechQueueService`, que cambia su backend según este flag.
  // El usuario debe desactivar TalkBack a mano (atajo OS) — la app detecta
  // si sigue activo y muestra banner de aviso. Ver SELFVOICING.md.
  // ttsEngine: package name del motor (vacío = motor por defecto del OS).
  // ttsVoice: voice id de TTS.Voice (vacío = primera voz del motor).
  // ttsRate: 0.1..6.0 (1.0 = normal, 2.0 = doble, etc). Pitch: 0.5..2 (1 = normal).
  // ttsVolume: 0..1, separado de ambient/effects (las tres categorías
  //   son ducking-independientes).
  useSelfVoicing: boolean;
  ttsEngine: string;
  ttsVoice: string;
  ttsRate: number;
  ttsPitch: number;
  ttsVolume: number;
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
  useSelfVoicing: false,
  ttsEngine: '',
  ttsVoice: '',
  ttsRate: 1.0,
  ttsPitch: 1.0,
  ttsVolume: 1.0,
  // Defaults vacíos: la app arranca sin ningún gesto configurado. La
  // configuración curada (norte/sur/dentro/fuera/cerrar/abrir/t/responder...)
  // viaja en el Config.zip que el usuario importa desde la pantalla de
  // import/export. rebuildGestures se asegura de que cualquier tipo nuevo
  // que añadamos en el futuro aparezca aquí también.
  gestures: [
    { type: 'swipe_up', enabled: false, action: { kind: 'send', text: '' } },
    { type: 'swipe_down', enabled: false, action: { kind: 'send', text: '' } },
    { type: 'swipe_left', enabled: false, action: { kind: 'send', text: '' } },
    { type: 'swipe_right', enabled: false, action: { kind: 'send', text: '' } },
    { type: 'swipe_up_right', enabled: false, action: { kind: 'send', text: '' } },
    { type: 'swipe_up_left', enabled: false, action: { kind: 'send', text: '' } },
    { type: 'swipe_down_right', enabled: false, action: { kind: 'send', text: '' } },
    { type: 'swipe_down_left', enabled: false, action: { kind: 'send', text: '' } },
    { type: 'twofingers_up', enabled: false, action: { kind: 'send', text: '' } },
    { type: 'twofingers_down', enabled: false, action: { kind: 'send', text: '' } },
    { type: 'twofingers_left', enabled: false, action: { kind: 'send', text: '' } },
    { type: 'twofingers_right', enabled: false, action: { kind: 'send', text: '' } },
    { type: 'twofingers_up_right', enabled: false, action: { kind: 'send', text: '' } },
    { type: 'twofingers_up_left', enabled: false, action: { kind: 'send', text: '' } },
    { type: 'twofingers_down_right', enabled: false, action: { kind: 'send', text: '' } },
    { type: 'twofingers_down_left', enabled: false, action: { kind: 'send', text: '' } },
    { type: 'pinch_in', enabled: false, action: { kind: 'send', text: '' } },
    { type: 'pinch_out', enabled: false, action: { kind: 'send', text: '' } },
    { type: 'twofingers_doubletap', enabled: false, action: { kind: 'send', text: '' } },
    { type: 'doubletap_hold_swipe_up', enabled: false, action: { kind: 'send', text: '' } },
    { type: 'doubletap_hold_swipe_down', enabled: false, action: { kind: 'send', text: '' } },
    { type: 'doubletap_hold_swipe_left', enabled: false, action: { kind: 'send', text: '' } },
    { type: 'doubletap_hold_swipe_right', enabled: false, action: { kind: 'send', text: '' } },
    { type: 'doubletap_hold_swipe_up_right', enabled: false, action: { kind: 'send', text: '' } },
    { type: 'doubletap_hold_swipe_up_left', enabled: false, action: { kind: 'send', text: '' } },
    { type: 'doubletap_hold_swipe_down_right', enabled: false, action: { kind: 'send', text: '' } },
    { type: 'doubletap_hold_swipe_down_left', enabled: false, action: { kind: 'send', text: '' } },
  ],
};

export async function loadSettings(): Promise<AppSettings> {
  const json = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!json) return { ...DEFAULT_SETTINGS };
  // Strip the obsolete enabledSounds field (replaced by per-trigger.enabled in
  // the seeded "Sonidos del MUD" pack) so it doesn't linger in saved state.
  const parsed = JSON.parse(json) as Partial<AppSettings> & { enabledSounds?: unknown; typingVerbosity?: unknown; typingAnnounce?: unknown };
  delete parsed.enabledSounds;
  delete parsed.typingVerbosity;
  delete parsed.typingAnnounce;
  const merged = { ...DEFAULT_SETTINGS, ...parsed };
  // Purga tipos de gestos obsoletos (p.ej. `doubletap` que se eliminó al
  // introducir doubletap_hold_swipe). Y pasa por rebuildGestures para
  // asegurar que toda la lista del default esté presente con los valores
  // guardados aplicados encima — útil cuando se añaden tipos nuevos en una
  // versión sin que el usuario tenga que hacer nada.
  if (Array.isArray(merged.gestures)) {
    return rebuildGestures(merged);
  }
  return merged;
}

export function rebuildGestures(settings: AppSettings): AppSettings {
  // El array guardado puede mezclar:
  //   - Forma actual v4: { type, enabled, action: { kind, ... } }
  //   - Forma legacy:    { type, enabled, command, opensKeyboard } — aún
  //     existe en AsyncStorage de instalaciones anteriores; convertimos a la
  //     nueva al cargar y se persiste con el siguiente saveSettings.
  const savedGestureMap = new Map(
    settings.gestures.map(g => [g.type, g as unknown as Record<string, unknown>]),
  );

  const rebuilt = DEFAULT_SETTINGS.gestures.map(defaultGesture => {
    const saved = savedGestureMap.get(defaultGesture.type);
    if (!saved) return defaultGesture;
    const action = normalizeGestureAction(saved);
    return { ...defaultGesture, enabled: !!saved.enabled, action };
  });

  return { ...settings, gestures: rebuilt };
}

function normalizeGestureAction(saved: Record<string, unknown>): GestureAction {
  // Forma legacy { command, opensKeyboard } → send/prepare con text.
  if (saved.action === undefined && (saved.command !== undefined || saved.opensKeyboard !== undefined)) {
    const text = typeof saved.command === 'string' ? saved.command : '';
    return saved.opensKeyboard ? { kind: 'prepare', text } : { kind: 'send', text };
  }
  const raw = saved.action;
  if (!raw || typeof raw !== 'object') return { kind: 'send', text: '' };
  // Acceso defensivo por indexer: el JSON pudo guardarse con cualquier shape
  // (otra versión de la app, edición manual...). No confiamos en el tipo.
  const a = raw as Record<string, unknown>;
  if (a.kind === 'prepare') {
    return { kind: 'prepare', text: typeof a.text === 'string' ? a.text : '' };
  }
  if (a.kind === 'pick') {
    const sources = ['roomExits', 'recentTells', 'custom'] as const;
    const source = sources.includes(a.source as typeof sources[number])
      ? (a.source as typeof sources[number])
      : 'custom';
    return {
      kind: 'pick',
      prefix: typeof a.prefix === 'string' ? a.prefix : '',
      source,
      customList: Array.isArray(a.customList)
        ? a.customList.filter((s: unknown): s is string => typeof s === 'string')
        : [],
      autoSend: !!a.autoSend,
    };
  }
  // 'send' o desconocido → fallback a send.
  return { kind: 'send', text: typeof a.text === 'string' ? a.text : '' };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
