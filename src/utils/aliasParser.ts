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

function isChannelAlias(command: string): boolean {
  // Check if command contains channel-related keywords
  const keywords = ['chat', 'bando', 'grupo', 'gremio', 'ciudadania', 'familia', 'rol', 'trivial', 'consulta', 'novato', 'clan'];
  return keywords.some(keyword => command.toLowerCase().includes(keyword));
}

export function parseAliasOutput(rawLines: string[]): ParsedAlias[] {
  const aliases: ParsedAlias[] = [];
  const seen = new Set<string>();

  // Join all lines and clean ANSI codes
  const fullText = rawLines.join(' ');
  const cleaned = cleanAnsi(fullText);

  // First, normalize excessive whitespace (keep single space between items)
  const normalized = cleaned.replace(/\s+/g, ' ');

  // Match pattern: word: anything up to next word: or end
  // Look for: name: command, where command ends when we see 2+ spaces + word + colon
  const aliasRegex = /(\w+):\s*([^:]+?)(?=\s{2,}\w+:\s|$)/g;
  let match;

  while ((match = aliasRegex.exec(normalized)) !== null) {
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

  // Sort: channel aliases first, then rest
  const userAliases = aliases.sort((a, b) => {
    const aIsChannel = isChannelAlias(a.command);
    const bIsChannel = isChannelAlias(b.command);

    // Channel aliases come first
    if (aIsChannel && !bIsChannel) return -1;
    if (!aIsChannel && bIsChannel) return 1;

    // Within same category, sort by name length
    return a.name.length - b.name.length;
  });

  return userAliases;
}
