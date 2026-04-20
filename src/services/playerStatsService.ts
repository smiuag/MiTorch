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
  hpHistory: { delta: number; label: string }[];
}

class PlayerStatsService {
  private playerVariables: PlayerVariables;
  private onUpdateCallback?: (variables: PlayerVariables) => void;

  constructor() {
    this.playerVariables = {
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
      hpHistory: [],
    };
  }

  updatePlayerVariables(variables: Partial<PlayerVariables>) {
    this.playerVariables = { ...this.playerVariables, ...variables };
    if (this.onUpdateCallback) {
      this.onUpdateCallback(this.playerVariables);
    }
  }

  getPlayerVariables(): PlayerVariables {
    return { ...this.playerVariables };
  }

  setOnUpdateCallback(callback: (variables: PlayerVariables) => void) {
    this.onUpdateCallback = callback;
  }

  reset() {
    this.playerVariables = {
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
      hpHistory: [],
    };
  }
}

export const playerStatsService = new PlayerStatsService();
