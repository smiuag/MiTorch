import AsyncStorage from '@react-native-async-storage/async-storage';

export interface LayoutButton {
  id: string;
  col: number;
  row: number;
  label: string;
  command: string;
  color: string;
  textColor: string;
  addText?: boolean;
  secondaryCommand?: string;
  alternativeCommands?: string[];
  locked?: boolean;
  fixed?: boolean;
  blindPanel?: 1 | 2; // Panel 1 or 2 for blind mode buttons (fijo, no dinámico)
  // Panel del modo completo. Antes era `1 | 2` fijo; ahora puede ser cualquier
  // ID de panel definido en `ServerProfile.panels` (default [1, 2], hasta 6).
  // Migración: valores 1 y 2 existentes siguen funcionando idénticos.
  completoPanel?: number;
  // 'command' (default, unset) sends the payload to the MUD; 'floating'
  // shows the payload as an in-app floating message (also announced via
  // TalkBack). Both expand ${var} via expandVars().
  kind?: 'command' | 'floating';
}

export interface ButtonLayout {
  buttons: LayoutButton[];
}

const LAYOUT_KEY = 'aljhtar_button_layout';

const DEFAULT_LAYOUT: ButtonLayout = {
  buttons: [],
};

let buttonIdCounter = 0;
function genId() {
  return `btn_${buttonIdCounter++}`;
}

export function createDefaultLayout(): ButtonLayout {
  // Panel 1: full command set (Decir/Res/STOP/IR/SIG/LOC + directions)
  const panel1: LayoutButton[] = [
    { id: genId(), col: 0, row: 0, label: 'Panel', command: '__SWITCH_PANEL__', color: '#336666', textColor: '#88ccff', completoPanel: 1, fixed: true, locked: true },
    // Row 0: Decir, Responder, _, _, STOP, IR, LOC
    { id: genId(), col: 3, row: 0, label: 'Decir', command: 'decir', color: '#662266', textColor: '#fff', addText: true, completoPanel: 1 },
    { id: genId(), col: 4, row: 0, label: 'Res', command: 'responder', color: '#662266', textColor: '#fff', addText: true, completoPanel: 1 },
    { id: genId(), col: 6, row: 0, label: 'STOP', command: 'stop', color: '#662222', textColor: '#fff', completoPanel: 1 },
    { id: genId(), col: 7, row: 0, label: 'IR', command: 'irsala', color: '#662266', textColor: '#fff', addText: true, completoPanel: 1 },
    { id: genId(), col: 7, row: 1, label: 'SIG', command: 'sigilarsala', color: '#443366', textColor: '#fff', addText: true, completoPanel: 1 },
    { id: genId(), col: 8, row: 0, label: 'LOC', command: 'locate', color: '#223366', textColor: '#fff', completoPanel: 1 },
    // Row 2: NO, N, NE, AR
    { id: genId(), col: 3, row: 2, label: 'NO', command: 'noroeste', color: '#662222', textColor: '#fff', completoPanel: 1 },
    { id: genId(), col: 4, row: 2, label: 'N', command: 'norte', color: '#662222', textColor: '#fff', completoPanel: 1 },
    { id: genId(), col: 5, row: 2, label: 'NE', command: 'noreste', color: '#662222', textColor: '#fff', completoPanel: 1 },
    { id: genId(), col: 6, row: 2, label: 'AR', command: 'ar', color: '#663322', textColor: '#fff', completoPanel: 1 },
    // Row 3: O, E, AB
    { id: genId(), col: 3, row: 3, label: 'O', command: 'oeste', color: '#662222', textColor: '#fff', completoPanel: 1 },
    { id: genId(), col: 5, row: 3, label: 'E', command: 'este', color: '#662222', textColor: '#fff', completoPanel: 1 },
    { id: genId(), col: 6, row: 3, label: 'AB', command: 'ab', color: '#663322', textColor: '#fff', completoPanel: 1 },
    // Row 4: SO, S, SE, DE
    { id: genId(), col: 3, row: 4, label: 'SO', command: 'sudoeste', color: '#662222', textColor: '#fff', completoPanel: 1 },
    { id: genId(), col: 4, row: 4, label: 'S', command: 'sur', color: '#662222', textColor: '#fff', completoPanel: 1 },
    { id: genId(), col: 5, row: 4, label: 'SE', command: 'sudeste', color: '#662222', textColor: '#fff', completoPanel: 1 },
    { id: genId(), col: 6, row: 4, label: 'DE', command: 'dentro', color: '#663322', textColor: '#fff', completoPanel: 1 },
    // Row 5: FU
    { id: genId(), col: 6, row: 5, label: 'FU', command: 'fuera', color: '#663322', textColor: '#fff', completoPanel: 1 },
  ];

  // Panel 2: directions mirror panel 1; rest empty for user customization
  const panel2: LayoutButton[] = [
    { id: genId(), col: 0, row: 0, label: 'Panel', command: '__SWITCH_PANEL__', color: '#336666', textColor: '#88ccff', completoPanel: 2, fixed: true, locked: true },
    { id: genId(), col: 3, row: 2, label: 'NO', command: 'noroeste', color: '#662222', textColor: '#fff', completoPanel: 2 },
    { id: genId(), col: 4, row: 2, label: 'N', command: 'norte', color: '#662222', textColor: '#fff', completoPanel: 2 },
    { id: genId(), col: 5, row: 2, label: 'NE', command: 'noreste', color: '#662222', textColor: '#fff', completoPanel: 2 },
    { id: genId(), col: 6, row: 2, label: 'AR', command: 'ar', color: '#663322', textColor: '#fff', completoPanel: 2 },
    { id: genId(), col: 3, row: 3, label: 'O', command: 'oeste', color: '#662222', textColor: '#fff', completoPanel: 2 },
    { id: genId(), col: 5, row: 3, label: 'E', command: 'este', color: '#662222', textColor: '#fff', completoPanel: 2 },
    { id: genId(), col: 6, row: 3, label: 'AB', command: 'ab', color: '#663322', textColor: '#fff', completoPanel: 2 },
    { id: genId(), col: 3, row: 4, label: 'SO', command: 'sudoeste', color: '#662222', textColor: '#fff', completoPanel: 2 },
    { id: genId(), col: 4, row: 4, label: 'S', command: 'sur', color: '#662222', textColor: '#fff', completoPanel: 2 },
    { id: genId(), col: 5, row: 4, label: 'SE', command: 'sudeste', color: '#662222', textColor: '#fff', completoPanel: 2 },
    { id: genId(), col: 6, row: 4, label: 'DE', command: 'dentro', color: '#663322', textColor: '#fff', completoPanel: 2 },
    { id: genId(), col: 6, row: 5, label: 'FU', command: 'fuera', color: '#663322', textColor: '#fff', completoPanel: 2 },
  ];

  return { buttons: [...panel1, ...panel2] };
}

