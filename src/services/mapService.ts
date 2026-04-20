export interface MapRoom {
  id: number;
  n: string;   // name
  x: number;
  y: number;
  z: number;
  e: Record<string, number>;  // exits: {direction: roomId}
  fn?: string; // full name with exits
  c?: string;  // color hex
}

interface MapData {
  rooms: Record<string, { n: string; x: number; y: number; z: number; e: Record<string, number>; fn?: string; c?: string }>;
  nameIndex: Record<string, number[]>;
}

export class MapService {
  private rooms: Map<number, MapRoom> = new Map();
  // Case-insensitive name index
  private nameIndexLower: Map<string, number[]> = new Map();
  private currentRoomId: number | null = null;
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const data: MapData = require('../assets/map-reinos.json');

      for (const [idStr, room] of Object.entries(data.rooms)) {
        const id = Number(idStr);
        this.rooms.set(id, { id, ...room });
      }

      // Build case-insensitive index
      for (const [name, ids] of Object.entries(data.nameIndex)) {
        const lower = name.toLowerCase();
        const existing = this.nameIndexLower.get(lower);
        if (existing) {
          // Merge, avoiding duplicates
          for (const id of ids) {
            if (!existing.includes(id)) existing.push(id);
          }
        } else {
          this.nameIndexLower.set(lower, [...ids]);
        }
      }

