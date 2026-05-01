import { AccessibilityInfo } from 'react-native';
import Tts from 'react-native-tts';
import { AppSettings, loadSettings } from '../storage/settingsStorage';

// JS-level queue for spoken announcements. Two backends:
//
// 1) "talkback": AccessibilityInfo.announceForAccessibility(). Used in modo
//    completo y en modo blind cuando `useSelfVoicing` está OFF (= modelo
//    legacy con TalkBack-on). TalkBack es fire-and-forget — no hay API
//    pública para saber cuándo terminó de leer, así que serializamos con
//    timer estimado por longitud.
//
// 2) "tts": react-native-tts. Usado solo cuando `useSelfVoicing` está ON Y
//    `uiMode === 'blind'` (= self-voicing real con TalkBack desactivado a
//    mano por el usuario). TTS sí emite eventos `tts-finish` / `tts-cancel`,
//    así que la serialización es precisa.
//
// El backend activo se decide por settings y se actualiza vía applyConfig().
// El cambio de backend hace clear() para no mezclar colas.
//
// Prioridades:
//   - 'high'   → atropella (clear queue + stop tts/talkback + speak now).
//                Para feedback inmediato de UI (botón pulsado, error).
//   - 'normal' → encola FIFO. Default. Para líneas del MUD, vitals, etc.
//   - 'low'    → solo si la cola está vacía y nadie hablando. Para hints
//                opcionales que no deben molestar si hay tráfico.

const FLOOR_MS = 800;
const DEFAULT_CHAR_DURATION_MS = 20;

export type SpeechPriority = 'high' | 'normal' | 'low';
type Backend = 'talkback' | 'tts';

interface QueueItem {
  text: string;
  priority: SpeechPriority;
}

class SpeechQueueService {
  private queue: QueueItem[] = [];
  private speakingTimer: ReturnType<typeof setTimeout> | null = null;
  private isSpeakingTts = false; // true entre tts-start y tts-finish/cancel
  private charDurationMs = DEFAULT_CHAR_DURATION_MS;
  private screenReaderEnabled = false;
  private useSelfVoicing = false;
  private uiMode: 'completo' | 'blind' = 'completo';
  private ttsVolume = 1.0;
  private ttsReady = false;
  private maxQueueSize = 10;

