import { AnsiSpan, FloatingMessageLevel, PatternBlock, Trigger, TriggerAction } from '../types';

export type TriggerSideEffect =
  | { type: 'play_sound'; file: string }
  | { type: 'send'; command: string }
  | { type: 'notify'; title?: string; message: string }
  | { type: 'floating'; message: string; level: FloatingMessageLevel };

export interface ProcessResult {
  gagged: boolean;
  spans: AnsiSpan[];
  sideEffects: TriggerSideEffect[];
}

interface CompiledTrigger {
  trigger: Trigger;
  re: RegExp | null;
  // Literal substring that MUST appear in the line for this trigger's regex
  // to possibly match. Pre-computed to fast-discard triggers via indexOf
  // before the more expensive regex.exec(). Already lowercased when
  // caseInsensitive=true so we don't lowercase the needle on the hot path.
  // null = no discriminator available (expert-mode regex, all-capture pattern,
  // or only sub-2-char literals) — falls through to regex.exec().
  discriminator: string | null;
  caseInsensitive: boolean;
}

const MIN_DISCRIMINATOR_LEN = 2;

export function extractDiscriminator(blocks: PatternBlock[] | undefined): string | null {
  if (!blocks || blocks.length === 0) return null;
  let best: string | null = null;
  for (const b of blocks) {
    if (b.kind !== 'text') continue;
    if (b.text.length < MIN_DISCRIMINATOR_LEN) continue;
    if (best === null || b.text.length > best.length) best = b.text;
  }
  return best;
}

class TriggerEngine {
  private compiled: CompiledTrigger[] = [];

  setActiveTriggers(triggers: Trigger[]): void {
    this.compiled = triggers.map((t) => {
      let re: RegExp | null = null;
      try {
        re = new RegExp(t.source.pattern, t.source.flags || '');
      } catch (e) {
        console.warn(`[triggerEngine] invalid regex in trigger "${t.name}": ${t.source.pattern}`);
      }
      const caseInsensitive = (t.source.flags || '').includes('i');
      const rawDiscriminator = extractDiscriminator(t.source.blocks);
      const discriminator = rawDiscriminator
        ? (caseInsensitive ? rawDiscriminator.toLowerCase() : rawDiscriminator)
        : null;
      return { trigger: t, re, discriminator, caseInsensitive };
    });
  }

  clear(): void {
    this.compiled = [];
  }

  process(plainText: string, spans: AnsiSpan[]): ProcessResult {
    if (this.compiled.length === 0) {
      return { gagged: false, spans, sideEffects: [] };
    }

    // Lazy-computed lowercase haystack — only created if at least one
    // case-insensitive trigger with a discriminator needs it.
    let lowerText: string | null = null;

    for (const c of this.compiled) {
      if (!c.re) continue;
      if (c.discriminator) {
        const haystack = c.caseInsensitive
          ? (lowerText ??= plainText.toLowerCase())
          : plainText;
        if (haystack.indexOf(c.discriminator) < 0) continue;
      }
      c.re.lastIndex = 0;
      const match = c.re.exec(plainText);
      if (!match) continue;

      const sideEffects: TriggerSideEffect[] = [];
      let mutatedSpans = spans;
      let gagged = false;

      for (const action of c.trigger.actions) {
        const result = applyAction(action, match, plainText, mutatedSpans);
        // gag suppresses display, but does NOT short-circuit subsequent
        // actions in the same trigger — users want patterns like
        // [gag, floating] or [gag, play_sound] to silence the line AND fire
        // the side effect.
        if (result.gag) gagged = true;
        if (result.spans) mutatedSpans = result.spans;
        if (result.sideEffect) sideEffects.push(result.sideEffect);
      }

      return { gagged, spans: mutatedSpans, sideEffects };
    }

    return { gagged: false, spans, sideEffects: [] };
  }
}

interface ActionResult {
  gag?: boolean;
  spans?: AnsiSpan[];
  sideEffect?: TriggerSideEffect;
}

function applyAction(
  action: TriggerAction,
  match: RegExpExecArray,
  plainText: string,
  spans: AnsiSpan[],
): ActionResult {
  switch (action.type) {
    case 'gag':
      return { gag: true };

    case 'replace': {
      const newText = expandCaptures(action.with, match);
      return { spans: [{ text: newText }] };
    }

    case 'color':
      return {
        spans: spans.map((s) => ({
          ...s,
          fg: action.fg ?? s.fg,
          bg: action.bg ?? s.bg,
          bold: action.bold ?? s.bold,
        })),
      };

    case 'play_sound':
      return { sideEffect: { type: 'play_sound', file: action.file } };

    case 'send':
      return {
        sideEffect: {
          type: 'send',
          command: expandCaptures(action.command, match),
        },
      };

    case 'notify':
      return {
        sideEffect: {
          type: 'notify',
          title: action.title ? expandCaptures(action.title, match) : undefined,
          message: expandCaptures(action.message, match),
        },
      };

    case 'floating':
      return {
        sideEffect: {
          type: 'floating',
          message: expandCaptures(action.message, match),
          level: action.level || 'info',
        },
      };
  }
}

function expandCaptures(template: string, match: RegExpExecArray): string {
  return template.replace(/\$(\d+)|\$&/g, (full, idx) => {
    if (full === '$&') return match[0];
    const i = Number(idx);
    return match[i] != null ? match[i] : '';
  });
}

export const triggerEngine = new TriggerEngine();
