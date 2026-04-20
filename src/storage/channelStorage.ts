import AsyncStorage from '@react-native-async-storage/async-storage';

const key = (serverId: string) => `aljhtar_channel_aliases_${serverId}`;

export async function loadChannelAliases(serverId: string): Promise<Record<string, string>> {
  const json = await AsyncStorage.getItem(key(serverId));
  return json ? JSON.parse(json) : {};
}

export async function saveChannelAliases(serverId: string, aliases: Record<string, string>): Promise<void> {
  await AsyncStorage.setItem(key(serverId), JSON.stringify(aliases));
}
