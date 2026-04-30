import { AnsiSpan, FloatingMessageLevel, PatternBlock, Trigger, TriggerAction, VariableCondition } from '../types';
import { PlayerVariables, playerStatsService } from './playerStatsService';
import { userVariablesService } from './userVariablesService';
import { getVariableDependencies, isPredefinedVariable, readVariable } from '../utils/variableMap';

export type TriggerSideEffect =
  | { type: 'play_sound'; file: string }
  | { type: 'send'; command: string }
  | { type: 'notify'; title?: string; message: string }
  | { type: 'floating'; message: string; level: FloatingMessageLevel; fg?: string; bg?: string };

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

interface CompiledPromptVarTrigger {
  trigger: Trigger;
  variableName: string;
  condition: VariableCondition;
  // Internal fields the variable depends on. Used as fast filter: skip the
  // trigger entirely when none of its deps changed in the current snapshot.
  fields: (keyof PlayerVariables)[];
}

interface CompiledUserVarTrigger {
  trigger: Trigger;
  variableName: string;
  condition: VariableCondition;
}

const MIN_DISCRIMINATOR_LEN = 2;

// Hard cap on cascading user-variable trigger evaluations. Trigger A fires a
// set_var that fires trigger B, which fires another set_var that fires C...
// We cap at 3 levels deep to make accidental loops self-terminating without
// hanging the JS thread. A console.warn is logged when the cap kicks in.
const MAX_USER_VAR_DEPTH = 3;

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
  private compiledPromptVars: CompiledPromptVarTrigger[] = [];
  private compiledUserVars: CompiledUserVarTrigger[] = [];
  private userVarDepth = 0;

  setActiveTriggers(triggers: Trigger[]): void {
    const regexCompiled: CompiledTrigger[] = [];
    const promptVarCompiled: CompiledPromptVarTrigger[] = [];
    const userVarCompiled: CompiledUserVarTrigger[] = [];

    // Resolve ${personaje} (the only static system var supported in regex
    // patterns) once per recompile. Empty when the user didn't fill the
    // "Personaje" field — substitution becomes (?!), which never matches.
    const playerName = playerStatsService.getPlayerVariables().playerName ?? '';
    const escapedPersonaje = playerName
      ? playerName.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
      : '(?!)';

    for (const t of triggers) {
      if (t.source.kind === 'regex') {
        const pattern = t.source.pattern.replace(/\$\{personaje\}/g, escapedPersonaje);
        let re: RegExp | null = null;
        try {
          re = new RegExp(pattern, t.source.flags || '');
        } catch (e) {
          console.warn(`[triggerEngine] invalid regex in trigger "${t.name}": ${pattern}`);
        }
        const caseInsensitive = (t.source.flags || '').includes('i');
        const rawDiscriminator = extractDiscriminator(t.source.blocks);
        const discriminator = rawDiscriminator
          ? (caseInsensitive ? rawDiscriminator.toLowerCase() : rawDiscriminator)
          : null;
        regexCompiled.push({ trigger: t, re, discriminator, caseInsensitive });
      } else if (t.source.kind === 'variable') {
        // Partition variable triggers by whether the watched name is a
        // predefined prompt variable or a user-defined one. They evaluate
        // through different paths (snapshots vs scalar pair).
        if (isPredefinedVariable(t.source.name)) {
          const fields = getVariableDependencies(t.source.name);
          if (fields.length === 0) {
            console.warn(`[triggerEngine] unknown prompt variable "${t.source.name}" in trigger "${t.name}"`);
            continue;
          }
          promptVarCompiled.push({
            trigger: t,
            variableName: t.source.name,
            condition: t.source.condition,
            fields,
          });
        } else {
          // Any name not in VARIABLE_SPECS is treated as a user-defined var.
          // The var doesn't need to exist yet — the trigger watches for the
          // first time set_var writes it.
          userVarCompiled.push({
            trigger: t,
            variableName: t.source.name,
            condition: t.source.condition,
          });
        }
      }
    }

    this.compiled = regexCompiled;
    this.compiledPromptVars = promptVarCompiled;
    this.compiledUserVars = userVarCompiled;
  }

  clear(): void {
    this.compiled = [];
    this.compiledPromptVars = [];
    this.compiledUserVars = [];
    this.userVarDepth = 0;
  }

  // Cheap O(1) check the line pipeline uses to decide whether to bother
  // running the prompt parser's expensive field extraction. When no PROMPT
  // variable triggers are active, captured prompt values are never read,
  // so we can skip extraction entirely (the line still gets gagged).
  hasVariableTriggers(): boolean {
    return this.compiledPromptVars.length > 0;
  }

  process(plainText: string, spans: AnsiSpan[]): ProcessResult {
    if (this.compiled.length === 0) {
      return { gagged: false, spans, sideEffects: [] };
    }

    // Lazy-computed lowercase haystack — only created if at least one
    // case-insensitive trigger with a discriminator needs it.
    let lowerText: string | null = null;

    // Accumulators across the trigger chain. Non-blocking triggers contribute
    // side-effects but no mutations; the first blocking match takes its
    // mutations and breaks. Default behavior (no `blocking` flag set) is
    // first-match-wins, identical to the pre-blocking-flag engine.
    let mutatedSpans = spans;
    let gagged = false;
    const sideEffects: TriggerSideEffect[] = [];

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

      const blocking = c.trigger.blocking !== false;

      for (const action of c.trigger.actions) {
        // Mutations (gag/replace/color) are skipped on non-blocking triggers
        // — letting several non-blocking triggers compete to mutate the same
        // line leads to undefined display state. Side-effects (sound, send,
        // notify, floating, set_var) are always applied.
        if (!blocking && (action.type === 'gag' || action.type === 'replace' || action.type === 'color')) {
          continue;
        }
        const result = this.applyAction(action, match, mutatedSpans, sideEffects);
        // gag suppresses display, but does NOT short-circuit subsequent
        // actions in the same trigger — users want patterns like
        // [gag, floating] or [gag, play_sound] to silence the line AND fire
        // the side effect.
        if (result.gag) gagged = true;
        if (result.spans) mutatedSpans = result.spans;
      }

      if (blocking) break;
    }

    return { gagged, spans: mutatedSpans, sideEffects };
  }

  // Evaluate prompt variable triggers after a snapshot update. `changedKeys`
  // is the list of internal PlayerVariables fields that actually changed.
  // `prev` and `current` are full snapshots — derived variables (vida_pct,
  // en_combate) are computed from these on demand. Side effects are returned
  // for the caller (TerminalScreen) to dispatch the same way as regex side
  // effects.
  evaluateVariableTriggers(
    changedKeys: (keyof PlayerVariables)[],
    prev: PlayerVariables,
    current: PlayerVariables,
  ): TriggerSideEffect[] {
    const effects: TriggerSideEffect[] = [];
    if (this.compiledPromptVars.length === 0 || changedKeys.length === 0) return effects;
    const changedSet = new Set<keyof PlayerVariables>(changedKeys);

    // First-match-wins **per variable**: once a trigger fires on a given
    // variable name (e.g. `imagenes`), subsequent triggers watching the same
    // variable in this snapshot are skipped. Triggers on OTHER variables
    // (e.g. `pieles`, `vida`) keep evaluating independently.
    const firedVariables = new Set<string>();

    for (const cv of this.compiledPromptVars) {
      if (firedVariables.has(cv.variableName)) continue;

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
        this.applyVariableAction(action, oldVal, newVal, effects);
      }
      firedVariables.add(cv.variableName);
    }
    return effects;
  }

  // Cascade evaluator for user-defined variables. Fired internally when a
  // set_var action actually changes a value. Pushes side effects directly
  // into the caller's accumulator so the cascade chain bubbles up to the
  // original regex/prompt trigger that started it.
  //
  // First-match-wins: only the first compiled user-var trigger that watches
  // `changedName` AND whose condition holds will fire. Subsequent triggers
  // on the same variable are skipped.
  //
  // Depth guard: hard cap of MAX_USER_VAR_DEPTH nested cascade levels
  // prevents infinite loops when triggers chain set_vars among each other.
  private evaluateUserVarTriggersInto(
    changedName: string,
    oldVal: string,
    newVal: string,
    sideEffectsOut: TriggerSideEffect[],
  ): void {
    if (this.compiledUserVars.length === 0) return;
    if (this.userVarDepth >= MAX_USER_VAR_DEPTH) {
      console.warn(
        `[triggerEngine] user variable cascade depth ${MAX_USER_VAR_DEPTH} exceeded ` +
        `(set_var "${changedName}"); stopping recursion to prevent loop.`,
      );
      return;
    }
    if (oldVal === newVal) return;

    this.userVarDepth++;
    try {
      for (const cv of this.compiledUserVars) {
        if (cv.variableName !== changedName) continue;
        if (!checkVariableCondition(cv.condition, oldVal, newVal)) continue;
        for (const action of cv.trigger.actions) {
          this.applyVariableAction(action, oldVal, newVal, sideEffectsOut);
        }
        return; // first match wins
      }
    } finally {
      this.userVarDepth--;
    }
  }

  // Apply a regex-trigger action. Mutates `sideEffectsOut` for fire-and-forget
  // side effects (sounds, sends, notifications, floatings, cascaded user-var
  // triggers from set_var). Returns gag flag and possibly mutated spans for
  // the caller's accumulator.
  private applyAction(
    action: TriggerAction,
    match: RegExpExecArray,
    spans: AnsiSpan[],
    sideEffectsOut: TriggerSideEffect[],
  ): { gag?: boolean; spans?: AnsiSpan[] } {
    switch (action.type) {
      case 'gag':
        return { gag: true };

      case 'replace':
        return { spans: [{ text: expandTemplate(action.with, match, null, null) }] };

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
        if (action.file) sideEffectsOut.push({ type: 'play_sound', file: action.file });
        return {};

      case 'send':
        sideEffectsOut.push({
          type: 'send',
          command: expandTemplate(action.command, match, null, null),
        });
        return {};

      case 'notify':
        sideEffectsOut.push({
          type: 'notify',
          title: action.title ? expandTemplate(action.title, match, null, null) : undefined,
          message: expandTemplate(action.message, match, null, null),
        });
        return {};

      case 'floating':
        sideEffectsOut.push({
          type: 'floating',
          message: expandTemplate(action.message, match, null, null),
          level: action.level || 'info',
          fg: action.fg,
          bg: action.bg,
        });
        return {};

      case 'set_var': {
        if (!action.varName) return {};
        const value = expandTemplate(action.value, match, null, null);
        const prevVal = userVariablesService.get(action.varName);
        const changed = userVariablesService.set(action.varName, value);
        if (changed) {
          this.evaluateUserVarTriggersInto(action.varName, prevVal, value, sideEffectsOut);
        }
        return {};
      }
    }
  }

  // Apply a variable-trigger action (prompt vars or user vars). gag/replace/
  // color don't make sense (no display line involved — the prompt was gagged
  // by the parser, and user vars never produce a line). The wizard prevents
  // them but we still ignore defensively if a saved trigger has them.
  private applyVariableAction(
    action: TriggerAction,
    oldVal: number | string | boolean,
    newVal: number | string | boolean,
    sideEffectsOut: TriggerSideEffect[],
  ): void {
    switch (action.type) {
      case 'play_sound':
        if (action.file) sideEffectsOut.push({ type: 'play_sound', file: action.file });
        return;

      case 'send':
        sideEffectsOut.push({
          type: 'send',
          command: expandTemplate(action.command, null, oldVal, newVal),
        });
        return;

      case 'notify':
        sideEffectsOut.push({
          type: 'notify',
          title: action.title ? expandTemplate(action.title, null, oldVal, newVal) : undefined,
          message: expandTemplate(action.message, null, oldVal, newVal),
        });
        return;

      case 'floating':
        sideEffectsOut.push({
          type: 'floating',
          message: expandTemplate(action.message, null, oldVal, newVal),
          level: action.level || 'info',
          fg: action.fg,
          bg: action.bg,
        });
        return;

      case 'set_var': {
        if (!action.varName) return;
        const value = expandTemplate(action.value, null, oldVal, newVal);
        const prevVal = userVariablesService.get(action.varName);
        const changed = userVariablesService.set(action.varName, value);
        if (changed) {
          this.evaluateUserVarTriggersInto(action.varName, prevVal, value, sideEffectsOut);
        }
        return;
      }
    }
  }
}

