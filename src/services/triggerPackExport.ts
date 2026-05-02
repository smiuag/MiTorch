import JSZip from 'jszip';
import { Paths, File, Directory } from 'expo-file-system';
import { AmbientMappings, GestureConfig, RoomCategory, ServerProfile, Trigger, TriggerAction, TriggerPack } from '../types';
import {
  loadCustomSounds,
  addCustomSoundFromBytes,
} from '../storage/customSoundsStorage';
import { loadPacks, newPackId, newTriggerId, savePacks } from '../storage/triggerStorage';
import { loadAmbientMappings, saveAmbientMappings } from '../storage/ambientStorage';
import { loadServers, saveServers } from '../storage/serverStorage';
import {
  ButtonLayout,
  loadServerLayout,
  saveServerLayout,
} from '../storage/layoutStorage';
import {
  loadChannelAliases,
  loadChannelOrder,
  saveChannelAliases,
  saveChannelOrder,
} from '../storage/channelStorage';
import { AppSettings, loadSettings, saveSettings } from '../storage/settingsStorage';
import { collectVarsReferencedByPacks } from '../utils/userVariablesUsage';
import { userVariablesService } from '../services/userVariablesService';

// Export format header — kept stable so older app versions can detect (and
// reject with a clear error) packs created by newer ones, and so we can bump
// the version cleanly when the schema evolves.
const EXPORT_FORMAT = 'torchzhyla-trigger-pack';
const EXPORT_VERSION = 1;

const CUSTOM_PREFIX = 'custom:';

interface SoundManifestEntry {
  uuid: string;
  name: string;
  ext: string;
}

interface ExportedPackJson {
  format: typeof EXPORT_FORMAT;
  version: number;
  name: string;
  triggers: Trigger[];
  soundsManifest: SoundManifestEntry[];
}

export interface ImportResult {
  pack: TriggerPack;
  importedSoundCount: number;
  missingSoundCount: number;
}

// Walks all triggers/actions in a pack and collects unique custom-sound uuids
// referenced by play_sound actions. Returns the parsed { uuid, ext } pairs.
function collectReferencedCustomSounds(triggers: Trigger[]): Array<{ uuid: string; ext: string }> {
  const seen = new Map<string, string>(); // uuid → ext
  for (const t of triggers) {
    for (const a of t.actions) {
      if (a.type !== 'play_sound') continue;
      if (!a.file || !a.file.startsWith(CUSTOM_PREFIX)) continue;
      const filename = a.file.slice(CUSTOM_PREFIX.length); // "{uuid}.{ext}"
      const dot = filename.lastIndexOf('.');
      if (dot < 0) continue;
      const uuid = filename.slice(0, dot);
      const ext = filename.slice(dot + 1).toLowerCase();
      if (!seen.has(uuid)) seen.set(uuid, ext);
    }
  }
  return Array.from(seen.entries()).map(([uuid, ext]) => ({ uuid, ext }));
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'pack'
  );
}

// Generates a `.zip` containing pack.json + sounds/{uuid}.{ext} for each
// custom sound referenced by the pack. Returns the local file URI of the
// generated zip (in cache dir). Caller is responsible for sharing it.
export async function exportPackToZip(pack: TriggerPack): Promise<string> {
  const allSounds = await loadCustomSounds();
  const referenced = collectReferencedCustomSounds(pack.triggers);

  const soundsManifest: SoundManifestEntry[] = [];
  const zip = new JSZip();

  const soundsDir = new Directory(Paths.document, 'sounds');
  for (const ref of referenced) {
    const meta = allSounds.find((s) => s.uuid === ref.uuid);
    if (!meta) continue; // referenced uuid not in storage — skip silently
    const sourceFile = new File(soundsDir, meta.filename);
    if (!sourceFile.exists) continue; // metadata exists but file missing
    const bytes = await sourceFile.bytes();
    zip.file(`sounds/${meta.filename}`, bytes);
    soundsManifest.push({ uuid: meta.uuid, name: meta.name, ext: meta.ext });
  }

  // Strip volatile fields the importer regenerates (id, assignedServerIds).
  // Keep trigger ids — the importer will regenerate those too, but having
  // them in the export keeps round-trips deterministic for diff/inspection.
  const exported: ExportedPackJson = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    name: pack.name,
    triggers: pack.triggers,
    soundsManifest,
  };
  zip.file('pack.json', JSON.stringify(exported, null, 2));

  const zipBytes = await zip.generateAsync({ type: 'uint8array' });

  const filename = `${slugify(pack.name)}-${Date.now()}.zip`;
  const outFile = new File(Paths.cache, filename);
  if (outFile.exists) outFile.delete();
  outFile.create();
  outFile.write(zipBytes);
  return outFile.uri;
}

