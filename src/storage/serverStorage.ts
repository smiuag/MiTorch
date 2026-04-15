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
  return [
    { id: '1', name: 'Aardwolf', host: 'aardmud.org', port: 4000 },
    { id: '2', name: 'BatMUD', host: 'batmud.bat.org', port: 23 },
    { id: '3', name: 'Discworld MUD', host: 'discworld.starturtle.net', port: 4242 },
  ];
}
