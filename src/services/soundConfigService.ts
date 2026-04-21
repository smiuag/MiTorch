import { AppSettings } from '../storage/settingsStorage';

export class SoundConfigService {
  private settings: AppSettings | null = null;

  setSettings(settings: AppSettings) {
    this.settings = settings;
  }

  shouldPlaySound(soundPath: string | undefined): boolean {
    if (!soundPath || !this.settings || !this.settings.soundsEnabled) {
      return false;
    }
    return this.settings.enabledSounds[soundPath] ?? false;
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
