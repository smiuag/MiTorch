import { filterNicks } from '../storage/nickStorage';
import { terminalVocabularyService } from './terminalVocabularyService';

// Motor de sugerencias para el blind keyboard. Combina tres fuentes:
//   1. Diccionario MUD estático: comandos comunes de Reinos (atacar,
//      decir, irsala, etc.). Hardcoded.
//   2. Historial de comandos del personaje: tokens únicos del array
//      `commandHistory` que mantiene TerminalScreen, ordenados por
//      recencia.
//   3. Nicks recientes (per-server, ya en `nickStorage`).
//
// Aplica filtro por prefix (case-insensitive), deduplicación y ranking
// por score = peso_fuente × recencia. Devuelve top N.

const MUD_DICTIONARY = [
  // Movimiento + navegación
  'norte', 'sur', 'este', 'oeste', 'noreste', 'noroeste', 'sureste', 'suroeste',
  'arriba', 'abajo', 'dentro', 'fuera',
  'irsala', 'sigilarsala', 'parar', 'stop', 'mirar', 'm', 'bordear',
  // Combate
  'atacar', 'huir', 'cubrirse', 'destrabarse', 'rendirse', 'ojear', 'evaluar',
  // Comunicación
  'decir', 'responder', 'gritar', 'susurrar', 'comunicar', 'tribu', 'orden',
  'bando', 'grupo', 'comercio', 'novato', 'oficio', 'ayuda',
  // Magia / hechizos
  'formular', 'memorizar', 'olvidar', 'rezar', 'cantar', 'invocar',
  // Inventario / objetos
  'coger', 'soltar', 'dar', 'guardar', 'sacar', 'inventario', 'i',
  'equipar', 'desequipar', 'examinar', 'leer', 'abrir', 'cerrar',
  'meter', 'beber', 'comer', 'usar',
  // Información
  'consultar', 'consentir', 'estado', 'salud', 'vida', 'nivel',
  'puntuacion', 'puntuación', 'sc', 'tareas', 'donde', 'quien',
  'canales', 'puntos', 'experiencia', 'xp',
  // Sociales / utilidad
  'saludar', 'sonreir', 'reir', 'asentir', 'abrazar', 'besar',
  'sentarse', 'levantarse', 'descansar', 'dormir', 'despertar',
  // Misc
  'salir', 'logout', 'quit', 'colores', 'prompt',
];

interface SuggestionContext {
  history?: string[];   // commandHistory de TerminalScreen (cmd más reciente primero)
  serverId?: string;    // por si en el futuro queremos vocabulario per-server
}

const SOURCE_WEIGHT = {
  history: 3.0,    // Lo que el user repite tiene máxima prioridad
  nick: 2.5,       // Nicks recientes son específicos y útiles
  dictionary: 1.0, // Diccionario base
  // Vocabulario del terminal: peso bajo, solo emerge cuando ninguna de
  // las fuentes anteriores tiene match para el prefix. Útil para
  // capturar nicks de NPCs, salas, ítems sin ensuciar el ranking
  // cuando hay alternativas mejores.
  terminal: 0.7,
};

interface ScoredCandidate {
  word: string;
  score: number;
}

export function getSuggestions(
  prefix: string,
  context: SuggestionContext = {},
  limit: number = 10,
): string[] {
  const p = prefix.trim().toLowerCase();
  if (!p) return [];

  const map = new Map<string, ScoredCandidate>();

  const add = (word: string, weight: number, recencyBonus: number = 0) => {
    if (!word.toLowerCase().startsWith(p)) return;
    if (word.toLowerCase() === p) return; // ya tipeada exacta — no aporta
    const score = weight + recencyBonus;
    const key = word.toLowerCase();
    const existing = map.get(key);
    if (!existing || existing.score < score) {
      map.set(key, { word, score });
    }
  };

  // 1. History — tokens únicos, recencia decreciente.
  if (context.history && context.history.length > 0) {
    const seen = new Set<string>();
    context.history.forEach((cmd, idx) => {
      const tokens = cmd.split(/\s+/).filter(Boolean);
      for (const tok of tokens) {
        const lower = tok.toLowerCase();
        if (seen.has(lower)) continue;
        seen.add(lower);
        // Recency bonus: más alto cuanto más reciente. idx=0 es lo más
        // reciente. Bonus baja con índice.
        const recencyBonus = Math.max(0, 1 - idx * 0.05);
        add(tok, SOURCE_WEIGHT.history, recencyBonus);
      }
    });
  }

  // 2. Nicks recientes — el storage ya devuelve ordenado por lastSeen.
  const nicks = filterNicks(p, 20);
  const now = Date.now();
  for (const entry of nicks) {
    // Recency bonus por nick (días desde último visto, decae).
    const days = (now - entry.lastSeen) / 86400000;
    const recencyBonus = Math.max(0, 1 - days * 0.1);
    add(entry.nick, SOURCE_WEIGHT.nick, recencyBonus);
  }

  // 3. Diccionario MUD estático.
  for (const word of MUD_DICTIONARY) {
    add(word, SOURCE_WEIGHT.dictionary);
  }

  // 4. Vocabulario rolling de las últimas N líneas del terminal.
  for (const word of terminalVocabularyService.filter(p, 50)) {
    add(word, SOURCE_WEIGHT.terminal);
  }

  return Array.from(map.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((c) => c.word);
}
