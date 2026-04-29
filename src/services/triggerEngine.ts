import { AnsiSpan, FloatingMessageLevel, PatternBlock, Trigger, TriggerAction, VariableCondition } from '../types';
import { PlayerVariables } from './playerStatsService';
import { getVariableDependencies, readVariable } from '../utils/variableMap';

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

interface CompiledVariableTrigger {
  trigger: Trigger;
  variableName: string;
  condition: VariableCondition;
  // Internal fields the variable depends on. Used as fast filter: skip the
  // trigger entirely when none of its deps changed in the current snapshot.
  fields: (keyof PlayerVariables)[];
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
  private compiledVariables: CompiledVariableTrigger[] = [];

  setActiveTriggers(triggers: Trigger[]): void {
    const regexCompiled: CompiledTrigger[] = [];
    const varCompiled: CompiledVariableTrigger[] = [];

    for (const t of triggers) {
      if (t.source.kind === 'regex') {
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
        regexCompiled.push({ trigger: t, re, discriminator, caseInsensitive });
      } else if (t.source.kind === 'variable') {
        const fields = getVariableDependencies(t.source.name);
        if (fields.length === 0) {
          console.warn(`[triggerEngine] unknown variable "${t.source.name}" in trigger "${t.name}"`);
          continue;
        }
        varCompiled.push({
          trigger: t,
          variableName: t.source.name,
          condition: t.source.condition,
          fields,
        });
      }
    }

    this.compiled = regexCompiled;
    this.compiledVariables = varCompiled;
  }

  clear(): void {
    this.compiled = [];
    this.compiledVariables = [];
  }

  // Cheap O(1) check the line pipeline uses to decide whether to bother
  // running the prompt parser's expensive field extraction. When no variable
  // triggers are active, captured prompt values are never read by anything,
  // so we can skip extraction entirely (the line still gets gagged).
  hasVariableTriggers(): boolean {
    return this.compiledVariables.length > 0;
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

  // Evaluate variable triggers after a snapshot update. `changedKeys` is the
  // list of internal PlayerVariables fields that actually changed. `prev` and
  // `current` are full snapshots — derived variables (vida_pct, en_combate)
  // are computed from these on demand. Side effects are returned for the
  // caller (TerminalScreen) to dispatch the same way as regex side effects.
  evaluateVariableTriggers(
    changedKeys: (keyof PlayerVariables)[],
    prev: PlayerVariables,
    current: PlayerVariables,
  ): TriggerSideEffect[] {
    const effects: TriggerSideEffect[] = [];
    if (this.compiledVariables.length === 0 || changedKeys.length === 0) return effects;
    const changedSet = new Set<keyof PlayerVariables>(changedKeys);

    // First-match-wins **per variable**: once a trigger fires on a given
    // variable name (e.g. `imagenes`), subsequent triggers watching the same
    // variable in this snapshot are skipped. Triggers on OTHER variables
    // (e.g. `pieles`, `vida`) keep evaluating independently.
    //
    // This mirrors the regex `process()` semantics — first rule that matches
    // wins — but scoped to each variable since a single prompt update can
    // legitimately change multiple variables at once.
    const firedVariables = new Set<string>();

    for (const cv of this.compiledVariables) {
      if (firedVariables.has(cv.variableName)) continue;

      // Fast filter: only evaluate if any of its dependencies changed.
      let touched = false;
      for (const f of cv.fields) {
        if (changedSet.has(f)) {
          touched = true;
          break;
        }
      }
      if (!touched) continue;

      const oldVal = readVariable(cv.variableName, prev);
      const newVal = readVariable(cv.variableName, current);
      if (oldVal === undefined || newVal === undefined) continue;
      if (oldVal === newVal) continue;

      if (!checkVariableCondition(cv.condition, oldVal, newVal)) continue;

      for (const action of cv.trigger.actions) {
        const fx = applyVariableAction(action, oldVal, newVal);
        if (fx) effects.push(fx);
      }
      firedVariables.add(cv.variableName);
    }
    return effects;
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

function checkVariableCondition(
  cond: VariableCondition,
  oldVal: number | string | boolean,
  newVal: number | string | boolean,
): boolean {
  switch (cond.event) {
    case 'changes':
      return oldVal !== newVal;
    case 'appears': {
      const wasEmpty = oldVal === '' || oldVal === 0 || oldVal === false;
      const isNonEmpty = newVal !== '' && newVal !== 0 && newVal !== false;
      return wasEmpty && isNonEmpty;
    }
    case 'equals':
      return newVal === cond.value;
    case 'crosses_below':
      if (typeof oldVal !== 'number' || typeof newVal !== 'number') return false;
      return oldVal >= cond.value && newVal < cond.value;
    case 'crosses_above':
      if (typeof oldVal !== 'number' || typeof newVal !== 'number') return false;
      return oldVal <= cond.value && newVal > cond.value;
  }
}

function applyVariableAction(
  action: TriggerAction,
  oldVal: number | string | boolean,
  newVal: number | string | boolean,
): TriggerSideEffect | null {
  // gag/replace/color don't make sense for variable triggers (no line to
  // mutate — the prompt line is already gagged by the parser). The wizard
  // should not allow these, but if a saved trigger has them we ignore.
  switch (action.type) {
    case 'play_sound':
      return action.file ? { type: 'play_sound', file: action.file } : null;
    case 'send':
      return {
        type: 'send',
        command: expandVariableTemplate(action.command, oldVal, newVal),
      };
    case 'notify':
      return {
        type: 'notify',
        title: action.title ? expandVariableTemplate(action.title, oldVal, newVal) : undefined,
        message: expandVariableTemplate(action.message, oldVal, newVal),
      };
    case 'floating':
      return {
        type: 'floating',
        message: expandVariableTemplate(action.message, oldVal, newVal),
        level: action.level || 'info',
      };
    default:
      return null;
  }
}

function expandVariableTemplate(
  template: string,
  oldVal: number | string | boolean,
  newVal: number | string | boolean,
): string {
  return template
    .replace(/\$old\b/g, String(oldVal))
    .replace(/\$new\b/g, String(newVal));
}

export const triggerEngine = new TriggerEngine();
