import AsyncStorage from '@react-native-async-storage/async-storage';
import { FloatingLayout, LayoutItem } from '../types';

const LAYOUT_KEY = 'aljhtar_floating_layout';

const DEFAULT_LAYOUT: FloatingLayout = {
  gridCols: 12,
  gridRows: 24,
  items: [],
};

let itemIdCounter = 0;
function genId() {
  return `item_${itemIdCounter++}`;
}

export function createDefaultLayout(orientation: 'portrait' | 'landscape' = 'portrait'): FloatingLayout {
  const items: LayoutItem[] = [];

  if (orientation === 'portrait') {
    // Portrait layout (vertical):
    // Row 0-6: Terminal (with direction buttons centered inside) - 7 filas
    // Row 7: VitalBars
    // Row 8-14: Chat (7 filas)
    // Row 15: Input
    // Row 16: Empty (no existe, es row 15 la última)
    // Ajustando a 16 filas totales (0-15):
    // Row 0-6: Terminal (7 filas, filas 10-15 desde abajo)
    // Row 7: VitalBars (fila 9 desde abajo)
    // Row 8-14: Chat (7 filas, filas 2-8 desde abajo)
    // Row 14: Input (fila 1 desde abajo)
    // Row 15: Empty (fila 0 desde abajo)

    // Terminal - occupies all rows above Input (rows 0-12, 13 filas)
    items.push({ id: genId(), type: 'terminal', col: 0, row: 0, colSpan: 12, rowSpan: 13, opacity: 1 });

    // Direction buttons inside terminal - centered (col 4-6, rows 5-7)
    // 1x1 buttons in 3x3 grid, centered in the terminal
    items.push(
      { id: genId(), type: 'button', col: 4, row: 5, colSpan: 1, rowSpan: 1, label: 'NO', command: 'noroeste', color: '#666666', opacity: 0.7 },
      { id: genId(), type: 'button', col: 5, row: 5, colSpan: 1, rowSpan: 1, label: 'N', command: 'norte', color: '#666666', opacity: 0.7 },
      { id: genId(), type: 'button', col: 6, row: 5, colSpan: 1, rowSpan: 1, label: 'NE', command: 'noreste', color: '#666666', opacity: 0.7 },
      { id: genId(), type: 'button', col: 4, row: 6, colSpan: 1, rowSpan: 1, label: 'O', command: 'oeste', color: '#666666', opacity: 0.7 },
      { id: genId(), type: 'button', col: 5, row: 6, colSpan: 1, rowSpan: 1, label: 'LOC', command: 'locate', color: '#3399cc', opacity: 0.8 },
      { id: genId(), type: 'button', col: 6, row: 6, colSpan: 1, rowSpan: 1, label: 'E', command: 'este', color: '#666666', opacity: 0.7 },
      { id: genId(), type: 'button', col: 4, row: 7, colSpan: 1, rowSpan: 1, label: 'SO', command: 'sudoeste', color: '#666666', opacity: 0.7 },
      { id: genId(), type: 'button', col: 5, row: 7, colSpan: 1, rowSpan: 1, label: 'S', command: 'sur', color: '#666666', opacity: 0.7 },
      { id: genId(), type: 'button', col: 6, row: 7, colSpan: 1, rowSpan: 1, label: 'SE', command: 'sudeste', color: '#666666', opacity: 0.7 }
    );

    // Input - justo encima de VitalBars = row 13
    items.push({ id: genId(), type: 'input', col: 0, row: 13, colSpan: 12, rowSpan: 1, opacity: 1 });

    // VitalBars - row 14
    items.push({ id: genId(), type: 'vitalbars', col: 0, row: 14, colSpan: 12, rowSpan: 1, opacity: 1 });

    // Chat - rows 15-21 (7 filas)
    items.push({ id: genId(), type: 'chat', col: 0, row: 15, colSpan: 12, rowSpan: 7, opacity: 1 });
  } else {
    // Landscape layout (horizontal):
    // Grid: 24 columns × 10 rows
    // Terminal - left side (cols 0-15)
    items.push({ id: genId(), type: 'terminal', col: 0, row: 0, colSpan: 16, rowSpan: 10, opacity: 1 });

    // VitalBars - right top (cols 16-21, row 0)
    items.push({ id: genId(), type: 'vitalbars', col: 16, row: 0, colSpan: 6, rowSpan: 1, opacity: 1 });

    // Input - right middle (cols 16-21, row 1)
    items.push({ id: genId(), type: 'input', col: 16, row: 1, colSpan: 6, rowSpan: 1, opacity: 1 });

    // Chat - right bottom (cols 16-21, rows 2-9)
    items.push({ id: genId(), type: 'chat', col: 16, row: 2, colSpan: 6, rowSpan: 8, opacity: 1 });
    // Columns 22-23 remain empty
  }

  return {
    gridCols: orientation === 'portrait' ? 12 : 24,
    gridRows: orientation === 'portrait' ? 24 : 10,
    items,
  };
}

export async function loadLayout(): Promise<FloatingLayout> {
  const json = await AsyncStorage.getItem(LAYOUT_KEY);
  if (!json) return { ...DEFAULT_LAYOUT };
  return { ...DEFAULT_LAYOUT, ...JSON.parse(json) };
}

export async function saveLayout(layout: FloatingLayout): Promise<void> {
  await AsyncStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
}
