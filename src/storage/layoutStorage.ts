import AsyncStorage from '@react-native-async-storage/async-storage';

export interface LayoutButton {
  id: string;
  col: number;
  row: number;
  label: string;
  command: string;
  color: string;
  opacity: number;
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
  // 11x11 grid with LOC in center (5,5) and 8 directions in a 3x3 grid around it
  const buttons: LayoutButton[] = [
    // Top row (row 4)
    { id: genId(), col: 4, row: 4, label: 'Noroeste', command: 'noroeste', color: '#cc3333', opacity: 0.5 },
    { id: genId(), col: 5, row: 4, label: 'Norte', command: 'norte', color: '#cc3333', opacity: 0.5 },
    { id: genId(), col: 6, row: 4, label: 'Noreste', command: 'noreste', color: '#cc3333', opacity: 0.5 },
    // Middle row (row 5)
    { id: genId(), col: 4, row: 5, label: 'Oeste', command: 'oeste', color: '#cc3333', opacity: 0.5 },
    { id: genId(), col: 5, row: 5, label: 'LOC', command: 'locate', color: '#3399cc', opacity: 0.5 },
    { id: genId(), col: 6, row: 5, label: 'Este', command: 'este', color: '#cc3333', opacity: 0.5 },
    // Bottom row (row 6)
    { id: genId(), col: 4, row: 6, label: 'Sudoeste', command: 'sudoeste', color: '#cc3333', opacity: 0.5 },
    { id: genId(), col: 5, row: 6, label: 'Sur', command: 'sur', color: '#cc3333', opacity: 0.5 },
    { id: genId(), col: 6, row: 6, label: 'Sudeste', command: 'sudeste', color: '#cc3333', opacity: 0.5 },
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
