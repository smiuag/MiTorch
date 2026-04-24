export interface ServerProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  encoding?: string;
  username?: string;
  password?: string;
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

export type GestureType =
  | 'doubletap'
  | 'swipe_up' | 'swipe_down' | 'swipe_left' | 'swipe_right'
  | 'swipe_up_right' | 'swipe_up_left' | 'swipe_down_right' | 'swipe_down_left'
  | 'twofingers_up' | 'twofingers_down' | 'twofingers_left' | 'twofingers_right'
  | 'twofingers_up_right' | 'twofingers_up_left' | 'twofingers_down_right' | 'twofingers_down_left'
  | 'pinch_in' | 'pinch_out';

export interface GestureConfig {
  type: GestureType;
  enabled: boolean;
  command: string;
  opensKeyboard: boolean;
}

