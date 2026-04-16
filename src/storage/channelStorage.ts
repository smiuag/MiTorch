import AsyncStorage from '@react-native-async-storage/async-storage';

const ALIAS_KEY = 'aljhtar_channel_aliases';
const CONFIG_KEY = 'aljhtar_full_config';

// Channel aliases: { "chat": "ch", "bando": "bando" }
export async function loadChannelAliases(): Promise<Record<string, string>> {
  const json = await AsyncStorage.getItem(ALIAS_KEY);
  if (!json) return {};
  return JSON.parse(json);
}

export async function saveChannelAliases(aliases: Record<string, string>): Promise<void> {
  await AsyncStorage.setItem(ALIAS_KEY, JSON.stringify(aliases));
}

// Full config export/import (aliases + fkeys + extra buttons)
export async function exportConfig(): Promise<string> {
  const config: Record<string, any> = {};
  const aliasJson = await AsyncStorage.getItem(ALIAS_KEY);
  if (aliasJson) config[ALIAS_KEY] = JSON.parse(aliasJson);
  return JSON.stringify(config, null, 2);
}

export async function importConfig(configJson: string): Promise<void> {
  const config = JSON.parse(configJson);
  for (const [key, value] of Object.entries(config)) {
    if (key.startsWith('aljhtar_')) {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    }
  }
}