function isExportedPack(obj: any): obj is ExportedPackJson {
  return (
    obj &&
    typeof obj === 'object' &&
    obj.format === EXPORT_FORMAT &&
    typeof obj.version === 'number' &&
    typeof obj.name === 'string' &&
    Array.isArray(obj.triggers) &&
    Array.isArray(obj.soundsManifest)
  );
}

// Reads a `.zip` produced by exportPackToZip and reconstructs a TriggerPack
// ready to insert into storage. Custom sounds get fresh local uuids (avoids
// collisions with sounds the user already had) and play_sound action `file`
// refs are rewritten accordingly. Caller decides how to handle the returned
// pack (assignment to servers, name collision, etc).
export async function importPackFromZip(zipUri: string): Promise<ImportResult> {
  const srcFile = new File(zipUri);
  if (!srcFile.exists) throw new Error('El archivo no existe');
  const bytes = await srcFile.bytes();

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (e) {
    throw new Error('El archivo no es un ZIP válido');
  }

  const packEntry = zip.file('pack.json');
  if (!packEntry) throw new Error('El ZIP no contiene pack.json — no es un export de TorchZhyla');
  const json = await packEntry.async('text');
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error('pack.json corrupto: no es JSON válido');
  }
  if (!isExportedPack(parsed)) {
    throw new Error('pack.json no tiene el formato esperado de TorchZhyla');
  }
  if (parsed.version > EXPORT_VERSION) {
    throw new Error(`Este pack es de una versión más reciente (v${parsed.version}). Actualiza la app.`);
  }

  // Install each sound under a fresh uuid and build the rewrite map.
  const uuidMap = new Map<string, string>(); // oldUuid → newUuid
  let importedSoundCount = 0;
  let missingSoundCount = 0;
  for (const entry of parsed.soundsManifest) {
    const zipPath = `sounds/${entry.uuid}.${entry.ext}`;
    const soundEntry = zip.file(zipPath);
    if (!soundEntry) {
      missingSoundCount++;
      continue;
    }
    const soundBytes = await soundEntry.async('uint8array');
    try {
      const meta = await addCustomSoundFromBytes(soundBytes, entry.name, entry.ext);
      uuidMap.set(entry.uuid, meta.uuid);
      importedSoundCount++;
    } catch (e) {
      console.warn(`[triggerPackExport] failed to install sound ${entry.uuid}:`, e);
      missingSoundCount++;
    }
  }

  // Rewrite play_sound refs and regenerate trigger ids.
  const triggers = parsed.triggers.map((t) => ({
    ...t,
    id: newTriggerId(),
    actions: t.actions.map((a) => rewriteActionSoundRef(a, uuidMap)),
  }));

  const pack: TriggerPack = {
    id: newPackId(),
    name: parsed.name,
    triggers,
    assignedServerIds: [],
  };

  return { pack, importedSoundCount, missingSoundCount };
}

