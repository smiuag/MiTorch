import AsyncStorage from '@react-native-async-storage/async-storage';
import { Paths, File, Directory } from 'expo-file-system';
import { MapLibraryEntry } from '../types';
import { OptimizedMap } from '../services/mudletMapParser';

// Biblioteca de mapas:
//   - Índice (lista de entradas) en AsyncStorage `aljhtar_map_library`.
//   - Contenido de cada mapa importado en `${Paths.document}/maps/{id}.json`.
//   - El mapa de Reinos bundleado vive en `src/assets/map-reinos.json` y se
//     expone como entrada virtual con id `BUNDLED_REINOS_ID` — no toca el
//     filesystem y no se puede borrar/renombrar.

const KEY = 'aljhtar_map_library';
const MAPS_DIR = 'maps';

export const BUNDLED_REINOS_ID = 'reinos-bundled';

let counter = Date.now();
function genId(): string {
  return `m_${(counter++).toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function ensureDir(): Directory {
  const dir = new Directory(Paths.document, MAPS_DIR);
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

function bundledEntry(): MapLibraryEntry {
  // Se calcula on-demand para no cargar el JSON en este módulo (el bundle
  // ya lo carga MapService al montarse). El roomCount queda fijo porque
  // el bundleado es inmutable; el numero coincide con el del map-reinos.json
  // actual y se ajustará si el bundle cambia en el futuro.
  return {
    id: BUNDLED_REINOS_ID,
    name: 'Reinos de Leyenda',
    roomCount: 28816,
    importedAt: 0,
    builtin: true,
  };
}

async function loadIndex(): Promise<MapLibraryEntry[]> {
  const json = await AsyncStorage.getItem(KEY);
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((e) => e && typeof e.id === 'string') : [];
  } catch {
    return [];
  }
}

async function saveIndex(list: MapLibraryEntry[]): Promise<void> {
  // El bundleado nunca se persiste — se inyecta on-demand al leer.
  const persistable = list.filter((e) => !e.builtin);
  await AsyncStorage.setItem(KEY, JSON.stringify(persistable));
}

// Lista completa: bundleado primero, después los importados ordenados por
// nombre. La pantalla "Mis mapas" usa este orden tal cual.
export async function listLibrary(): Promise<MapLibraryEntry[]> {
  const imported = await loadIndex();
  imported.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return [bundledEntry(), ...imported];
}

export async function getEntry(id: string): Promise<MapLibraryEntry | null> {
  if (id === BUNDLED_REINOS_ID) return bundledEntry();
  const index = await loadIndex();
  return index.find((e) => e.id === id) ?? null;
}

// Carga el contenido del mapa. Para el bundleado devuelve el require directo
// (el bundler de Metro lo resuelve a un objeto JSON ya parseado en runtime).
// Para importados, lee y parsea el archivo de filesystem.
export async function loadMapContent(id: string): Promise<OptimizedMap | null> {
  if (id === BUNDLED_REINOS_ID) {
    return require('../assets/map-reinos.json') as OptimizedMap;
  }
  try {
    const dir = ensureDir();
    const file = new File(dir, `${id}.json`);
    if (!file.exists) return null;
    const text = await file.text();
    const parsed = JSON.parse(text) as OptimizedMap;
    return parsed;
  } catch (e) {
    console.warn('[mapLibraryStorage] loadMapContent error:', e);
    return null;
  }
}

// Guarda un mapa importado. Crea entrada en el índice y escribe el JSON al
// filesystem. Devuelve la entry ya con id asignado.
export async function saveImportedMap(name: string, content: OptimizedMap): Promise<MapLibraryEntry> {
  const id = genId();
  const dir = ensureDir();
  const file = new File(dir, `${id}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(content));

  const entry: MapLibraryEntry = {
    id,
    name: name.trim() || 'Mapa sin nombre',
    roomCount: Object.keys(content.rooms).length,
    importedAt: Date.now(),
  };
  const index = await loadIndex();
  index.push(entry);
  await saveIndex(index);
  return entry;
}

export async function renameMap(id: string, newName: string): Promise<MapLibraryEntry[]> {
  if (id === BUNDLED_REINOS_ID) {
    throw new Error('El mapa de Reinos viene con la app y no se puede renombrar.');
  }
  const trimmed = newName.trim();
  if (!trimmed) throw new Error('El nombre no puede estar vacío.');
  const index = await loadIndex();
  const next = index.map((e) => (e.id === id ? { ...e, name: trimmed } : e));
  await saveIndex(next);
  return listLibrary();
}

export async function deleteMap(id: string): Promise<MapLibraryEntry[]> {
  if (id === BUNDLED_REINOS_ID) {
    throw new Error('El mapa de Reinos viene con la app y no se puede borrar.');
  }
  try {
    const dir = ensureDir();
    const file = new File(dir, `${id}.json`);
    if (file.exists) file.delete();
  } catch (e) {
    console.warn('[mapLibraryStorage] delete file error:', e);
  }
  const index = await loadIndex();
  const next = index.filter((e) => e.id !== id);
  await saveIndex(next);
  return listLibrary();
}
