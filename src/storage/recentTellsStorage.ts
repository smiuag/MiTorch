import AsyncStorage from '@react-native-async-storage/async-storage';

// Ring buffer per-server de los últimos remitentes de telepatía. Se persiste
// en AsyncStorage para que sobreviva al cierre de la app — la lista que ves
// en el gesto "responder" sigue ahí cuando vuelves al personaje.
//
// Decisiones cerradas:
//   - Per-server: cada serverId tiene su propio ring buffer. Tells de un MUD
//     no aplican a otro.
//   - Cap = 10. Suficiente para el caso de uso (gesto pick, conversaciones
//     activas) sin que la lista se vuelva ruido.
//   - NO se exporta ni importa: es contexto efímero de juego, no
//     configuración del usuario. `triggerPackExport` no lo toca.
//   - Sin TTL ni limpieza automática. Si el usuario quiere reset, desinstala
//     o borra datos de la app desde Android — no exponemos UI.

const STORAGE_PREFIX = 'aljhtar_recent_tells_';
export const RECENT_TELLS_CAP = 10;

function key(serverId: string): string {
  return `${STORAGE_PREFIX}${serverId}`;
}

export async function loadRecentTells(serverId: string): Promise<string[]> {
  try {
    const json = await AsyncStorage.getItem(key(serverId));
    if (!json) return [];
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === 'string').slice(0, RECENT_TELLS_CAP);
  } catch {
    return [];
  }
}

export async function saveRecentTells(serverId: string, list: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(key(serverId), JSON.stringify(list.slice(0, RECENT_TELLS_CAP)));
  } catch {
    // Si AsyncStorage falla aquí no es crítico — la lista en memoria sigue
    // funcionando. La próxima sesión arrancará desde el último save válido.
  }
}
