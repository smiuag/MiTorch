import { AccessibilityInfo } from 'react-native';
import { Audio } from 'expo-av';
import blindModeFiltersData from '../config/blindModeFilters.json';

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
}

class BlindModeService {
  private filters: Record<string, FilterGroup>;
  private lineHistory: Map<string, number> = new Map();
  private lastAnnouncedTime: Record<string, number> = {};
  private playerVariables: PlayerVariables;
  private activeFilters: Set<string>;

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
    };
    this.activeFilters = new Set(
      blindModeFiltersData.classConfigs.generica.enabledFilters
    );
  }

  /**
   * Update player variables from GMCP or status messages
   */
  updatePlayerVariables(variables: Partial<PlayerVariables>) {
    this.playerVariables = { ...this.playerVariables, ...variables };

    // Update active filters based on character class
    if (variables.playerClass && variables.playerClass !== 'desconocida') {
      this.updateActiveFiltersByClass(variables.playerClass);
    }
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
    // Check all filter groups that are enabled
    for (const [groupName, group] of Object.entries(this.filters)) {
      if (!group.enabled) continue;

      for (const pattern of group.patterns) {
        try {
          const regex = new RegExp(pattern.regex, 'i');
          const match = regex.exec(text);
          if (match) {
            return this.executeFilterAction(pattern, text, groupName, match);
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
  } {
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
      if (!soundPath) return;

      // Set audio mode for playback
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
      });

      // Construct the path to the sound file relative to assets
      const soundFile = require(`../assets/${blindModeFiltersData.sounds.directory}/${soundPath}`);
      const { sound } = await Audio.Sound.createAsync(soundFile);
      await sound.playAsync();

      // Clean up sound object after playing
      setTimeout(() => {
        sound.unloadAsync().catch(e => console.warn('[BlindMode] Error unloading sound:', e));
      }, 5000);
    } catch (e) {
      console.warn(`[BlindMode] Error playing sound ${soundPath}:`, e);
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
    Object.entries(this.lastAnnouncedTime).forEach(([key, time]) => {
      if (time < fiveMinutesAgo) {
        delete this.lastAnnouncedTime[key];
      }
    });
  }
}

export const blindModeService = new BlindModeService();
