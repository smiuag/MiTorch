import AsyncStorage from '@react-native-async-storage/async-storage';

const CONFIG_KEY = 'aljhtar_full_config';

function getAliasKey(serverId: string): string {
  return `aljhtar_channel_aliases_${serverId}`;
}

// Channel aliases per server: { "chat": "ch", "bando": "bando" }
export async function loadChannelAliases(serverId: string): Promise<Record<string, string>> {
  const json = await AsyncStorage.getItem(getAliasKey(serverId));
  if (!json) return {};
  return JSON.parse(json);
}

export async function saveChannelAliases(serverId: string, aliases: Record<string, string>): Promise<void> {
  await AsyncStorage.setItem(getAliasKey(serverId), JSON.stringify(aliases));
}

