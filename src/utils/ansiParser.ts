import { AnsiSpan } from '../types';

const ANSI_COLORS: Record<number, string> = {
  30: '#444444', 31: '#dd5555', 32: '#55dd55', 33: '#dddd55',
  34: '#5555dd', 35: '#dd55dd', 36: '#55dddd', 37: '#ffffff',
  90: '#888888', 91: '#ff5555', 92: '#55ff55', 93: '#ffff55',
  94: '#5555ff', 95: '#ff55ff', 96: '#55ffff', 97: '#ffffff',
};

const ANSI_BG_COLORS: Record<number, string> = {
  40: '#444444', 41: '#dd5555', 42: '#55dd55', 43: '#dddd55',
  44: '#5555dd', 45: '#dd55dd', 46: '#55dddd', 47: '#ffffff',
  100: '#888888', 101: '#ff5555', 102: '#55ff55', 103: '#ffff55',
  104: '#5555ff', 105: '#ff55ff', 106: '#55ffff', 107: '#ffffff',
};

const ANSI_256_COLORS: string[] = (() => {
  const colors: string[] = [];
  // 0-15: standard + bright colors
  const std = [
    '#444444', '#dd5555', '#55dd55', '#dddd55', '#5555dd', '#dd55dd', '#55dddd', '#ffffff',
    '#888888', '#ff5555', '#55ff55', '#ffff55', '#5555ff', '#ff55ff', '#55ffff', '#ffffff',
  ];
  colors.push(...std);
  // 16-231: 6x6x6 color cube
  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 6; g++) {
      for (let b = 0; b < 6; b++) {
        const rv = r ? r * 40 + 55 : 0;
        const gv = g ? g * 40 + 55 : 0;
        const bv = b ? b * 40 + 55 : 0;
        colors.push(`#${rv.toString(16).padStart(2, '0')}${gv.toString(16).padStart(2, '0')}${bv.toString(16).padStart(2, '0')}`);
      }
    }
  }
  // 232-255: grayscale
  for (let i = 0; i < 24; i++) {
    const v = i * 10 + 8;
    const hex = v.toString(16).padStart(2, '0');
    colors.push(`#${hex}${hex}${hex}`);
  }
  return colors;
})();

interface AnsiState {
  fg?: string;
  bg?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

function applyParams(state: AnsiState, params: number[]): void {
  let i = 0;
  while (i < params.length) {
    const p = params[i];
    if (p === 0) {
      state.fg = undefined;
      state.bg = undefined;
      state.bold = undefined;
      state.italic = undefined;
      state.underline = undefined;
    } else if (p === 1) {
      state.bold = true;
    } else if (p === 3) {
      state.italic = true;
    } else if (p === 4) {
      state.underline = true;
    } else if (p === 22) {
      state.bold = undefined;
    } else if (p === 23) {
      state.italic = undefined;
    } else if (p === 24) {
      state.underline = undefined;
    } else if (p >= 30 && p <= 37) {
      state.fg = ANSI_COLORS[p];
    } else if (p === 38 && params[i + 1] === 5) {
      // 256-color foreground
      const colorIndex = params[i + 2];
      state.fg = ANSI_256_COLORS[colorIndex] ?? undefined;
      i += 2;
    } else if (p === 38 && params[i + 1] === 2) {
      // 24-bit foreground
      const r = params[i + 2], g = params[i + 3], b = params[i + 4];
      state.fg = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      i += 4;
    } else if (p === 39) {
      state.fg = undefined;
    } else if (p >= 40 && p <= 47) {
      state.bg = ANSI_BG_COLORS[p];
    } else if (p === 48 && params[i + 1] === 5) {
      const colorIndex = params[i + 2];
      state.bg = ANSI_256_COLORS[colorIndex] ?? undefined;
      i += 2;
    } else if (p === 48 && params[i + 1] === 2) {
      const r = params[i + 2], g = params[i + 3], b = params[i + 4];
      state.bg = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      i += 4;
    } else if (p === 49) {
      state.bg = undefined;
    } else if (p >= 90 && p <= 97) {
      state.fg = ANSI_COLORS[p];
    } else if (p >= 100 && p <= 107) {
      state.bg = ANSI_BG_COLORS[p];
    }
    i++;
  }
}

// ESC sequence regex: matches CSI sequences (ESC[...m) and strips other ESC sequences
const ESC_RE = /\x1b\[([0-9;]*)m/g;
// Strip non-SGR escape sequences
const ESC_OTHER = /\x1b\[[^a-zA-Z]*[a-ln-zA-Z]|\x1b[^[\x1b]/g;

export function parseAnsi(text: string): AnsiSpan[] {
  if (text.includes('bando') || text.length > 150) {
    // parseAnsi logs removed Input text (first 100 chars):', JSON.stringify(text.slice(0, 100)));
    // parseAnsi logs removed Has ANSI codes:', /\x1b\[/.test(text));
  }

  // Strip non-color escape sequences
  text = text.replace(ESC_OTHER, '');

  const spans: AnsiSpan[] = [];
  const state: AnsiState = {};
  let lastIndex = 0;

  ESC_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = ESC_RE.exec(text)) !== null) {
    // Text before this escape
    if (match.index > lastIndex) {
      const chunk = text.slice(lastIndex, match.index);
      if (chunk) {
        spans.push({ text: chunk, ...state });
      }
    }
    // Parse params
    const params = match[1] ? match[1].split(';').map(Number) : [0];
    applyParams(state, params);
    lastIndex = ESC_RE.lastIndex;
  }

  // Remaining text
  if (lastIndex < text.length) {
    const chunk = text.slice(lastIndex);
    if (chunk) {
      spans.push({ text: chunk, ...state });
    }
  }

  if (text.includes('bando') || text.length > 150) {
    // parseAnsi logs removed Output spans count:', spans.length);
  }

  return spans;
}
