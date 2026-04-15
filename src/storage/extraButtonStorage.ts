import AsyncStorage from '@react-native-async-storage/async-storage';
import { Macro } from '../types';

function storageKey(serverId: string): string {
  return `aljhtar_extrabtns_${serverId}`;
}

export async function loadExtraButtons(serverId: string): Promise<(Macro | null)[]> {
  const json = await AsyncStorage.getItem(storageKey(serverId));
  if (!json) return [null, null, null, null];
  return JSON.parse(json);
}

export async function saveExtraButtons(serverId: string, buttons: (Macro | null)[]): Promise<void> {
  await AsyncStorage.setItem(storageKey(serverId), JSON.stringify(buttons));
}
