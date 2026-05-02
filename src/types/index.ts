export interface ServerProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  encoding?: string;
  username?: string;
  password?: string;
  // Configuración del grid de botones del Terminal en modo completo. Se
  // decide al CREAR el server y es inmutable después (la edición de server
  // no muestra estos campos). Servers cargados sin estos campos se migran
  // a defaults: layoutKind='standard', panels=[1, 2].
  //
  // 'standard': grid 9×6 (vertical) / 6×9 (horizontal) con transformaciones
  //   `normalModeTransforms` que reorganizan la zona de direcciones al
  //   pivotar. Layout por defecto incluye Decir/Res/STOP/IR/SIG/LOC y la
  //   cruz de direcciones. Al añadir paneles, se copia la zona de direcciones
  //   del panel 1.
  // 'custom': grid lógico cuadrado (5×5, 7×7, 9×9). En cada orientación se
  //   renderiza solo el sub-rectángulo que cabe (Pequeño 4×5/5×4, Mediano
  //   5×7/7×5, Grande 5×9/9×5). Sin transformaciones de landscape — solo
  //   recortar. Botones fuera del rectángulo visible quedan guardados pero
  //   inaccesibles hasta rotar el móvil. Empieza vacío excepto el switch
  //   button en (0,0). Al añadir paneles, panel vacío.
  layoutKind?: 'standard' | 'custom';
  customGridSize?: 5 | 7 | 9;
  // IDs de paneles del modo completo. Default [1, 2]. Cap máximo 6. Los
  // dos primeros no se pueden eliminar. Los IDs no necesitan ser
  // consecutivos (al borrar uno y añadir otro, se usa max+1).
  panels?: number[];
  // Referencia a una entrada de la biblioteca de mapas. Sin valor → MapService
  // inactivo (sin minimap ni irsala). Valor especial 'reinos-bundled' carga el
  // mapa que viaja en el APK; cualquier otro string es un id generado al
  // importar un JSON de Mudlet desde "Mis mapas".
  mapId?: string;
}

// Entrada de la biblioteca de mapas (índice en AsyncStorage). El contenido
// real (rooms, nameIndex) vive en `${Paths.document}/maps/{id}.json` para los
// mapas importados, y en `src/assets/map-reinos.json` (bundleado) para la
// entrada virtual 'reinos-bundled'.
export interface MapLibraryEntry {
  id: string;
  name: string;
  roomCount: number;
  importedAt: number;
  // Marca la entrada virtual del mapa de Reinos bundleado: no se puede
  // renombrar ni borrar (no hay archivo en filesystem que tocar).
  builtin?: boolean;
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

// `sourceLocation` propaga si la pantalla se abrió desde el MUD (Terminal) o
// desde fuera (ServerList). Algunas opciones se ocultan dentro del MUD
// (codificación, modo de la app), otras solo aparecen ahí (aplicar prompt).
export type SettingsStackParams = { sourceLocation?: 'terminal' | 'serverlist' };

export type RootStackParamList = {
  ServerList: undefined;
  Terminal: { server: ServerProfile };
  Settings: SettingsStackParams | undefined;
  SettingsGeneral: SettingsStackParams | undefined;
  SettingsAdvanced: SettingsStackParams | undefined;
  SettingsSystem: SettingsStackParams | undefined;
  SettingsGestures: SettingsStackParams | undefined;
  Triggers: undefined;
  TriggerEditor: { packId: string; autoOpenTriggerId?: string };
  MySounds: undefined;
  UserVariables: undefined;
  MyAmbients: undefined;
  MyMaps: undefined;
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
  | 'swipe_up' | 'swipe_down' | 'swipe_left' | 'swipe_right'
  | 'swipe_up_right' | 'swipe_up_left' | 'swipe_down_right' | 'swipe_down_left'
  | 'twofingers_up' | 'twofingers_down' | 'twofingers_left' | 'twofingers_right'
  | 'twofingers_up_right' | 'twofingers_up_left' | 'twofingers_down_right' | 'twofingers_down_left'
  | 'pinch_in' | 'pinch_out'
  // Doble-tap-hold-swipe: tap-tap-mantener-y-arrastrar. El segundo tap se
  // mantiene > 200 ms y el dedo se mueve > 15 px en la dirección. Permite
  // 8 acciones extra sin chocar con el doble-tap rápido (que aquí se
  // elimina completamente — solo existe la variante con hold).
  | 'doubletap_hold_swipe_up' | 'doubletap_hold_swipe_down'
  | 'doubletap_hold_swipe_left' | 'doubletap_hold_swipe_right'
  | 'doubletap_hold_swipe_up_right' | 'doubletap_hold_swipe_up_left'
  | 'doubletap_hold_swipe_down_right' | 'doubletap_hold_swipe_down_left'
  // Doble-tap con 2 dedos. Atómico (sin dirección) — esa entropía la dan
  // ya `twofingers_swipe_*` y `pinch_*`. Solo dispara con dos dedos pulsados
  // a la vez, sin movimiento (>10 px = pinch o swipe), <200 ms cada tap, y
  // dos taps consecutivos en <300 ms. En blind+TalkBack lo consume el lector
  // (TalkBack usa 2-finger doble-tap para activar) — solo es útil en
  // self-voicing o modo completo.
  | 'twofingers_doubletap';

// Fuente de opciones del selector cuando un gesto es de tipo `pick`. Cada
// fuente resuelve a string[] en runtime:
//   - roomExits: salidas de la sala actual (n/s/ar/ab → norte/sur/arriba/abajo).
//   - recentTells: últimos N jugadores que mandaron tell (ring buffer en memoria).
//   - custom: lista que el usuario edita en el propio gesto.
export type GesturePickSource = 'roomExits' | 'recentTells' | 'custom';

// Acción que dispara un gesto. Discriminated union desde v4 (antes era
// `{command, opensKeyboard}` plano, migrado al cargar settings):
//   - send: envía `text` directo al MUD.
//   - prepare: pone `text` en el input del terminal y abre el teclado para
//     que el usuario complete.
//   - pick: abre un selector con opciones de `source`. Al elegir, construye
//     `prefix + opcion`. Si `autoSend` envía; si no, pone en el input,
//     enfoca el final y abre el teclado para completar.
export type GestureAction =
  | { kind: 'send'; text: string }
  | { kind: 'prepare'; text: string }
  | {
      kind: 'pick';
      prefix: string;
      source: GesturePickSource;
      // Solo relevante cuando source === 'custom'. Para otras fuentes lo
      // mantenemos como [] (el editor lo oculta).
      customList: string[];
      autoSend: boolean;
    };

export interface GestureConfig {
  type: GestureType;
  enabled: boolean;
  action: GestureAction;
}

