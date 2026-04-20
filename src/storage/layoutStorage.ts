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
  locked?: boolean;
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
  // 9x6 grid with empty row 1, directions from row 2-4, LOC at (8,0)
  const buttons: LayoutButton[] = [
    // Row 0: Decir, Responder, _, _, _, _, IR, LOC
    { id: genId(), col: 3, row: 0, label: 'Decir', command: 'decir', color: '#662266', textColor: '#fff', addText: true },
    { id: genId(), col: 4, row: 0, label: 'Res', command: 'responder', color: '#662266', textColor: '#fff', addText: true },
    { id: genId(), col: 7, row: 0, label: 'IR', command: 'irsala', color: '#662266', textColor: '#fff', addText: true },
    { id: genId(), col: 8, row: 0, label: 'LOC', command: 'locate', color: '#223366', textColor: '#fff' },
    // Row 1: (empty)
    // Row 2: _, _, _, NO, N, NE, AR, _, _
    { id: genId(), col: 3, row: 2, label: 'NO', command: 'noroeste', color: '#662222', textColor: '#fff', locked: true },
    { id: genId(), col: 4, row: 2, label: 'N', command: 'norte', color: '#662222', textColor: '#fff', locked: true },
    { id: genId(), col: 5, row: 2, label: 'NE', command: 'noreste', color: '#662222', textColor: '#fff', locked: true },
    { id: genId(), col: 6, row: 2, label: 'AR', command: 'ar', color: '#663322', textColor: '#fff', locked: true },
    // Row 3: _, _, _, O, _, E, AB, _, _
    { id: genId(), col: 3, row: 3, label: 'O', command: 'oeste', color: '#662222', textColor: '#fff', locked: true },
    { id: genId(), col: 5, row: 3, label: 'E', command: 'este', color: '#662222', textColor: '#fff', locked: true },
    { id: genId(), col: 6, row: 3, label: 'AB', command: 'ab', color: '#663322', textColor: '#fff', locked: true },
    // Row 4: _, _, _, SO, S, SE, DE, _, _
    { id: genId(), col: 3, row: 4, label: 'SO', command: 'sudoeste', color: '#662222', textColor: '#fff', locked: true },
    { id: genId(), col: 4, row: 4, label: 'S', command: 'sur', color: '#662222', textColor: '#fff', locked: true },
    { id: genId(), col: 5, row: 4, label: 'SE', command: 'sudeste', color: '#662222', textColor: '#fff', locked: true },
    { id: genId(), col: 6, row: 4, label: 'DE', command: 'dentro', color: '#663322', textColor: '#fff', locked: true },
    // Row 5: _, _, _, _, _, _, FU, _, _
    { id: genId(), col: 6, row: 5, label: 'FU', command: 'fuera', color: '#663322', textColor: '#fff', locked: true },
  ];

  return { buttons };
}

export function createBlindModeLayout(): ButtonLayout {
  // 5x4 grid optimized for blind users: directions + vertical movement + controls
  const buttons: LayoutButton[] = [
    // Row 0: STOP, IR, LOC, VID, SAL
    { id: genId(), col: 0, row: 0, label: 'STOP', command: 'stop', color: '#662222', textColor: '#fff', locked: true },
    { id: genId(), col: 1, row: 0, label: 'IR', command: 'irsala', color: '#662266', textColor: '#fff', addText: true },
    { id: genId(), col: 2, row: 0, label: 'LOC', command: 'locate', color: '#223366', textColor: '#fff', locked: true },
    { id: genId(), col: 3, row: 0, label: 'VID', command: 'consultar vida', color: '#336633', textColor: '#fff', secondaryCommand: 'consultar energia' },
    { id: genId(), col: 4, row: 0, label: 'SAL', command: 'consultar salidas', color: '#336633', textColor: '#fff', secondaryCommand: 'xp' },
    // Row 1: NO, N, NE, AR
    { id: genId(), col: 0, row: 1, label: 'NO', command: 'noroeste', color: '#662222', textColor: '#fff', locked: true },
    { id: genId(), col: 1, row: 1, label: 'N', command: 'norte', color: '#662222', textColor: '#fff', locked: true },
    { id: genId(), col: 2, row: 1, label: 'NE', command: 'noreste', color: '#662222', textColor: '#fff', locked: true },
    { id: genId(), col: 3, row: 1, label: 'AR', command: 'ar', color: '#663322', textColor: '#fff', locked: true },
    // Row 2: O, DAÑ, E, AB, ENE
    { id: genId(), col: 0, row: 2, label: 'O', command: 'oeste', color: '#662222', textColor: '#fff', locked: true },
    { id: genId(), col: 1, row: 2, label: 'DAÑ', command: 'ultimo daño', color: '#cc6633', textColor: '#fff' },
    { id: genId(), col: 2, row: 2, label: 'E', command: 'este', color: '#662222', textColor: '#fff', locked: true },
    { id: genId(), col: 3, row: 2, label: 'AB', command: 'ab', color: '#663322', textColor: '#fff', locked: true },
    { id: genId(), col: 4, row: 2, label: 'ENE', command: 'enemigos', color: '#994444', textColor: '#fff' },
    // Row 3: SO, S, SE, DE, FU
    { id: genId(), col: 0, row: 3, label: 'SO', command: 'sudoeste', color: '#662222', textColor: '#fff', locked: true },
    { id: genId(), col: 1, row: 3, label: 'S', command: 'sur', color: '#662222', textColor: '#fff', locked: true },
    { id: genId(), col: 2, row: 3, label: 'SE', command: 'sudeste', color: '#662222', textColor: '#fff', locked: true },
    { id: genId(), col: 3, row: 3, label: 'DE', command: 'dentro', color: '#663322', textColor: '#fff', locked: true },
    { id: genId(), col: 4, row: 3, label: 'FU', command: 'fuera', color: '#663322', textColor: '#fff', locked: true },
  ];

  return { buttons };
}

export async function loadLayout(): Promise<ButtonLayout> {
  const json = await AsyncStorage.getItem(LAYOUT_KEY);
  if (!json) return createDefaultLayout();
  return JSON.parse(json);
}

export async function saveLayout(layout: ButtonLayout): Promise<void> {
  await AsyncStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
}
