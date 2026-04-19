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
  // 9x6 grid with empty row 1, directions from row 2-4, STOP at (0,0), LOC at (8,0)
  const buttons: LayoutButton[] = [
    // Row 0: STOP, Login, Pass, Decir, Responder, _, _, _, LOC
    { id: genId(), col: 0, row: 0, label: 'STOP', command: 'parar', color: '#662222', textColor: '#fff' },
    { id: genId(), col: 1, row: 0, label: 'Login', command: '__LOGIN_NAME__', color: '#662266', textColor: '#fff' },
    { id: genId(), col: 2, row: 0, label: 'Pass', command: '', color: '#662266', textColor: '#fff' },
    { id: genId(), col: 3, row: 0, label: 'Decir', command: 'decir', color: '#662266', textColor: '#fff', addText: true },
    { id: genId(), col: 4, row: 0, label: 'Res', command: 'responder', color: '#662266', textColor: '#fff', addText: true },
    { id: genId(), col: 6, row: 0, label: 'STOP', command: 'stop', color: '#662222', textColor: '#fff' },
    { id: genId(), col: 7, row: 0, label: 'IR', command: 'irsala', color: '#662266', textColor: '#fff', addText: true },
    { id: genId(), col: 8, row: 0, label: 'LOC', command: 'locate', color: '#223366', textColor: '#fff' },
    // Row 1: (empty)
    // Row 2: _, _, _, NO, N, NE, _, _, _
    { id: genId(), col: 3, row: 2, label: 'NO', command: 'noroeste', color: '#662222', textColor: '#fff' },
    { id: genId(), col: 4, row: 2, label: 'N', command: 'norte', color: '#662222', textColor: '#fff' },
    { id: genId(), col: 5, row: 2, label: 'NE', command: 'noreste', color: '#662222', textColor: '#fff' },
    // Row 3: _, _, _, O, _, E, _, _, _
    { id: genId(), col: 3, row: 3, label: 'O', command: 'oeste', color: '#662222', textColor: '#fff' },
    { id: genId(), col: 5, row: 3, label: 'E', command: 'este', color: '#662222', textColor: '#fff' },
    // Row 4: _, _, _, SO, S, SE, _, _, _
    { id: genId(), col: 3, row: 4, label: 'SO', command: 'suroeste', color: '#662222', textColor: '#fff' },
    { id: genId(), col: 4, row: 4, label: 'S', command: 'sur', color: '#662222', textColor: '#fff' },
    { id: genId(), col: 5, row: 4, label: 'SE', command: 'sureste', color: '#662222', textColor: '#fff' },
    // Row 5: (empty)
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
