export interface ServerProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  encoding?: string;
  buttonLayout?: {
    buttons: Array<{
      id: string;
      col: number;
      row: number;
      label: string;
      command: string;
      color: string;
      textColor: string;
    }>;
  };
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

export type RootStackParamList = {
  ServerList: undefined;
  Terminal: { server: ServerProfile };
  Settings: undefined;
};

export type FloatingOrientation = 'portrait' | 'landscape';

export interface LayoutItem {
  id: string;
  type: 'button' | 'vitalbars' | 'input' | 'chat' | 'terminal';
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

