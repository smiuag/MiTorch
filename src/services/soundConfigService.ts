import { AppSettings } from '../storage/settingsStorage';

export class SoundConfigService {
  private settings: AppSettings | null = null;

  setSettings(settings: AppSettings) {
    this.settings = settings;
  }

  shouldPlaySound(soundPath: string | undefined): boolean {
    console.log(`[SoundConfig] shouldPlaySound("${soundPath}")`);
    if (!soundPath) {
      console.log(`[SoundConfig] ✗ No soundPath`);
      return false;
    }
    if (!this.settings) {
      console.log(`[SoundConfig] ✗ No settings`);
      return false;
    }
    if (!this.settings.soundsEnabled) {
      console.log(`[SoundConfig] ✗ soundsEnabled=false`);
      return false;
    }
    const enabled = this.settings.enabledSounds[soundPath] ?? false;
    console.log(`[SoundConfig] enabledSounds["${soundPath}"] = ${enabled}`);
    return enabled;
  }

  getInitialSoundsState(currentUIMode: 'blind' | 'completo'): {
    soundsEnabled: boolean;
    enabledSounds: Record<string, boolean>;
  } {
    if (currentUIMode === 'blind') {
      const allSounds = Object.keys(this.settings?.enabledSounds ?? {});
      return {
        soundsEnabled: true,
        enabledSounds: allSounds.reduce((acc, sound) => ({
          ...acc,
          [sound]: true,
        }), {}),
      };
    }
    return {
      soundsEnabled: false,
      enabledSounds: Object.keys(this.settings?.enabledSounds ?? {}).reduce((acc, sound) => ({
        ...acc,
        [sound]: false,
      }), {}),
    };
  }
}

export const soundConfigService = new SoundConfigService();
