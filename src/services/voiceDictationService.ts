import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import type {
  ExpoSpeechRecognitionResultEvent,
  ExpoSpeechRecognitionErrorEvent,
} from 'expo-speech-recognition';
import { speechQueue } from './speechQueueService';

// Push-to-talk dictado para modo blind+self-voicing. El consumer (gesto de
// 3 dedos en TerminalScreen) llama `start(...)` al detectar la dirección,
// mantiene la sesión mientras los dedos están abajo y llama `stop()` al
// release para obtener el texto final.
//
// Doctrina:
//   - Una sola sesión activa a la vez. Llamar start() con sesión existente
//     la cancela primero.
//   - speechQueue se suspende al start (silencio total para que el mic no
//     grabe al propio TTS) y se reanuda en stop/cancel.
//   - El recognizer no es continuo en Android — corta solo al detectar
//     silencio. Para nuestro modelo push-to-talk eso da igual: el "final"
//     lo marca el release del usuario, no el endpoint del recognizer. Si
//     el recognizer corta antes de tiempo (silencio mid-frase), guardamos
//     ese resultado parcial-final como fallback y `stop()` lo devuelve.
//   - Permiso RECORD_AUDIO se pide la primera vez. Si el usuario lo niega,
//     `start()` falla con error 'permission'.

export type DictationErrorKind =
  | 'unavailable'      // isRecognitionAvailable() = false (sin servicio)
  | 'permission'       // RECORD_AUDIO denegado
  | 'language'         // lang no soportado / no instalado offline
  | 'busy'             // ya hay sesión activa
  | 'engine';          // otros errores del motor

export interface DictationStartOptions {
  lang?: string;                 // BCP-47, default 'es-ES'
  onReady?: () => void;          // emitido cuando recognizer ya escucha (audiostart/speechstart)
  onError?: (kind: DictationErrorKind, message: string) => void;
}

export interface DictationResult {
  text: string;           // texto final acumulado, sin trim trailing
  hadAudio: boolean;      // true si llegó al menos un evento de audio
}

class VoiceDictationService {
  private active = false;
  private listeners: Array<{ remove: () => void }> = [];
  private lastFinalText = '';
  private lastInterimText = '';
  private hadAudio = false;
  private startResolve: (() => void) | null = null;
  private startReject: ((err: { kind: DictationErrorKind; message: string }) => void) | null = null;
  private readyAnnounced = false;
  private onReadyCallback: (() => void) | null = null;
  private onErrorCallback: ((kind: DictationErrorKind, message: string) => void) | null = null;

  /**
   * Comprueba si el dispositivo expone un servicio de reconocimiento
   * compatible. En Android es servicio de SpeechRecognizer del sistema
   * (Google App casi siempre presente; en móviles sin servicios Google
   * puede faltar).
   */
  isAvailable(): boolean {
    try {
      return ExpoSpeechRecognitionModule.isRecognitionAvailable();
    } catch (_) {
      return false;
    }
  }

  /**
   * Inicia una sesión de dictado. Resuelve cuando el comando `start` ha
   * sido aceptado por el motor (no necesariamente cuando ya escucha — eso
   * se notifica por `onReady`). Rechaza si falla la inicialización
   * (permiso, sin servicio, idioma no soportado, etc).
   */
  async start(opts: DictationStartOptions = {}): Promise<void> {
    if (this.active) {
      const kind: DictationErrorKind = 'busy';
      throw { kind, message: 'Sesión de dictado ya activa' };
    }
    if (!this.isAvailable()) {
      const kind: DictationErrorKind = 'unavailable';
      throw { kind, message: 'Reconocimiento de voz no disponible en este dispositivo' };
    }

    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      const kind: DictationErrorKind = 'permission';
      throw { kind, message: 'Permiso de micrófono denegado' };
    }

    this.active = true;
    this.lastFinalText = '';
    this.lastInterimText = '';
    this.hadAudio = false;
    this.readyAnnounced = false;
    this.onReadyCallback = opts.onReady ?? null;
    this.onErrorCallback = opts.onError ?? null;

    // Silenciar TTS y acumular en cola lo que llegue durante la captura.
    speechQueue.setSuspended(true);

    this.attachListeners();