function rewriteActionSoundRef(
  action: TriggerAction,
  uuidMap: Map<string, string>,
): TriggerAction {
  if (action.type !== 'play_sound') return action;
  if (!action.file || !action.file.startsWith(CUSTOM_PREFIX)) return action;
  const filename = action.file.slice(CUSTOM_PREFIX.length);
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return action;
  const oldUuid = filename.slice(0, dot);
  const ext = filename.slice(dot + 1);
  const newUuid = uuidMap.get(oldUuid);
  if (!newUuid) return action; // sound was missing; leave ref so user sees "(falta)"
  return { ...action, file: `${CUSTOM_PREFIX}${newUuid}.${ext}` };
}

// ---- Configuración global (export/import granular) -----------------------
// Formato `torchzhyla-config-backup` — el nombre legacy
// `torchzhyla-trigger-backup` (de cuando solo transportaba plantillas) sigue
// aceptado en lectura para no romper ZIPs ya distribuidos.
//
// El export es granular: el caller decide qué packs incluir, si lleva
// ambient, servidores, settings. Cada sección es opcional en el JSON; un
// importador antiguo lee solo las que conoce y ignora el resto.
//
// El import es en dos fases. `readImportManifest` parsea el ZIP y devuelve
// un resumen de qué contiene; el caller pinta checkboxes y llama a
// `applyImport(manifest, selections)` para aplicar solo lo seleccionado.

const BACKUP_FORMAT = 'torchzhyla-config-backup';
const BACKUP_FORMAT_LEGACY = 'torchzhyla-trigger-backup';
const ACCEPTED_BACKUP_FORMATS = new Set([BACKUP_FORMAT, BACKUP_FORMAT_LEGACY]);
// v4: gestos extraídos a campo top-level `gestures` (antes viajaban dentro
// del blob de settings, sin granularidad). En exports v4 el blob `settings`
// ya NO contiene `gestures`/`gesturesEnabled` — siempre se serializan en
// `gestures` aparte si el usuario marca el check.
// v3: añadidos servers, layouts, channelAliases, channelOrder, settings
// (todos opcionales). v2 añadió ambientMappings. v1 solo packs+sounds.
const BACKUP_VERSION = 4;

interface ExportedBackupPack {
  name: string;
  triggers: Trigger[];
}

interface ExportedBackupJson {
  format: string;
  version: number;
  exportedAt: number;
  // Todas las secciones son opcionales para soportar export granular y
  // versiones más antiguas. Un export que solo lleve ambient tendrá
  // packs/soundsManifest ausentes o vacíos.
  packs?: ExportedBackupPack[];
  soundsManifest?: SoundManifestEntry[];
  ambientMappings?: Partial<AmbientMappings>;
  // v3:
  servers?: ServerProfile[];
  // Map serverId-en-el-ZIP → layout / aliases / order. El importador
  // remapea los serverIds a frescos y reescribe estas keys con `serverIdMap`.
  layouts?: Record<string, ButtonLayout>;
  channelAliases?: Record<string, Record<string, string>>;
  channelOrder?: Record<string, string[]>;
  // Settings sin `gestures`/`gesturesEnabled` desde v4 — esos viajan en
  // `gestures` aparte para permitir granularidad import/export.
  settings?: Omit<AppSettings, 'gestures' | 'gesturesEnabled'>;
  // v4: bloque dedicado para los gestos del terminal.
  gestures?: { gesturesEnabled: boolean; gestures: GestureConfig[] };
}

// ---- Export ---------------------------------------------------------------

export interface ExportConfigOptions {
  // IDs de packs a incluir. Empty array = no se exporta ningún pack. Para
  // exportar todos, el caller pasa `packs.map(p => p.id)`. La elección
  // explícita evita suposiciones sobre "todos por defecto" en este nivel.
  packIds: string[];
  includeAmbient: boolean;
  // Servidores arrastra: ServerProfile[] + layouts per-server + channel
  // aliases per-server + channel order per-server. Todo o nada.
  includeServers: boolean;
  includeSettings: boolean;
  // Gestos del terminal — desde v4 viajan aparte de settings para que el
  // usuario pueda traerse/llevarse solo los gestos sin tocar el resto.
  includeGestures: boolean;
}

