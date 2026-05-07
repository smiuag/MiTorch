import { Buffer } from 'buffer';

// Detecta firma mojibake (`Ã©`, `Â¿`, etc.) y aplica round-trip
// latin1→utf8 para recuperar la cadena original. Si el round-trip
// produce chars de reemplazo (�) significa que NO era mojibake real
// y devolvemos la entrada sin tocar — protege contra falsos positivos.
//
// Caso típico que resuelve: otro jugador conectado en latin-1 envía bytes
// UTF-8 que el MUD almacena como dos chars latin-1 y luego retransmite a
// nosotros (en UTF-8) re-encodeados como UTF-8 — llegan como Ã© doble.
//
// Limitaciones conocidas:
// - No cubre triple encoding (raro).
// - Nombres de jugador que LITERALMENTE empiezan por "Ã" + acento serán
//   mal interpretados, pero en RdL es muy improbable.
// - Si una línea mezcla mojibake y texto bien (raro) intentará el fix
//   sobre la línea entera y solo restaurará si no rompe nada.

// Cualquier carácter UTF-8 de 2 bytes (todo el latino acentuado europeo)
// es `[C2-DF][80-BF]` a nivel de bytes. Cuando el pipeline del MUD lee
// esos bytes como latin-1 y los re-encodea como UTF-8, en cliente
// aparecen como dos chars con codepoint U+00C2..U+00DF + U+0080..U+00BF.
// La regex los caza sin enumerar el alfabeto (cubre í/ó y mayúsculas
// acentuadas que la lista anterior se dejaba fuera). La red de seguridad
// del round-trip — bail si produce `�` — protege contra falsos positivos.
const MOJIBAKE_SIGNATURE = /[Â-ß][-¿]/;

export function fixMojibake(text: string): string {
  if (!text || !MOJIBAKE_SIGNATURE.test(text)) return text;
  try {
    const fixed = Buffer.from(text, 'latin1').toString('utf8');
    if (fixed.includes('�')) return text;
    return fixed;
  } catch {
    return text;
  }
}
