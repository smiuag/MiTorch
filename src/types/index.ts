export interface ServerProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  encoding?: string;
}

export interface AnsiSpan {
  text: string;
  fg?: string;
  bg?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface MudLine {
  id: number;
  spans: AnsiSpan[];
}

export interface Macro {
  id: string;
  label: string;
  command: string;
  color: string;
}

export type RootStackParamList = {
  ServerList: undefined;
  Terminal: { server: ServerProfile };
  Settings: undefined;
  LayoutEditor: undefined;
};

export type LayoutItemType = 'button' | 'vitalbars' | 'input' | 'chat' | 'terminal';
export type FloatingOrientation = 'portrait' | 'landscape';

export interface LayoutItem {
  id: string;
  type: LayoutItemType;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  // Only for type === 'button':
  label?: string;
  command?: string;
  color?: string;
  opacity?: number;
}

export interface FloatingLayout {
  gridCols: number;
  gridRows: number;
  items: LayoutItem[];
}

// New unified layout types
export type Orientation = 'portrait' | 'landscape';

export interface FloatingButton {
  id: string;
  label: string;
  command: string;
  color: string;
  gridX: number;
  gridRow: number;
}

export interface OrientationLayout {
  orientation: Orientation;
  floatingButtons: FloatingButton[];
}

export interface UnifiedLayoutConfig {
  portrait: OrientationLayout;
  landscape: OrientationLayout;
}
