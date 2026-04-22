import React, { createContext, useContext, useState, ReactNode } from 'react';
import { ServerProfile } from '../types';

interface SelectedServerContextType {
  selectedServer: ServerProfile | null;
  setSelectedServer: (server: ServerProfile | null) => void;
}

const SelectedServerContext = createContext<SelectedServerContextType | undefined>(undefined);

export function SelectedServerProvider({ children }: { children: ReactNode }) {
  const [selectedServer, setSelectedServer] = useState<ServerProfile | null>(null);

  const value: SelectedServerContextType = {
    selectedServer,
    setSelectedServer,
  };

  return (
    <SelectedServerContext.Provider value={value}>
      {children}
    </SelectedServerContext.Provider>
  );
}

export function useSelectedServer() {
  const context = useContext(SelectedServerContext);
  if (!context) {
    throw new Error('useSelectedServer must be used within SelectedServerProvider');
  }
  return context;
}
