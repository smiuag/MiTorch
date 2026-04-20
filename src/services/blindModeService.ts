import { AccessibilityInfo } from 'react-native';
import { Audio } from 'expo-av';
import blindModeFiltersData from '../config/blindModeFilters.json';

const soundModules = {
  'bloqueos/bloqueo-termina.wav': require('../../assets/sounds/bloqueos/bloqueo-termina.wav'),
  'combate/pierdes-concentracion.wav': require('../../assets/sounds/combate/pierdes-concentracion.wav'),
  'hechizos/preparas.wav': require('../../assets/sounds/hechizos/preparas.wav'),
  'hechizos/formulando.wav': require('../../assets/sounds/hechizos/formulando.wav'),
  'hechizos/resiste.wav': require('../../assets/sounds/hechizos/resiste.wav'),
  'hechizos/fuera-rango.wav': require('../../assets/sounds/hechizos/fuera-rango.wav'),
  'hechizos/imagenes-off.wav': require('../../assets/sounds/hechizos/imagenes-off.wav'),
  'hechizos/imagenes-up.wav': require('../../assets/sounds/hechizos/imagenes-up.wav'),
  'hechizos/piel-piedra-on.wav': require('../../assets/sounds/hechizos/piel-piedra-on.wav'),
  'combate/impacto.wav': require('../../assets/sounds/combate/impacto.wav'),
  'combate/esquivado.wav': require('../../assets/sounds/combate/esquivado.wav'),
  'combate/bloqueado.wav': require('../../assets/sounds/combate/bloqueado.wav'),
  'combate/objetivo-perdido.wav': require('../../assets/sounds/combate/objetivo-perdido.wav'),
  'combate/interrumpido.wav': require('../../assets/sounds/combate/interrumpido.wav'),
  'combate/critico.wav': require('../../assets/sounds/combate/critico.wav'),
  'eventos/muerte.wav': require('../../assets/sounds/eventos/muerte.wav'),
  'eventos/victoria.wav': require('../../assets/sounds/eventos/victoria.wav'),
  'eventos/xp.wav': require('../../assets/sounds/eventos/xp.wav'),
  'eventos/curacion.wav': require('../../assets/sounds/eventos/curacion.wav'),
} as const;


export interface FilterAction {
  type: 'announce' | 'silence' | 'reduce' | 'filter';
  message?: string;
  announce?: boolean;
  silence?: boolean;
  priority?: 'low' | 'normal' | 'high';
}

export interface FilterPattern {
  regex: string;
  action: string;
  message?: string;
  announce?: boolean;
  silence?: boolean;
  priority?: 'low' | 'normal' | 'high';
  description?: string;
  frequency?: string;
  sound?: string;
}

export interface FilterGroup {
  enabled: boolean;
  description: string;
  class?: string;
  patterns: FilterPattern[];
}

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
  activeHpAlert: 'none' | 'low50' | 'low30' | 'critical10';
}

class BlindModeService {
  private filters: Record<string, FilterGroup>;
  private lineHistory: Map<string, number> = new Map();
  private lastAnnouncedTime: Record<string, number> = {};
  private playerVariables: PlayerVariables;
  private activeFilters: Set<string>;
  private hpAlertInterval: ReturnType<typeof setInterval> | null = null;
  private lastHpPercent: number = 100;

  constructor() {
    this.filters = { ...blindModeFiltersData.filters };
    this.playerVariables = {
      playerClass: 'desconocida',
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
      activeHpAlert: 'none',
    };
    this.activeFilters = new Set(
      blindModeFiltersData.classConfigs.generica.enabledFilters
    );
  }

  /**
   * Update player variables from GMCP or status messages
   */
  updatePlayerVariables(variables: Partial<PlayerVariables>) {
    const oldHP = this.playerVariables.playerHP;
    const oldMaxHP = this.playerVariables.playerMaxHP;

    this.playerVariables = { ...this.playerVariables, ...variables };

    // Update active filters based on character class
    if (variables.playerClass && variables.playerClass !== 'desconocida') {
      this.updateActiveFiltersByClass(variables.playerClass);
    }

    // Handle HP threshold alerts
    if (variables.playerHP !== undefined && variables.playerMaxHP !== undefined) {
      this.checkHpThresholds(oldHP, variables.playerHP, variables.playerMaxHP);
    }
  }