// Unified template expander. Replaces three placeholder families:
//   - $1..$9 / $&   regex captures (only meaningful when match != null)
//   - $old / $new   variable trigger context (only meaningful when oldVal/newVal != null)
//   - ${name}       user variable lookup (always live from userVariablesService)
// Unknown / unset placeholders expand to empty string — same fail-quiet
// semantics as missing regex captures.
function expandTemplate(
  template: string,
  match: RegExpExecArray | null,
  oldVal: number | string | boolean | null,
  newVal: number | string | boolean | null,
): string {
  return template
    .replace(/\$(\d+)|\$&/g, (full, idx) => {
      if (!match) return '';
      if (full === '$&') return match[0];
      const i = Number(idx);
      return match[i] != null ? match[i] : '';
    })
    .replace(/\$old\b/g, oldVal != null ? String(oldVal) : '')
    .replace(/\$new\b/g, newVal != null ? String(newVal) : '')
    .replace(/\$\{([a-z][a-z0-9_]*)\}/g, (_, name) => userVariablesService.get(name));
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
    case 'crosses_below': {
      // Lazy Number() — works for both number-typed prompt vars and string
      // user vars that happen to hold numeric text. NaN comparisons return
      // false, which fails the condition silently (documented).
      const oldN = typeof oldVal === 'number' ? oldVal : Number(oldVal);
      const newN = typeof newVal === 'number' ? newVal : Number(newVal);
      if (Number.isNaN(oldN) || Number.isNaN(newN)) return false;
      return oldN >= cond.value && newN < cond.value;
    }
    case 'crosses_above': {
      const oldN = typeof oldVal === 'number' ? oldVal : Number(oldVal);
      const newN = typeof newVal === 'number' ? newVal : Number(newVal);
      if (Number.isNaN(oldN) || Number.isNaN(newN)) return false;
      return oldN <= cond.value && newN > cond.value;
    }
  }
}

export const triggerEngine = new TriggerEngine();
