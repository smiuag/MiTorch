import AsyncStorage from '@react-native-async-storage/async-storage';

// Persistence of DECLARED user variable names. Declarations are GLOBAL
// (not per-server) — same scope as trigger packs. Values are NOT persisted
// (memory-only by design — they reset on app restart) but the SET of names
// persists so triggers that reference them keep working across sessions
// without forcing the user to redeclare manually.

const KEY = 'aljhtar_user_vars_declared';

export async function loadDeclaredVars(): Promise<string[]> {
  try {
    const json = await AsyncStorage.getItem(KEY);
    if (!json) return [];
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

export async function saveDeclaredVars(names: string[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(names));
}
