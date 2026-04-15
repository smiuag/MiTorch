import AsyncStorage from '@react-native-async-storage/async-storage';
import { Macro } from '../types';

function storageKey(serverId: string): string {
  return `aljhtar_fkeys_${serverId}`;
}

export async function loadFKeys(serverId: string): Promise<(Macro | null)[]> {
  const json = await AsyncStorage.getItem(storageKey(serverId));
  if (!json) return getDefaultFKeys();
  return JSON.parse(json);
}

export async function saveFKeys(serverId: string, fkeys: (Macro | null)[]): Promise<void> {
  await AsyncStorage.setItem(storageKey(serverId), JSON.stringify(fkeys));
}

function getDefaultFKeys(): (Macro | null)[] {
  return [null, null, null, null, null, null, null, null, null, null];
}