  constructor() {
    AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      this.screenReaderEnabled = enabled;
    });
    AccessibilityInfo.addEventListener('screenReaderChanged', (enabled) => {
      const wasEnabled = this.screenReaderEnabled;
      this.screenReaderEnabled = enabled;
      if (!enabled && this.activeBackend() === 'talkback') this.clear();
      // Si se acaba de encender un lector externo (TalkBack, Voice Assistant,
      // Jieshuo, etc.) mientras estamos en self-voicing, cortar lo que
      // estemos hablando: a partir de ahora nuevos enqueue van a drop y el
      // utterance en curso se atropellaría con el lector que acaba de entrar.
      if (enabled && !wasEnabled && this.activeBackend() === 'tts') this.clear();
    });

    // TTS event listeners — wire una sola vez. La inicialización del motor
    // (Tts.getInitStatus) ocurre lazy en applyConfig() la primera vez que
    // entramos en modo self-voicing.
    Tts.addEventListener('tts-finish', () => {
      this.isSpeakingTts = false;
      this.flushNext();
    });
    Tts.addEventListener('tts-cancel', () => {
      this.isSpeakingTts = false;
      // No flushNext aquí: cancel sucede por clear() o priority=high, los
      // cuales ya se encargan de la siguiente acción.
    });

    // Carga inicial de settings — solo para arrancar con valores correctos
    // antes de que SettingsScreen empiece a llamar applyConfig.
    loadSettings()
      .then((s) => this.applyConfig(s))
      .catch(() => {});
  }

  /**
   * Push de configuración desde código de aplicación (App startup +
   * SettingsScreen tras saveSettings). Esto cambia backend, voz, rate, etc.
   * Si el backend activo cambia, se vacía la cola actual.
   */
  async applyConfig(settings: AppSettings): Promise<void> {
    if (typeof settings.speechCharDurationMs === 'number') {
      this.charDurationMs = Math.max(1, settings.speechCharDurationMs);
    }

    const before = this.activeBackend();
    this.useSelfVoicing = !!settings.useSelfVoicing;
    this.uiMode = settings.uiMode;
    this.ttsVolume = clamp01(settings.ttsVolume ?? 1.0);
    const after = this.activeBackend();

    if (before !== after) {
      this.clear();
    }

    if (after === 'tts') {
      await this.applyTtsConfig(settings);
    }
  }

  private async applyTtsConfig(settings: AppSettings): Promise<void> {
    if (!this.ttsReady) {
      try {
        await Tts.getInitStatus();
        this.ttsReady = true;
        // Ducking automático: cuando el TTS habla, Android baja temporalmente
        // el volumen de otras apps de audio (música ambient, juegos). Al
        // terminar el utterance, restaura. Hace que la voz se entienda sobre
        // la música de fondo sin necesidad de pausar manualmente.
        // (`setDucking` es one-shot global del SDK, no por-utterance.)
        try { await Tts.setDucking(true); } catch (_) { /* SDK puede no exponerlo */ }
      } catch (e) {
        // Motor TTS no disponible — la app debería avisar al usuario, pero
        // a nivel de servicio simplemente no podemos hablar. Dejamos
        // ttsReady=false; flushNext caerá silenciosamente cuando intente.
        return;
      }
    }
    try {
      if (settings.ttsEngine) {
        await Tts.setDefaultEngine(settings.ttsEngine);
      }
      if (settings.ttsVoice) {
        await Tts.setDefaultVoice(settings.ttsVoice);
      }
      if (typeof settings.ttsRate === 'number') {
        // skipTransform=true → rate se pasa tal cual a Android
        // TextToSpeech.setSpeechRate. Convención de la API: 1.0 = normal,
        // 2.0 = doble velocidad, etc. No hay max documentado — Google TTS
        // suele capear ~4.0-5.0; motores comerciales tipo Vocalizer/Eloquence
        // aguantan 8.0+. Permitimos hasta 6.0 desde Settings (cubre el caso
        // común y deja margen para motores rápidos). Cualquier valor por
        // encima del tope del motor se queda en el tope sin error.
        await Tts.setDefaultRate(clampRate(settings.ttsRate), true);
      }
      if (typeof settings.ttsPitch === 'number') {
        await Tts.setDefaultPitch(clampPitch(settings.ttsPitch));
      }
    } catch (e) {
      // Una config rota (ej: voice id no existe en motor seleccionado) no
      // debe tirar el servicio. Logueamos vía console y seguimos con la
      // config previa del motor.
      console.warn('[speechQueue] applyTtsConfig partial failure:', e);
    }
  }

  /**
   * @deprecated Usar applyConfig(settings). Mantenido por compatibilidad
   * temporal con SettingsScreen — eliminar tras refactor.
   */
  setCharDurationMs(ms: number): void {
    this.charDurationMs = Math.max(1, ms);
  }

  enqueue(text: string, priority: SpeechPriority = 'normal'): void {
    const trimmed = text?.trim();
    if (!trimmed) return;

    const backend = this.activeBackend();
    if (backend === 'talkback' && !this.screenReaderEnabled) return;
    if (backend === 'tts' && !this.ttsReady) return;
    // Si hay un lector externo activo (TalkBack, Voice Assistant Samsung,
    // Jieshuo, BrailleBack, etc.) y estamos en backend tts, callamos: lo
    // que digamos se duplica con el lector y se atropellan. El banner
    // naranja en TerminalScreen avisa al usuario para que lo desactive.
    if (backend === 'tts' && this.screenReaderEnabled) return;

    if (priority === 'high') {
      // Atropella: vacía la cola, corta lo que se esté hablando, dispara ya.
      this.queue.length = 0;
      if (this.speakingTimer) {
        clearTimeout(this.speakingTimer);
        this.speakingTimer = null;
      }
      if (backend === 'tts') {
        Tts.stop();
        this.isSpeakingTts = false;
      }
      this.queue.push({ text: trimmed, priority });
      this.flushNext();
      return;
    }

    if (priority === 'low') {
      // Solo si nadie hablando ni cola pendiente.
      if (this.queue.length > 0 || this.isSpeakingTts || this.speakingTimer) {
        return;
      }
    }

    if (this.queue.length >= this.maxQueueSize) {
      this.queue.shift();
    }
    this.queue.push({ text: trimmed, priority });

    if (!this.speakingTimer && !this.isSpeakingTts) {
      this.flushNext();
    }
  }

  clear(): void {
    this.queue.length = 0;
    if (this.speakingTimer) {
      clearTimeout(this.speakingTimer);
      this.speakingTimer = null;
    }
    if (this.activeBackend() === 'tts') {
      Tts.stop();
      this.isSpeakingTts = false;
    }
  }

  /**
   * Habla un texto fuera de cola, ignorando estado actual. Útil para botón
   * "Probar voz" en Settings — no queremos meter eso en la cola normal.
   */
  preview(text: string): void {
    // Si hay lector externo on, evitar disparar el TTS propio aunque estemos
    // en backend tts: caería atropellado por el lector. announceForAccessibility
    // hará que el lector externo lo lea — el usuario al menos oye algo.
    if (this.activeBackend() === 'tts' && this.ttsReady && !this.screenReaderEnabled) {
      Tts.stop();
      Tts.speak(text, this.ttsSpeakOpts());
    } else {
      AccessibilityInfo.announceForAccessibility(text);
    }
  }

  private activeBackend(): Backend {
    if (this.useSelfVoicing && this.uiMode === 'blind') return 'tts';
    return 'talkback';
  }

  private ttsSpeakOpts(): Parameters<typeof Tts.speak>[1] {
    return {
      androidParams: {
        KEY_PARAM_PAN: 0,
        KEY_PARAM_VOLUME: this.ttsVolume,
        KEY_PARAM_STREAM: 'STREAM_MUSIC',
      },
      iosVoiceId: '',
      rate: 0.5,
    };
  }

  private flushNext = (): void => {
    const next = this.queue.shift();
    if (!next) {
      this.speakingTimer = null;
      this.isSpeakingTts = false;
      return;
    }

    const backend = this.activeBackend();
    if (backend === 'tts' && this.ttsReady) {
      this.isSpeakingTts = true;
      // No hay timer: la siguiente flushNext se dispara desde el listener
      // de tts-finish.
      Tts.speak(next.text, this.ttsSpeakOpts());
      return;
    }

    AccessibilityInfo.announceForAccessibility(next.text);
    const duration = Math.max(FLOOR_MS, next.text.length * this.charDurationMs);
    this.speakingTimer = setTimeout(this.flushNext, duration);
  };
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 1;
  return Math.max(0, Math.min(1, n));
}

function clampRate(n: number): number {
  if (Number.isNaN(n)) return 1;
  // Min 0.1 = lentísimo (apenas usable), max 6.0 = rapidísimo. Por encima
  // de lo que el motor soporte se queda en el tope del motor sin error.
  return Math.max(0.1, Math.min(6, n));
}

function clampPitch(n: number): number {
  if (Number.isNaN(n)) return 1;
  return Math.max(0.5, Math.min(2, n));
}

export const speechQueue = new SpeechQueueService();
