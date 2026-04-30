import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { Audio } from 'expo-av';
import Sound from 'react-native-sound';
import { getCustomSoundUri } from '../storage/customSoundsStorage';
import { loadSettings } from '../storage/settingsStorage';

// react-native-sound needs to know the audio category before any sound is
// loaded. 'Playback' is the right one for trigger sounds (mixes with system
// audio, plays in silent mode = no, plays through the speaker). One-time
// init at module load.
Sound.setCategory('Playback');

const CUSTOM_PREFIX = 'custom:';
const BUILTIN_PREFIX = 'builtin:';

const soundModules = {
  'bloqueos/bloqueo-termina.wav': require('../../assets/sounds/bloqueos/bloqueo-termina.wav'),
  'combate/pierdes-concentracion.wav': require('../../assets/sounds/combate/pierdes-concentracion.wav'),
  'hechizos/preparas.wav': require('../../assets/sounds/hechizos/preparas.wav'),
  'hechizos/formulando.wav': require('../../assets/sounds/hechizos/formulando.wav'),
  'hechizos/resiste.wav': require('../../assets/sounds/hechizos/resiste.wav'),
  'hechizos/fuera-rango.wav': require('../../assets/sounds/hechizos/fuera-rango.wav'),
  'hechizos/imagenes-off.wav': require('../../assets/sounds/hechizos/imagenes-off.wav'),
  'hechizos/imagenes-up.wav': require('../../assets/sounds/hechizos/imagenes-up.wav'),
  'hechizos/piel-piedra-on.wav': require('../../assets/sounds/hechizos/piel-piedra-on.wav'),
  'combate/impacto.wav': require('../../assets/sounds/combate/impacto.wav'),
  'combate/esquivado.wav': require('../../assets/sounds/combate/esquivado.wav'),
  'combate/bloqueado.wav': require('../../assets/sounds/combate/bloqueado.wav'),
  'combate/objetivo-perdido.wav': require('../../assets/sounds/combate/objetivo-perdido.wav'),
  'combate/interrumpido.wav': require('../../assets/sounds/combate/interrumpido.wav'),
  'combate/critico.wav': require('../../assets/sounds/combate/critico.wav'),
  'combate/golpe-lanzas.wav': require('../../assets/sounds/combate/golpe-lanzas.wav'),
  'combate/golpe-recibes.wav': require('../../assets/sounds/combate/golpe-recibes.wav'),
  'combate/muerte-propia.wav': require('../../assets/sounds/combate/muerte-propia.wav'),
  'combate/muerte-otro.wav': require('../../assets/sounds/combate/muerte-otro.wav'),
  'combate/hemorragia.wav': require('../../assets/sounds/combate/hemorragia.wav'),
  'combate/cicatrizar.wav': require('../../assets/sounds/combate/cicatrizar.wav'),
  'combate/incapacitado.wav': require('../../assets/sounds/combate/incapacitado.wav'),
  'combate/alerta.wav': require('../../assets/sounds/combate/alerta.wav'),
  'combate/alerta-vida-50.wav': require('../../assets/sounds/combate/alerta-vida-50.wav'),
  'combate/alerta-vida-30.wav': require('../../assets/sounds/combate/alerta-vida-30.wav'),
  'combate/alerta-vida-10.wav': require('../../assets/sounds/combate/alerta-vida-10.wav'),
  'eventos/muerte.wav': require('../../assets/sounds/eventos/muerte.wav'),
  'eventos/victoria.wav': require('../../assets/sounds/eventos/victoria.wav'),
  'eventos/xp.wav': require('../../assets/sounds/eventos/xp.wav'),
  'eventos/curacion.wav': require('../../assets/sounds/eventos/curacion.wav'),
} as const;

interface SoundContextType {
  soundCache: Map<string, Audio.Sound>;
  isReady: boolean;
  // `pan` is in [-1, 1] (-1 hard left, 0 centre, +1 hard right). Honoured
  // for CUSTOM sounds via react-native-sound (D-4 of the Movement plan).
  // Builtins with non-zero pan fall back to centred and log a warning —
  // rewrapping the warmed expo-av cache via a second library would defeat
  // the warmup. Practically, the Movement pack uses custom sounds for all
  // its directional triggers so this limitation is invisible in the
  // intended use case.
  playSound: (soundKey: string, pan?: number) => Promise<void>;
  prepareSounds: () => Promise<void>;
  // Multiplica el volumen de cada `play_sound` de trigger antes de
  // reproducirlo. Rango [0, 1]. La pantalla "Mis ambientes" lo actualiza
  // cuando el usuario mueve el +/- de "Volumen efectos". El kill-switch
  // (silentModeEnabled) se aplica antes y sigue mandando.
  setEffectsVolume: (v: number) => void;
}

const SoundContext = createContext<SoundContextType | undefined>(undefined);

