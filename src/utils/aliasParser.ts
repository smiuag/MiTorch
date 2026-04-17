export interface ParsedAlias {
  name: string;
  command: string;
  type: 'direction' | 'locate' | 'alias';
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

export function parseAliasOutput(rawLines: string[]): ParsedAlias[] {
  const cleanedText = rawLines.map(cleanAnsi).join('\n');

  const aliases: ParsedAlias[] = [];
  const seen = new Set<string>();

  const regex = /([a-zA-Z0-9_]+):\s*(.+?)(?=\s{2,}[a-zA-Z0-9_]+:|[\r\n]|$)/g;
  let match;

  while ((match = regex.exec(cleanedText)) !== null) {
    const name = match[1].trim();
    const command = match[2].trim();

    if (!name || !command || seen.has(name)) continue;
    seen.add(name);

    let type: 'direction' | 'locate' | 'alias' = 'alias';

    if (DIRECTIONS.includes(name.toLowerCase())) {
      type = 'direction';
    } else if (isLocateAlias(command)) {
      type = 'locate';
    }

    aliases.push({ name, command, type });
  }

  const directions = aliases.filter(a => a.type === 'direction')
    .sort((a, b) => DIRECTIONS.indexOf(a.name.toLowerCase()) - DIRECTIONS.indexOf(b.name.toLowerCase()));

  const locate = aliases.filter(a => a.type === 'locate');

  const userAliases = aliases.filter(a => a.type === 'alias')
    .sort((a, b) => a.name.length - b.name.length);

  return [...directions, ...locate, ...userAliases];
}
