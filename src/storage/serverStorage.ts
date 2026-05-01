import AsyncStorage from '@react-native-async-storage/async-storage';
import { ServerProfile } from '../types';

const STORAGE_KEY = 'aljhtar_servers';

// Migración de servers cargados desde AsyncStorage o desde un zip importado:
// completa los campos del rediseño de grid con sus defaults para que servers
// pre-rediseño (o exportados desde versión vieja) sigan funcionando como
// "estándar con paneles 1 y 2".
function migrateServer(s: any): ServerProfile {
  const next: ServerProfile = { ...s };
  if (!next.layoutKind) next.layoutKind = 'standard';
  if (next.layoutKind === 'standard') {
    // En estándar, customGridSize no aplica — eliminamos cualquier valor
    // residual para no confundir al render condicional.
    delete (next as any).customGridSize;
  } else if (next.layoutKind === 'custom') {
    // En custom, customGridSize es obligatorio. Si falta (no debería pasar),
    // caemos al tamaño grande como fallback razonable.
    if (next.customGridSize !== 5 && next.customGridSize !== 7 && next.customGridSize !== 9) {
      next.customGridSize = 9;
    }
  }
  if (!Array.isArray(next.panels) || next.panels.length < 2) {
    next.panels = [1, 2];
  }
  return next;
}

export async function loadServers(): Promise<ServerProfile[]> {
  const json = await AsyncStorage.getItem(STORAGE_KEY);
  if (!json) return getDefaultServers();
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) return getDefaultServers();
  return parsed.map(migrateServer);
}

export async function saveServers(servers: ServerProfile[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
}

function getDefaultServers(): ServerProfile[] {
  return [];
}
