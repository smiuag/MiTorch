import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = 'aljhtar_settings';

export interface AppSettings {
  fontSize: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  fontSize: 14,
};

export async function loadSettings(): Promise<AppSettings> {
  const json = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!json) return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...JSON.parse(json) };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
