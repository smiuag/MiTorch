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

  // Join lines intelligently: add space only if next line starts a new alias
  let fullText = '';
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (i === 0) {
      fullText = line;
    } else {
      // If line starts with \w+: (new alias), add space. Otherwise it's continuation, no space
      const startsNewAlias = /^\w+:/.test(line.trim());
      fullText += startsNewAlias ? ' ' + line : line;
    }
  }

  const cleaned = cleanAnsi(fullText);

  // Preserve variables: replace $...$ with placeholders so colons inside don't break parsing
  const variables: string[] = [];
  let withoutVars = cleaned;
  withoutVars = withoutVars.replace(/\$[^$]*\$/g, (match) => {
    variables.push(match);
    return `__VAR_${variables.length - 1}__`;
  });

  // Match pattern: word: anything up to next word: or end
  // This regex captures: name: command pairs separated by significant whitespace
  const aliasRegex = /(\w+):\s*([^:]*?)(?=\s{2,}\w+:|$)/g;
  let match;

  while ((match = aliasRegex.exec(withoutVars)) !== null) {
    let name = match[1].trim();
    let command = match[2].trim();

    // Restore variables in command
    command = command.replace(/__VAR_(\d+)__/g, (_, idx) => variables[parseInt(idx)] || '');

    if (!name || !command || seen.has(name)) continue;
    if (!/^[a-zA-Z0-9_]+$/.test(name)) continue;

    // Skip predefined directions - they'll be added separately
    if (DIRECTIONS.includes(name.toLowerCase())) continue;

    // Skip aliases with variable parameters ($*$ or $digit+$) UNLESS they are channel aliases
    const isChannel = isChannelAlias(command);
    if (!isChannel && hasVariableParameters(command)) continue;

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
