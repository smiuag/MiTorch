import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { Audio } from 'expo-av';
import { loadSettings } from '../storage/settingsStorage';
import { getCustomSoundUri } from '../storage/customSoundsStorage';

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
  'eventos/muerte.wav': require('../../assets/sounds/eventos/muerte.wav'),
  'eventos/victoria.wav': require('../../assets/sounds/eventos/victoria.wav'),
  'eventos/xp.wav': require('../../assets/sounds/eventos/xp.wav'),
  'eventos/curacion.wav': require('../../assets/sounds/eventos/curacion.wav'),
} as const;

interface SoundContextType {
  soundCache: Map<string, Audio.Sound>;
  isReady: boolean;
  playSound: (soundKey: string) => Promise<void>;
  prepareSounds: () => Promise<void>;
}

const SoundContext = createContext<SoundContextType | undefined>(undefined);

export function SoundProvider({ children }: { children: React.ReactNode }) {
  const [soundCache, setSoundCache] = useState<Map<string, Audio.Sound>>(new Map());
  const [isReady, setIsReady] = useState(false);
  const soundCacheRef = useRef<Map<string, Audio.Sound>>(new Map());
  const isReadyRef = useRef(false);
  const loadingRef = useRef(false);

  const prepareSounds = useCallback(async () => {
    if (isReadyRef.current || loadingRef.current) return;
    loadingRef.current = true;
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
        interruptionModeAndroid: 1,
      });

      const cache = new Map<string, Audio.Sound>();

      for (const [soundPath, module] of Object.entries(soundModules)) {
        try {
          const { sound } = await Audio.Sound.createAsync(module);
          cache.set(soundPath, sound);
        } catch (e) {
          console.warn(`[SoundContext] Failed to preload ${soundPath}: ${e}`);
        }
      }

      setSoundCache(cache);
      soundCacheRef.current = cache;

      for (const [soundPath, sound] of cache.entries()) {
        try {
          await sound.setVolumeAsync(0);
          await sound.setPositionAsync(0);
          await sound.playAsync();
          await sound.setVolumeAsync(1);
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

  useEffect(() => {
    (async () => {
      try {
        const settings = await loadSettings();
        if (settings.soundsEnabled) {
          await prepareSounds();
        }
      } catch (e) {
        console.warn(`[SoundContext] Failed to read settings on mount: ${e}`);
      }
    })();
  }, [prepareSounds]);

  const playSound = useCallback(async (soundKey: string) => {
    try {
      if (!soundKey) return;

      if (soundKey.startsWith(CUSTOM_PREFIX)) {
        const filename = soundKey.slice(CUSTOM_PREFIX.length);
        const uri = getCustomSoundUri(filename);
        if (!uri) {
          console.warn(`[SoundContext.playSound] Custom sound not found: ${filename}`);
          return;
        }
        const { sound } = await Audio.Sound.createAsync({ uri });
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

      const sound = soundCacheRef.current.get(path)!;
      await sound.setPositionAsync(0);
      await sound.playAsync();
    } catch (e) {
      console.error(`[SoundContext.playSound] Error: ${e}`);
    }
  }, []);

  return (
    <SoundContext.Provider value={{ soundCache, isReady, playSound, prepareSounds }}>
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
