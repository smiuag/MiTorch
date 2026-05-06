// Vocabulario rolling de las últimas N líneas del terminal. Sirve como
// 4ª fuente del SuggestionEngine — captura nicks de NPCs, nombres de
// salas, ítems, etc. que no están en el diccionario hardcoded ni en
// nicks/history.
//
// Mantenimiento incremental: cada línea entrante se tokeniza y se
// suma al refcount de cada token. Cuando se expulsa una línea vieja
// (>maxLines), se decrementan los refcounts de sus tokens; si llegan
// a 0, el token desaparece del set activo. Coste por keystroke: solo
// iterar el set y filtrar por prefix — ~ms imperceptibles.

const MAX_LINES = 200;
const MIN_TOKEN_LEN = 4;
const MAX_TOKEN_LEN = 30;

// Stopwords en castellano que aparecen mucho pero no aportan valor
// como sugerencia. Lista corta y conservadora.
const STOPWORDS = new Set([
  'pero', 'esto', 'eso', 'esta', 'este', 'esa', 'ese',
  'aquí', 'aqui', 'allí', 'alli', 'aquel', 'aquellos',
  'algún', 'algun', 'alguno', 'alguna', 'algunos', 'algunas',
  'mucho', 'mucha', 'muchos', 'muchas', 'todo', 'toda', 'todos', 'todas',
  'otro', 'otra', 'otros', 'otras',
  'cada', 'porque', 'porqué', 'cómo', 'como',
  'sólo', 'solo', 'también', 'tambien',
  'entre', 'sobre', 'desde', 'hasta', 'hacia',
  'cuando', 'cuándo', 'donde', 'dónde', 'mientras',
  'están', 'estás', 'estoy', 'estamos', 'están', 'estaba', 'estaban',
  'tiene', 'tienes', 'tengo', 'tenemos', 'tenían', 'tenía',
  'puede', 'puedes', 'puedo', 'podemos', 'pueden',
  'parece', 'parecen', 'siente', 'sientes', 'siento',
  'siempre', 'nunca', 'jamás', 'jamas',
  'antes', 'después', 'despues', 'luego',
]);

// Regex para split: cualquier cosa que no sea letra (incluyendo
// vocales acentuadas y ñ) cuenta como separador.
const TOKEN_SPLIT_RE = /[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]+/;
const ANSI_RE = /\x1b\[[\d;]*m/g;

class TerminalVocabularyService {
  // Cola circular de tokens por línea (FIFO).
  private linesQueue: string[][] = [];
  // Refcount para saber cuándo un token deja de estar en el buffer.
  private tokenRefCount = new Map<string, number>();

  addLine(text: string): void {
    const tokens = this.tokenize(text);
    if (tokens.length === 0) return;
    this.linesQueue.push(tokens);
    for (const tok of tokens) {
      this.tokenRefCount.set(tok, (this.tokenRefCount.get(tok) || 0) + 1);
    }
    while (this.linesQueue.length > MAX_LINES) {
      const old = this.linesQueue.shift()!;
      for (const tok of old) {
        const c = (this.tokenRefCount.get(tok) || 0) - 1;
        if (c <= 0) this.tokenRefCount.delete(tok);
        else this.tokenRefCount.set(tok, c);
      }
    }
  }

  filter(prefix: string, limit: number = 20): string[] {
    if (!prefix) return [];
    const p = prefix.toLowerCase();
    const result: string[] = [];
    for (const tok of this.tokenRefCount.keys()) {
      if (tok.toLowerCase().startsWith(p)) {
        result.push(tok);
        if (result.length >= limit) break;
      }
    }
    return result;
  }

  clear(): void {
    this.linesQueue = [];
    this.tokenRefCount.clear();
  }

  private tokenize(text: string): string[] {
    const clean = text.replace(ANSI_RE, '');
    const raw = clean.split(TOKEN_SPLIT_RE).filter(Boolean);
    const out: string[] = [];
    for (const t of raw) {
      if (t.length < MIN_TOKEN_LEN || t.length > MAX_TOKEN_LEN) continue;
      if (STOPWORDS.has(t.toLowerCase())) continue;
      out.push(t);
    }
    return out;
  }
}

export const terminalVocabularyService = new TerminalVocabularyService();
