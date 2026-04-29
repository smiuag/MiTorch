import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActionTextBlock, FloatingMessageLevel, PatternBlock, Trigger, TriggerAction, TriggerPack, VariableCondition } from '../types';
import { compileActionText, compilePattern, newCaptureId } from '../utils/triggerCompiler';
import { loadServers } from './serverStorage';

const PACKS_KEY = 'aljhtar_trigger_packs';
const SEEDED_KEY = 'aljhtar_trigger_packs_seeded';
const SOUNDS_SEEDED_KEY = 'aljhtar_trigger_packs_sounds_seeded';
const MIRRORS_SKINS_SEEDED_KEY = 'aljhtar_trigger_packs_mirrors_skins_seeded';

export const SOUNDS_PACK_ID = 'pack_seeded_sounds';
export const MIRRORS_SKINS_PACK_ID = 'pack_seeded_mirrors_skins';

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

  const existingJson = await AsyncStorage.getItem(PACKS_KEY);
  let packs: TriggerPack[] = existingJson ? safeParse(existingJson) : [];
  let dirty = false;

  const avisosSeeded = await AsyncStorage.getItem(SEEDED_KEY);
  if (avisosSeeded !== '1') {
    packs.push(createDefaultPack());
    dirty = true;
  }

  const soundsSeeded = await AsyncStorage.getItem(SOUNDS_SEEDED_KEY);
  // Only seed the sounds pack if its stable id is not already present.
  // Guards against a corrupt SOUNDS_SEEDED_KEY duplicating the pack.
  const soundsPresent = packs.some((p) => p.id === SOUNDS_PACK_ID);
  if (soundsSeeded !== '1' && !soundsPresent) {
    packs.push(createSoundsPack());
    dirty = true;
  }

  const mirrorsSkinsSeeded = await AsyncStorage.getItem(MIRRORS_SKINS_SEEDED_KEY);
  const mirrorsSkinsPresent = packs.some((p) => p.id === MIRRORS_SKINS_PACK_ID);
  if (mirrorsSkinsSeeded !== '1' && !mirrorsSkinsPresent) {
    packs.push(createMirrorsAndSkinsPack());
    dirty = true;
  }

  if (dirty) {
    await AsyncStorage.setItem(PACKS_KEY, JSON.stringify(packs));
    if (avisosSeeded !== '1') await AsyncStorage.setItem(SEEDED_KEY, '1');
    if (soundsSeeded !== '1') await AsyncStorage.setItem(SOUNDS_SEEDED_KEY, '1');
    if (mirrorsSkinsSeeded !== '1') await AsyncStorage.setItem(MIRRORS_SKINS_SEEDED_KEY, '1');
  }
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

/**
 * Builds a single play_sound trigger from a list of pattern fragments.
 * Each fragment is either a string (literal text) or a capture descriptor.
 * Pattern is open-open (no anchors) — matches anywhere on the line.
 */
type Frag = string | { capture: 'word' | 'phrase' | 'number' };

function buildSoundTrigger(name: string, fragments: Frag[], soundFile: string, enabled = false): Trigger {
  const blocks: PatternBlock[] = fragments.map((f) => {
    if (typeof f === 'string') return { kind: 'text', text: f };
    return { kind: 'capture', captureType: f.capture, id: newCaptureId() };
  });
  const compiled = compilePattern(blocks, 'open', 'open');
  const actions: TriggerAction[] = [{ type: 'play_sound', file: `builtin:${soundFile}` }];
  return {
    id: newTriggerId(),
    name,
    type: 'sound',
    enabled,
    source: {
      kind: 'regex',
      pattern: compiled.pattern,
      flags: 'i',
      blocks,
      anchorStart: 'open',
      anchorEnd: 'open',
      expertMode: false,
    },
    actions,
  };
}

