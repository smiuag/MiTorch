import AsyncStorage from '@react-native-async-storage/async-storage';
import { Trigger, TriggerPack } from '../types';
import { loadServers } from './serverStorage';

const PACKS_KEY = 'aljhtar_trigger_packs';

let idCounter = Date.now();
function genId(prefix: string): string {
  return `${prefix}_${idCounter++}`;
}

export function newPackId(): string {
  return genId('pack');
}

export function newTriggerId(): string {
  return genId('trg');
}

function safeParse(json: string): TriggerPack[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function loadPacks(): Promise<TriggerPack[]> {
  const json = await AsyncStorage.getItem(PACKS_KEY);
  if (!json) return [];
  return safeParse(json);
}

export async function savePacks(packs: TriggerPack[]): Promise<void> {
  await AsyncStorage.setItem(PACKS_KEY, JSON.stringify(packs));
}

export async function upsertPack(pack: TriggerPack): Promise<TriggerPack[]> {
  const packs = await loadPacks();
  const idx = packs.findIndex((p) => p.id === pack.id);
  if (idx >= 0) {
    packs[idx] = pack;
  } else {
    packs.push(pack);
  }
  await savePacks(packs);
  return packs;
}

export async function deletePack(packId: string): Promise<TriggerPack[]> {
  const packs = await loadPacks();
  const next = packs.filter((p) => p.id !== packId);
  await savePacks(next);
  return next;
}

export async function duplicatePack(packId: string): Promise<TriggerPack[]> {
  const packs = await loadPacks();
  const orig = packs.find((p) => p.id === packId);
  if (!orig) return packs;
  const copy: TriggerPack = {
    id: newPackId(),
    name: `${orig.name} (copia)`,
    triggers: orig.triggers.map((t) => ({ ...t, id: newTriggerId() })),
    assignedServerIds: [],
  };
  packs.push(copy);
  await savePacks(packs);
  return packs;
}

/**
 * When a new character is created, append its id to every pack whose
 * `autoAssignToNew` flag is true (undefined treated as true). Existing
 * `assignedServerIds` of packs with the flag off are not touched. Returns
 * the (possibly mutated) pack list.
 */
export async function autoAssignNewCharacterToPacks(serverId: string): Promise<TriggerPack[]> {
  const packs = await loadPacks();
  let dirty = false;
  const next = packs.map((p) => {
    if (p.autoAssignToNew === false) return p;
    if (p.assignedServerIds.includes(serverId)) return p;
    dirty = true;
    return { ...p, assignedServerIds: [...p.assignedServerIds, serverId] };
  });
  if (dirty) await savePacks(next);
  return next;
}

/**
 * Adds the given serverId to the assignedServerIds of the packs whose ids
 * are in `packIds`, deduping. Returns the new pack list.
 */
export async function assignServerToPacks(
  serverId: string,
  packIds: string[],
): Promise<TriggerPack[]> {
  const packs = await loadPacks();
  const idSet = new Set(packIds);
  let dirty = false;
  const next = packs.map((p) => {
    if (!idSet.has(p.id)) return p;
    if (p.assignedServerIds.includes(serverId)) return p;
    dirty = true;
    return { ...p, assignedServerIds: [...p.assignedServerIds, serverId] };
  });
  if (dirty) await savePacks(next);
  return next;
}

/**
 * Sets assignedServerIds of the given packs to the union of all character
 * ids currently saved. Used by the "asignar a todos" prompt after import.
 * Packs not in `packIds` are untouched.
 */
export async function assignAllCharactersToPacks(packIds: string[]): Promise<TriggerPack[]> {
  const packs = await loadPacks();
  const servers = await loadServers();
  const allIds = servers.map((s) => s.id);
  const idSet = new Set(packIds);
  let dirty = false;
  const next = packs.map((p) => {
    if (!idSet.has(p.id)) return p;
    const merged = new Set([...p.assignedServerIds, ...allIds]);
    if (merged.size === p.assignedServerIds.length) return p;
    dirty = true;
    return { ...p, assignedServerIds: Array.from(merged) };
  });
  if (dirty) await savePacks(next);
  return next;
}

export async function getTriggersForServer(serverId: string): Promise<Trigger[]> {
  const packs = await loadPacks();
  const sorted = [...packs].sort((a, b) => a.name.localeCompare(b.name));
  const out: Trigger[] = [];
  for (const pack of sorted) {
    if (!pack.assignedServerIds.includes(serverId)) continue;
    for (const trg of pack.triggers) {
      if (trg.enabled) out.push(trg);
    }
  }
  return out;
}
