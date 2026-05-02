// Parser que convierte el JSON exportado por Mudlet (`lua saveJsonMap(...)`)
// al formato optimizado interno que consume `MapService` (mismo schema que
// `src/assets/map-reinos.json`). Función pura — pensada para ser testeable
// sin RN ni filesystem.
//
// Formato Mudlet (entrada):
//   { areas: [{ id, name, rooms: [{ id, name?, coordinates: [x,y,z],
//     environment, exits: [{ exitId, name }], userData? }] }],
//     customEnvColors: [{ id, color24RGB: [r,g,b] }], ... }
//
// Formato optimizado (salida):
//   { rooms: { id: { n, x, y, z, e: {dir: roomId}, fn?, c? } },
//     nameIndex: { "name [exits]": [roomIds] } }
//
// La traducción de direcciones depende del idioma del MUD destino — Mudlet
// almacena cardinales en inglés (north/south/...) y up/down/in/out en
// inglés también, pero las salidas especiales (saltar abajo, nadar se) las
// guarda verbatim con el comando que tecleó el jugador, así que solo
// traducimos los nombres canónicos. El resto pasa tal cual.

export interface OptimizedRoom {
  n: string;
  x: number;
  y: number;
  z: number;
  e: Record<string, number>;
  fn?: string;
  c?: string;
}

export interface OptimizedMap {
  rooms: Record<string, OptimizedRoom>;
  nameIndex: Record<string, number[]>;
}

export type DirectionPreset = 'spanish' | 'english';

export interface ParseOptions {
  directionPreset?: DirectionPreset;
}

interface MudletExit {
  exitId: number;
  name: string;
}

interface MudletRoom {
  id: number;
  name?: string;
  coordinates: [number, number, number];
  environment: number;
  exits: MudletExit[];
  userData?: unknown;
}

interface MudletArea {
  id: number;
  name: string;
  rooms: MudletRoom[];
}

interface MudletEnvColor {
  id: number;
  color24RGB: [number, number, number];
}

interface MudletMap {
  areas: MudletArea[];
  customEnvColors?: MudletEnvColor[];
  formatVersion?: number;
}

const SPANISH_DIRECTIONS: Record<string, string> = {
  north: 'n', south: 's', east: 'e', west: 'w',
  northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw',
  up: 'ar', down: 'ab', in: 'de', out: 'fu',
};

const ENGLISH_DIRECTIONS: Record<string, string> = {
  north: 'n', south: 's', east: 'e', west: 'w',
  northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw',
  up: 'u', down: 'd', in: 'in', out: 'out',
};

function translateDirection(name: string, table: Record<string, string>): string {
  const lower = name.toLowerCase().trim();
  // Tabla cubre canónicas Mudlet en inglés. Lo que no esté ahí pasa tal cual
  // (salidas especiales del MUD: "saltar abajo", "nadar se", "entrar portal").
  return table[lower] ?? lower;
}

function rgbToHex(rgb: [number, number, number]): string {
  const [r, g, b] = rgb;
  const hex = (n: number) => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function buildEnvColorMap(envColors: MudletEnvColor[] | undefined): Map<number, string> {
  const out = new Map<number, string>();
  if (!envColors) return out;
  for (const ec of envColors) {
    if (ec && typeof ec.id === 'number' && Array.isArray(ec.color24RGB) && ec.color24RGB.length === 3) {
      out.set(ec.id, rgbToHex(ec.color24RGB));
    }
  }
  return out;
}

// Mudlet expone room.name como "Anduar: Plaza Mayor [n,s,e,o]" cuando viene
// del MUD vía GMCP. El sufijo "[...]" es el resumen de salidas que muestra el
// servidor. El formato optimizado guarda el nombre limpio en `n` y el
// completo en `fn` para poder buscar por ambos.
function splitRoomName(raw: string | undefined): { n: string; fn?: string } {
  if (!raw) return { n: '' };
  const trimmed = raw.trim();
  if (!trimmed) return { n: '' };
  const m = trimmed.match(/^(.*?)\s*\[(.+)\]$/);
  if (m) {
    return { n: m[1].trim(), fn: trimmed };
  }
  return { n: trimmed };
}

export interface ParseResult {
  map: OptimizedMap;
  stats: {
    areaCount: number;
    roomCount: number;
    skippedRooms: number;
    nameIndexEntries: number;
  };
}

export function parseMudletJson(rawJson: string, opts: ParseOptions = {}): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (e) {
    throw new Error(`JSON inválido: ${(e as Error).message}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('El archivo no es un objeto JSON.');
  }

  const mudlet = parsed as Partial<MudletMap>;
  if (!Array.isArray(mudlet.areas)) {
    throw new Error('No es un export de Mudlet (falta el campo "areas").');
  }

  const preset: DirectionPreset = opts.directionPreset ?? 'spanish';
  const dirTable = preset === 'english' ? ENGLISH_DIRECTIONS : SPANISH_DIRECTIONS;
  const envColors = buildEnvColorMap(mudlet.customEnvColors);

  const rooms: Record<string, OptimizedRoom> = {};
  const nameIndex: Record<string, number[]> = {};
  let skippedRooms = 0;

  for (const area of mudlet.areas) {
    if (!area || !Array.isArray(area.rooms)) continue;
    for (const room of area.rooms) {
      if (!room || typeof room.id !== 'number') {
        skippedRooms++;
        continue;
      }
      const coords = Array.isArray(room.coordinates) && room.coordinates.length === 3
        ? room.coordinates
        : [0, 0, 0];

      const exits: Record<string, number> = {};
      if (Array.isArray(room.exits)) {
        for (const exit of room.exits) {
          if (!exit || typeof exit.exitId !== 'number' || typeof exit.name !== 'string') continue;
          const dir = translateDirection(exit.name, dirTable);
          // Si dos salidas Mudlet colapsan al mismo código (no debería pasar
          // pero por defensividad), gana la primera — comportamiento estable.
          if (!(dir in exits)) {
            exits[dir] = exit.exitId;
          }
        }
      }

      const { n, fn } = splitRoomName(room.name);
      const x = Number(coords[0]) || 0;
      const y = Number(coords[1]) || 0;
      const z = Number(coords[2]) || 0;

      // Salas "basura" típicas del Default Area de Mudlet (id -1): sin nombre,
      // en (0,0,0), sin salidas y sin environment asignado. No son alcanzables
      // desde ningún sitio y solo ensuciarían el minimap si el usuario llega a
      // (0,0,0). Replica el filtrado del optimizador original.
      const isJunk = !n && !fn && x === 0 && y === 0 && z === 0 &&
        Object.keys(exits).length === 0 &&
        (room.environment === -1 || room.environment === undefined);
      if (isJunk) {
        skippedRooms++;
        continue;
      }

      const out: OptimizedRoom = { n, x, y, z, e: exits };
      if (fn) out.fn = fn;
      const colorHex = envColors.get(room.environment);
      if (colorHex) out.c = colorHex;

      rooms[String(room.id)] = out;

      // nameIndex usa el nombre completo (`fn`) si existe, si no `n`. Mantiene
      // la convención del map-reinos.json bundleado: claves vacías permitidas
      // (agrupan todas las salas sin nombre conocido).
      const key = fn ?? n;
      const list = nameIndex[key];
      if (list) {
        list.push(room.id);
      } else {
        nameIndex[key] = [room.id];
      }
    }
  }

  return {
    map: { rooms, nameIndex },
    stats: {
      areaCount: mudlet.areas.length,
      roomCount: Object.keys(rooms).length,
      skippedRooms,
      nameIndexEntries: Object.keys(nameIndex).length,
    },
  };
}
