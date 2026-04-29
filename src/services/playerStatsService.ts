export interface PlayerVariables {
  playerClass: string;
  playerLevel: number;
  playerHP: number;
  playerMaxHP: number;
  playerEnergy: number;
  playerMaxEnergy: number;
  concentrationActive: boolean;
  inCombat: boolean;
  playerXP: number;
  playerImages: number;
  playerSkins: number;
  playerInertia: number;
  playerAstuteness: number;
  roomEnemies: string;
  roomAllies: string;
  roomCombatants: string;
  roomExits: string;
  roomPlayers: number;
  actionsMovement: number;
  actionsPrimary: number;
  actionsSecondary: number;
  actionsMinor: number;
  carry: number;
  hpHistory: { delta: number; label: string }[];
}

const DEFAULTS: PlayerVariables = {
  playerClass: '',
  playerLevel: 0,
  playerHP: 0,
  playerMaxHP: 0,
  playerEnergy: 0,
  playerMaxEnergy: 0,
  concentrationActive: false,
  inCombat: false,
  playerXP: 0,
  playerImages: 0,
  playerSkins: 0,
  playerInertia: 0,
  playerAstuteness: 0,
  roomEnemies: '',
  roomAllies: '',
  roomCombatants: '',
  roomExits: '',
  roomPlayers: 0,
  actionsMovement: 0,
  actionsPrimary: 0,
  actionsSecondary: 0,
  actionsMinor: 0,
  carry: 0,
  hpHistory: [],
};

class PlayerStatsService {
  private playerVariables: PlayerVariables = { ...DEFAULTS };
  private prevValues: PlayerVariables = { ...DEFAULTS };
  private onUpdateCallback?: (variables: PlayerVariables) => void;

  updatePlayerVariables(variables: Partial<PlayerVariables>) {
    this.playerVariables = { ...this.playerVariables, ...variables };
    if (this.onUpdateCallback) {
      this.onUpdateCallback(this.playerVariables);
    }
  }

  // Apply a snapshot of updates and return the list of keys whose value
  // actually changed compared to the previous state. Captures `prevValues`
  // BEFORE the merge so edge-triggered events (crosses_below/above) can read
  // both old and new sides via getPrevValues() / getPlayerVariables().
  setSnapshot(updates: Partial<PlayerVariables>): (keyof PlayerVariables)[] {
    const changedKeys: (keyof PlayerVariables)[] = [];
    const prev = { ...this.playerVariables };
    for (const k of Object.keys(updates) as (keyof PlayerVariables)[]) {
      const newVal = updates[k];
      if (newVal === undefined) continue;
      if (prev[k] !== newVal) {
        changedKeys.push(k);
      }
    }
    if (changedKeys.length === 0) {
      return [];
    }
    this.prevValues = prev;
    this.playerVariables = { ...this.playerVariables, ...updates };
    if (this.onUpdateCallback) {
      this.onUpdateCallback(this.playerVariables);
    }
    return changedKeys;
  }

  getPlayerVariables(): PlayerVariables {
    return { ...this.playerVariables };
  }

  getPrevValues(): PlayerVariables {
    return { ...this.prevValues };
  }

  setOnUpdateCallback(callback: (variables: PlayerVariables) => void) {
    this.onUpdateCallback = callback;
  }

  reset() {
    this.playerVariables = { ...DEFAULTS };
    this.prevValues = { ...DEFAULTS };
  }
}

export const playerStatsService = new PlayerStatsService();
