import { loadDeclaredVars, saveDeclaredVars } from '../storage/userVariablesStorage';

// User-defined variables. Two-layer model:
// - DECLARED: persisted set of names per server (AsyncStorage). The user
//   creates these from the "Mis variables" screen, OR they're auto-declared
//   when imported in a trigger pack / loaded from a server's existing packs.
// - VALUES: memory-only. set() requires the name to be declared first;
//   writes to undeclared names are silently dropped (with console.warn).
//
// Type: always `string`. Numeric conditions on user vars do `Number()`
// lazily and silently fail on NaN — documented behaviour.
//
// Reserved names: any predefined variable from `variableMap.VARIABLE_SPECS`
// cannot be used. Validation lives at create time in the UI; the service
// trusts callers but the check is also enforced in `declare()` defensively.

const NAME_RE = /^[a-z][a-z0-9_]*$/;

class UserVariablesService {
  private declared: Set<string> = new Set();
  private values: Record<string, string> = {};
  private activeServerId: string | null = null;
  private onUpdateCallback?: (snapshot: { declared: string[]; values: Record<string, string> }) => void;

  // Switch active server. If different from the current one, reloads the
  // declared set from storage and resets values (memory-only). If the same
  // (e.g. disconnect/reconnect cycle), no-op so values persist within a
  // single session against the same server.
  async setActiveServer(serverId: string): Promise<void> {
    if (this.activeServerId === serverId) return;
    this.activeServerId = serverId;
    this.values = {};
    const persisted = await loadDeclaredVars(serverId);
    this.declared = new Set(persisted);
    this.notify();
  }

  // Declares a new variable name. Returns true if it was actually added
  // (false if already declared). Persists immediately. Initializes the
  // value to "" so reads before any set return a stable empty string.
  async declare(name: string): Promise<boolean> {
    if (!NAME_RE.test(name)) return false;
    if (this.declared.has(name)) return false;
    this.declared.add(name);
    if (!(name in this.values)) this.values[name] = '';
    await this.persist();
    this.notify();
    return true;
  }

  // Bulk-declare many names at once. Skips invalid and already-declared
  // names. Persists once at the end. Used by pack import / server bootstrap.
  async declareMany(names: string[]): Promise<string[]> {
    const added: string[] = [];
    for (const n of names) {
      if (!NAME_RE.test(n)) continue;
      if (this.declared.has(n)) continue;
      this.declared.add(n);
      if (!(n in this.values)) this.values[n] = '';
      added.push(n);
    }
    if (added.length > 0) {
      await this.persist();
      this.notify();
    }
    return added;
  }

  async undeclare(name: string): Promise<boolean> {
    if (!this.declared.has(name)) return false;
    this.declared.delete(name);
    delete this.values[name];
    await this.persist();
    this.notify();
    return true;
  }

  isDeclared(name: string): boolean {
    return this.declared.has(name);
  }

  getDeclared(): string[] {
    return [...this.declared].sort();
  }

  // Sets a variable's value. Returns true if value actually changed (engine
  // uses this to decide cascade-evaluation). Silently no-ops if the name
  // isn't declared — the trigger engine logs a warning at compile time so
  // the user is alerted via console.
  set(name: string, value: string): boolean {
    if (!this.declared.has(name)) {
      console.warn(`[userVariablesService] set("${name}") ignored — variable not declared. Create it from "Mis variables" first.`);
      return false;
    }
    const prev = this.values[name] ?? '';
    if (prev === value) return false;
    this.values = { ...this.values, [name]: value };
    this.notify();
    return true;
  }

  get(name: string): string {
    return this.values[name] ?? '';
  }

  getAllValues(): Record<string, string> {
    return { ...this.values };
  }

  // Clears all CURRENT VALUES for declared variables, but keeps the
  // declarations. UI "Resetear todas" calls this.
  resetValues(): void {
    if (Object.keys(this.values).length === 0) return;
    const next: Record<string, string> = {};
    for (const name of this.declared) next[name] = '';
    this.values = next;
    this.notify();
  }

  setOnUpdateCallback(
    cb: ((snapshot: { declared: string[]; values: Record<string, string> }) => void) | undefined,
  ): void {
    this.onUpdateCallback = cb;
  }

  private async persist(): Promise<void> {
    if (this.activeServerId == null) return;
    await saveDeclaredVars(this.activeServerId, [...this.declared]);
  }

  private notify(): void {
    if (this.onUpdateCallback) {
      this.onUpdateCallback({
        declared: this.getDeclared(),
        values: { ...this.values },
      });
    }
  }

  static isValidName(name: string): boolean {
    return NAME_RE.test(name);
  }
}

export const userVariablesService = new UserVariablesService();
export const isValidUserVarName = (name: string): boolean => UserVariablesService.isValidName(name);
