import AsyncStorage from '@react-native-async-storage/async-storage';
import { ServerProfile } from '../types';

const STORAGE_KEY = 'aljhtar_servers';

export async function loadServers(): Promise<ServerProfile[]> {
  const json = await AsyncStorage.getItem(STORAGE_KEY);
  if (!json) return getDefaultServers();
  return JSON.parse(json);
}

export async function saveServers(servers: ServerProfile[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
}

function getDefaultServers(): ServerProfile[] {
  return [];
}
