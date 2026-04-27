import { AnsiSpan, FloatingMessageLevel, Trigger, TriggerAction } from '../types';

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
      return { trigger: t, re };
    });
  }

  clear(): void {
    this.compiled = [];
  }

  process(plainText: string, spans: AnsiSpan[]): ProcessResult {
    if (this.compiled.length === 0) {
      return { gagged: false, spans, sideEffects: [] };
    }

    for (const c of this.compiled) {
      if (!c.re) continue;
      c.re.lastIndex = 0;
      const match = c.re.exec(plainText);
      if (!match) continue;

      const sideEffects: TriggerSideEffect[] = [];
      let mutatedSpans = spans;
      let gagged = false;

      for (const action of c.trigger.actions) {
        const result = applyAction(action, match, plainText, mutatedSpans);
        if (result.gag) {
          gagged = true;
          break;
        }
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
