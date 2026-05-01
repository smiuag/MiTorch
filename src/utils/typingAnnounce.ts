import { speechQueue } from '../services/speechQueueService';

// Anuncio de tecleo para self-voicing (TalkBack desactivado). Se invoca
// desde el `onChangeText` de cada TextInput del flujo blind, comparando el
// valor previo con el nuevo. El llamador decide cuándo invocarlo (gate por
// `selfVoicingActive`); aquí solo decidimos QUÉ decir:
//
//   - Cada carácter añadido se anuncia (prioridad 'high' → tecleo rápido
//     atropella anuncios viejos y solo oyes el último, igual que TalkBack).
//   - Si lo añadido es UN solo separador (espacio, puntuación), en lugar
//     del nombre del separador se anuncia la palabra recién cerrada
//     (más útil que oír "espacio"). Si no hay palabra delante (separador
//     al inicio o tras otro separador), se anuncia el nombre del separador.
//   - Borrar anuncia "borrado".
//   - Paste de varios chars: leídos tal cual.

const PUNCT = /[\s.,;:!?¿¡()'"\-]/;

export function announceTyping(prev: string, curr: string): void {
  if (prev === curr) return;

  if (curr.length < prev.length) {
    speechQueue.enqueue('borrado', 'high');
    return;
  }

  const added = diffAdded(prev, curr);
  if (!added) return;

  if (added.length === 1 && PUNCT.test(added)) {
    const word = lastWordBefore(curr, curr.length - 1);
    speechQueue.enqueue(word || spellable(added), 'high');
    return;
  }

  speechQueue.enqueue(spellable(added), 'high');
}

// Best effort: en append puro (escribir al final) devuelve la cola añadida.
// En edición en medio (paste o cursor en el medio) devuelve el bloque que
// quedó entre el prefijo y el sufijo comunes — no siempre es lo que el
// usuario quiere oír, pero el caso 99% del flujo blind es append.
function diffAdded(prev: string, curr: string): string {
  if (curr.startsWith(prev)) return curr.slice(prev.length);
  let p = 0;
  while (p < prev.length && p < curr.length && prev[p] === curr[p]) p++;
  let s = 0;
  while (
    s < prev.length - p &&
    s < curr.length - p &&
    prev[prev.length - 1 - s] === curr[curr.length - 1 - s]
  ) s++;
  return curr.slice(p, curr.length - s);
}

function lastWordBefore(s: string, end: number): string {
  let i = end - 1;
  while (i >= 0 && PUNCT.test(s[i])) i--;
  const wordEnd = i + 1;
  while (i >= 0 && !PUNCT.test(s[i])) i--;
  return s.slice(i + 1, wordEnd);
}

function spellable(c: string): string {
  if (c.length !== 1) return c;
  if (c === ' ') return 'espacio';
  if (c === '\n') return 'enter';
  if (c === '.') return 'punto';
  if (c === ',') return 'coma';
  if (c === ';') return 'punto y coma';
  if (c === ':') return 'dos puntos';
  if (c === '?') return 'interrogación';
  if (c === '!') return 'exclamación';
  return c;
}