// Recolecta refs únicas a custom sounds de packs Y de mappings de ambient.
// Un wav usado en N packs + 1 mapping se exporta UNA sola vez.
function collectReferencedCustomSoundsAcrossPacks(
  packs: TriggerPack[],
  mappings?: AmbientMappings | null,
): Array<{ uuid: string; ext: string }> {
  const seen = new Map<string, string>();
  const consume = (file: string) => {
    if (!file.startsWith(CUSTOM_PREFIX)) return;
    const filename = file.slice(CUSTOM_PREFIX.length);
    const dot = filename.lastIndexOf('.');
    if (dot < 0) return;
    const uuid = filename.slice(0, dot);
    const ext = filename.slice(dot + 1).toLowerCase();
    if (!seen.has(uuid)) seen.set(uuid, ext);
  };
  for (const p of packs) {
    for (const t of p.triggers) {
      for (const a of t.actions) {
        if (a.type === 'play_sound' && a.file) consume(a.file);
      }
    }
  }
  if (mappings) {
    for (const cat of Object.values(mappings)) {
      for (const ref of cat.sounds) consume(ref);
    }
  }
  return Array.from(seen.entries()).map(([uuid, ext]) => ({ uuid, ext }));
}

export async function exportConfigToZip(options: ExportConfigOptions): Promise<string> {
  const allPacks = await loadPacks();
  const selectedPacks = allPacks.filter((p) => options.packIds.includes(p.id));

  let mappings: AmbientMappings | null = null;
  if (options.includeAmbient) {
    mappings = await loadAmbientMappings();
  }

  let servers: ServerProfile[] | null = null;
  let layouts: Record<string, ButtonLayout> | null = null;
  let channelAliases: Record<string, Record<string, string>> | null = null;
  let channelOrder: Record<string, string[]> | null = null;
  if (options.includeServers) {
    servers = await loadServers();
    layouts = {};
    channelAliases = {};
    channelOrder = {};
    for (const s of servers) {
      const layout = await loadServerLayout(s.id);
      if (layout.buttons.length > 0) layouts[s.id] = layout;
      const aliases = await loadChannelAliases(s.id);
      if (Object.keys(aliases).length > 0) channelAliases[s.id] = aliases;
      const order = await loadChannelOrder(s.id);
      if (order.length > 0) channelOrder[s.id] = order;
    }
  }

  // Cargamos settings una sola vez si se necesitan para alguno de los dos
  // bloques (settings o gestures), y luego serializamos cada uno por separado.
  let settingsBlob: Omit<AppSettings, 'gestures' | 'gesturesEnabled'> | null = null;
  let gesturesBlob: { gesturesEnabled: boolean; gestures: GestureConfig[] } | null = null;
  if (options.includeSettings || options.includeGestures) {
    const all = await loadSettings();
    if (options.includeSettings) {
      const { gestures: _g, gesturesEnabled: _ge, ...rest } = all;
      settingsBlob = rest;
    }
    if (options.includeGestures) {
      gesturesBlob = { gesturesEnabled: all.gesturesEnabled, gestures: all.gestures };
    }
  }

  // Bundle de wavs: solo los referenciados por las secciones incluidas.
  // Si el usuario exporta ambient sin packs, no metemos sonidos de packs.
  const allSounds = await loadCustomSounds();
  const referenced = collectReferencedCustomSoundsAcrossPacks(selectedPacks, mappings);

  const soundsManifest: SoundManifestEntry[] = [];
  const zip = new JSZip();
  const soundsDir = new Directory(Paths.document, 'sounds');
  for (const ref of referenced) {
    const meta = allSounds.find((s) => s.uuid === ref.uuid);
    if (!meta) continue;
    const sourceFile = new File(soundsDir, meta.filename);
    if (!sourceFile.exists) continue;
    const bytes = await sourceFile.bytes();
    zip.file(`sounds/${meta.filename}`, bytes);
    soundsManifest.push({ uuid: meta.uuid, name: meta.name, ext: meta.ext });
  }

  const exported: ExportedBackupJson = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
  };
  if (selectedPacks.length > 0) {
    // Strip volatile fields the importer regenerates (id, assignedServerIds).
    // assignedServerIds no sobrevive cambio de móvil — los serverIds son
    // locales y diferentes en cada instalación.
    exported.packs = selectedPacks.map((p) => ({ name: p.name, triggers: p.triggers }));
    exported.soundsManifest = soundsManifest;
  } else if (soundsManifest.length > 0) {
    // Caso: solo ambient con sonidos. soundsManifest sí va aunque no haya
    // packs (los wavs están en sounds/ y el JSON tiene que indexarlos).
    exported.soundsManifest = soundsManifest;
  }
  if (mappings) {
    // Filtramos categorías sin wavs (ruido en el JSON; merge en import
    // ya ignora las ausentes).
    const filtered: Partial<AmbientMappings> = {};
    for (const [cat, value] of Object.entries(mappings) as Array<[RoomCategory, { sounds: string[] }]>) {
      if (value.sounds.length > 0) filtered[cat] = { sounds: [...value.sounds] };
    }
    if (Object.keys(filtered).length > 0) {
      exported.ambientMappings = filtered;
    }
  }
  if (servers) {
    // La contraseña NUNCA se exporta — el destino tendrá que reescribirla
    // tras importar. Esto es independiente del toggle "Personajes": si lo
    // marcas, vienen los servidores pero sin credenciales.
    exported.servers = servers.map(({ password: _password, ...rest }) => rest);
    if (Object.keys(layouts!).length > 0) exported.layouts = layouts!;
    if (Object.keys(channelAliases!).length > 0) exported.channelAliases = channelAliases!;
    if (Object.keys(channelOrder!).length > 0) exported.channelOrder = channelOrder!;
  }
  if (settingsBlob) {
    exported.settings = settingsBlob;
  }
  if (gesturesBlob) {
    exported.gestures = gesturesBlob;
  }
  zip.file('backup.json', JSON.stringify(exported, null, 2));

  const zipBytes = await zip.generateAsync({ type: 'uint8array' });

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `torchzhyla-config-${stamp}.zip`;
  const outFile = new File(Paths.cache, filename);
  if (outFile.exists) outFile.delete();
  outFile.create();
  outFile.write(zipBytes);
  return outFile.uri;
}

