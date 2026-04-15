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
};