      this.loaded = true;
    } catch (e) {
      console.warn('Failed to load map:', e);
    }
  }

  /**
   * Find room by name as sent by GMCP Room.Actual
   * The MUD sends names like "Anduar: Plaza Mayor [n,s,e,o]"
   */
  findRoom(name: string): MapRoom | null {
    if (!this.loaded) return null;

    // Normalize: trim, extract short name and exits
    const trimmed = name.trim();
    const bracketMatch = trimmed.match(/^(.*?)\s*\[(.+)\]$/);
    const shortName = bracketMatch ? bracketMatch[1].trim() : trimmed;
    const shortLower = shortName.toLowerCase();

    // Parse exits from bracket if present
    const gmcpExits = bracketMatch
      ? bracketMatch[2].split(',').map(e => e.trim())
      : null;

    // Find candidates by short name
    const candidates = this.nameIndexLower.get(shortLower) ?? [];
    console.log('[MAP] Búsqueda "' + shortLower + '": ' + candidates.length + ' coincidencias');

    if (candidates.length === 0) {
      return null;
    }

    // Single match by name: localize
    if (candidates.length === 1) {
      const room = this.rooms.get(candidates[0]);
      if (room) {
        this.currentRoomId = room.id;
        return room;
      }
    }

    // Multiple candidates: try to disambiguate by exits
    if (gmcpExits && candidates.length > 1) {
      const exitsMatches: number[] = [];
      for (const id of candidates) {
        const room = this.rooms.get(id);
        if (room && this.exitsMatch(Object.keys(room.e), gmcpExits)) {
          exitsMatches.push(id);
        }
      }

      // Only localize if exits disambiguation gives exactly 1 match
      if (exitsMatches.length === 1) {
        const room = this.rooms.get(exitsMatches[0]);
        if (room) {
          this.currentRoomId = room.id;
          return room;
        }
      }

      // 0 or 2+ exits matches: ambiguous
      if (exitsMatches.length === 0) {
        console.log('[MAP] Ambigua: sin salidas coincidentes de ' + candidates.length + ' candidatas');
      } else {
        console.log('[MAP] Ambigua: ' + exitsMatches.length + ' candidatas coinciden por salidas');
      }
      return null;
    }

    // Multiple candidates but no exit info to disambiguate
    console.log('[MAP] Ambigua: ' + candidates.length + ' coincidencias, sin info de salidas');
    return null;
  }

  /**
   * Move to a room by following a direction from current room
   */
  private static readonly DIR_TO_KEY: Record<string, string> = {
    'norte': 'n', 'sur': 's', 'este': 'e', 'oeste': 'w',
    'noreste': 'ne', 'noroeste': 'nw',
    'sudeste': 'se', 'sudoeste': 'sw', 'sureste': 'se', 'suroeste': 'sw',
    'arriba': 'ar', 'abajo': 'ab',
    'dentro': 'de', 'fuera': 'fu',
    'north': 'n', 'south': 's', 'east': 'e', 'west': 'w',
    'northeast': 'ne', 'northwest': 'nw', 'southeast': 'se', 'southwest': 'sw',
    'up': 'ar', 'down': 'ab', 'in': 'de', 'out': 'fu',
    'n': 'n', 's': 's', 'e': 'e', 'w': 'w', 'o': 'w',
    'ne': 'ne', 'nw': 'nw', 'no': 'nw', 'se': 'se', 'sw': 'sw', 'so': 'sw',
    'ar': 'ar', 'ab': 'ab', 'de': 'de', 'fu': 'fu',
  };

  moveByDirection(direction: string): MapRoom | null {
    if (!this.currentRoomId) return null;
    const current = this.rooms.get(this.currentRoomId);
    if (!current) return null;

    const dirLower = direction.toLowerCase().trim();
    const key = MapService.DIR_TO_KEY[dirLower] ?? dirLower;

    // Try mapped key first, then original
    const destId = current.e[key] ?? current.e[dirLower];
    if (destId) {
      const dest = this.rooms.get(destId);
      if (dest) {
        this.currentRoomId = dest.id;
        return dest;
      }
    }
    return null;
  }

  setCurrentRoom(roomId: number): void {
    this.currentRoomId = roomId;
  }

  getCurrentRoom(): MapRoom | null {
    if (!this.currentRoomId) return null;
    return this.rooms.get(this.currentRoomId) ?? null;
  }

  getRoom(id: number): MapRoom | null {
    return this.rooms.get(id) ?? null;
  }

  /**
   * Get rooms near a position for rendering
   */
  getNearbyRooms(centerX: number, centerY: number, centerZ: number, radius: number): MapRoom[] {
    const nearby: MapRoom[] = [];
    for (const room of this.rooms.values()) {
      if (room.z !== centerZ) continue;
      if (Math.abs(room.x - centerX) <= radius && Math.abs(room.y - centerY) <= radius) {
        nearby.push(room);
      }
    }
    return nearby;
  }

  /**
   * Search rooms by partial name match (for irsala)
   */
  searchRooms(query: string, maxResults: number = 20): MapRoom[] {
    if (!this.loaded) return [];
    const queryLower = query.toLowerCase();
    const results: MapRoom[] = [];
    const seen = new Set<number>();

    for (const [name, ids] of this.nameIndexLower.entries()) {
      if (name.includes(queryLower)) {
        for (const id of ids) {
          if (!seen.has(id) && results.length < maxResults) {
            const room = this.rooms.get(id);
            if (room) {
              results.push(room);
              seen.add(id);
            }
          }
        }
      }
      if (results.length >= maxResults) break;
    }
    return results;
  }

  /**
   * Map exit key back to MUD command
   */
  private static readonly KEY_TO_CMD: Record<string, string> = {
    'n': 'norte', 's': 'sur', 'e': 'este', 'w': 'oeste',
    'ne': 'noreste', 'nw': 'noroeste', 'se': 'sudeste', 'sw': 'sudoeste',
    'ar': 'arriba', 'ab': 'abajo', 'de': 'dentro', 'fu': 'fuera',
  };

  /**
   * Find shortest path between two rooms using BFS
   * Returns array of MUD commands to execute
   */
  findPath(fromId: number, toId: number): string[] | null {
    if (!this.loaded || fromId === toId) return fromId === toId ? [] : null;

    const visited = new Set<number>();
    const queue: { id: number; path: { exitKey: string; roomId: number }[] }[] = [
      { id: fromId, path: [] }
    ];
    visited.add(fromId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const room = this.rooms.get(current.id);
      if (!room) continue;

      for (const [exitKey, destId] of Object.entries(room.e)) {
        if (visited.has(destId)) continue;

        const newPath = [...current.path, { exitKey, roomId: destId }];

        if (destId === toId) {
          // Convert exit keys to MUD commands
          return newPath.map(step => MapService.KEY_TO_CMD[step.exitKey] ?? step.exitKey);
        }

        visited.add(destId);
        queue.push({ id: destId, path: newPath });

        // Safety limit
        if (visited.size > 50000) return null;
      }
    }

    return null;
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  private exitsMatch(roomExits: string[], gmcpExits: string[]): boolean {
    const normalize: Record<string, string> = {
      'north': 'n', 'south': 's', 'east': 'e', 'west': 'o',
      'norte': 'n', 'sur': 's', 'este': 'e', 'oeste': 'o', 'w': 'o',
      'northeast': 'ne', 'northwest': 'no', 'nw': 'no',
      'southeast': 'se', 'southwest': 'so', 'sw': 'so',
      'noreste': 'ne', 'noroeste': 'no', 'sudeste': 'se', 'sudoeste': 'so',
      'sureste': 'se', 'suroeste': 'so',
      'arriba': 'ar', 'abajo': 'ab', 'up': 'ar', 'down': 'ab',
      'dentro': 'de', 'fuera': 'fu', 'in': 'de', 'out': 'fu',
    };

    const norm = (d: string) => normalize[d.toLowerCase()] ?? d.toLowerCase();
    const set1 = new Set(roomExits.map(norm));
    const set2 = new Set(gmcpExits.map(norm));

    if (set1.size !== set2.size) return false;
    for (const d of set1) {
      if (!set2.has(d)) return false;
    }
    return true;
  }
}