// ---- Import: dos fases ----------------------------------------------------

// Resumen de lo que un ZIP contiene. La UI lo usa para pintar checkboxes
// con qué traer. `_data` es opaco — se le pasa íntegro a `applyImport`.
export interface ImportManifest {
  version: number;
  packs: { name: string; triggerCount: number }[];
  hasAmbient: boolean;
  ambientCategoryCount: number;
  hasServers: boolean;
  serverCount: number;
  hasSettings: boolean;
  hasGestures: boolean;
  enabledGestureCount: number;
  totalSoundCount: number;
  _data: {
    zip: JSZip;
    parsed: ExportedBackupJson;
  };
}

export interface ImportSelections {
  // Índices en `manifest.packs` que el usuario quiere importar.
  packIndices: number[];
  importAmbient: boolean;
  importServers: boolean;
  importSettings: boolean;
  importGestures: boolean;
}

export interface ImportApplyResult {
  importedPacks: TriggerPack[];
  importedSoundCount: number;
  missingSoundCount: number;
  ambientCategoriesApplied: number;
  importedServerCount: number;
  importedSettingsApplied: boolean;
  importedGesturesApplied: boolean;
  newlyDeclaredVarNames: string[];
}

function isExportedBackup(obj: any): obj is ExportedBackupJson {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.format === 'string' &&
    ACCEPTED_BACKUP_FORMATS.has(obj.format) &&
    typeof obj.version === 'number'
  );
}

