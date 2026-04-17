import AsyncStorage from '@react-native-async-storage/async-storage';
import { ButtonLayout } from './layoutStorage';

const PROFILES_INDEX_KEY = 'aljhtar_layout_profiles_index';

export interface LayoutProfileMeta {
  id: string;
  name: string;
  createdAt: string;
}

export interface LayoutProfile extends LayoutProfileMeta {
  layout: ButtonLayout;
}

let profileIdCounter = 0;
function genId() {
  return `profile_${Date.now()}_${profileIdCounter++}`;
}

export async function listLayoutProfiles(): Promise<LayoutProfileMeta[]> {
  try {
    const json = await AsyncStorage.getItem(PROFILES_INDEX_KEY);
    return json ? JSON.parse(json) : [];
  } catch (e) {
    console.error('Error loading layout profiles index:', e);
    return [];
  }
}

export async function saveLayoutProfile(name: string, layout: ButtonLayout): Promise<string> {
  try {
    const profiles = await listLayoutProfiles();
    const id = genId();
    const newProfile: LayoutProfileMeta = {
      id,
      name,
      createdAt: new Date().toISOString(),
    };

    const updated = [...profiles, newProfile];
    await AsyncStorage.setItem(PROFILES_INDEX_KEY, JSON.stringify(updated));
    await AsyncStorage.setItem(`aljhtar_layout_profile_${id}`, JSON.stringify(layout));

    return id;
  } catch (e) {
    console.error('Error saving layout profile:', e);
    throw e;
  }
}

export async function updateLayoutProfile(id: string, name: string, layout: ButtonLayout): Promise<void> {
  try {
    const profiles = await listLayoutProfiles();
    const updated = profiles.map(p =>
      p.id === id ? { ...p, name } : p
    );

    await AsyncStorage.setItem(PROFILES_INDEX_KEY, JSON.stringify(updated));
    await AsyncStorage.setItem(`aljhtar_layout_profile_${id}`, JSON.stringify(layout));
  } catch (e) {
    console.error('Error updating layout profile:', e);
    throw e;
  }
}

export async function loadLayoutProfile(id: string): Promise<ButtonLayout | null> {
  try {
    const json = await AsyncStorage.getItem(`aljhtar_layout_profile_${id}`);
    return json ? JSON.parse(json) : null;
  } catch (e) {
    console.error('Error loading layout profile:', e);
    return null;
  }
}

export async function deleteLayoutProfile(id: string): Promise<void> {
  try {
    const profiles = await listLayoutProfiles();
    const updated = profiles.filter(p => p.id !== id);

    await AsyncStorage.setItem(PROFILES_INDEX_KEY, JSON.stringify(updated));
    await AsyncStorage.removeItem(`aljhtar_layout_profile_${id}`);
  } catch (e) {
    console.error('Error deleting layout profile:', e);
    throw e;
  }
}
