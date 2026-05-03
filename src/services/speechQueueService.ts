import { AccessibilityInfo } from 'react-native';
import Tts from 'react-native-tts';
import { AppSettings, DEFAULT_SETTINGS, loadSettings } from '../storage/settingsStorage';

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
// Coalesce high-priority enqueues que llegan en ráfaga (típicamente desde
// `typingAnnounce`: cada keystroke es un enqueue 'high'). Sin esto, tecleo
// rápido genera N×Tts.stop()+Tts.speak()/seg y los `tts-cancel` de las
// utterances anuladas pisaban `isSpeakingTts` de las nuevas. Con coalesce,
// varias high consecutivas <40ms colapsan a una sola: el usuario solo oye
// la última, el motor recibe un único stop+speak.
const HIGH_COALESCE_MS = 40;
// Watchdog: si `isSpeakingTts` lleva true demasiado tiempo sin que llegue
// `tts-finish` (engine murió, evento perdido, listener desuscrito), se
// resetea y se reanuda la cola. 120s cubre líneas largas a 0.5x.
const SPEAKING_WATCHDOG_MS = 120_000;

export type SpeechPriority = 'high' | 'normal' | 'low';
type Backend = 'talkback' | 'tts';

interface QueueItem {
  text: string;
  priority: SpeechPriority;
}

