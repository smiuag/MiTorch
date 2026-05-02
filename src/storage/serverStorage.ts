import AsyncStorage from '@react-native-async-storage/async-storage';
import { ServerProfile } from '../types';
import { BUNDLED_REINOS_ID } from './mapLibraryStorage';

const STORAGE_KEY = 'aljhtar_servers';
const MAP_MIGRATION_KEY = 'aljhtar_map_migration_v1';

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
  // Asegura que la migración one-shot del mapa corra antes del primer read.
  // Es idempotente y barata (un get del flag) cuando ya se hizo.
  await runMapMigrationOnce();
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

// Migración one-shot al introducir la biblioteca de mapas (2026-05-02): los
// servidores existentes cuyo host apunte a Reinos y no tengan `mapId`
// reciben el mapa bundleado. El flag en AsyncStorage evita re-aplicar la
// migración si el usuario decide explícitamente quitarle el mapa a un server
// más adelante (sin flag, cada arranque pisaría su elección).
export async function runMapMigrationOnce(): Promise<void> {
  const done = await AsyncStorage.getItem(MAP_MIGRATION_KEY);
  if (done === '1') return;

  try {
    const json = await AsyncStorage.getItem(STORAGE_KEY);
    if (json) {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) {
        let touched = false;
        const updated = parsed.map((s: any) => {
          if (s && !s.mapId && typeof s.host === 'string' && s.host.includes('reinosdeleyenda.es')) {
            touched = true;
            return { ...s, mapId: BUNDLED_REINOS_ID };
          }
          return s;
        });
        if (touched) {
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        }
      }
    }
  } catch (e) {
    console.warn('[serverStorage] runMapMigrationOnce failed:', e);
  }

  await AsyncStorage.setItem(MAP_MIGRATION_KEY, '1');
}
