import AsyncStorage from '@react-native-async-storage/async-storage';

// Per-server persistence of DECLARED user variable names. Values are NOT
// persisted (memory-only by design — they reset on app restart) but the
// SET of names persists so triggers that reference them keep working
// across sessions without forcing the user to redeclare manually.

const KEY_PREFIX = 'aljhtar_user_vars_';

export async function loadDeclaredVars(serverId: string): Promise<string[]> {
  try {
    const json = await AsyncStorage.getItem(KEY_PREFIX + serverId);
    if (!json) return [];
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

export async function saveDeclaredVars(serverId: string, names: string[]): Promise<void> {
  await AsyncStorage.setItem(KEY_PREFIX + serverId, JSON.stringify(names));
}
