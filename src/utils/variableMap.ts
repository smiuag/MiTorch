import { PlayerVariables } from '../services/playerStatsService';

// User-facing variable name (Spanish) → how to read its value from a snapshot.
// "field" entries read directly from PlayerVariables; "derived" entries compute
// a value from the snapshot. Used by the variable trigger evaluator and the
// wizard dropdown.

export type VariableKind = 'number' | 'string' | 'boolean';

export type VariableSpec =
  | { name: string; kind: VariableKind; field: keyof PlayerVariables; description: string }
  | { name: string; kind: VariableKind; derived: (v: PlayerVariables) => number | string | boolean; description: string };

export const VARIABLE_SPECS: VariableSpec[] = [
  // Numéricas
  { name: 'vida', kind: 'number', field: 'playerHP', description: 'Puntos de vida actuales' },
  { name: 'vida_max', kind: 'number', field: 'playerMaxHP', description: 'Puntos de vida máximos' },
  {
    name: 'vida_pct',
    kind: 'number',
    derived: (v) => (v.playerMaxHP > 0 ? Math.round((v.playerHP / v.playerMaxHP) * 100) : 0),
    description: 'Porcentaje de vida (0-100)',
  },
  { name: 'energia', kind: 'number', field: 'playerEnergy', description: 'Puntos de energía actuales' },
  { name: 'energia_max', kind: 'number', field: 'playerMaxEnergy', description: 'Puntos de energía máximos' },
  {
    name: 'energia_pct',
    kind: 'number',
    derived: (v) => (v.playerMaxEnergy > 0 ? Math.round((v.playerEnergy / v.playerMaxEnergy) * 100) : 0),
    description: 'Porcentaje de energía (0-100)',
  },
  { name: 'xp', kind: 'number', field: 'playerXP', description: 'Puntos de experiencia' },
  { name: 'imagenes', kind: 'number', field: 'playerImages', description: 'Imágenes restantes' },
  { name: 'pieles', kind: 'number', field: 'playerSkins', description: 'Pieles de piedra restantes' },
  { name: 'inercia', kind: 'number', field: 'playerInertia', description: 'Puntos de inercia' },
  { name: 'astucia', kind: 'number', field: 'playerAstuteness', description: 'Puntos de astucia' },
  { name: 'jugadores_sala', kind: 'number', field: 'roomPlayers', description: 'Jugadores en la sala' },
  { name: 'acciones_movimiento', kind: 'number', field: 'actionsMovement', description: 'Acciones de movimiento restantes' },
  { name: 'acciones_principales', kind: 'number', field: 'actionsPrimary', description: 'Acciones principales restantes' },
  { name: 'acciones_secundarias', kind: 'number', field: 'actionsSecondary', description: 'Acciones secundarias restantes' },
  { name: 'acciones_menores', kind: 'number', field: 'actionsMinor', description: 'Acciones menores restantes' },
  { name: 'carga', kind: 'number', field: 'carry', description: 'Carga actual' },

  // Texto
  { name: 'salidas', kind: 'string', field: 'roomExits', description: 'Salidas visibles desde la sala' },
  { name: 'enemigos', kind: 'string', field: 'roomEnemies', description: 'Enemigos en la sala (los que puedes matar)' },
  { name: 'aliados', kind: 'string', field: 'roomAllies', description: 'Aliados en la sala (PK colaboradores)' },
  { name: 'combatientes', kind: 'string', field: 'roomCombatants', description: 'Jugadores en peleas contigo' },

  // Derivada booleana
  {
    name: 'en_combate',
    kind: 'boolean',
    derived: (v) => (v.roomCombatants ?? '') !== '',
    description: 'true si hay combatientes en tu sala',
  },
];

const SPEC_BY_NAME = new Map(VARIABLE_SPECS.map((s) => [s.name, s]));

export function getVariableSpec(name: string): VariableSpec | undefined {
  return SPEC_BY_NAME.get(name);
}

export function readVariable(name: string, snapshot: PlayerVariables): number | string | boolean | undefined {
  const spec = SPEC_BY_NAME.get(name);
  if (!spec) return undefined;
  if ('field' in spec) return snapshot[spec.field] as number | string | boolean;
  return spec.derived(snapshot);
}

// For variables backed by a field, returns the field name so callers can
// detect whether a setSnapshot() update touched the underlying storage.
// Derived variables return the list of fields they depend on.
export function getVariableDependencies(name: string): (keyof PlayerVariables)[] {
  const spec = SPEC_BY_NAME.get(name);
  if (!spec) return [];
  if ('field' in spec) return [spec.field];
  switch (name) {
    case 'vida_pct':
      return ['playerHP', 'playerMaxHP'];
    case 'energia_pct':
      return ['playerEnergy', 'playerMaxEnergy'];
    case 'en_combate':
      return ['roomCombatants'];
    default:
      return [];
  }
}