class SpeechQueueService {
  private queue: QueueItem[] = [];
  private speakingTimer: ReturnType<typeof setTimeout> | null = null;
  private isSpeakingTts = false; // true entre Tts.speak() y tts-finish/cancel
  // Prioridad de la utterance que se está hablando ahora mismo. Permite a
  // `clear({ keepHighPriority: true })` decidir si cortar o no la voz en
  // curso (el comando del usuario no debe pisar un anuncio crítico).
  private currentlySpeakingPriority: SpeechPriority | null = null;
  private charDurationMs = DEFAULT_CHAR_DURATION_MS;
  private screenReaderEnabled = false;
  private useSelfVoicing = false;
  private uiMode: 'completo' | 'blind' = 'completo';
  private ttsVolume = DEFAULT_SETTINGS.ttsVolume;
  private ttsReady = false;
  private duckingOn = false;
  private maxQueueSize = 10;
  // Coalesce timer + buffer de la última high pendiente.
  private highCoalesceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingHighText: string | null = null;
  // Contador de Tts.stop() iniciados por nosotros que aún no han producido
  // su correspondiente tts-cancel. Cada Tts.stop() emite eventualmente un
  // tts-cancel (asíncrono); si entretanto iniciamos un Tts.speak nuevo, su
  // listener vería ese cancel viejo y pisaría isSpeakingTts=false aunque la
  // nueva utterance siga en marcha. Con este contador, cancels esperados
  // por nuestro propio stop se descartan en silencio. Cancels reales (audio
  // focus loss, engine error) llegan con counter==0 y se procesan.
  private pendingStopCount = 0;
  private speakingWatchdog: ReturnType<typeof setTimeout> | null = null;
  // applyConfig serialization. Llamadas rápidas desde Settings (mover slider
  // pitch + cambiar voz) pueden interleavar setDefault* del motor, dejando
  // estado raro. Encadenamos las invocaciones.
  private applyConfigChain: Promise<void> = Promise.resolve();
  // Aviso una sola vez por sesión cuando dropeamos por lector externo en
  // backend tts — sin esto el dev queda ciego ante el silencio.
  private warnedScreenReaderDrop = false;

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
      // Reset del warn cuando cambia el estado, para que vuelva a salir si
      // se reinstala el conflicto en una sesión larga.
      this.warnedScreenReaderDrop = false;
    });

    // TTS event listeners — wire una sola vez. La inicialización del motor
    // (Tts.getInitStatus) ocurre lazy en applyConfig() la primera vez que
    // entramos en modo self-voicing.
    Tts.addEventListener('tts-finish', () => {
      // tts-finish solo se emite para utterances que terminaron solas (sin
      // stop). No hay race con stops nuestros — siempre es nuestra speak en
      // curso. Si llegara espurio (estado limpio), es no-op porque
      // `isSpeakingTts` ya es false.
      if (!this.isSpeakingTts) return;
      this.markUtteranceEnded();
      this.flushNext();
    });
    Tts.addEventListener('tts-cancel', () => {
      if (this.pendingStopCount > 0) {
        // Cancel auto-iniciado por un Tts.stop() nuestro. Ya limpiamos el
        // estado local de forma síncrona en clear()/preemptAndSpeak — solo
        // descontamos el counter para que un cancel REAL futuro (audio
        // focus, engine crash) sí procese.
        this.pendingStopCount--;
        return;
      }
      // Cancel externo: engine perdió focus, OS lo paró, etc. Tratamos como
      // utterance terminada para no quedar atascados.
      if (!this.isSpeakingTts) return;
      this.markUtteranceEnded();
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
   *
   * Las llamadas se serializan internamente — si dos applyConfig caen muy
   * seguidas (slider rápido en Settings), la segunda espera a que termine
   * la primera antes de tocar el motor.
   */
  applyConfig(settings: AppSettings): Promise<void> {
    const next = this.applyConfigChain
      .catch(() => {})
      .then(() => this.doApplyConfig(settings));
    this.applyConfigChain = next;
    return next;
  }

  private async doApplyConfig(settings: AppSettings): Promise<void> {
    if (typeof settings.speechCharDurationMs === 'number') {
      this.charDurationMs = Math.max(1, settings.speechCharDurationMs);
    }

    const before = this.activeBackend();
    this.useSelfVoicing = !!settings.useSelfVoicing;
    this.uiMode = settings.uiMode;
    this.ttsVolume = clamp01(settings.ttsVolume ?? DEFAULT_SETTINGS.ttsVolume);
    const after = this.activeBackend();

    if (before !== after) {
      this.clear();
      // Salimos de tts → desactivar ducking para no dejar el flag puesto
      // (Android lo respeta para futuras llamadas a Tts.speak, aunque no
      // estemos hablando ahora; cero impacto pero conviene limpieza).
      if (before === 'tts' && this.duckingOn) {
        try { await Tts.setDucking(false); } catch (_) { /* ignore */ }
        this.duckingOn = false;
      }
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
      } catch (e) {
        // Motor TTS no disponible — la app debería avisar al usuario, pero
        // a nivel de servicio simplemente no podemos hablar. Dejamos
        // ttsReady=false; flushNext caerá silenciosamente cuando intente.
        return;
      }
    }
    // Ducking automático: cuando el TTS habla, Android baja temporalmente
    // el volumen de otras apps de audio (música ambient, juegos). Al
    // terminar el utterance, restaura. Hace que la voz se entienda sobre
    // la música de fondo sin necesidad de pausar manualmente.
    // (`setDucking` es one-shot global del SDK, no por-utterance.)
    if (!this.duckingOn) {
      try {
        await Tts.setDucking(true);
        this.duckingOn = true;
      } catch (_) { /* SDK puede no exponerlo */ }
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
    if (backend === 'tts' && this.screenReaderEnabled) {
      if (!this.warnedScreenReaderDrop) {
        console.warn('[speechQueue] backend=tts con lector externo activo — anuncios bloqueados hasta que se desactive el lector.');
        this.warnedScreenReaderDrop = true;
      }
      return;
    }

    if (priority === 'high') {
      // Coalescing: en lugar de speak inmediato, guardamos el texto y
      // programamos un timer corto. Si llegan más high en la ventana, el
      // texto se reemplaza pero el timer no se reprograma — solo cuando
      // expira hacemos el atropello real (clear queue + Tts.stop + speak).
      // Esto colapsa ráfagas de typingAnnounce y reduce la presión sobre
      // el motor.
      this.pendingHighText = trimmed;
      if (this.highCoalesceTimer) return;
      this.highCoalesceTimer = setTimeout(() => {
        this.highCoalesceTimer = null;
        const text = this.pendingHighText;
        this.pendingHighText = null;
        if (!text) return;
        this.preemptAndSpeak(text);
      }, HIGH_COALESCE_MS);
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

  /**
   * Vacía la cola. Si se pasa `keepHighPriority`, los items con priority
   * 'high' se mantienen y, si lo que está hablando ahora es 'high', no se
   * corta la voz. Útil para que `sendCommand` del Terminal limpie el ruido
   * (líneas de MUD acumuladas) sin pisar avisos críticos (vitales bajos,
   * errores).
   */
  clear(options?: { keepHighPriority?: boolean }): void {
    if (options?.keepHighPriority) {
      this.queue = this.queue.filter((item) => item.priority === 'high');
      // Si la utterance en curso es high, no la cortes. La cola con solo
      // highs continuará tras tts-finish.
      if (this.currentlySpeakingPriority === 'high') return;
    } else {
      this.queue.length = 0;
    }
    if (this.speakingTimer) {
      clearTimeout(this.speakingTimer);
      this.speakingTimer = null;
    }
    if (this.highCoalesceTimer) {
      clearTimeout(this.highCoalesceTimer);
      this.highCoalesceTimer = null;
      this.pendingHighText = null;
    }
    if (this.activeBackend() === 'tts') {
      this.stopTts();
    }
  }

  /**
   * Habla un texto fuera de cola, ignorando estado actual. Útil para botón
   * "Probar voz" en Settings — no queremos meter eso en la cola normal.
   * Internamente sigue usando el mismo motor, así que se serializa con la
   * cola: si había algo hablando lo atropella, y el siguiente item de la
   * cola sigue después como cualquier otro.
   */
  preview(text: string): void {
    // Si hay lector externo on, evitar disparar el TTS propio aunque estemos
    // en backend tts: caería atropellado por el lector. announceForAccessibility
    // hará que el lector externo lo lea — el usuario al menos oye algo.
    if (this.activeBackend() === 'tts' && this.ttsReady && !this.screenReaderEnabled) {
      this.preemptAndSpeak(text, 'normal');
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
    } as any;
  }

  /**
   * Atropello explícito: limpia cola + cancela utterance en curso + habla
   * el texto pasado. Usado por priority='high' tras coalesce y por
   * `preview()`.
   */
  private preemptAndSpeak(text: string, priority: SpeechPriority = 'high'): void {
    this.queue.length = 0;
    if (this.speakingTimer) {
      clearTimeout(this.speakingTimer);
      this.speakingTimer = null;
    }
    if (this.activeBackend() === 'tts') {
      this.stopTts();
    }
    this.queue.push({ text, priority });
    this.flushNext();
  }

  private stopTts(): void {
    // Solo contamos pendingStop si había algo en marcha — un Tts.stop()
    // sobre el motor ya parado no produce tts-cancel.
    if (this.isSpeakingTts) {
      this.pendingStopCount++;
    }
    Tts.stop();
    this.markUtteranceEnded();
  }

  private flushNext = (): void => {
    const next = this.queue.shift();
    if (!next) {
      this.speakingTimer = null;
      this.markUtteranceEnded();
      return;
    }

    const backend = this.activeBackend();
    if (backend === 'tts') {
      if (!this.ttsReady) {
        // No deberíamos llegar aquí (enqueue lo gatea), pero si pasa, no
        // caigamos al path talkback — sería ruido. Drop y avanzar.
        this.flushNext();
        return;
      }
      this.speakNow(next);
      return;
    }

    AccessibilityInfo.announceForAccessibility(next.text);
    this.currentlySpeakingPriority = next.priority;
    const duration = Math.max(FLOOR_MS, next.text.length * this.charDurationMs);
    this.speakingTimer = setTimeout(() => {
      this.speakingTimer = null;
      this.currentlySpeakingPriority = null;
      this.flushNext();
    }, duration);
  };

  private speakNow(item: QueueItem): void {
    this.isSpeakingTts = true;
    this.currentlySpeakingPriority = item.priority;
    this.armSpeakingWatchdog();
    let result: any;
    try {
      result = Tts.speak(item.text, this.ttsSpeakOpts());
    } catch (e) {
      console.warn('[speechQueue] Tts.speak threw:', e);
      this.markUtteranceEnded();
      this.flushNext();
      return;
    }
    Promise.resolve(result).catch((e) => {
      // El motor rechazó la utterance (engine inicializando, OOM raro,
      // texto demasiado largo en algunos motores). Sin este catch nos
      // quedamos con isSpeakingTts=true para siempre y la cola atascada.
      if (!this.isSpeakingTts) return; // ya manejado por otro path
      console.warn('[speechQueue] Tts.speak rejected:', e);
      this.markUtteranceEnded();
      this.flushNext();
    });
  }

  private markUtteranceEnded(): void {
    this.isSpeakingTts = false;
    this.currentlySpeakingPriority = null;
    if (this.speakingWatchdog) {
      clearTimeout(this.speakingWatchdog);
      this.speakingWatchdog = null;
    }
  }

  private armSpeakingWatchdog(): void {
    if (this.speakingWatchdog) clearTimeout(this.speakingWatchdog);
    this.speakingWatchdog = setTimeout(() => {
      // Si llegamos aquí es que tts-finish/cancel no llegó nunca para esta
      // utterance — engine murió, evento perdido, listener desuscrito.
      // Reseteamos y avanzamos para no dejar la cola bloqueada.
      console.warn('[speechQueue] speaking watchdog fired — engine no respondió, reset.');
      this.markUtteranceEnded();
      this.flushNext();
    }, SPEAKING_WATCHDOG_MS);
  }
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
