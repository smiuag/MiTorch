import { ActionTextBlock, Trigger, TriggerAction, TriggerPack } from '../types';
import { isPredefinedVariable } from './variableMap';

export type UsageRole = 'writer' | 'reader' | 'watcher';

export interface VarUsage {
  packId: string;
  packName: string;
  triggerId: string;
  triggerName: string;
  roles: UsageRole[];
}

// Walks all packs/triggers/actions/blocks looking for references to a given
// user-variable name. Returns one row per trigger that mentions it (with
// the union of roles). Used by the "Mis variables" screen to show usage
// and by the delete-with-warning flow.
export function findTriggersUsingVar(varName: string, packs: TriggerPack[]): VarUsage[] {
  const out: VarUsage[] = [];
  for (const pack of packs) {
    for (const trigger of pack.triggers) {
      const roles = collectRolesForTrigger(trigger, varName);
      if (roles.length > 0) {
        out.push({
          packId: pack.id,
          packName: pack.name,
          triggerId: trigger.id,
          triggerName: trigger.name,
          roles,
        });
      }
    }
  }
  return out;
}

// Collects ALL user-variable names referenced anywhere in a single pack's
// triggers (any role). Used at pack-import time to auto-declare missing
// names on the destination server, and at server-bootstrap to ensure
// already-stored packs work after a fresh app install / data reset.
export function collectVarsReferencedByPack(pack: TriggerPack): string[] {
  const set = new Set<string>();
  for (const trigger of pack.triggers) {
    addRefsFromTrigger(trigger, set);
  }
  return [...set];
}

export function collectVarsReferencedByPacks(packs: TriggerPack[]): string[] {
  const set = new Set<string>();
  for (const pack of packs) {
    for (const trigger of pack.triggers) addRefsFromTrigger(trigger, set);
  }
  return [...set];
}

function addRefsFromTrigger(trigger: Trigger, set: Set<string>): void {
  if (trigger.source.kind === 'variable' && !isPredefinedVariable(trigger.source.name)) {
    set.add(trigger.source.name);
  }
  for (const action of trigger.actions) {
    if (action.type === 'set_var' && action.varName) {
      set.add(action.varName);
    }
    for (const blocks of collectBlocks(action)) {
      for (const b of blocks) {
        if (b.kind === 'user_var_ref' && b.varName) set.add(b.varName);
      }
    }
    // Expert-mode compiled strings may also contain ${name}. Scan for them
    // so we don't miss references the user wrote by hand.
    const re = /\$\{([a-z][a-z0-9_]*)\}/g;
    for (const s of collectCompiledStrings(action)) {
      let m: RegExpExecArray | null;
      re.lastIndex = 0;
      while ((m = re.exec(s)) !== null) {
        if (!isPredefinedVariable(m[1])) set.add(m[1]);
      }
    }
  }
}

function collectRolesForTrigger(trigger: Trigger, varName: string): UsageRole[] {
  const roles = new Set<UsageRole>();
  if (trigger.source.kind === 'variable' && trigger.source.name === varName) {
    roles.add('watcher');
  }
  for (const action of trigger.actions) {
    if (action.type === 'set_var' && action.varName === varName) {
      roles.add('writer');
    }
    for (const blocks of collectBlocks(action)) {
      for (const b of blocks) {
        if (b.kind === 'user_var_ref' && b.varName === varName) roles.add('reader');
      }
    }
    const re = new RegExp(`\\$\\{${escapeRegex(varName)}\\}`);
    for (const s of collectCompiledStrings(action)) {
      if (re.test(s)) roles.add('reader');
    }
  }
  return [...roles];
}

function collectBlocks(action: TriggerAction): ActionTextBlock[][] {
  const out: ActionTextBlock[][] = [];
  if (action.type === 'replace' && action.withBlocks) out.push(action.withBlocks);
  if (action.type === 'send' && action.commandBlocks) out.push(action.commandBlocks);
  if (action.type === 'notify') {
    if (action.titleBlocks) out.push(action.titleBlocks);
    if (action.messageBlocks) out.push(action.messageBlocks);
  }
  if (action.type === 'floating' && action.messageBlocks) out.push(action.messageBlocks);
  if (action.type === 'set_var' && action.valueBlocks) out.push(action.valueBlocks);
  return out;
}

function collectCompiledStrings(action: TriggerAction): string[] {
  const out: string[] = [];
  if (action.type === 'replace') out.push(action.with);
  if (action.type === 'send') out.push(action.command);
  if (action.type === 'notify') {
    if (action.title) out.push(action.title);
    out.push(action.message);
  }
  if (action.type === 'floating') out.push(action.message);
  if (action.type === 'set_var') out.push(action.value);
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