// Layout inicial para servers con `layoutKind='custom'`. Empieza con solo
// el switch button en (0,0) replicado en los 2 paneles iniciales. El usuario
// va creando el resto de botones a mano.
export function createCustomLayout(): ButtonLayout {
  return {
    buttons: [
      { id: genId(), col: 0, row: 0, label: 'Panel', command: '__SWITCH_PANEL__', color: '#336666', textColor: '#88ccff', completoPanel: 1, fixed: true, locked: true },
      { id: genId(), col: 0, row: 0, label: 'Panel', command: '__SWITCH_PANEL__', color: '#336666', textColor: '#88ccff', completoPanel: 2, fixed: true, locked: true },
    ],
  };
}

// Genera los botones de un panel nuevo. Para 'standard' clona la zona de
// direcciones del panel base (típicamente panel 1) — incluye los direcciones
// AR/AB/DE/FU + N/S/E/O/NO/NE/SO/SE en sus posiciones canónicas. El switch
// button siempre se añade. Para 'custom' solo se añade el switch button (sin
// más botones — el usuario los crea a mano).
export function createPanelButtons(panelId: number, kind: 'standard' | 'custom', sourcePanel?: LayoutButton[]): LayoutButton[] {
  const switchBtn: LayoutButton = {
    id: genId(),
    col: 0, row: 0,
    label: 'Panel', command: '__SWITCH_PANEL__',
    color: '#336666', textColor: '#88ccff',
    completoPanel: panelId,
    fixed: true, locked: true,
  };
  if (kind === 'custom') return [switchBtn];

  // Standard: copia la zona de direcciones del panel fuente. Si no se da
  // un panel fuente, usa los defaults del panel 1.
  const direccionesSource = sourcePanel ?? createDefaultLayout().buttons.filter(b => b.completoPanel === 1);
  const direccionesCopy: LayoutButton[] = direccionesSource
    // Solo botones que NO sean el switch (que ya añadimos arriba) y que estén
    // en la zona de direcciones (cols 3-6, rows 2-5).
    .filter(b => b.command !== '__SWITCH_PANEL__' && b.col >= 3 && b.col <= 6 && b.row >= 2 && b.row <= 5)
    .map(b => ({ ...b, id: genId(), completoPanel: panelId }));
  return [switchBtn, ...direccionesCopy];
}

