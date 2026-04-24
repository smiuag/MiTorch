import AsyncStorage from '@react-native-async-storage/async-storage';

const key = (serverId: string) => `aljhtar_channel_aliases_${serverId}`;
const orderKey = (serverId: string) => `aljhtar_channel_order_${serverId}`;

export async function loadChannelAliases(serverId: string): Promise<Record<string, string>> {
  const json = await AsyncStorage.getItem(key(serverId));
  return json ? JSON.parse(json) : {};
}

export async function saveChannelAliases(serverId: string, aliases: Record<string, string>): Promise<void> {
  await AsyncStorage.setItem(key(serverId), JSON.stringify(aliases));
}

export async function loadChannelOrder(serverId: string): Promise<string[]> {
  const json = await AsyncStorage.getItem(orderKey(serverId));
  return json ? JSON.parse(json) : [];
}

export async function saveChannelOrder(serverId: string, order: string[]): Promise<void> {
  await AsyncStorage.setItem(orderKey(serverId), JSON.stringify(order));
}
