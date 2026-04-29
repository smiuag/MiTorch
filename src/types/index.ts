export interface ServerProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  encoding?: string;
  username?: string;
  password?: string;
  buttonLayout?: {
    buttons: Array<{
      id: string;
      col: number;
      row: number;
      label: string;
      command: string;
      color: string;
      textColor: string;
    }>;
  };
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
  TriggerEditor: { packId: string };
  MySounds: undefined;
  UserVariables: undefined;
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

export type FloatingMessageLevel = 'info' | 'success' | 'error';

// Action text fields support both compiled string (engine reads this)
// and optional blocks[] (editor reads this in cajas mode).
export type TriggerAction =
  | { type: 'gag' }
  | { type: 'replace'; with: string; withBlocks?: ActionTextBlock[] }
  | { type: 'color'; fg?: string; bg?: string; bold?: boolean }
  | { type: 'play_sound'; file: string }
  | { type: 'send'; command: string; commandBlocks?: ActionTextBlock[] }
  | { type: 'notify'; title?: string; titleBlocks?: ActionTextBlock[]; message: string; messageBlocks?: ActionTextBlock[] }
  | { type: 'floating'; message: string; messageBlocks?: ActionTextBlock[]; level?: FloatingMessageLevel }
  // User-defined variable: writes a templated value into the user-vars store.
  // varName must be a valid identifier ([a-z][a-z0-9_]*) and not collide with
  // a predefined variable name (vida, energia, ...). value template can use
  // capture refs ($1, $2 — only meaningful in regex triggers), $old/$new
  // (only in variable triggers), and ${otherVar} for nested user-var refs.
  | { type: 'set_var'; varName: string; value: string; valueBlocks?: ActionTextBlock[] };

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
}

export interface TriggerPack {
  id: string;
  name: string;
  triggers: Trigger[];
  assignedServerIds: string[];
}

export type FloatingOrientation = 'portrait' | 'landscape';

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

