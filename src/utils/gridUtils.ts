import { FloatingOrientation, LayoutItem } from '../types';

export interface GridMetrics {
  cellSize: number;
  gridCols: number;
  gridRows: number;
  gridWidth: number;
  gridHeight: number;
  offsetX: number;
  offsetY: number;
}

export function computeGridMetrics(
  screenWidth: number,
  screenHeight: number,
  orientation: FloatingOrientation,
  targetCols: number = 6,
): GridMetrics {
  // useWindowDimensions() already returns correct width/height for current orientation
  // In portrait: width < height
  // In landscape: width > height
  const availW = screenWidth;
  const availH = screenHeight;

  // Target cell size: divide available width by target columns
  // Clamp between 30px (minimum) and 70px (reasonable spacing)
  const cellSize = Math.max(30, Math.min(70, Math.floor(availW / targetCols)));

  const gridCols = Math.floor(availW / cellSize);
  const gridRows = Math.floor(availH / cellSize);

  const gridWidth = cellSize * gridCols;
  const gridHeight = cellSize * gridRows;

  const offsetX = Math.floor((availW - gridWidth) / 2);
  const offsetY = Math.floor((availH - gridHeight) / 2);

  return { cellSize, gridCols, gridRows, gridWidth, gridHeight, offsetX, offsetY };
}

export function occupiedCells(item: LayoutItem): Set<string> {
  const cells = new Set<string>();
  // Terminal only occupies its starting cell in the editor grid
  if (item.type === 'terminal') {
    cells.add(`${item.col},${item.row}`);
    return cells;
  }
  for (let r = item.row; r < item.row + item.rowSpan; r++) {
    for (let c = item.col; c < item.col + item.colSpan; c++) {
      cells.add(`${c},${r}`);
    }
  }
  return cells;
}

export function hasCollision(
  candidate: LayoutItem | { col: number; row: number; colSpan: number; rowSpan: number },
  items: LayoutItem[],
  gridCols: number,
  gridRows: number,
  excludeId?: string,
): boolean {
  // Check bounds
  if (candidate.col < 0 || candidate.row < 0) return true;
  if (candidate.col + candidate.colSpan > gridCols) return true;
  if (candidate.row + candidate.rowSpan > gridRows) return true;

  // Terminal type has no collision restrictions - it can overlap with anything
  if ('type' in candidate && candidate.type === 'terminal') return false;

  // Check collision with existing items (but ignore terminal items)
  const candidateCells = occupiedCells(candidate as LayoutItem);
  for (const item of items) {
    if (item.id === excludeId) continue;
    // Terminal items don't block other items from being placed
    if (item.type === 'terminal') continue;
    for (const cell of occupiedCells(item)) {
      if (candidateCells.has(cell)) return true;
    }
  }
  return false;
}
