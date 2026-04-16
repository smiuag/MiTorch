import AsyncStorage from '@react-native-async-storage/async-storage';

const PROFILES_INDEX_KEY = 'aljhtar_config_profiles_index';
const PROFILE_PREFIX = 'aljhtar_config_profile_';

export interface ConfigProfile {
  name: string;
  savedAt: string;
}

// Get list of saved profile names
export async function listConfigProfiles(): Promise<ConfigProfile[]> {
  const json = await AsyncStorage.getItem(PROFILES_INDEX_KEY);
  if (!json) return [];
  const profiles: ConfigProfile[] = JSON.parse(json);
  // Deduplicate by name
  const seen = new Set<string>();
  return profiles.filter(p => {
    if (seen.has(p.name)) return false;
    seen.add(p.name);
    return true;
  });
}

// Save current config as a named profile
export async function saveConfigProfile(name: string, serverId: string): Promise<void> {
  // Gather all config for this server
  const config: Record<string, any> = {};

  const fkeysJson = await AsyncStorage.getItem(`aljhtar_fkeys_${serverId}`);
  if (fkeysJson) config.fkeys = JSON.parse(fkeysJson);

  const extraJson = await AsyncStorage.getItem(`aljhtar_extrabtns_${serverId}`);
  if (extraJson) config.extrabtns = JSON.parse(extraJson);

  const aliasJson = await AsyncStorage.getItem('aljhtar_channel_aliases');
  if (aliasJson) config.channelAliases = JSON.parse(aliasJson);

  // Save the profile data
  await AsyncStorage.setItem(PROFILE_PREFIX + name, JSON.stringify(config));

  // Update index
  const profiles = await listConfigProfiles();
  const existing = profiles.findIndex(p => p.name === name);
  const entry: ConfigProfile = { name, savedAt: new Date().toISOString() };
  if (existing >= 0) {
    profiles[existing] = entry;
  } else {
    profiles.push(entry);
  }
  await AsyncStorage.setItem(PROFILES_INDEX_KEY, JSON.stringify(profiles));
}

// Load a named profile into current config
export async function loadConfigProfile(name: string, serverId: string): Promise<boolean> {
  const json = await AsyncStorage.getItem(PROFILE_PREFIX + name);
  if (!json) return false;

  const config = JSON.parse(json);

  if (config.fkeys) {
    await AsyncStorage.setItem(`aljhtar_fkeys_${serverId}`, JSON.stringify(config.fkeys));
  }
  if (config.extrabtns) {
    await AsyncStorage.setItem(`aljhtar_extrabtns_${serverId}`, JSON.stringify(config.extrabtns));
  }
  if (config.channelAliases) {
    await AsyncStorage.setItem('aljhtar_channel_aliases', JSON.stringify(config.channelAliases));
  }

  return true;
}

// Delete a named profile
export async function deleteConfigProfile(name: string): Promise<void> {
  await AsyncStorage.removeItem(PROFILE_PREFIX + name);

  const profiles = await listConfigProfiles();
  const updated = profiles.filter(p => p.name !== name);
  await AsyncStorage.setItem(PROFILES_INDEX_KEY, JSON.stringify(updated));
}
