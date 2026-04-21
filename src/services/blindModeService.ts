import { AccessibilityInfo } from 'react-native';
import { Audio } from 'expo-av';
import blindModeFiltersData from '../config/blindModeFilters.json';
import { playerStatsService, PlayerVariables } from './playerStatsService';

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

export interface BlindModePlayerVariables extends PlayerVariables {
  activeHpAlert: 'none' | 'low50' | 'low30' | 'critical10';
}

class BlindModeService {
  private filters: Record<string, FilterGroup>;
  private lineHistory: Map<string, number> = new Map();
  private lastAnnouncedTime: Record<string, number> = {};
  private activeHpAlert: 'none' | 'low50' | 'low30' | 'critical10' = 'none';
  private activeFilters: Set<string>;
  private hpAlertInterval: ReturnType<typeof setInterval> | null = null;
  private lastHpPercent: number = 100;
  private promptFilterRegexes: RegExp[] = [];

  constructor() {
    this.filters = { ...blindModeFiltersData.filters };
    this.activeFilters = new Set(
      blindModeFiltersData.classConfigs.generica.enabledFilters
    );

    // Load and process prompt filters on initialization
    this.loadPromptFilters();
  }

  /**
   * Load and process blind mode prompt filters from raw alias_macros patterns
   * Includes both "prompt" and "promptcombate" patterns
   */
  private loadPromptFilters() {
    try {
      // Pre-defined prompt patterns from alias_macros.set
      // Both normal prompt and combat prompt patterns
      const rawPatterns = [
        // configurarpromptB
        '$lPv:$v\\$V Pe:$g\\$G Xp:$x$lSL:$s$lPL:$a$lNM:$k$lLD:$K$l',
        // configurarpromptBM
        '$lPv:$v\\$V Pe:$g\\$G Xp:$x$lSL:$s$lPL:$a$lNM:$k$lLD:$K$lImágenes:$e$lPieles:$p$l',
        // configurarpromptBI
        '$lPv:$v\\$V Pe:$g\\$G Xp:$x$lSL:$s$lPL:$a$lNM:$k$lLD:$K$lInercia:$n$l',
        // configurarpromptBMA
        '$lPv:$v\\$V Pe:$g\\$G Xp:$x$lSL:$s$lPL:$a$lNM:$k$lLD:$K$lImágenes:$e$lPieles:$p$lAstucia:$t$l',
        // configurarpromptA
        '$lPv:$v\\$V Pe:$g\\$G Xp:$x$lSL:$s$lPL:$a$lNM:$b$lLD:$K$l',
        // configurarpromptAM
        '$lPv:$v\\$V Pe:$g\\$G Xp:$x$lSL:$s$lPL:$a$lNM:$b$lLD:$K$lImágenes:$e$lPieles:$p$l',
        // configurarpromptAA
        '$lPv:$v\\$V Pe:$g\\$G Xp:$x$lSL:$s$lPL:$a$lNM:$b$lLD:$K$lAstucia:$t$l',
        // configurarpromptAMA
        '$lPv:$v\\$V Pe:$g\\$G Xp:$x$lSL:$s$lPL:$a$lNM:$b$lLD:$K$lImágenes:$e$lPieles:$p$lAstucia:$t$l',
        // configurarpromptX
        '$lPv:$v\\$V Pe:$g\\$G Xp:$x$lSL:$s$lPL:$a$lJgd:$j$l',
        // configurarpromptXM
        '$lPv:$v\\$V Pe:$g\\$G Xp:$x$lSL:$s$lPL:$a$lJgd:$j$lImágenes:$e$lPieles:$p$l',
        // configurarpromptXA
        '$lPv:$v\\$V Pe:$g\\$G Xp:$x$lSL:$s$lPL:$a$lJgd:$j$lAstucia:$t$l',
        // configurarpromptXMA
        '$lPv:$v\\$V Pe:$g\\$G Xp:$x$lSL:$s$lPL:$a$lJgd:$j$lImágenes:$e$lPieles:$p$lAstucia:$t$l',
      ];

      // Note: Both prompt and promptcombate patterns are identical in alias_macros.set,
      // so the same patterns apply to both normal and combat prompts
      // Flatten all regex arrays into a single array
      this.promptFilterRegexes = rawPatterns
        .flatMap(pattern => this.convertPromptPatternToRegexArray(pattern));

      console.log(`[BlindMode] Loaded ${this.promptFilterRegexes.length} prompt filter regex patterns (from ${rawPatterns.length} prompt patterns)`);
    } catch (e) {
      console.warn('[BlindMode] Error loading prompt filters:', e);
      this.promptFilterRegexes = [];
    }
  }

