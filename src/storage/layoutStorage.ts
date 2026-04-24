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
  blindPanel?: 1 | 2; // Panel 1 or 2 for blind mode buttons
  completoPanel?: 1 | 2; // Panel 1 or 2 for completo mode buttons
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

export function createBlindModeLayout(): ButtonLayout {
  // Panel 1: Core controls + directions
  const panel1: LayoutButton[] = [
    // Row 0: IR, VID, GPS, XP, Salidas
    { id: genId(), col: 0, row: 0, label: 'IR', command: 'irsala', color: '#662266', textColor: '#fff', blindPanel: 1, fixed: true },
    { id: genId(), col: 1, row: 0, label: 'VID', command: 'consultar vida', color: '#336633', textColor: '#fff', blindPanel: 1 },
    { id: genId(), col: 2, row: 0, label: 'GPS', command: 'consultar energia', color: '#336633', textColor: '#fff', blindPanel: 1 },
    { id: genId(), col: 3, row: 0, label: 'XP', command: 'xp', color: '#336633', textColor: '#fff', blindPanel: 1 },
    { id: genId(), col: 4, row: 0, label: 'Salidas', command: 'consultar salidas', color: '#336633', textColor: '#fff', blindPanel: 1 },
    // Row 1: NO, N, NE, AR
    { id: genId(), col: 0, row: 1, label: 'NO', command: 'noroeste', color: '#662222', textColor: '#fff', blindPanel: 1 },
    { id: genId(), col: 1, row: 1, label: 'N', command: 'norte', color: '#662222', textColor: '#fff', blindPanel: 1 },
    { id: genId(), col: 2, row: 1, label: 'NE', command: 'noreste', color: '#662222', textColor: '#fff', blindPanel: 1 },
    { id: genId(), col: 3, row: 1, label: 'AR', command: 'ar', color: '#663322', textColor: '#fff', blindPanel: 1 },
    // Row 2: O, [CENTER SWITCH], E, AB
    { id: genId(), col: 0, row: 2, label: 'O', command: 'oeste', color: '#662222', textColor: '#fff', blindPanel: 1 },
    { id: genId(), col: 1, row: 2, label: 'Cambiar', command: '__SWITCH_PANEL__', color: '#336666', textColor: '#88ccff', blindPanel: 1, fixed: true },
    { id: genId(), col: 2, row: 2, label: 'E', command: 'este', color: '#662222', textColor: '#fff', blindPanel: 1 },
    { id: genId(), col: 3, row: 2, label: 'AB', command: 'ab', color: '#663322', textColor: '#fff', blindPanel: 1 },
    // Row 3: SO, S, SE, DE, FU
    { id: genId(), col: 0, row: 3, label: 'SO', command: 'sudoeste', color: '#662222', textColor: '#fff', blindPanel: 1 },
    { id: genId(), col: 1, row: 3, label: 'S', command: 'sur', color: '#662222', textColor: '#fff', blindPanel: 1 },
    { id: genId(), col: 2, row: 3, label: 'SE', command: 'sudeste', color: '#662222', textColor: '#fff', blindPanel: 1 },
    { id: genId(), col: 3, row: 3, label: 'DE', command: 'dentro', color: '#663322', textColor: '#fff', blindPanel: 1 },
    { id: genId(), col: 4, row: 3, label: 'FU', command: 'fuera', color: '#663322', textColor: '#fff', blindPanel: 1 },
    // Enemigo (row 1, col 4) and Daño (row 2, col 4) - below Salidas
    { id: genId(), col: 4, row: 1, label: 'Enemigo', command: 'enemigos', color: '#336633', textColor: '#fff', blindPanel: 1 },
    { id: genId(), col: 4, row: 2, label: 'Daño', command: 'ultimo daño', color: '#336633', textColor: '#fff', blindPanel: 1 },
  ];

  // Panel 2: Stealth directions with empty customizable buttons
  const panel2: LayoutButton[] = [
    // Row 0: 5 empty buttons
    { id: genId(), col: 0, row: 0, label: '-', command: '', color: '#444444', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 1, row: 0, label: '-', command: '', color: '#444444', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 2, row: 0, label: '-', command: '', color: '#444444', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 3, row: 0, label: '-', command: '', color: '#444444', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 4, row: 0, label: '-', command: '', color: '#444444', textColor: '#fff', blindPanel: 2 },
    // Row 1: Stealth directions NO, N, NE, AR + empty
    { id: genId(), col: 0, row: 1, label: 'NO', command: 'sigilar noroeste', color: '#662222', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 1, row: 1, label: 'N', command: 'sigilar norte', color: '#662222', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 2, row: 1, label: 'NE', command: 'sigilar noreste', color: '#662222', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 3, row: 1, label: 'AR', command: 'sigilar ar', color: '#663322', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 4, row: 1, label: '-', command: '', color: '#444444', textColor: '#fff', blindPanel: 2 },
    // Row 2: Stealth directions O, SWITCH, E, AB + empty
    { id: genId(), col: 0, row: 2, label: 'O', command: 'sigilar oeste', color: '#662222', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 1, row: 2, label: 'Cambiar', command: '__SWITCH_PANEL__', color: '#336666', textColor: '#88ccff', blindPanel: 2 },
    { id: genId(), col: 2, row: 2, label: 'E', command: 'sigilar este', color: '#662222', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 3, row: 2, label: 'AB', command: 'sigilar ab', color: '#663322', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 4, row: 2, label: '-', command: '', color: '#444444', textColor: '#fff', blindPanel: 2 },
    // Row 3: Stealth directions SO, S, SE, DE, FU
    { id: genId(), col: 0, row: 3, label: 'SO', command: 'sigilar sudoeste', color: '#662222', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 1, row: 3, label: 'S', command: 'sigilar sur', color: '#662222', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 2, row: 3, label: 'SE', command: 'sigilar sudeste', color: '#662222', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 3, row: 3, label: 'DE', command: 'sigilar dentro', color: '#663322', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 4, row: 3, label: 'FU', command: 'sigilar fuera', color: '#663322', textColor: '#fff', blindPanel: 2 },
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
