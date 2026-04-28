import {
  ActionTextBlock,
  AnchorMode,
  CaptureType,
  PatternBlock,
} from '../types';

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const CAPTURE_PATTERNS: Record<CaptureType, string> = {
  word: '(\\S+)',
  phrase: '(.+?)',
  number: '(\\d+)',
};

export interface CompiledPattern {
  pattern: string;
  /** Maps captureBlock.id → 1-based group index in the regex. */
  captureMap: Map<string, number>;
}

export function compilePattern(
  blocks: PatternBlock[],
  anchorStart: AnchorMode = 'open',
  anchorEnd: AnchorMode = 'open',
): CompiledPattern {
  const parts: string[] = [];
  const captureMap = new Map<string, number>();
  let groupIndex = 0;

  if (anchorStart === 'anchored') parts.push('^');

  for (const b of blocks) {
    if (b.kind === 'text') {
      parts.push(escapeRegex(b.text));
    } else {
      groupIndex += 1;
      captureMap.set(b.id, groupIndex);
      parts.push(CAPTURE_PATTERNS[b.captureType]);
    }
  }

  if (anchorEnd === 'anchored') parts.push('$');

  return { pattern: parts.join(''), captureMap };
}

export function compileActionText(
  blocks: ActionTextBlock[] | undefined,
  captureMap: Map<string, number>,
): string {
  if (!blocks) return '';
  return blocks
    .map((b) => {
      if (b.kind === 'text') return b.text;
      const idx = captureMap.get(b.captureId);
      if (idx == null) {
        // Orphan capture_ref — its target capture no longer exists in the
        // pattern. Compiles to empty so the runtime sub yields nothing,
        // but log so the user can find out via adb logcat.
        console.warn(
          `[triggerCompiler] capture_ref points to unknown captureId "${b.captureId}" — orphaned chip. Action text will be empty at this position.`,
        );
        return '';
      }
      return `$${idx}`;
    })
    .join('');
}

/** Returns capture_ref blocks whose captureId isn't in the captureMap. */
export function findOrphanCaptureRefs(
  blocks: ActionTextBlock[] | undefined,
  captureMap: Map<string, number>,
): string[] {
  if (!blocks) return [];
  const out: string[] = [];
  for (const b of blocks) {
    if (b.kind === 'capture_ref' && !captureMap.has(b.captureId)) {
      out.push(b.captureId);
    }
  }
  return out;
}

let nextCaptureId = 1;
export function newCaptureId(): string {
  return `cap_${Date.now()}_${nextCaptureId++}`;
}

const PALETTE = ['#e6c200', '#1ca0c8', '#d24d8c', '#cc6633', '#56a955', '#7a78d8'];

/** Assigns colors to captures by order of appearance, cycling through the palette. */
export function captureColors(blocks: PatternBlock[]): Map<string, string> {
  const out = new Map<string, string>();
  let i = 0;
  for (const b of blocks) {
    if (b.kind === 'capture') {
      out.set(b.id, PALETTE[i % PALETTE.length]);
      i += 1;
    }
  }
  return out;
}

const TYPE_LABEL: Record<CaptureType, string> = {
  word: 'palabra',
  phrase: 'frase',
  number: 'número',
};

/** Auto-labels captures: "palabra 1", "palabra 2", "frase 1", etc. */
export function captureLabels(blocks: PatternBlock[]): Map<string, string> {
  const counts: Record<CaptureType, number> = { word: 0, phrase: 0, number: 0 };
  const out = new Map<string, string>();
  for (const b of blocks) {
    if (b.kind === 'capture') {
      counts[b.captureType] += 1;
      out.set(b.id, `${TYPE_LABEL[b.captureType]} ${counts[b.captureType]}`);
    }
  }
  return out;
}
