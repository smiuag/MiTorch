import AsyncStorage from '@react-native-async-storage/async-storage';
import { FloatingLayout, LayoutItem } from '../types';

const LAYOUT_KEY = 'aljhtar_floating_layout';

const DEFAULT_LAYOUT: FloatingLayout = {
  gridCols: 8,
  gridRows: 8,
  items: [],
};

let itemIdCounter = 0;
function genId() {
  return `item_${itemIdCounter++}`;
}

export function createDefaultLayout(): FloatingLayout {
  // Universal 8x8 grid layout that can be rotated for any orientation
  const items: LayoutItem[] = [];

  // Simple default: Terminal at top, Chat at bottom
  items.push({ id: genId(), type: 'terminal', col: 0, row: 0, colSpan: 8, rowSpan: 5, opacity: 1 });
  items.push({ id: genId(), type: 'chat', col: 0, row: 5, colSpan: 8, rowSpan: 3, opacity: 1 });

  return {
    gridCols: 8,
    gridRows: 8,
    items,
  };
}

export async function loadLayout(): Promise<FloatingLayout> {
  const json = await AsyncStorage.getItem(LAYOUT_KEY);
  if (!json) return createDefaultLayout();
  return { ...DEFAULT_LAYOUT, ...JSON.parse(json) };
}

export async function saveLayout(layout: FloatingLayout): Promise<void> {
  await AsyncStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
}
