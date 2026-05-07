import AsyncStorage from '@react-native-async-storage/async-storage';
import { ServerProfile } from '../types';
import { BUNDLED_REINOS_ID } from './mapLibraryStorage';
import { migrateLayoutToV3 } from './layoutStorage';

const STORAGE_KEY = 'aljhtar_servers';
const MAP_MIGRATION_KEY = 'aljhtar_map_migration_v1';
const LAYOUT_V3_MIGRATION_KEY = 'aljhtar_layout_v3_migration';

// Migración de servers cargados desde AsyncStorage o desde un zip importado:
// completa los campos del rediseño de grid con sus defaults para que servers
// pre-rediseño (o exportados desde versión vieja) sigan funcionando como
// "estándar con paneles 1 y 2".
// Tabla custom 5/7/9 → (gridCols, gridRows) que tenía visibles en vertical.
function customGridDims(size: number): { cols: number; rows: number } {
  if (size === 5) return { cols: 5, rows: 4 };
  if (size === 7) return { cols: 7, rows: 5 };
  return { cols: 9, rows: 6 }; // 9 o fallback
}

function migrateServer(s: any): ServerProfile {
  const next: ServerProfile = { ...s };
  // Drop campo experimental (intento de hoy) — superseded por gridSize/gridCols/gridRows.
  delete (next as any).buttonGridSize;

  // === Derivación v3: gridSize/gridCols/gridRows ===
  // Si ya están seteados (server creado tras v3), respetarlos. Si faltan,
  // derivar desde el campo legacy `layoutKind` + `customGridSize`.
  if (next.gridSize === undefined) next.gridSize = 'normal';

  if (next.gridCols === undefined || next.gridRows === undefined) {
    const legacy = (s.layoutKind as string | undefined) ?? 'standard';
    if (legacy === 'custom') {
      const dims = customGridDims(s.customGridSize ?? 9);
      if (next.gridCols === undefined) next.gridCols = dims.cols;
      if (next.gridRows === undefined) next.gridRows = dims.rows;
    } else if (legacy === 'reducida') {
      // Reducida legacy = 9×5 (una fila menos que normal).
      if (next.gridCols === undefined) next.gridCols = 9;
      if (next.gridRows === undefined) next.gridRows = 5;
    } else {
      // standard / normal → 9×6.
      if (next.gridCols === undefined) next.gridCols = 9;
      if (next.gridRows === undefined) next.gridRows = 6;
    }
  }
  // Saneado: cap a los rangos del editor para evitar valores absurdos en
  // datos importados de zips antiguos.
  next.gridCols = Math.max(5, Math.min(9, next.gridCols));
  next.gridRows = Math.max(4, Math.min(6, next.gridRows));

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

  // Migración v3 del layout: para cada server pre-v3 (sin gridSize), aplicar
  // la migración de su button-layout (split vertical/horizontal con transforms
  // canónicos). One-shot, controlada por flag global.
  const layoutMigrationDone = await AsyncStorage.getItem(LAYOUT_V3_MIGRATION_KEY);
  if (layoutMigrationDone !== '1') {
    for (const raw of parsed) {
      if (!raw || typeof raw.id !== 'string') continue;
      const legacyKind = (raw.layoutKind as string | undefined) ?? 'standard';
      try {
        await migrateLayoutToV3(raw.id, legacyKind);
      } catch (e) {
        console.warn('[serverStorage] migrateLayoutToV3 failed for', raw.id, e);
      }
    }
    await AsyncStorage.setItem(LAYOUT_V3_MIGRATION_KEY, '1');
  }

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
