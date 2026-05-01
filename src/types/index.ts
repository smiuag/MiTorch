export interface ServerProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  encoding?: string;
  username?: string;
  password?: string;
}

export interface AnsiSpan {
  text: string;
  fg?: string;
  bg?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface MudLine {
  id: number;
  spans: AnsiSpan[];
}

export type RootStackParamList = {
  ServerList: undefined;
  Terminal: { server: ServerProfile };
  Settings: undefined;
  Triggers: undefined;
  TriggerEditor: { packId: string; autoOpenTriggerId?: string };
  MySounds: undefined;
  UserVariables: undefined;
  MyAmbients: undefined;
  ConfigBackup: undefined;
};

export type TriggerType =
  | 'gag'
  | 'color'
  | 'sound'
  | 'notify'
  | 'command'
  | 'replace'
  | 'combo'
  | 'variable';

export type FloatingMessageLevel = 'info' | 'success' | 'warning' | 'error';

// Action text fields support both compiled string (engine reads this)
// and optional blocks[] (editor reads this in cajas mode).
export type TriggerAction =
  | { type: 'gag' }
  | { type: 'replace'; with: string; withBlocks?: ActionTextBlock[] }
  | { type: 'color'; fg?: string; bg?: string; bold?: boolean }
  // `pan` is the stereo balance: -1 hard left, 0 centre (default), +1 hard
  // right. Range is clamped to [-1, 1] at playback. undefined / missing /
  // 0 all mean centre. The pan is only honoured by the platform when an
  // engine that supports stereo balancing is wired up; otherwise the sound
  // plays centred regardless. Compatible backwards: existing pack JSONs
  // without `pan` keep playing centred.
  | { type: 'play_sound'; file: string; pan?: number }
  | { type: 'send'; command: string; commandBlocks?: ActionTextBlock[] }
  | { type: 'notify'; title?: string; titleBlocks?: ActionTextBlock[]; message: string; messageBlocks?: ActionTextBlock[] }
  // `level` selects a preset palette. `fg`/`bg` (optional, hex strings) override
  // letter color and background respectively — when absent each falls back to
  // the preset for `level`. Setting one without the other works (e.g. custom
  // background with the level's default text color).
  | { type: 'floating'; message: string; messageBlocks?: ActionTextBlock[]; level?: FloatingMessageLevel; fg?: string; bg?: string }
  // User-defined variable: writes a templated value into the user-vars store.
  // varName must be a valid identifier ([a-z][a-z0-9_]*) and not collide with
  // a predefined variable name (vida, energia, ...). value template can use
  // capture refs ($1, $2 — only meaningful in regex triggers), $old/$new
  // (only in variable triggers), and ${otherVar} for nested user-var refs.
  // After template expansion, `replacements` (when present) are applied in
  // order — each pair does a literal (non-regex) string replace-all on the
  // accumulated value. Common use: turn ", " into "|" so the resulting var
  // is regex-friendly when injected into a pattern with `${name:raw}`.
  | { type: 'set_var'; varName: string; value: string; valueBlocks?: ActionTextBlock[]; replacements?: { from: string; to: string }[] };

export type CaptureType = 'word' | 'phrase' | 'number';

export type PatternBlock =
  | { kind: 'text'; text: string }
  | { kind: 'capture'; captureType: CaptureType; id: string };

export type AnchorMode = 'open' | 'anchored';

export type ActionTextBlock =
  | { kind: 'text'; text: string }
  | { kind: 'capture_ref'; captureId: string }
  // Reference to a user-defined variable. Compiles to "${varName}" in the
  // engine's template string, expanded at fire-time against the current
  // user-vars store for the active server.
  | { kind: 'user_var_ref'; varName: string };

export type TriggerSource =
  | {
      kind: 'regex';
      pattern: string;                  // compiled regex (read by engine)
      flags?: string;
      // Visual editor state — present when not in expert mode:
      blocks?: PatternBlock[];
      anchorStart?: AnchorMode;         // default 'open'
      anchorEnd?: AnchorMode;           // default 'open'
      expertMode?: boolean;             // true => editor shows raw regex, blocks ignored
    }
  | {
      kind: 'variable';
      name: string;                     // e.g. 'vida', 'energia_pct', 'combatientes'
      condition: VariableCondition;
    };

export type VariableCondition =
  | { event: 'appears' }                          // 0/"" → valor real
  | { event: 'changes' }                          // cualquier cambio
  | { event: 'equals'; value: number | string }   // valor exactamente igual a X
  | { event: 'crosses_below'; value: number }     // edge: estaba ≥N, ahora <N
  | { event: 'crosses_above'; value: number };    // edge: estaba ≤N, ahora >N

export interface Trigger {
  id: string;
  name: string;
  type: TriggerType;
  enabled: boolean;
  source: TriggerSource;
  actions: TriggerAction[];
  // When true (or undefined — default), first-match-wins: this trigger
  // executes all its actions and stops the evaluation chain. When false,
  // only side-effects fire (play_sound, send, notify, floating, set_var)
  // and evaluation continues — gag/replace/color are skipped on
  // non-blocking triggers because allowing several to compete on the same
  // line leads to undefined display state.
  blocking?: boolean;
}

export interface TriggerPack {
  id: string;
  name: string;
  triggers: Trigger[];
  assignedServerIds: string[];
  // When true, any newly-created character automatically gets this pack
  // appended to its assigned list. Undefined is treated as true at read
  // time (legacy packs default to "auto-assign on") and persisted on the
  // first explicit edit. Existing assignedServerIds are never altered by
  // this flag — only future characters pick it up.
  autoAssignToNew?: boolean;
}

export type FloatingOrientation = 'portrait' | 'landscape';

// Categorías de ambient sound. La pantalla "Mis ambientes" deja al usuario
// asignar 0-4 wavs a cada una; el clasificador (`roomCategorizer`) deduce
// la categoría a partir del nombre de la sala. 'default' captura todo lo
// que no encaja en ninguna otra.
export type RoomCategory =
  | 'desierto'
  | 'subterraneo'
  | 'bosque'
  | 'camino'
  | 'mar_costa'
  | 'fortificacion'
  | 'nieve_frio'
  | 'volcanico'
  | 'montana'
  | 'interior_civil'
  | 'campo_cultivo'
  | 'paramo_llanura'
  | 'pantano'
  | 'ciudad'
  | 'templo'
  | 'ruinas'
  | 'cementerio_no_muertos'
  | 'default';

// Mapping persistido en AsyncStorage. Cada categoría guarda hasta 4 refs
// `custom:{uuid}.{ext}`. Lista vacía → silencio en esa categoría.
export type AmbientMappings = {
  [K in RoomCategory]: { sounds: string[] };
};

export interface LayoutItem {
  id: string;
  type: 'button' | 'vitalbars' | 'input' | 'chat' | 'terminal';
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  // Only for type === 'button':
  label?: string;
  command?: string;
  color?: string;
  opacity?: number;
}

export interface FloatingLayout {
  gridCols: number;
  gridRows: number;
  items: LayoutItem[];
}

export type GestureType =
  | 'doubletap'
  | 'swipe_up' | 'swipe_down' | 'swipe_left' | 'swipe_right'
  | 'swipe_up_right' | 'swipe_up_left' | 'swipe_down_right' | 'swipe_down_left'
  | 'twofingers_up' | 'twofingers_down' | 'twofingers_left' | 'twofingers_right'
  | 'twofingers_up_right' | 'twofingers_up_left' | 'twofingers_down_right' | 'twofingers_down_left'
  | 'pinch_in' | 'pinch_out';

export interface GestureConfig {
  type: GestureType;
  enabled: boolean;
  command: string;
  opensKeyboard: boolean;
}

