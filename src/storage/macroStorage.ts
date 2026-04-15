import AsyncStorage from '@react-native-async-storage/async-storage';
import { Macro } from '../types';

function storageKey(serverId: string): string {
  return `aljhtar_macros_${serverId}`;
}

export async function loadMacros(serverId: string): Promise<Macro[]> {
  const json = await AsyncStorage.getItem(storageKey(serverId));
  if (!json) return getDefaultMacros();
  return JSON.parse(json);
}

export async function saveMacros(serverId: string, macros: Macro[]): Promise<void> {
  await AsyncStorage.setItem(storageKey(serverId), JSON.stringify(macros));
}

function getDefaultMacros(): Macro[] {
  return [
    { id: '1', label: 'Look', command: 'look', color: '#2a6e2a' },
    { id: '2', label: 'Inv', command: 'inventory', color: '#2a4e6e' },
    { id: '3', label: 'Score', command: 'score', color: '#6e5a2a' },
    { id: '4', label: 'N', command: 'north', color: '#444' },
    { id: '5', label: 'S', command: 'south', color: '#444' },
    { id: '6', label: 'E', command: 'east', color: '#444' },
    { id: '7', label: 'W', command: 'west', color: '#444' },
    { id: '8', label: 'U', command: 'up', color: '#444' },
    { id: '9', label: 'D', command: 'down', color: '#444' },
  ];
}