export async function readImportManifest(zipUri: string): Promise<ImportManifest> {
  const srcFile = new File(zipUri);
  if (!srcFile.exists) throw new Error('El archivo no existe');
  const bytes = await srcFile.bytes();

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (e) {
    throw new Error('El archivo no es un ZIP válido');
  }

  // Normalizamos single-pack ZIP (pack.json) y backup ZIP (backup.json) al
  // mismo shape. Single-pack se ve como un backup con UN pack, sin secciones.
  let parsed: ExportedBackupJson;
  const backupEntry = zip.file('backup.json');
  const packEntry = zip.file('pack.json');
  if (backupEntry) {
    const json = await backupEntry.async('text');
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch (e) {
      throw new Error('backup.json corrupto: no es JSON válido');
    }
    if (!isExportedBackup(raw)) {
      throw new Error('backup.json no tiene el formato esperado de TorchZhyla');
    }
    parsed = raw;
  } else if (packEntry) {
    const json = await packEntry.async('text');
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch (e) {
      throw new Error('pack.json corrupto: no es JSON válido');
    }
    if (!isExportedPack(raw)) {
      throw new Error('pack.json no tiene el formato esperado de TorchZhyla');
    }
    parsed = {
      format: BACKUP_FORMAT,
      version: raw.version,
      exportedAt: Date.now(),
      packs: [{ name: raw.name, triggers: raw.triggers }],
      soundsManifest: raw.soundsManifest,
    };
  } else {
    throw new Error('El ZIP no contiene ni backup.json ni pack.json — no es un export de TorchZhyla');
  }

  if (parsed.version > BACKUP_VERSION) {
    throw new Error(`Este archivo es de una versión más reciente (v${parsed.version}). Actualiza la app.`);
  }

  let ambientCategoryCount = 0;
  if (parsed.ambientMappings) {
    for (const value of Object.values(parsed.ambientMappings)) {
      if (value && Array.isArray(value.sounds) && value.sounds.length > 0) ambientCategoryCount++;
    }
  }

  const hasGestures = !!parsed.gestures && Array.isArray(parsed.gestures.gestures);
  // "Activo" = habilitado y con algo realmente disparable. Para send/prepare,
  // que su `text` no esté vacío; para pick, que el prefix tenga contenido.
  const enabledGestureCount = hasGestures
    ? parsed.gestures!.gestures.filter((g) => {
        if (!g.enabled) return false;
        const a = g.action;
        if (a.kind === 'pick') return a.prefix.trim().length > 0;
        return a.text.trim().length > 0;
      }).length
    : 0;

  return {
    version: parsed.version,
    packs: (parsed.packs ?? []).map((p) => ({
      name: p.name,
      triggerCount: p.triggers.length,
    })),
    hasAmbient: ambientCategoryCount > 0,
    ambientCategoryCount,
    hasServers: !!parsed.servers && parsed.servers.length > 0,
    serverCount: parsed.servers?.length ?? 0,
    hasSettings: !!parsed.settings,
    hasGestures,
    enabledGestureCount,
    totalSoundCount: parsed.soundsManifest?.length ?? 0,
    _data: { zip, parsed },
  };
}

