import AsyncStorage from '@react-native-async-storage/async-storage';

export interface LayoutButton {
  id: string;
  col: number;
  row: number;
  label: string;
  command: string;
  color: string;
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
  // 11x11 grid with LOC in center and directions around it
  const buttons: LayoutButton[] = [
    // Center column
    { id: genId(), col: 5, row: 4, label: 'Noroeste', command: 'noroeste', color: '#666666' },
    { id: genId(), col: 5, row: 5, label: 'Norte', command: 'norte', color: '#666666' },
    { id: genId(), col: 5, row: 6, label: 'Noreste', command: 'noreste', color: '#666666' },
    // Middle row
    { id: genId(), col: 4, row: 5, label: 'Oeste', command: 'oeste', color: '#666666' },
    { id: genId(), col: 5, row: 5, label: 'Localizar', command: 'ojear', color: '#3399cc' },
    { id: genId(), col: 6, row: 5, label: 'Este', command: 'este', color: '#666666' },
    // Bottom row
    { id: genId(), col: 4, row: 6, label: 'Sudoeste', command: 'sudoeste', color: '#666666' },
    { id: genId(), col: 5, row: 6, label: 'Sur', command: 'sur', color: '#666666' },
    { id: genId(), col: 6, row: 6, label: 'Sudeste', command: 'sudeste', color: '#666666' },
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
