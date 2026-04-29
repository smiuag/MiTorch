// Module-level registry of the currently active server connection.
//
// TerminalScreen owns the TelnetService instance for its mounted server, so
// other screens (notably the ServerListScreen edit modal) can't reach it
// directly. This registry lets the Terminal register/unregister itself on
// mount and lets other screens query "are we connected to <serverId>?" and
// "send this command on that connection".
//
// In practice only one Terminal is mounted at a time, so a single slot is
// enough — no map needed.

type Sender = (command: string) => void;

let activeServerId: string | null = null;
let activeSender: Sender | null = null;

export const activeConnection = {
  set(serverId: string, sender: Sender): void {
    activeServerId = serverId;
    activeSender = sender;
  },
  clear(serverId: string): void {
    // Only clear if the caller still owns the slot — guards against a stale
    // unmount clearing a newer connection's registration.
    if (activeServerId === serverId) {
      activeServerId = null;
      activeSender = null;
    }
  },
  isConnectedTo(serverId: string): boolean {
    return activeServerId === serverId && activeSender !== null;
  },
  isAnyConnected(): boolean {
    return activeSender !== null;
  },
  send(serverId: string, command: string): boolean {
    if (activeServerId !== serverId || !activeSender) return false;
    activeSender(command);
    return true;
  },
  // Send to whichever connection is currently active. Useful from screens
  // (e.g. Settings opened from Terminal) that don't track a serverId
  // explicitly but are guaranteed to run while a connection is open.
  sendActive(command: string): boolean {
    if (!activeSender) return false;
    activeSender(command);
    return true;
  },
};
