import AsyncStorage from '@react-native-async-storage/async-storage';
import { UnifiedLayoutConfig, OrientationLayout, FloatingButton } from '../types';

const CONFIG_KEY = 'aljhtar_unified_layout_config';

const DEFAULT_PORTRAIT: OrientationLayout = {
  orientation: 'portrait',
  floatingButtons: [],
};

const DEFAULT_LANDSCAPE: OrientationLayout = {
  orientation: 'landscape',
  floatingButtons: [],
};

const DEFAULT_CONFIG: UnifiedLayoutConfig = {
  portrait: DEFAULT_PORTRAIT,
  landscape: DEFAULT_LANDSCAPE,
};

let buttonIdCounter = 0;
function genButtonId() {
  return `btn_${buttonIdCounter++}`;
}

export function createDefaultButton(label: string, command: string, gridX: number, gridRow: number): FloatingButton {
  return {
    id: genButtonId(),
    label,
    command,
    color: '#3399cc',
    gridX,
    gridRow,
  };
}

export async function loadUnifiedLayoutConfig(): Promise<UnifiedLayoutConfig> {
  try {
    const json = await AsyncStorage.getItem(CONFIG_KEY);
    if (!json) return { ...DEFAULT_CONFIG };
    return JSON.parse(json);
  } catch (e) {
    console.error('Error loading unified layout config:', e);
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveUnifiedLayoutConfig(config: UnifiedLayoutConfig): Promise<void> {
  try {
    await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Error saving unified layout config:', e);
  }
}

export async function loadOrientationLayout(orientation: 'portrait' | 'landscape'): Promise<OrientationLayout> {
  const config = await loadUnifiedLayoutConfig();
  return orientation === 'portrait' ? config.portrait : config.landscape;
}

export async function saveOrientationLayout(layout: OrientationLayout): Promise<void> {
  const config = await loadUnifiedLayoutConfig();
  if (layout.orientation === 'portrait') {
    config.portrait = layout;
  } else {
    config.landscape = layout;
  }
  await saveUnifiedLayoutConfig(config);
}