  /**
   * Check HP thresholds and trigger alerts
   */
  private checkHpThresholds(prevHP: number, newHP: number, maxHP: number) {
    // Record HP change in history
    if (newHP !== prevHP) {
      const delta = newHP - prevHP;
      const label = delta > 0 ? `Vida ganada: ${delta}` : `Vida perdida: ${Math.abs(delta)}`;

      this.playerVariables.hpHistory.push({ delta, label });
      if (this.playerVariables.hpHistory.length > 10) {
        this.playerVariables.hpHistory = this.playerVariables.hpHistory.slice(-10);
      }
      console.log(`[HP_HISTORY] ${label}`);
    }

    const newPercent = maxHP > 0 ? (newHP / maxHP) * 100 : 0;

    // Calculate previous percentage
    const prevPercent = maxHP > 0 ? (prevHP / maxHP) * 100 : 0;

    // Check thresholds and manage alerts
    if (newPercent <= 10 && prevPercent > 10) {
      // Entered critical zone (<=10%)
      this.playerVariables.activeHpAlert = 'critical10';
      this.playSoundLoop('alertas/hp-10.wav', 8000);
      this.announceMessage('VIDA CRÍTICA', 'high');
    } else if (newPercent <= 30 && prevPercent > 30) {
      // Entered warning zone (<=30%)
      this.playerVariables.activeHpAlert = 'low30';
      this.playSound('alertas/hp-30.wav');
      this.announceMessage('Vida peligrosa', 'normal');
    } else if (newPercent <= 50 && prevPercent > 50) {
      // Entered caution zone (<=50%)
      this.playerVariables.activeHpAlert = 'low50';
      this.playSound('alertas/hp-50.wav');
      this.announceMessage('Vida baja', 'normal');
    } else if (newPercent > 50 && prevPercent <= 50) {
      // Recovered above 50%
      this.stopSoundLoop();
      this.playerVariables.activeHpAlert = 'none';
      this.announceMessage('Recuperándose', 'low');
    } else if (newPercent > 30 && prevPercent <= 30) {
      // Recovered above 30%
      this.stopSoundLoop();
      this.playerVariables.activeHpAlert = 'low50';
    } else if (newPercent > 10 && prevPercent <= 10) {
      // Recovered above 10%
      this.stopSoundLoop();
      this.playerVariables.activeHpAlert = 'none';
      this.announceMessage('Vida recuperada', 'low');
    }

    this.lastHpPercent = newPercent;
  }

  /**
   * Update active filters based on character class from config
   */
  private updateActiveFiltersByClass(playerClass: string) {
    const classKey = playerClass.toLowerCase();
    const classConfig = blindModeFiltersData.classConfigs[classKey as keyof typeof blindModeFiltersData.classConfigs] ||
                       blindModeFiltersData.classConfigs.generica;

    // Disable all filters first
    Object.keys(this.filters).forEach(filterName => {
      this.filters[filterName].enabled = false;
    });

    // Enable only the filters for this class
    classConfig.enabledFilters.forEach(filterName => {
      if (this.filters[filterName]) {
        this.filters[filterName].enabled = true;
      }
    });

    this.activeFilters = new Set(classConfig.enabledFilters);
  }

  /**
   * Remove ANSI escape codes from text for pattern matching
   */
  private stripAnsiCodes(text: string): string {
    // Remove all ANSI escape sequences: ESC [ ... m
    // Using character code 27 for ESC to be sure
    const esc = String.fromCharCode(27);
    return text.replace(new RegExp(esc + '\\[[0-9;]*m', 'g'), '');
  }

  /**
   * Process a line of text from the server
   * Returns { shouldDisplay, announcement, modifiedText, sound }
   */
  processLine(text: string): {
    shouldDisplay: boolean;
    announcement?: string;
    modifiedText: string;
    action?: FilterAction;
    sound?: string;
  } {
    // Strip ANSI codes for pattern matching
    const cleanText = this.stripAnsiCodes(text);

    if (cleanText.includes('bloqueo')) {
      console.log(`[BM] BLOQUEO DETECTADO: "${cleanText}"`);
    }

    // Check all filter groups that are enabled
    for (const [groupName, group] of Object.entries(this.filters)) {
      if (!group.enabled) {
        continue;
      }

      for (const pattern of group.patterns) {
        try {
          const regex = new RegExp(pattern.regex, 'i');
          const match = regex.exec(cleanText);
          if (match) {
            console.log(`[BM] ✓ MATCH en ${groupName}: patrón="${pattern.regex}" silence=${pattern.silence}`);
            return this.executeFilterAction(pattern, cleanText, groupName, match);
          }
        } catch (e) {
          console.warn(`[BlindMode] Invalid regex in ${groupName}: ${pattern.regex}`);
        }
      }
    }

    // No filter matched, display normally
    return {
      shouldDisplay: true,
      modifiedText: text,
    };
  }

