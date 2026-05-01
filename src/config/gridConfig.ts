/**
 * Grid dimensions configuration for all modes
 * Single source of truth for button grid layout
 */

export interface GridDimensions {
  cols: number;
  rows: number;
}

export interface ModeConfig {
  vertical: GridDimensions;
  horizontal: GridDimensions;
}

// Normal mode: 9x6 vertical, 6x9 horizontal
export const NORMAL_MODE: ModeConfig = {
  vertical: { cols: 9, rows: 6 },
  horizontal: { cols: 6, rows: 9 },
};

// Blind mode: 5x4 vertical, 4x5 horizontal
export const BLIND_MODE: ModeConfig = {
  vertical: { cols: 5, rows: 4 },
  horizontal: { cols: 4, rows: 5 },
};

export function getGridConfig(uiMode: 'completo' | 'blind'): ModeConfig {
  return uiMode === 'blind' ? BLIND_MODE : NORMAL_MODE;
}

export function getVerticalDimensions(uiMode: 'completo' | 'blind'): GridDimensions {
  return getGridConfig(uiMode).vertical;
}

export function getHorizontalDimensions(uiMode: 'completo' | 'blind'): GridDimensions {
  return getGridConfig(uiMode).horizontal;
}

// Custom layout: el usuario configura un grid lógico cuadrado (5×5, 7×7 o
// 9×9) al crear el server. En cada orientación se renderiza el sub-rectángulo
// que cabe — sin transformaciones ni transposición. Botones cuya (col, row)
// caigan fuera del rectángulo visible existen en datos pero no se renderizan.
//
// Tamaños fijos (forma coherente con el grid estándar 9×6 / 6×9):
//   Pequeño 5×5 → portrait 5×4 (ancho y bajo), landscape 4×5 (alto y estrecho)
//   Mediano 7×7 → portrait 7×5, landscape 5×7
//   Grande  9×9 → portrait 9×6, landscape 6×9 (igual que el grid estándar)
//
// Patrón: la dim "estrecha" (rows en portrait, cols en landscape) escala con
// el tamaño del grid (5→4, 7→5, 9→6). Grande 9×9 coincide exactamente con
// el grid estándar para que la sensación visual sea idéntica.
export type CustomGridSize = 5 | 7 | 9;
export type Orientation = 'vertical' | 'horizontal';

const NARROW_BY_SIZE: Record<CustomGridSize, number> = { 5: 4, 7: 5, 9: 6 };

export function getCustomDisplayDimensions(
  size: CustomGridSize,
  orientation: Orientation,
): GridDimensions {
  const narrow = NARROW_BY_SIZE[size];
  if (orientation === 'vertical') {
    // Portrait (móvil de pie): cols = grid completo (ancho), rows = cap.
    return { cols: size, rows: narrow };
  }
  // Landscape (móvil tumbado): cols = cap, rows = grid completo (alto).
  return { cols: narrow, rows: size };
}
