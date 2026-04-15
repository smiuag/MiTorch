import { AnsiSpan } from '../types';

const ANSI_COLORS: Record<number, string> = {
  30: '#000000', 31: '#cc0000', 32: '#00cc00', 33: '#cccc00',
  34: '#0000cc', 35: '#cc00cc', 36: '#00cccc', 37: '#cccccc',
  90: '#666666', 91: '#ff0000', 92: '#00ff00', 93: '#ffff00',
  94: '#5555ff', 95: '#ff00ff', 96: '#00ffff', 97: '#ffffff',
};

const ANSI_BG_COLORS: Record<number, string> = {
  40: '#000000', 41: '#cc0000', 42: '#00cc00', 43: '#cccc00',
  44: '#0000cc', 45: '#cc00cc', 46: '#00cccc', 47: '#cccccc',
  100: '#666666', 101: '#ff0000', 102: '#00ff00', 103: '#ffff00',
  104: '#5555ff', 105: '#ff00ff', 106: '#00ffff', 107: '#ffffff',
};

const ANSI_256_COLORS: string[] = (() => {
  const colors: string[] = [];
  // 0-15: standard + bright colors
  const std = [
    '#000000', '#cc0000', '#00cc00', '#cccc00', '#0000cc', '#cc00cc', '#00cccc', '#cccccc',
    '#666666', '#ff0000', '#00ff00', '#ffff00', '#5555ff', '#ff00ff', '#00ffff', '#ffffff',
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
      state.fg = ANSI_COLORS[state.bold ? p + 60 : p];
    } else if (p === 38 && params[i + 1] === 5) {
      // 256-color foreground
      state.fg = ANSI_256_COLORS[params[i + 2]] ?? undefined;
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
      state.bg = ANSI_256_COLORS[params[i + 2]] ?? undefined;
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

  return spans;
}
