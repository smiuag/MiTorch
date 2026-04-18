import React, { createContext, useContext, useState, useRef, ReactNode } from 'react';
import { MudLine, ChannelMessage } from '../types';
import { TelnetService } from '../services/telnetService';
import { nextMsgId } from '../components/ChannelPanel';

interface TerminalContextType {
  lines: MudLine[];
  setLines: (lines: MudLine[]) => void;
  addLine: (line: MudLine) => void;
  channels: string[];
  setChannels: (channels: string[]) => void;
  channelMessages: ChannelMessage[];
  setChannelMessages: (messages: ChannelMessage[]) => void;
  activeChannel: string | null;
  setActiveChannel: (channel: string | null) => void;
  unreadCounts: Record<string, number>;
  setUnreadCounts: (counts: Record<string, number>) => void;
  channelAliases: Record<string, string>;
  setChannelAliases: (aliases: Record<string, string>) => void;
  hp: number;
  setHp: (hp: number) => void;
  hpMax: number;
  setHpMax: (hpMax: number) => void;
  energy: number;
  setEnergy: (energy: number) => void;
  energyMax: number;
  setEnergyMax: (energyMax: number) => void;
  telnetRef: React.MutableRefObject<TelnetService | null>;
}

const TerminalContext = createContext<TerminalContextType | undefined>(undefined);

export function TerminalProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<MudLine[]>([]);
  const [channels, setChannels] = useState<string[]>([]);
  const [channelMessages, setChannelMessages] = useState<ChannelMessage[]>([]);
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [channelAliases, setChannelAliases] = useState<Record<string, string>>({});
  const [hp, setHp] = useState(0);
  const [hpMax, setHpMax] = useState(0);
  const [energy, setEnergy] = useState(0);
  const [energyMax, setEnergyMax] = useState(0);
  const telnetRef = useRef<TelnetService | null>(null);

  const addLine = (line: MudLine) => {
    setLines(prev => {
      const updated = [...prev, line];
      const MAX_LINES = 2000;
      if (updated.length > MAX_LINES) {
        return updated.slice(updated.length - MAX_LINES);
      }
      return updated;
    });
  };

  const value: TerminalContextType = {
    lines,
    setLines,
    addLine,
    channels,
    setChannels,
    channelMessages,
    setChannelMessages,
    activeChannel,
    setActiveChannel,
    unreadCounts,
    setUnreadCounts,
    channelAliases,
    setChannelAliases,
    hp,
    setHp,
    hpMax,
    setHpMax,
    energy,
    setEnergy,
    energyMax,
    setEnergyMax,
    telnetRef,
  };

  return (
    <TerminalContext.Provider value={value}>
      {children}
    </TerminalContext.Provider>
  );
}

export function useTerminal() {
  const context = useContext(TerminalContext);
  if (!context) {
    throw new Error('useTerminal must be used within TerminalProvider');
  }
  return context;
}
