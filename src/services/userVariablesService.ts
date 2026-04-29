// User-defined variables. Memory-only (no AsyncStorage), scoped to the
// currently active server. When the user navigates to a different server
// the store is wiped. Disconnect/reconnect to the same server preserves
// values — only an explicit reset (UI button) or server change clears them.
//
// Type: always `string`. Numeric conditions on user vars do `Number()`
// lazily and silently fail on NaN — documented behaviour.
//
// Reserved names: any predefined variable from `variableMap.VARIABLE_SPECS`
// cannot be used as a user-var name. Validation lives at trigger save time
// in the editor; the service trusts callers.

const NAME_RE = /^[a-z][a-z0-9_]*$/;

class UserVariablesService {
  private vars: Record<string, string> = {};
  private activeServerId: string | null = null;
  private onUpdateCallback?: (vars: Record<string, string>) => void;

  // Switch active server. If different from the current one, wipes the store
  // (per-server scope). If the same (e.g. disconnect/reconnect cycle), no-op
  // so values persist within a single session against the same server.
  setActiveServer(serverId: string): void {
    if (this.activeServerId === serverId) return;
    this.activeServerId = serverId;
    this.vars = {};
    if (this.onUpdateCallback) this.onUpdateCallback({ ...this.vars });
  }

  // Sets a variable. Returns true if the value actually changed (the engine
  // uses this to decide whether to cascade-evaluate user-variable triggers).
  set(name: string, value: string): boolean {
    const prev = this.vars[name] ?? '';
    if (prev === value) return false;
    this.vars = { ...this.vars, [name]: value };
    if (this.onUpdateCallback) this.onUpdateCallback({ ...this.vars });
    return true;
  }

  get(name: string): string {
    return this.vars[name] ?? '';
  }

  getAll(): Record<string, string> {
    return { ...this.vars };
  }

  // Clears all user vars for the active server. Does not change the active
  // server id. UI "Resetear todas mis variables" calls this.
  reset(): void {
    if (Object.keys(this.vars).length === 0) return;
    this.vars = {};
    if (this.onUpdateCallback) this.onUpdateCallback({ ...this.vars });
  }

  // Subscribe to changes (e.g. for the "Mis variables" UI to live-update).
  // Single subscriber by design — overwrites previous.
  setOnUpdateCallback(cb: ((vars: Record<string, string>) => void) | undefined): void {
    this.onUpdateCallback = cb;
  }

  static isValidName(name: string): boolean {
    return NAME_RE.test(name);
  }
}

export const userVariablesService = new UserVariablesService();
export const isValidUserVarName = (name: string): boolean => UserVariablesService.isValidName(name);