export function SoundProvider({ children }: { children: React.ReactNode }) {
  const [soundCache, setSoundCache] = useState<Map<string, Audio.Sound>>(new Map());
  const [isReady, setIsReady] = useState(false);
  const soundCacheRef = useRef<Map<string, Audio.Sound>>(new Map());
  const isReadyRef = useRef(false);
  const loadingRef = useRef(false);
  // Volume multiplier for trigger sounds. Read in playSound on every call
  // so updates from setEffectsVolume apply immediately without a rerender.
  // Default 0.7 mirrors the storage default; if loadSettings comes back
  // with something different we update the ref.
  const effectsVolumeRef = useRef<number>(0.7);

  const setEffectsVolume = useCallback((v: number) => {
    effectsVolumeRef.current = Math.max(0, Math.min(1, v));
  }, []);

  const prepareSounds = useCallback(async () => {
    if (isReadyRef.current || loadingRef.current) return;
    loadingRef.current = true;
    try {
      const cache = new Map<string, Audio.Sound>();

      // Load each sound at volume 0 — keeps the warmup-play below silent
      // without needing a separate setVolumeAsync call. Real plays restore
      // volume in `playSound()` before triggering playAsync().
      for (const [soundPath, module] of Object.entries(soundModules)) {
        try {
          const { sound } = await Audio.Sound.createAsync(module, { volume: 0 });
          cache.set(soundPath, sound);
        } catch (e) {
          console.warn(`[SoundContext] Failed to preload ${soundPath}: ${e}`);
        }
      }

      setSoundCache(cache);
      soundCacheRef.current = cache;

      // Warmup: play each preloaded sound at volume 0 to prime Android's
      // AudioTrack pipeline. The original code restored volume to 1 right
      // after playAsync(), which caused the warmup to be audible — playAsync
      // resolves when playback STARTS, not when it ends, so the volume jump
      // happened mid-playback. Now we leave volume at 0 and rely on
      // `playSound()` to restore it for real plays.
      for (const [soundPath, sound] of cache.entries()) {
        try {
          await sound.setPositionAsync(0);
          await sound.playAsync();
        } catch (e) {
          console.warn(`[SoundContext] Failed to warm up ${soundPath}: ${e}`);
        }
      }

      isReadyRef.current = true;
      setIsReady(true);
    } catch (e) {
      console.error(`[SoundContext] Initialization error: ${e}`);
    } finally {
      loadingRef.current = false;
    }
  }, []);

  // Audio mode + preload run UNCONDITIONALLY on mount, regardless of the
  // `soundsEnabled` setting. Reasons:
  //  - Custom sounds (Audio.Sound.createAsync({uri:...}) for each play) need
  //    setAudioModeAsync to have run, otherwise the first playback after a
  //    fresh install is silent on Android even though no error is thrown.
  //  - The "Probar" buttons in Mis sonidos / TriggerEditModal don't check
  //    the soundsEnabled toggle — users expect them to work. The toggle
  //    only gates whether triggers fire automatically (handled in
  //    TerminalScreen via silentModeEnabledRef).
  // Cost: ~5 MB of decoded wavs resident in memory after warmup. Acceptable
  // for a MUD client.
  useEffect(() => {
    // Inicialización secuencial: setAudioModeAsync DEBE terminar antes
    // del warmup, si no las primeras play() pueden caer en
    // AudioFocusNotAcquiredException porque expo-av todavía no sabe
    // que aceptamos audio en background. La versión anterior corría
    // los tres en paralelo (sin await) y el preload perdía la carrera
    // en device lentos.
    //
    // Modo audio:
    //   - interruptionModeAndroid=2 (DuckOthers): expo-av no pide focus
    //     exclusivo, lo que permite a `react-native-sound` (la lib del
    //     pan) coexistir sin AudioFocusNotAcquiredException entre ellas.
    //   - staysActiveInBackground=true: el foreground service mantiene
    //     el proceso vivo durante la sesión MUD, pero sin esta opción
    //     expo-av rechaza el play cuando la activity no está visible
    //     (típico al cambiar de app sin desconectar). Con true, los
    //     triggers siguen sonando aunque el usuario tenga otra app
    //     delante. El ambient lo gestionamos aparte vía AppState.
    //   - shouldDuckAndroid=true: si Spotify/etc. está sonando, lo
    //     atenuamos en vez de cortarlo cuando reproducimos.
    (async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
          interruptionModeAndroid: 2,
        });
      } catch (e) {
        console.warn(`[SoundContext] setAudioModeAsync failed: ${e}`);
      }

      prepareSounds().catch((e) => console.warn(`[SoundContext] prepareSounds failed: ${e}`));

      // Seed effectsVolume from persisted settings. Subsequent changes from
      // "Mis ambientes" call setEffectsVolume directly — this initial load
      // keeps the volume coherent across app restarts.
      try {
        const s = await loadSettings();
        if (typeof s.effectsVolume === 'number') {
          effectsVolumeRef.current = Math.max(0, Math.min(1, s.effectsVolume));
        }
      } catch {}
    })();
  }, [prepareSounds]);

  const playSound = useCallback(async (soundKey: string, pan?: number) => {
    // Stereo-balance handling: when `pan` is non-zero we route the playback
    // through react-native-sound (which exposes setPan), otherwise we use
    // the existing expo-av path (cache + warmup for builtins, on-demand
    // load for customs). Centred plays keep the existing fast path —
    // crucial because the builtin cache holds preloaded Audio.Sound
    // instances that we don't want to throw away. Pan is only honoured for
    // CUSTOM sounds (the Movement pack uses customs); builtins with pan
    // ≠ 0 fall back to centred and emit a warning since rewriting the
    // builtin cache through react-native-sound would defeat the warmup.
    try {
      if (!soundKey) return;
      const wantsPan = pan !== undefined && pan !== 0;
      // Volume scalar applied to every trigger sound. Read from ref so
      // updates from "Mis ambientes" take effect on the very next play.
      const fxVol = effectsVolumeRef.current;

      if (soundKey.startsWith(CUSTOM_PREFIX)) {
        const filename = soundKey.slice(CUSTOM_PREFIX.length);
        const uri = getCustomSoundUri(filename);
        if (!uri) {
          console.warn(`[SoundContext.playSound] Custom sound not found: ${filename}`);
          return;
        }

        if (wantsPan) {
          // react-native-sound expects a filesystem path WITHOUT the
          // file:// scheme. The clamp protects against malformed callers
          // even though the wizard already restricts the value to [-1, 1].
          const path = uri.replace(/^file:\/\//, '');
          const clamped = Math.max(-1, Math.min(1, pan!));

          // Single fallback path used by every error branch (load fail,
          // sync constructor throw, play() throw): plays centred via
          // expo-av. We accept losing the directional info to guarantee
          // the user hears SOMETHING. AudioFocusNotAcquiredException is
          // the most common cause on Android when another lib holds focus.
          const fallbackToExpoAv = () => {
            Audio.Sound.createAsync({ uri }, { volume: fxVol })
              .then(({ sound: avSound }) => {
                avSound.playAsync();
                setTimeout(() => avSound.unloadAsync().catch(() => {}), 8000);
              })
              .catch((e) => console.warn(`[SoundContext] expo-av fallback failed: ${e}`));
          };

          try {
            const sound = new Sound(path, '', (err) => {
              if (err) {
                console.warn(
                  `[SoundContext.playSound] react-native-sound load failed (${filename}): ${err.message}. Falling back to centred expo-av play.`,
                );
                fallbackToExpoAv();
                return;
              }
              try {
                sound.setVolume(fxVol);
                sound.setPan(clamped);
                sound.play((success) => {
                  if (!success) {
                    console.warn(`[SoundContext.playSound] react-native-sound play returned !success for ${filename}, falling back.`);
                    sound.release();
                    fallbackToExpoAv();
                    return;
                  }
                  sound.release();
                });
              } catch (playErr) {
                console.warn(`[SoundContext.playSound] react-native-sound play threw: ${playErr}, falling back.`);
                try { sound.release(); } catch {}
                fallbackToExpoAv();
              }
            });
          } catch (ctorErr) {
            console.warn(`[SoundContext.playSound] new Sound() threw: ${ctorErr}, falling back.`);
            fallbackToExpoAv();
          }
          return;
        }

        // No pan — keep the existing expo-av path so we don't double-load
        // the same wav through two different libraries on every play.
        const { sound } = await Audio.Sound.createAsync({ uri }, { volume: fxVol });
        await sound.playAsync();
        setTimeout(() => sound.unloadAsync().catch(() => {}), 8000);
        return;
      }

      const path = soundKey.startsWith(BUILTIN_PREFIX)
        ? soundKey.slice(BUILTIN_PREFIX.length)
        : soundKey;

      if (!soundCacheRef.current.has(path)) {
        return;
      }

      if (wantsPan) {
        // Builtins with pan: documented limitation — the cache holds
        // expo-av instances and rewrapping each builtin through
        // react-native-sound would lose the warmup. The Movement pack
        // (the main consumer of pan) uses custom sounds, so this only
        // affects user-authored triggers that point a builtin to a
        // panned action.
        console.warn(
          `[SoundContext.playSound] pan=${pan} ignored for builtin "${path}" — pan is only honoured on custom sounds.`,
        );
      }

      const sound = soundCacheRef.current.get(path)!;
      // Apply the effects volume scalar; warmup left it at 0. setVolumeAsync
      // awaits before playAsync runs so the new volume is in effect when
      // playback (re)starts.
      await sound.setVolumeAsync(fxVol);
      await sound.setPositionAsync(0);
      await sound.playAsync();
    } catch (e) {
      console.error(`[SoundContext.playSound] Error: ${e}`);
    }
  }, []);

  return (
    <SoundContext.Provider value={{ soundCache, isReady, playSound, prepareSounds, setEffectsVolume }}>
      {children}
    </SoundContext.Provider>
  );
}

export function useSounds() {
  const context = useContext(SoundContext);
  if (!context) {
    throw new Error('useSounds must be used within SoundProvider');
  }
  return context;
}