function createSoundsPack(): TriggerPack {
  const PHRASE: Frag = { capture: 'phrase' };
  const NUMBER: Frag = { capture: 'number' };

  return {
    id: SOUNDS_PACK_ID,
    name: 'Sonidos del MUD',
    assignedServerIds: [],
    triggers: [
      // Bloqueos
      buildSoundTrigger('Bloqueo termina', ["[El bloqueo '", PHRASE, "' termina]"], 'bloqueos/bloqueo-termina.wav'),
      // Combate
      buildSoundTrigger('Pierdes concentración', ['Te estremeces y pierdes la concentración'], 'combate/pierdes-concentracion.wav'),
      buildSoundTrigger('Impacto', ['Alcanzas', PHRASE, ' a ', PHRASE, ' con tu maniobra de ', PHRASE, '!'], 'combate/impacto.wav'),
      buildSoundTrigger('Esquivado', ['logra esquivar', PHRASE, ' tu maniobra'], 'combate/esquivado.wav'),
      buildSoundTrigger('Bloqueado', ['logra parar', PHRASE, ' tu maniobra'], 'combate/bloqueado.wav'),
      buildSoundTrigger('Objetivo perdido', ['Tus objetivos ya no están al alcance'], 'combate/objetivo-perdido.wav'),
      buildSoundTrigger('Maniobra interrumpida', ['Tu maniobra', PHRASE, ' se ve interrumpida'], 'combate/interrumpido.wav'),
      buildSoundTrigger('Crítico', ['críticamente'], 'combate/critico.wav'),
      // Hechizos
      buildSoundTrigger('Preparas hechizo', ['Preparas los componentes del hechizo'], 'hechizos/preparas.wav'),
      buildSoundTrigger('Formulando', ['Comienzas a formular el hechizo'], 'hechizos/formulando.wav'),
      buildSoundTrigger('Resiste hechizo', ['resiste los efectos de tu hechizo'], 'hechizos/resiste.wav'),
      buildSoundTrigger('Fuera de rango', ['El destino de tu hechizo ha desaparecido'], 'hechizos/fuera-rango.wav'),
      buildSoundTrigger('Imágenes desactivadas', ['Tus imágenes se desvanecen'], 'hechizos/imagenes-off.wav'),
      buildSoundTrigger('Imágenes activadas', ['Tus clones ilusorios se dividen', PHRASE, 'imágenes suba a ', NUMBER], 'hechizos/imagenes-up.wav'),
      buildSoundTrigger('Piel de piedra', ['Tu piel queda cubierta', PHRASE, ' capas de piedra'], 'hechizos/piel-piedra-on.wav'),
      // Eventos: muerte (alternaciones partidas)
      buildSoundTrigger('Muerte (es)', ['[muerte]'], 'eventos/muerte.wav'),
      buildSoundTrigger('Muerte (has muerto)', ['has muerto'], 'eventos/muerte.wav'),
      buildSoundTrigger('Muerte (Your death)', ['Your death'], 'eventos/muerte.wav'),
      buildSoundTrigger('Muerte (You have been killed)', ['You have been killed'], 'eventos/muerte.wav'),
      // Eventos: victoria (alternaciones partidas)
      buildSoundTrigger('Victoria (es)', ['[victoria]'], 'eventos/victoria.wav'),
      buildSoundTrigger('Victoria (aniquilado)', ['enemigo ha sido aniquilado'], 'eventos/victoria.wav'),
      buildSoundTrigger('Victoria (Victory)', ['Victory'], 'eventos/victoria.wav'),
      // Eventos: XP, curación
      buildSoundTrigger('XP ganada', ['Ganas ', NUMBER, ' puntos de experiencia'], 'eventos/xp.wav'),
      buildSoundTrigger('Curación', ['Tu salud ha aumentado'], 'eventos/curacion.wav'),
    ],
  };
}

function buildVariableTrigger(
  name: string,
  variableName: string,
  condition: VariableCondition,
  message: string,
  level: FloatingMessageLevel,
): Trigger {
  return {
    id: newTriggerId(),
    name,
    type: 'variable',
    enabled: true,
    source: { kind: 'variable', name: variableName, condition },
    actions: [
      { type: 'gag' },
      { type: 'floating', message, level },
    ],
  };
}

function createMirrorsAndSkinsPack(): TriggerPack {
  // Two triggers per variable: an `equals 0` trigger for the disappearance
  // message and a `changes` trigger for the running count. The `equals 0`
  // trigger MUST come first — the engine applies first-match-wins per
  // variable, so on the 1→0 transition the disappearance message wins and
  // the generic "Tienes 0 …" doesn't also fire.
  return {
    id: MIRRORS_SKINS_PACK_ID,
    name: 'Espejos y pieles',
    assignedServerIds: [],
    triggers: [
      buildVariableTrigger(
        'Espejos desaparecen',
        'imagenes',
        { event: 'equals', value: 0 },
        'Tus espejos desaparecen',
        'error',
      ),
      buildVariableTrigger(
        'Espejos cambian',
        'imagenes',
        { event: 'changes' },
        'Tienes $new espejos',
        'error',
      ),
      buildVariableTrigger(
        'Pieles desaparecen',
        'pieles',
        { event: 'equals', value: 0 },
        'Tus pieles desaparecen',
        'error',
      ),
      buildVariableTrigger(
        'Pieles cambian',
        'pieles',
        { event: 'changes' },
        'Tienes $new pieles',
        'error',
      ),
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

/**
 * Replicates legacy behavior: when the user switches to blind mode, every
 * built-in MUD sound becomes audible by default. Enables every trigger in the
 * seeded sounds pack and assigns it to every saved server.
 *
 * Idempotent — safe to call repeatedly. Silently no-ops if the sounds pack
 * was deleted by the user.
 */
export async function enableSoundsPackForBlindMode(): Promise<void> {
  const packs = await loadPacks();
  const idx = packs.findIndex((p) => p.id === SOUNDS_PACK_ID);
  if (idx < 0) return;
  const pack = packs[idx];
  const servers = await loadServers();
  const allServerIds = servers.map((s) => s.id);

  const triggers = pack.triggers.map((t) => (t.enabled ? t : { ...t, enabled: true }));
  const assignedSet = new Set([...pack.assignedServerIds, ...allServerIds]);

  const triggersChanged = triggers.some((t, i) => t !== pack.triggers[i]);
  const assignmentsChanged = assignedSet.size !== pack.assignedServerIds.length;
  if (!triggersChanged && !assignmentsChanged) return;

  packs[idx] = { ...pack, triggers, assignedServerIds: Array.from(assignedSet) };
  await savePacks(packs);
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
