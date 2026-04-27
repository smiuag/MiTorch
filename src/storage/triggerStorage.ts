import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActionTextBlock, PatternBlock, Trigger, TriggerPack } from '../types';
import { compileActionText, compilePattern, newCaptureId } from '../utils/triggerCompiler';

const PACKS_KEY = 'aljhtar_trigger_packs';
const SEEDED_KEY = 'aljhtar_trigger_packs_seeded';

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

let seedChecked = false;
async function ensureSeeded(): Promise<void> {
  if (seedChecked) return;
  seedChecked = true;
  const already = await AsyncStorage.getItem(SEEDED_KEY);
  if (already === '1') return;
  const existingJson = await AsyncStorage.getItem(PACKS_KEY);
  const existing: TriggerPack[] = existingJson ? safeParse(existingJson) : [];
  const seeded = [...existing, createDefaultPack()];
  await AsyncStorage.setItem(PACKS_KEY, JSON.stringify(seeded));
  await AsyncStorage.setItem(SEEDED_KEY, '1');
}

function safeParse(json: string): TriggerPack[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function buildFloatingTrigger(
  name: string,
  prefixCapture: PatternBlock[],
  literal: string,
  floatingSuffix: string,
): Trigger {
  // Pattern: [capture] + literal text (anchored both ends)
  const blocks: PatternBlock[] = [...prefixCapture, { kind: 'text', text: literal }];
  const compiled = compilePattern(blocks, 'anchored', 'anchored');

  // Floating message: capture_ref + suffix text
  const captureId = (prefixCapture[0] as { kind: 'capture'; id: string }).id;
  const messageBlocks: ActionTextBlock[] = [
    { kind: 'capture_ref', captureId },
    { kind: 'text', text: floatingSuffix },
  ];
  const message = compileActionText(messageBlocks, compiled.captureMap);

  return {
    id: newTriggerId(),
    name,
    type: 'combo',
    enabled: true,
    source: {
      kind: 'regex',
      pattern: compiled.pattern,
      flags: 'i',
      blocks,
      anchorStart: 'anchored',
      anchorEnd: 'anchored',
      expertMode: false,
    },
    actions: [
      { type: 'gag' },
      { type: 'floating', message, messageBlocks, level: 'info' },
    ],
  };
}

function createDefaultPack(): TriggerPack {
  const followCap: PatternBlock = { kind: 'capture', captureType: 'word', id: newCaptureId() };
  const formulaCap: PatternBlock = { kind: 'capture', captureType: 'word', id: newCaptureId() };

  return {
    id: newPackId(),
    name: 'Avisos básicos',
    assignedServerIds: [],
    triggers: [
      buildFloatingTrigger(
        'Aviso seguir',
        [followCap],
        ' comienza a seguirte.',
        ' te sigue',
      ),
      buildFloatingTrigger(
        'Aviso formular',
        [formulaCap],
        ' comienza a formular un hechizo.',
        ' formula',
      ),
    ],
  };
}

export async function loadPacks(): Promise<TriggerPack[]> {
  await ensureSeeded();
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
