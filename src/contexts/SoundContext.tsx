import React, { createContext, useContext, useEffect, useRef, useCallback } from 'react';
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

interface SoundContextType {
  // `pan` is in [-1, 1] (-1 hard left, 0 centre, +1 hard right). Honoured
  // for CUSTOM sounds via react-native-sound. Refs without the `custom:`
  // prefix (e.g. legacy `builtin:*` from packs imported in older builds)
  // fall through as silent no-ops.
  playSound: (soundKey: string, pan?: number) => Promise<void>;
  // Multiplica el volumen de cada `play_sound` de trigger antes de
  // reproducirlo. Rango [0, 1]. La pantalla "Mis ambientes" lo actualiza
  // cuando el usuario mueve el +/- de "Volumen efectos". El kill-switch
  // (silentModeEnabled) se aplica antes y sigue mandando.
  setEffectsVolume: (v: number) => void;
}

const SoundContext = createContext<SoundContextType | undefined>(undefined);

export function SoundProvider({ children }: { children: React.ReactNode }) {
  // Volume multiplier for trigger sounds. Read in playSound on every call
  // so updates from setEffectsVolume apply immediately without a rerender.
  // Default 0.7 mirrors the storage default; if loadSettings comes back
  // with something different we update the ref.
  const effectsVolumeRef = useRef<number>(0.7);

  const setEffectsVolume = useCallback((v: number) => {
    effectsVolumeRef.current = Math.max(0, Math.min(1, v));
  }, []);

  // Audio mode init runs UNCONDITIONALLY on mount. Custom sounds
  // (Audio.Sound.createAsync({uri:...}) for each play) need
  // setAudioModeAsync to have run, otherwise the first playback after a
  // fresh install is silent on Android even though no error is thrown.
  useEffect(() => {
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
  }, []);

  const playSound = useCallback(async (soundKey: string, pan?: number) => {
    // Stereo-balance handling: when `pan` is non-zero we route the playback
    // through react-native-sound (which exposes setPan), otherwise we use
    // expo-av on-demand. Refs without the `custom:` prefix fall through as
    // silent no-ops (legacy `builtin:*` from packs imported in older
    // builds — the audio for those is no longer bundled).
    try {
      if (!soundKey) return;
      if (!soundKey.startsWith(CUSTOM_PREFIX)) return;

      const wantsPan = pan !== undefined && pan !== 0;
      // Volume scalar applied to every trigger sound. Read from ref so
      // updates from "Mis ambientes" take effect on the very next play.
      const fxVol = effectsVolumeRef.current;

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

      // No pan — use expo-av on-demand.
      const { sound } = await Audio.Sound.createAsync({ uri }, { volume: fxVol });
      await sound.playAsync();
      setTimeout(() => sound.unloadAsync().catch(() => {}), 8000);
    } catch (e) {
      console.error(`[SoundContext.playSound] Error: ${e}`);
    }
  }, []);

  return (
    <SoundContext.Provider value={{ playSound, setEffectsVolume }}>
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