  /**
   * Execute action for a matched filter pattern
   */
  private executeFilterAction(
    pattern: FilterPattern,
    text: string,
    groupName: string,
    regexMatch: RegExpExecArray
  ): {
    shouldDisplay: boolean;
    announcement?: string;
    modifiedText: string;
    action?: FilterAction;
    sound?: string;
    capturedData?: Record<string, any>;
  } {
    // Handle capture actions
    if (pattern.action === 'capture' && (pattern as any).captureVars) {
      const captureVars = (pattern as any).captureVars as string[];
      const capturedData: Record<string, any> = {};

      for (let i = 0; i < captureVars.length && i + 1 < regexMatch.length; i++) {
        const varName = captureVars[i];
        const value = regexMatch[i + 1];

        // Try to convert to number, otherwise keep as string
        const parsedValue = isNaN(Number(value)) ? value : Number(value);
        capturedData[varName] = parsedValue;

        // Update internal PlayerVariables
        (this.playerVariables as any)[varName] = parsedValue;
        console.log(`[CAPTURE] ${varName} = ${JSON.stringify(parsedValue)}`);
      }

      return {
        shouldDisplay: pattern.silence === true ? false : true,
        modifiedText: text,
        capturedData,
      };
    }

    // Interpolate regex groups into message
    let message = pattern.message || text;
    if (regexMatch) {
      for (let i = 1; i < regexMatch.length; i++) {
        message = message.replace(`{${i}}`, regexMatch[i]);
      }
    }

    const action: FilterAction = {
      type: (pattern.action as any) || 'filter',
      message,
      announce: pattern.announce ?? false,
      silence: pattern.silence ?? false,
      priority: pattern.priority ?? 'normal',
    };

    // Handle repetition - if same line appears too often, reduce frequency
    if (pattern.frequency === 'high') {
      const count = (this.lineHistory.get(text) || 0) + 1;
      this.lineHistory.set(text, count);

      // Only show 1 out of every 3 similar lines
      if (count > 1 && count % 3 !== 1) {
        return {
          shouldDisplay: false,
          modifiedText: text,
          action,
        };
      }
    }

    // Determine if line should be silenced
    const shouldSilence = pattern.silence === true;
    const shouldAnnounce = pattern.announce === true || pattern.action === 'announce';

    return {
      shouldDisplay: !shouldSilence,
      announcement: shouldAnnounce ? message : undefined,
      modifiedText: text,
      action,
      sound: pattern.sound,
    };
  }

  /**
   * Announce a message using accessibility API (only in blind mode)
   */
  async announceMessage(message: string, priority: 'low' | 'normal' | 'high' = 'normal') {
    // Avoid announcing the same message too frequently
    const lastTime = this.lastAnnouncedTime[message] || 0;
    const now = Date.now();
    const minInterval = priority === 'high' ? 1000 : 2000; // ms between announcements

    if (now - lastTime < minInterval) {
      return;
    }

    this.lastAnnouncedTime[message] = now;
    await AccessibilityInfo.announceForAccessibility(message);
  }

  /**
   * Play a sound file from the assets directory
   */
  async playSound(soundPath: string) {
    try {
      console.log(`[SOUND] Intentando reproducir: "${soundPath}"`);

      if (!soundPath) {
        console.log(`[SOUND] ✗ soundPath está vacío`);
        return;
      }

      if (!(soundPath in soundModules)) {
        console.log(`[SOUND] ✗ soundPath="${soundPath}" NO existe en soundModules`);
        return;
      }

      console.log(`[SOUND] ✓ soundPath encontrado en soundModules`);

      // Set audio mode for playback
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      // Get the module directly from require
      const module = soundModules[soundPath as keyof typeof soundModules];

      // Play sound directly from module
      console.log(`[SOUND] Reproduciendo: "${soundPath}"`);
      const { sound } = await Audio.Sound.createAsync(module);
      await sound.playAsync();
      console.log(`[SOUND] ✓ Sonido reproduciendo: "${soundPath}"`);

      // Unload after playback completes
      setTimeout(() => {
        sound.unloadAsync().catch(() => {});
      }, 5000);
    } catch (e) {
      console.error(`[SOUND] ✗ Error: ${e}`);
    }
  }

  /**
   * Play a sound in loop at regular intervals
   */
  playSoundLoop(soundPath: string, intervalMs: number = 8000) {
    this.stopSoundLoop();
    this.playSound(soundPath);
    this.hpAlertInterval = setInterval(() => {
      this.playSound(soundPath);
    }, intervalMs);
  }

  /**
   * Stop the looping sound
   */
  stopSoundLoop() {
    if (this.hpAlertInterval) {
      clearInterval(this.hpAlertInterval);
      this.hpAlertInterval = null;
    }
  }

  /**
   * Get all enabled filters for debugging
   */
  getActiveFilters(): string[] {
    return Array.from(this.activeFilters);
  }

  /**
   * Get current player variables
   */
  getPlayerVariables(): PlayerVariables {
    return { ...this.playerVariables };
  }

  /**
   * Enable/disable a filter group
   */
  setFilterEnabled(groupName: string, enabled: boolean) {
    if (this.filters[groupName]) {
      this.filters[groupName].enabled = enabled;
      if (enabled) {
        this.activeFilters.add(groupName);
      } else {
        this.activeFilters.delete(groupName);
      }
    }
  }

  /**
   * Reset line history (call periodically to prevent memory leaks)
   */
  resetHistory() {
    this.lineHistory.clear();
    // Keep only recent announcements (last 5 minutes)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    Object.entries(this.lastAnnouncedTime).forEach(([key, time]: [string, number]) => {
      if (time < fiveMinutesAgo) {
        delete this.lastAnnouncedTime[key];
      }
    });
  }

  getPlayerVariables(): PlayerVariables {
    return { ...this.playerVariables };
  }
}

export const blindModeService = new BlindModeService();
