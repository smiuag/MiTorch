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

  // Join all lines and clean
  const fullText = rawLines.join(' ');
  const cleaned = cleanAnsi(fullText);

  // Match pattern: word: anything up to next word: or end
  // This regex captures: name: command pairs separated by significant whitespace
  const aliasRegex = /(\w+):\s*([^:]*?)(?=\s{2,}\w+:|$)/g;
  let match;

  while ((match = aliasRegex.exec(cleaned)) !== null) {
    const name = match[1].trim();
    const command = match[2].trim();

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

  const userAliases = aliases
    .sort((a, b) => a.name.length - b.name.length);

  return userAliases;
}