export function createBlindModeLayout(): ButtonLayout {
  // Panel 1: Core controls + directions
  const panel1: LayoutButton[] = [
    // Row 0: IRSALA, Vida, Energía, XP, Salidas (las 4 últimas son avisos floating con variables)
    { id: genId(), col: 0, row: 0, label: 'IRSALA', command: 'irsala', color: '#662266', textColor: '#fff', blindPanel: 1, fixed: true },
    { id: genId(), col: 1, row: 0, label: 'Vida', command: 'Vida: ${vida}/${vida_max}', color: '#336633', textColor: '#fff', blindPanel: 1, kind: 'floating' },
    { id: genId(), col: 2, row: 0, label: 'Energía', command: 'Energía: ${energia}/${energia_max}', color: '#336633', textColor: '#fff', blindPanel: 1, kind: 'floating' },
    { id: genId(), col: 3, row: 0, label: 'XP', command: 'XP: ${xp}', color: '#336633', textColor: '#fff', blindPanel: 1, kind: 'floating' },
    { id: genId(), col: 4, row: 0, label: 'Salidas', command: 'Salidas: ${salidas}', color: '#336633', textColor: '#fff', blindPanel: 1, kind: 'floating' },
    // Row 1: Noroeste, Norte, Noreste, Arriba
    { id: genId(), col: 0, row: 1, label: 'Noroeste', command: 'noroeste', color: '#662222', textColor: '#fff', blindPanel: 1 },
    { id: genId(), col: 1, row: 1, label: 'Norte', command: 'norte', color: '#662222', textColor: '#fff', blindPanel: 1 },
    { id: genId(), col: 2, row: 1, label: 'Noreste', command: 'noreste', color: '#662222', textColor: '#fff', blindPanel: 1 },
    { id: genId(), col: 3, row: 1, label: 'Arriba', command: 'ar', color: '#663322', textColor: '#fff', blindPanel: 1 },
    // Row 2: Oeste, [CENTER SWITCH], Este, Abajo
    { id: genId(), col: 0, row: 2, label: 'Oeste', command: 'oeste', color: '#662222', textColor: '#fff', blindPanel: 1 },
    { id: genId(), col: 1, row: 2, label: 'Cambiar', command: '__SWITCH_PANEL__', color: '#336666', textColor: '#88ccff', blindPanel: 1, fixed: true },
    { id: genId(), col: 2, row: 2, label: 'Este', command: 'este', color: '#662222', textColor: '#fff', blindPanel: 1 },
    { id: genId(), col: 3, row: 2, label: 'Abajo', command: 'ab', color: '#663322', textColor: '#fff', blindPanel: 1 },
    // Row 3: Sudoeste, Sur, Sudeste, Dentro, Fuera
    { id: genId(), col: 0, row: 3, label: 'Sudoeste', command: 'sudoeste', color: '#662222', textColor: '#fff', blindPanel: 1 },
    { id: genId(), col: 1, row: 3, label: 'Sur', command: 'sur', color: '#662222', textColor: '#fff', blindPanel: 1 },
    { id: genId(), col: 2, row: 3, label: 'Sudeste', command: 'sudeste', color: '#662222', textColor: '#fff', blindPanel: 1 },
    { id: genId(), col: 3, row: 3, label: 'Dentro', command: 'dentro', color: '#663322', textColor: '#fff', blindPanel: 1 },
    { id: genId(), col: 4, row: 3, label: 'Fuera', command: 'fuera', color: '#663322', textColor: '#fff', blindPanel: 1 },
  ];

  // Panel 2: Stealth directions with empty customizable buttons
  const panel2: LayoutButton[] = [
    // Row 0: 5 empty buttons
    { id: genId(), col: 0, row: 0, label: '-', command: '', color: '#444444', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 1, row: 0, label: '-', command: '', color: '#444444', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 2, row: 0, label: '-', command: '', color: '#444444', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 3, row: 0, label: '-', command: '', color: '#444444', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 4, row: 0, label: '-', command: '', color: '#444444', textColor: '#fff', blindPanel: 2 },
    // Row 1: Stealth directions Noroeste, Norte, Noreste, Arriba + empty
    { id: genId(), col: 0, row: 1, label: 'Noroeste sigilar', command: 'sigilar noroeste', color: '#662222', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 1, row: 1, label: 'Norte sigilar', command: 'sigilar norte', color: '#662222', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 2, row: 1, label: 'Noreste sigilar', command: 'sigilar noreste', color: '#662222', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 3, row: 1, label: 'Arriba sigilar', command: 'sigilar ar', color: '#663322', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 4, row: 1, label: '-', command: '', color: '#444444', textColor: '#fff', blindPanel: 2 },
    // Row 2: Stealth directions Oeste, SWITCH, Este, Abajo + empty
    { id: genId(), col: 0, row: 2, label: 'Oeste sigilar', command: 'sigilar oeste', color: '#662222', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 1, row: 2, label: 'Cambiar', command: '__SWITCH_PANEL__', color: '#336666', textColor: '#88ccff', blindPanel: 2 },
    { id: genId(), col: 2, row: 2, label: 'Este sigilar', command: 'sigilar este', color: '#662222', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 3, row: 2, label: 'Abajo sigilar', command: 'sigilar ab', color: '#663322', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 4, row: 2, label: '-', command: '', color: '#444444', textColor: '#fff', blindPanel: 2 },
    // Row 3: Stealth directions Sudoeste, Sur, Sudeste, Dentro, Fuera
    { id: genId(), col: 0, row: 3, label: 'Sudoeste sigilar', command: 'sigilar sudoeste', color: '#662222', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 1, row: 3, label: 'Sur sigilar', command: 'sigilar sur', color: '#662222', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 2, row: 3, label: 'Sudeste sigilar', command: 'sigilar sudeste', color: '#662222', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 3, row: 3, label: 'Dentro sigilar', command: 'sigilar dentro', color: '#663322', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 4, row: 3, label: 'Fuera sigilar', command: 'sigilar fuera', color: '#663322', textColor: '#fff', blindPanel: 2 },
  ];

  return { buttons: [...panel1, ...panel2] };
}

