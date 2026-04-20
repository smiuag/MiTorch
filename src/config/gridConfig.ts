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