  /**
   * Convert a prompt pattern to multiple regexes (one per line)
   * Example: "$lPv:$v\$V Pe:$g\$G Xp:$x$lSL:$s" → [regex for "Pv:...", regex for "SL:..."]
   * Returns array of regexes instead of a single one
   * Handles character encoding issues (like corrupted accented characters)
   */
  private convertPromptPatternToRegexArray(pattern: string): RegExp[] {
    try {
      // Split pattern by $l to get individual lines
      const lines = pattern.split(/\$l/).filter(line => line.trim().length > 0);
      const regexes: RegExp[] = [];

      for (const line of lines) {
        const variables = /\$[vVgGxsakhKnepbtj]/g;

        // FIRST: Normalize accented characters BEFORE any processing
        // This ensures "Imágenes" becomes "Imagenes" in the pattern
        let normalizedLine = line
          .replace(/[áÁ]/g, 'a')  // á, Á → a
          .replace(/[éÉ]/g, 'e')  // é, É → e
          .replace(/[íÍ]/g, 'i')  // í, Í → i
          .replace(/[óÓ]/g, 'o')  // ó, Ó → o
          .replace(/[úÚ]/g, 'u')  // ú, Ú → u
          .replace(/[üÜ]/g, 'u')  // ü, Ü → u
          .replace(/[ñÑ]/g, 'n'); // ñ, Ñ → n

        // SECOND: Replace variables with placeholder so they don't get escaped
        let regexStr = normalizedLine
          .replace(variables, '___DIGIT___');  // Temporarily replace variables

        // THIRD: Escape special regex characters
        regexStr = regexStr
          .replace(/[\\^$.|?*+(){}\[\]]/g, '\\$&');  // Escape special regex chars

        // FOURTH: Replace placeholders with digit pattern (zero or more digits)
        // Using \d* instead of \d+ to match cases where value might be missing
        regexStr = regexStr
          .replace(/___DIGIT___/g, '\\d*');

        // Make the pattern more flexible to match varying whitespace
        regexStr = regexStr.replace(/\s+/g, '\\s*');

        try {
          regexes.push(new RegExp(regexStr, 'i'));
        } catch (e) {
          console.warn('[BlindMode] Failed to create regex for line:', line, e);
        }
      }

      return regexes;
    } catch (e) {
      console.warn('[BlindMode] Failed to convert prompt pattern:', e);
      return [];
    }
  }

  /**
   * Check if a line matches any prompt filter pattern
   * Normalizes text to handle encoding issues with accented characters
   */
  private isPromptLine(text: string): boolean {
    let cleanText = this.stripAnsiCodes(text);
    const originalText = cleanText;

    // Normalize accented characters to handle corruption issues
    // This helps match lines even if they arrive with encoding issues
    cleanText = cleanText
      .replace(/[áÁa?]/g, 'a')  // á, Á, a, or corrupted → a
      .replace(/[éÉe?]/g, 'e')  // é, É, e, or corrupted → e
      .replace(/[íÍi?]/g, 'i')  // í, Í, i, or corrupted → i
      .replace(/[óÓo?]/g, 'o')  // ó, Ó, o, or corrupted → o
      .replace(/[úÚu?]/g, 'u')  // ú, Ú, u, or corrupted → u
      .replace(/[üÜu?]/g, 'u')  // ü, Ü, u, or corrupted → u
      .replace(/[ñÑn?]/g, 'n'); // ñ, Ñ, n, or corrupted → n

    const isPrompt = this.promptFilterRegexes.some(regex => regex.test(cleanText));

    // Log PL: and Jgd: lines for debugging
    if (originalText.includes('PL:') || originalText.includes('Jgd:')) {
      console.log(`[PROMPT_DEBUG] Original: "${originalText}"`);
      console.log(`[PROMPT_DEBUG] Normalized: "${cleanText}"`);
      console.log(`[PROMPT_DEBUG] IsPrompt: ${isPrompt}`);
      if (!isPrompt) {
        console.log(`[PROMPT_DEBUG] ⚠️ NOT FILTERED - checking regexes...`);
        this.promptFilterRegexes.forEach((regex, idx) => {
          if (regex.test(cleanText)) {
            console.log(`[PROMPT_DEBUG] ✓ Matched regex #${idx}: ${regex}`);
          }
        });
      }
    }

    return isPrompt;
  }