    try {
      ExpoSpeechRecognitionModule.start({
        lang: opts.lang ?? 'es-ES',
        interimResults: true,
        continuous: false,
        // Sin maxAlternatives — un solo candidato basta.
      });
    } catch (e: any) {
      this.cleanup();
      const kind: DictationErrorKind = 'engine';
      throw { kind, message: e?.message ?? String(e) };
    }
  }

  /**
   * Cierra la sesión y devuelve el texto acumulado. Si no se ha capturado
   * audio o resultado, retorna `{ text: '', hadAudio: false }` y el caller
   * decide qué hacer (típicamente: no enviar nada).
   *
   * Resuelve cuando llega el evento `end` del recognizer, con timeout de
   * 1500ms — si el motor no emite `end` (engine roto), salimos con lo que
   * tengamos para no dejar al usuario colgado.
   */
  async stop(): Promise<DictationResult> {
    if (!this.active) return { text: '', hadAudio: false };

    return new Promise<DictationResult>((resolve) => {
      const finalize = () => {
        // Tomamos el final si existe, sino el último interim como mejor
        // aproximación (sucede cuando el usuario suelta antes de que el
        // motor confirme el resultado).
        const text = (this.lastFinalText || this.lastInterimText || '').trim();
        const hadAudio = this.hadAudio;
        this.cleanup();
        resolve({ text, hadAudio });
      };

      const watchdog = setTimeout(() => {
        console.warn('[voiceDictation] stop watchdog (1500ms sin end) — saliendo.');
        finalize();
      }, 1500);

      const endSub = ExpoSpeechRecognitionModule.addListener('end', () => {
        clearTimeout(watchdog);
        endSub.remove();
        finalize();
      });
      this.listeners.push(endSub);

      try {
        ExpoSpeechRecognitionModule.stop();
      } catch (_) {
        clearTimeout(watchdog);
        endSub.remove();
        finalize();
      }
    });
  }

  /**
   * Cancela sin devolver texto. Útil si el usuario rota la pantalla,
   * pierde foco, o nos quedamos atascados.
   */
  cancel(): void {
    if (!this.active) return;
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch (_) { /* ignore */ }
    this.cleanup();
  }

  isActive(): boolean {
    return this.active;
  }

  private attachListeners(): void {
    const onStart = ExpoSpeechRecognitionModule.addListener('start', () => {
      // start = comando aceptado por el motor; aún no escucha mic.
    });
    const onAudioStart = ExpoSpeechRecognitionModule.addListener('audiostart', () => {
      this.markReady();
    });
    const onSpeechStart = ExpoSpeechRecognitionModule.addListener('speechstart', () => {
      // Por si audiostart no llegó (algunos motores).
      this.markReady();
    });
    const onResult = ExpoSpeechRecognitionModule.addListener('result', (evt: ExpoSpeechRecognitionResultEvent) => {
      this.hadAudio = true;
      const top = evt.results?.[0];
      const transcript = top?.transcript ?? '';
      if (evt.isFinal) {
        this.lastFinalText = transcript;
        this.lastInterimText = '';
      } else {
        this.lastInterimText = transcript;
      }
    });
    const onError = ExpoSpeechRecognitionModule.addListener('error', (evt: ExpoSpeechRecognitionErrorEvent) => {
      // Errores comunes en Android: 'no-speech' (silencio), 'audio-capture',
      // 'language-not-supported'. Para 'no-speech' (= silencio total) NO
      // emitimos error al consumer — es el caso típico de "el usuario soltó
      // sin hablar", se maneja como texto vacío.
      if (evt.error === 'no-speech') return;
      const kind = mapErrorKind(evt.error);
      if (this.onErrorCallback) this.onErrorCallback(kind, evt.message ?? evt.error);
    });
    this.listeners.push(onStart, onAudioStart, onSpeechStart, onResult, onError);
  }

  private markReady(): void {
    if (this.readyAnnounced) return;
    this.readyAnnounced = true;
    if (this.onReadyCallback) {
      try { this.onReadyCallback(); } catch (_) { /* ignore */ }
    }
  }

  private cleanup(): void {
    this.active = false;
    this.readyAnnounced = false;
    this.onReadyCallback = null;
    this.onErrorCallback = null;
    for (const sub of this.listeners) {
      try { sub.remove(); } catch (_) { /* ignore */ }
    }
    this.listeners = [];
    speechQueue.setSuspended(false);
  }
}

function mapErrorKind(error: string): DictationErrorKind {
  if (error === 'not-allowed' || error === 'permissions' || error === 'service-not-allowed') return 'permission';
  if (error === 'language-not-supported') return 'language';
  if (error === 'audio-capture' || error === 'network' || error === 'busy') return 'engine';
  return 'engine';
}

export const voiceDictation = new VoiceDictationService();