export async function applyImport(
  manifest: ImportManifest,
  selections: ImportSelections,
): Promise<ImportApplyResult> {
  const { zip, parsed } = manifest._data;

  // Filtra packs por índice. Mantiene el orden original del ZIP.
  const allPacks = parsed.packs ?? [];
  const selectedExported = selections.packIndices
    .filter((i) => i >= 0 && i < allPacks.length)
    .sort((a, b) => a - b)
    .map((i) => allPacks[i]);

  // Recolecta refs de sonidos a instalar: solo los usados por lo que el
  // usuario eligió importar. Si no marca packs ni ambient, no instalamos
  // wavs aunque el ZIP los traiga.
  const refsNeeded = new Set<string>(); // "uuid.ext"
  const wantedAmbient = selections.importAmbient && parsed.ambientMappings;
  const collectFromAction = (a: TriggerAction) => {
    if (a.type === 'play_sound' && a.file?.startsWith(CUSTOM_PREFIX)) {
      const filename = a.file.slice(CUSTOM_PREFIX.length);
      refsNeeded.add(filename);
    }
  };
  for (const p of selectedExported) {
    for (const t of p.triggers) {
      for (const a of t.actions) collectFromAction(a);
    }
  }
  if (wantedAmbient) {
    for (const value of Object.values(parsed.ambientMappings!)) {
      if (!value) continue;
      for (const ref of value.sounds) {
        if (ref.startsWith(CUSTOM_PREFIX)) {
          refsNeeded.add(ref.slice(CUSTOM_PREFIX.length));
        }
      }
    }
  }

  // Instala solo los wavs necesarios. uuidMap: oldUuid → newUuid.
  const uuidMap = new Map<string, string>();
  let importedSoundCount = 0;
  let missingSoundCount = 0;
  for (const entry of parsed.soundsManifest ?? []) {
    const filename = `${entry.uuid}.${entry.ext}`;
    if (!refsNeeded.has(filename)) continue;
    const zipPath = `sounds/${filename}`;
    const soundEntry = zip.file(zipPath);
    if (!soundEntry) {
      missingSoundCount++;
      continue;
    }
    const soundBytes = await soundEntry.async('uint8array');
    try {
      const meta = await addCustomSoundFromBytes(soundBytes, entry.name, entry.ext);
      uuidMap.set(entry.uuid, meta.uuid);
      importedSoundCount++;
    } catch (e) {
      console.warn(`[triggerPackExport] failed to install sound ${entry.uuid}:`, e);
      missingSoundCount++;
    }
  }

  // Construye los TriggerPacks importados con ids frescos.
  const importedPacks: TriggerPack[] = selectedExported.map((p) => ({
    id: newPackId(),
    name: p.name,
    triggers: p.triggers.map((t) => ({
      ...t,
      id: newTriggerId(),
      actions: t.actions.map((a) => rewriteActionSoundRef(a, uuidMap)),
    })),
    assignedServerIds: [],
  }));
  if (importedPacks.length > 0) {
    const existing = await loadPacks();
    await savePacks([...existing, ...importedPacks]);
  }

  // Auto-declare user vars referenciadas por los packs importados.
  let newlyDeclaredVarNames: string[] = [];
  if (importedPacks.length > 0) {
    const refs = collectVarsReferencedByPacks(importedPacks);
    if (refs.length > 0) {
      newlyDeclaredVarNames = await userVariablesService.declareMany(refs);
    }
  }

  // Ambient: merge por categoría (las que vienen pisan; las ausentes se
  // conservan). Permite ZIPs "solo bosque" sin destruir el resto.
  let ambientCategoriesApplied = 0;
  if (selections.importAmbient && parsed.ambientMappings) {
    const current = await loadAmbientMappings();
    const next = { ...current };
    for (const [cat, value] of Object.entries(parsed.ambientMappings) as Array<[
      RoomCategory,
      { sounds: string[] } | undefined,
    ]>) {
      if (!value || !Array.isArray(value.sounds)) continue;
      const rewritten: string[] = [];
      for (const ref of value.sounds) {
        if (!ref.startsWith(CUSTOM_PREFIX)) continue;
        const filename = ref.slice(CUSTOM_PREFIX.length);
        const dot = filename.lastIndexOf('.');
        if (dot < 0) continue;
        const oldUuid = filename.slice(0, dot);
        const ext = filename.slice(dot + 1);
        const newUuid = uuidMap.get(oldUuid);
        if (newUuid) rewritten.push(`${CUSTOM_PREFIX}${newUuid}.${ext}`);
      }
      next[cat] = { sounds: rewritten };
      ambientCategoriesApplied++;
    }
    if (ambientCategoriesApplied > 0) {
      await saveAmbientMappings(next);
    }
  }

  // Servidores: política decidida (1-A) — añadir como duplicados, sin merge
  // por nombre/host. El usuario gestiona si surgen "Aljhtar" y "Aljhtar"
  // en la lista. Cada server importado recibe un id fresco; layouts /
  // aliases / order se reescriben con ese id nuevo.
  let importedServerCount = 0;
  if (selections.importServers && parsed.servers) {
    const serverIdMap = new Map<string, string>(); // oldId → newId
    const importedServers: ServerProfile[] = parsed.servers.map((s) => {
      const newId = newServerId();
      serverIdMap.set(s.id, newId);
      return { ...s, id: newId };
    });
    if (importedServers.length > 0) {
      const existing = await loadServers();
      await saveServers([...existing, ...importedServers]);
      importedServerCount = importedServers.length;

      // Layouts per-server.
      if (parsed.layouts) {
        for (const [oldId, layout] of Object.entries(parsed.layouts)) {
          const newId = serverIdMap.get(oldId);
          if (newId && layout?.buttons) {
            await saveServerLayout(newId, layout);
          }
        }
      }
      // Channel aliases per-server.
      if (parsed.channelAliases) {
        for (const [oldId, aliases] of Object.entries(parsed.channelAliases)) {
          const newId = serverIdMap.get(oldId);
          if (newId && aliases) {
            await saveChannelAliases(newId, aliases);
          }
        }
      }
      // Channel order per-server.
      if (parsed.channelOrder) {
        for (const [oldId, order] of Object.entries(parsed.channelOrder)) {
          const newId = serverIdMap.get(oldId);
          if (newId && Array.isArray(order)) {
            await saveChannelOrder(newId, order);
          }
        }
      }
    }
  }

  // Settings y gestos: bloques independientes desde v4. El usuario puede
  // marcar uno, otro o ambos. Calculamos el blob final una sola vez para
  // evitar dos saves consecutivos (que dispararían dos rebuilds en quien
  // observe la key).
  //
  // - Solo Settings: el blob del ZIP sustituye al actual; los gestos
  //   actuales se conservan tal cual (campo no presente en parsed.settings).
  // - Solo Gestos: settings actuales intactos; gestos sustituidos por los
  //   del ZIP.
  // - Ambos: settings + gestos del ZIP.
  let importedSettingsApplied = false;
  let importedGesturesApplied = false;
  const wantSettings = selections.importSettings && !!parsed.settings;
  const wantGestures = selections.importGestures && !!parsed.gestures;
  if (wantSettings || wantGestures) {
    const current = await loadSettings();
    let next: AppSettings = current;
    if (wantSettings) {
      next = {
        ...parsed.settings!,
        gestures: current.gestures,
        gesturesEnabled: current.gesturesEnabled,
      };
      importedSettingsApplied = true;
    }
    if (wantGestures) {
      next = {
        ...next,
        gestures: parsed.gestures!.gestures,
        gesturesEnabled: parsed.gestures!.gesturesEnabled,
      };
      importedGesturesApplied = true;
    }
    await saveSettings(next);
  }

  return {
    importedPacks,
    importedSoundCount,
    missingSoundCount,
    ambientCategoriesApplied,
    importedServerCount,
    importedSettingsApplied,
    importedGesturesApplied,
    newlyDeclaredVarNames,
  };
}

function newServerId(): string {
  // ServerProfile.id es libre — usamos un id "ts + random" como ya hace el
  // resto del código (ver serverStorage / TriggerPack ids). No hay un
  // helper centralizado para esto, así que lo replicamos local.
  return `srv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