function migrateLayout(layout: ButtonLayout): ButtonLayout {
  const migratedButtons = layout.buttons.map(btn => {
    let next = btn;
    // Migrate secondaryCommand to alternativeCommands
    if (next.secondaryCommand && !next.alternativeCommands) {
      next = {
        ...next,
        alternativeCommands: [next.secondaryCommand],
        secondaryCommand: undefined,
      };
    }
    // Blind-mode panel-switch button: icon "⇄" replaced with brief text
    if (next.command === '__SWITCH_PANEL__' && next.label === '⇄') {
      next = { ...next, label: 'Cambiar' };
    }
    return next;
  });

  // Add SIG (sigilarsala) button below IR in completo layout if missing
  // and the target slot (7,1) is free. Blind-mode layouts use different
  // coordinates so this only affects the completo default layout.
  const hasIrCompleto = migratedButtons.some(b => b.col === 7 && b.row === 0 && b.command === 'irsala' && !b.blindPanel);
  const hasSigilarsala = migratedButtons.some(b => b.command === 'sigilarsala' && !b.blindPanel);
  const slotFree = !migratedButtons.some(b => b.col === 7 && b.row === 1 && !b.blindPanel);
  if (hasIrCompleto && !hasSigilarsala && slotFree) {
    migratedButtons.push({
      id: genId(),
      col: 7,
      row: 1,
      label: 'SIG',
      command: 'sigilarsala',
      color: '#443366',
      textColor: '#fff',
      addText: true,
    });
  }

  // Add panel-switch buttons at (0,0) for completo layouts that don't yet
  // use the panel system. Only applies if no button already uses
  // completoPanel and slot (0,0) is free in the completo layout.
  const hasCompletoPanel = migratedButtons.some(b => b.completoPanel !== undefined);
  const hasCompletoSwitch = migratedButtons.some(b => b.command === '__SWITCH_PANEL__' && b.completoPanel !== undefined);
  const completoSlotFree = !migratedButtons.some(b => b.col === 0 && b.row === 0 && !b.blindPanel);
  if (!hasCompletoPanel && !hasCompletoSwitch && completoSlotFree && hasIrCompleto) {
    migratedButtons.push(
      { id: genId(), col: 0, row: 0, label: 'Panel', command: '__SWITCH_PANEL__', color: '#336666', textColor: '#88ccff', completoPanel: 1, fixed: true, locked: true },
      { id: genId(), col: 0, row: 0, label: 'Panel', command: '__SWITCH_PANEL__', color: '#336666', textColor: '#88ccff', completoPanel: 2, fixed: true, locked: true },
    );
  }

  return { buttons: migratedButtons };
}

export async function loadLayout(): Promise<ButtonLayout> {
  const json = await AsyncStorage.getItem(LAYOUT_KEY);
  if (!json) return createDefaultLayout();
  const layout = JSON.parse(json);
  return migrateLayout(layout);
}

export async function saveLayout(layout: ButtonLayout): Promise<void> {
  await AsyncStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
}

export async function loadServerLayout(serverId: string): Promise<ButtonLayout> {
  const key = `buttonLayout_${serverId}`;
  const json = await AsyncStorage.getItem(key);
  if (!json) return { buttons: [] };
  const layout = JSON.parse(json);
  return migrateLayout(layout);
}

export async function saveServerLayout(serverId: string, layout: ButtonLayout): Promise<void> {
  const key = `buttonLayout_${serverId}`;
  await AsyncStorage.setItem(key, JSON.stringify(layout));
}
