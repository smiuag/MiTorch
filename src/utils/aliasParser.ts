export interface ParsedAlias {
  name: string;
  command: string;
  type: 'direction' | 'locate' | 'alias';
  description?: string;
}

const DIRECTIONS = ['n', 's', 'e', 'o', 'ne', 'no', 'se', 'so', 'de', 'fu', 'ar', 'ab'];

function cleanAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/%\^[A-Z_]+%\^/g, '')
    .replace(/\u001b\[[0-9;]*m/g, '');
}

function isLocateAlias(command: string): boolean {
  return /\blocate\b|\bmirar\b/.test(command.toLowerCase());
}

function hasVariableParameters(command: string): boolean {
  // Omit aliases with $*$ or $digit+$ pattern
  return /\$[\*\d]+\$/.test(command);
}

export function parseAliasOutput(rawLines: string[]): ParsedAlias[] {
  const aliases: ParsedAlias[] = [];
  const seen = new Set<string>();

  for (const line of rawLines) {
    const cleaned = cleanAnsi(line);
    if (!cleaned.trim()) continue;

    // Split by 2+ spaces to find individual alias:command pairs
    const parts = cleaned.split(/\s{2,}/);

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed.includes(':')) continue;

      const colonIdx = trimmed.indexOf(':');
      const name = trimmed.substring(0, colonIdx).trim();
      const command = trimmed.substring(colonIdx + 1).trim();

      if (!name || !command || seen.has(name)) continue;
      if (!/^[a-zA-Z0-9_]+$/.test(name)) continue;

      // Skip predefined directions - they'll be added separately
      if (DIRECTIONS.includes(name.toLowerCase())) continue;

      // Skip aliases with variable parameters ($*$ or $digit+$)
      if (hasVariableParameters(command)) continue;

      seen.add(name);

      // Don't detect locate - we'll add it as a predefined option
      aliases.push({ name, command, type: 'alias' });
    }
  }

  const userAliases = aliases
    .sort((a, b) => a.name.length - b.name.length);

  return userAliases;
}
