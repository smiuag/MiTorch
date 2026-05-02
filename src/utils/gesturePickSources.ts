import { GestureAction, GesturePickSource } from '../types';
import { MapRoom } from '../services/mapService';
import { RECENT_TELLS_CAP } from '../storage/recentTellsStorage';

export { RECENT_TELLS_CAP };

// Resolvers de las fuentes que alimentan al GesturePickerModal cuando un
// gesto es de tipo `pick`. Cada resolver devuelve un string[] (puede estar
// vacío — el handler en TerminalScreen anuncia "sin opciones" en ese caso).
//
// La forma del comando final lo construye el caller:
//   `${prefix}${opcionElegida}${suffix}`
// Por eso los resolvers devuelven SOLO la "parte variable" (nick, dirección,
// alias, etc.), nunca con prefix/suffix incrustados.

// Códigos cortos del mapa optimizado → forma larga que un jugador teclearía
// en el MUD. Las claves cubren las que produce `mudletMapParser`:
//   - presets español + inglés: n / s / e / w / ne / nw / se / sw
//   - preset español: ar / ab / de / fu (verticales y dentro/fuera)
//   - preset inglés:  u / d / in / out
// Direcciones especiales del MUD ("puerta", "saltar abajo"...) se quedan tal
// cual porque son comandos arbitrarios que el usuario tecleó en Mudlet.
const EXIT_LABELS: Record<string, string> = {
  n: 'norte',
  s: 'sur',
  e: 'este',
  w: 'oeste',
  ne: 'noreste',
  nw: 'noroeste',
  se: 'sudeste',
  sw: 'sudoeste',
  ar: 'arriba',
  ab: 'abajo',
  de: 'dentro',
  fu: 'fuera',
  u: 'arriba',
  d: 'abajo',
  in: 'dentro',
  out: 'fuera',
  // Fallbacks por si alguien tiene mapas viejos con códigos en español puro
  // (no producidos por `mudletMapParser` pero por si acaso).
  o: 'oeste',
  no: 'noroeste',
  so: 'sudoeste',
};

export function expandExitCode(code: string): string {
  return EXIT_LABELS[code.toLowerCase()] ?? code;
}

export interface PickSourceContext {
  currentRoom: MapRoom | null;
  recentTells: string[];        // Ring buffer del Terminal, más recientes primero.
  customList: string[];         // Lista del propio gesto cuando source==='custom'.
}

export async function resolvePickOptions(
  source: GesturePickSource,
  ctx: PickSourceContext,
): Promise<string[]> {
  switch (source) {
    case 'roomExits': {
      if (!ctx.currentRoom?.e) return [];
      const codes = Object.keys(ctx.currentRoom.e);
      // Mantenemos el orden de inserción del objeto (mapas de Mudlet suelen
      // venir n/s/e/o/...). Sin sort para no reordenar de forma sorpresiva.
      return codes.map(expandExitCode);
    }
    case 'recentTells': {
      // Ya viene deduplicado y con cap aplicado por el ring buffer.
      return [...ctx.recentTells];
    }
    case 'custom': {
      return ctx.customList.filter((s) => s.trim().length > 0);
    }
  }
}

export function pickSourceLabel(source: GesturePickSource): string {
  switch (source) {
    case 'roomExits': return 'Salidas';
    case 'recentTells': return 'Jugadores';
    case 'custom': return 'Personalizada';
  }
}

// Título amigable que se muestra/anuncia en la cabecera del picker.
export function pickActionTitle(action: Extract<GestureAction, { kind: 'pick' }>): string {
  const base = pickSourceLabel(action.source);
  // Si el prefix ya da contexto ("tell ") lo añadimos al título, capitalizado.
  const prefix = action.prefix.trim();
  if (!prefix) return base;
  return `${capitalize(prefix)} — ${base.toLowerCase()}`;
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Regex para capturar el remitente de una telepatía (tell entrante). Patrones
// de Reinos según el addon CMUD de Rhomdur (`Comunicaciones.set:321-335`):
//   "<Nombre> te dice: <mensaje>"
//   "<Nombre> te exclama: <mensaje>"
//   "<Nombre> te pregunta: <mensaje>"
//   "<fecha> (<hora>) - <Nombre> te dijo: <mensaje>"   (historial offline)
// IMPORTANTE: "te susurra:" NO es telepatía — es susurro en sala (FRoom).
// "te grita" tampoco. Por eso NO los incluimos en este regex.
//
// El verbo va en infinitivo "dijo" para el caso historial; los otros tres
// son presente. Hard-coded porque es el target del modo blind. Si en el
// futuro queremos soportar más MUDs, este patrón se vuelve configurable.
const TELL_REGEX_LIVE = /^([A-Za-zÀ-ÿ'][A-Za-zÀ-ÿ'0-9]+)\s+te\s+(?:dice|exclama|pregunta):\s/;
const TELL_REGEX_HISTORICAL = /-\s+([A-Za-zÀ-ÿ'][A-Za-zÀ-ÿ'0-9]+)\s+te\s+dijo:\s/;

export function parseTellSender(strippedLine: string): string | null {
  const m1 = strippedLine.match(TELL_REGEX_LIVE);
  if (m1) return m1[1];
  const m2 = strippedLine.match(TELL_REGEX_HISTORICAL);
  if (m2) return m2[1];
  return null;
}

// Inserta un nick en el ring buffer de tells recientes con dedupe (si ya
// estaba lo lleva al frente) y cap. Devuelve el array nuevo. Inmutable —
// el caller asigna a la ref.
export function pushRecentTell(buffer: string[], nick: string): string[] {
  const next = [nick, ...buffer.filter((n) => n.toLowerCase() !== nick.toLowerCase())];
  return next.slice(0, RECENT_TELLS_CAP);
}
