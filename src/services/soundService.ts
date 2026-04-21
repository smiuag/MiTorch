import { Audio } from 'expo-av';
import soundPatternsData from '../config/soundPatterns.json';

interface SoundPattern {
  regex: string;
  sound: string;
}

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

export class SoundService {
  private patterns: SoundPattern[] = [];
  private audioModeConfigured = false;
  private soundCache: Map<string, Audio.Sound> = new Map();
  private soundsReady = false;

  constructor() {
    this.patterns = (soundPatternsData as any).patterns || [];
    this.initAudioMode();
    this.preloadSounds();
  }

  private async initAudioMode() {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
        interruptionModeAndroid: 1,
      });
      this.audioModeConfigured = true;
    } catch (e) {
      console.warn(`[SoundService] Failed to configure audio mode: ${e}`);
    }
  }

  private async preloadSounds() {
    try {
      console.log(`[SoundService] Preloading ${Object.keys(soundModules).length} sounds...`);
      const t0 = Date.now();
      for (const [soundPath, module] of Object.entries(soundModules)) {
        try {
          console.log(`[SoundService] Loading: ${soundPath}, module type: ${typeof module}`);
          const { sound } = await Audio.Sound.createAsync(module);
          this.soundCache.set(soundPath, sound);
          console.log(`[SoundService] ✓ Loaded: ${soundPath}`);
        } catch (e) {
          console.warn(`[SoundService] ✗ Failed to preload ${soundPath}: ${e}`);
        }
      }
      this.soundsReady = true;
      const elapsed = Date.now() - t0;
      console.log(`[SoundService] Preload complete in ${elapsed}ms. Cache size: ${this.soundCache.size}`);
    } catch (e) {
      console.warn(`[SoundService] Error during preload: ${e}`);
    }
  }

  detectSound(text: string): string | undefined {
    const cleanText = this.stripAnsiCodes(text);

    for (const pattern of this.patterns) {
      try {
        const regex = new RegExp(pattern.regex, 'i');
        if (regex.test(cleanText)) {
          console.log(`[SoundService] ✓ MATCH: pattern="${pattern.regex}" → sound="${pattern.sound}"`);
          return pattern.sound;
        }
      } catch (e) {
        console.warn(`[SoundService] Invalid regex: ${pattern.regex}`);
      }
    }

    return undefined;
  }

  private stripAnsiCodes(text: string): string {
    return text.replace(/\x1b\[[0-9;]*m/g, '');
  }

  async playSound(soundPath: string) {
    try {
      console.log(`[SoundService.playSound] START: ${soundPath}`);
      const t0 = Date.now();

      if (!soundPath) {
        return;
      }

      if (!(soundPath in soundModules)) {
        console.warn(`[SoundService] Sound not found: "${soundPath}"`);
        return;
      }

      // Set audio mode before playing
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
        interruptionModeAndroid: 1,
      });

      // Create new instance and play (like blindModeService does)
      const module = soundModules[soundPath as keyof typeof soundModules];
      const { sound } = await Audio.Sound.createAsync(module);
      await sound.playAsync();

      const elapsed = Date.now() - t0;
      console.log(`[SoundService.playSound] END: ${soundPath} (${elapsed}ms)`);

      // Unload after playback
      setTimeout(() => {
        sound.unloadAsync().catch(() => {});
      }, 5000);
    } catch (e) {
      console.error(`[SoundService] Error playing sound: ${e}`);
    }
  }
}

export const soundService = new SoundService();
