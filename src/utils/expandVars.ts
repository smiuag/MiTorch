import { playerStatsService } from '../services/playerStatsService';
import { userVariablesService } from '../services/userVariablesService';
import { readVariable } from './variableMap';

const PLACEHOLDER_RE = /\$\{([a-z][a-z0-9_]*)\}/g;

// Expand ${name} placeholders in a button payload (command or floating
// message). Resolution order: predefined system variables (vida, energia,
// salidas, derivadas como vida_pct/en_combate) → user variables. Unknown or
// unset names expand to "" — same fail-quiet semantics as the trigger engine.
export function expandVars(template: string): string {
  if (!template || template.indexOf('${') < 0) return template;
  const snapshot = playerStatsService.getPlayerVariables();
  return template.replace(PLACEHOLDER_RE, (_, name) => {
    const sysVal = readVariable(name, snapshot);
    if (sysVal !== undefined) return String(sysVal);
    return userVariablesService.get(name);
  });
}