  /**
   * Update player variables from GMCP or status messages
   */
  updatePlayerVariables(variables: Partial<PlayerVariables>) {
    const currentStats = playerStatsService.getPlayerVariables();
    const oldHP = currentStats.playerHP;
    const oldMaxHP = currentStats.playerMaxHP;

    // Update the unified service
    playerStatsService.updatePlayerVariables(variables);

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

      const currentStats = playerStatsService.getPlayerVariables();
      const updatedHistory = [...currentStats.hpHistory, { delta, label }];
      if (updatedHistory.length > 10) {
        updatedHistory.splice(0, updatedHistory.length - 10);
      }

      playerStatsService.updatePlayerVariables({ hpHistory: updatedHistory });
      console.log(`[HP_HISTORY] ${label}`);
    }

    const newPercent = maxHP > 0 ? (newHP / maxHP) * 100 : 0;

    // Calculate previous percentage
    const prevPercent = maxHP > 0 ? (prevHP / maxHP) * 100 : 0;

    // Check thresholds and manage alerts
    if (newPercent <= 10 && prevPercent > 10) {
      // Entered critical zone (<=10%)
      this.activeHpAlert = 'critical10';
      this.playSoundLoop('alertas/hp-10.wav', 8000);
      this.announceMessage('VIDA CRÍTICA', 'high');
    } else if (newPercent <= 30 && prevPercent > 30) {
      // Entered warning zone (<=30%)
      this.activeHpAlert = 'low30';
      this.playSound('alertas/hp-30.wav');
      this.announceMessage('Vida peligrosa', 'normal');
    } else if (newPercent <= 50 && prevPercent > 50) {
      // Entered caution zone (<=50%)
      this.activeHpAlert = 'low50';
      this.playSound('alertas/hp-50.wav');
      this.announceMessage('Vida baja', 'normal');
    } else if (newPercent > 50 && prevPercent <= 50) {
      // Recovered above 50%
      this.stopSoundLoop();
      this.activeHpAlert = 'none';
      this.announceMessage('Recuperándose', 'low');
    } else if (newPercent > 30 && prevPercent <= 30) {
      // Recovered above 30%
      this.stopSoundLoop();
      this.activeHpAlert = 'low50';
    } else if (newPercent > 10 && prevPercent <= 10) {
      // Recovered above 10%
      this.stopSoundLoop();
      this.activeHpAlert = 'none';
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

    // First: Check if this is a prompt line (suppress prompt output from terminal)
    if (this.isPromptLine(cleanText)) {
      console.log(`[BM] ✓ PROMPT suppressed: "${cleanText}"`);
      return {
        shouldDisplay: false,
        modifiedText: text,
      };
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
      const updates: Partial<PlayerVariables> = {};

      for (let i = 0; i < captureVars.length && i + 1 < regexMatch.length; i++) {
        const varName = captureVars[i];
        const value = regexMatch[i + 1];

        // Try to convert to number, otherwise keep as string
        const parsedValue = isNaN(Number(value)) ? value : Number(value);
        capturedData[varName] = parsedValue;

        // Update unified PlayerVariables service
        (updates as any)[varName] = parsedValue;
        console.log(`[CAPTURE] ${varName} = ${JSON.stringify(parsedValue)}`);
      }

      if (Object.keys(updates).length > 0) {
        playerStatsService.updatePlayerVariables(updates);
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

    console.log(`[BM executeFilterAction] Returning sound="${pattern.sound}"`);
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

      // Set audio mode for playback - compatible with both iOS and Android
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false, // Don't lower volume when other audio is playing
        interruptionModeAndroid: 1, // INTERRUPTION_MODE_DO_NOT_MIX - don't mix with other audio
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
   * Get current player variables with blind-mode-specific alert status
   */
  getPlayerVariables(): BlindModePlayerVariables {
    const baseStats = playerStatsService.getPlayerVariables();
    return {
      ...baseStats,
      activeHpAlert: this.activeHpAlert,
    };
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
}

export const blindModeService = new BlindModeService();
