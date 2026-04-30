import JSZip from 'jszip';
import { Paths, File, Directory } from 'expo-file-system';
import { AmbientMappings, RoomCategory, Trigger, TriggerAction, TriggerPack } from '../types';
import {
  CustomSound,
  loadCustomSounds,
  addCustomSoundFromBytes,
} from '../storage/customSoundsStorage';
import { newPackId, newTriggerId } from '../storage/triggerStorage';
import { loadAmbientMappings, saveAmbientMappings } from '../storage/ambientStorage';

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

// ---- Backup global (todas las plantillas) ---------------------------------
// Mismo formato base que el export per-pack pero con varias plantillas y sus
// sonidos consolidados (deduplicados por uuid). Útil para cambio de móvil.

// Formato del backup multi-pack. Renombrado en A9 a "config-backup" para
// reflejar que ya transporta más que solo triggers (mappings de ambient,
// y a futuro layouts/servers/settings). Mantenemos la cadena legacy en
// el set de formatos aceptados al importar para que ZIPs ya distribuidos
// sigan funcionando.
const BACKUP_FORMAT = 'torchzhyla-config-backup';
const BACKUP_FORMAT_LEGACY = 'torchzhyla-trigger-backup';
const ACCEPTED_BACKUP_FORMATS = new Set([BACKUP_FORMAT, BACKUP_FORMAT_LEGACY]);
// v2: añadido `ambientMappings` opcional.
const BACKUP_VERSION = 2;

interface ExportedBackupPack {
  name: string;
  triggers: Trigger[];
}

interface ExportedBackupJson {
  // Acepta tanto el nombre nuevo como el legacy en import; al exportar
  // siempre escribimos el nuevo.
  format: string;
  version: number;
  exportedAt: number;
  packs: ExportedBackupPack[];
  soundsManifest: SoundManifestEntry[];
  // Mappings de ambient — opcional para compatibilidad con ZIPs v1 sin
  // la sección. Cuando está presente, el importador aplica merge por
  // categoría (las que vienen sobrescriben, las que no se conservan).
  ambientMappings?: Partial<AmbientMappings>;
}

export interface BackupImportResult {
  packs: TriggerPack[];
  importedSoundCount: number;
  missingSoundCount: number;
  // Número de categorías de ambient que el ZIP traía (independiente de
  // si tenían wavs o eran categoría vacía). 0 si el ZIP no incluía la
  // sección o si era v1.
  ambientCategoriesApplied: number;
}

export type ImportZipResult =
  | { kind: 'pack'; result: ImportResult }
  | { kind: 'backup'; result: BackupImportResult };

// Recolecta refs únicas a custom sounds de packs Y de mappings de ambient
// (cuando se pasan). Devuelve un único array sin duplicados — un wav que
// aparezca en N packs + en 1 mapping se exporta UNA sola vez.
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

// Exporta packs (y opcionalmente mappings de ambient) a un ZIP de
// "configuración". Si `includeAmbients` es true, carga `loadAmbientMappings`
// internamente; el caller puede pasarle también los mappings ya cargados
// vía `mappings` para evitar el round-trip al storage.
export async function exportAllPacksToZip(
  packs: TriggerPack[],
  options?: { includeAmbients?: boolean; mappings?: AmbientMappings | null },
): Promise<string> {
  const includeAmbients = options?.includeAmbients ?? true;
  let mappings: AmbientMappings | null = options?.mappings ?? null;
  if (includeAmbients && !mappings) {
    mappings = await loadAmbientMappings();
  }

  const allSounds = await loadCustomSounds();
  const referenced = collectReferencedCustomSoundsAcrossPacks(packs, mappings);

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

  // Strip volatile fields the importer regenerates (id, assignedServerIds).
  // Server IDs are local-generated and don't survive a device move; the
  // importer empties assignments and the user reassigns from the editor.
  const exported: ExportedBackupJson = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    packs: packs.map((p) => ({ name: p.name, triggers: p.triggers })),
    soundsManifest,
  };
  if (mappings) {
    // Filtramos las categorías sin wavs para no inflar el JSON con
    // ruido — el merge en import omite categorías ausentes, así que
    // exportar las vacías no aporta valor.
    const filtered: Partial<AmbientMappings> = {};
    for (const [cat, value] of Object.entries(mappings) as Array<[RoomCategory, { sounds: string[] }]>) {
      if (value.sounds.length > 0) filtered[cat] = { sounds: [...value.sounds] };
    }
    if (Object.keys(filtered).length > 0) {
      exported.ambientMappings = filtered;
    }
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

function isExportedBackup(obj: any): obj is ExportedBackupJson {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.format === 'string' &&
    ACCEPTED_BACKUP_FORMATS.has(obj.format) &&
    typeof obj.version === 'number' &&
    Array.isArray(obj.packs) &&
    Array.isArray(obj.soundsManifest)
  );
}

export async function importBackupFromZip(zipUri: string): Promise<BackupImportResult> {
  const srcFile = new File(zipUri);
  if (!srcFile.exists) throw new Error('El archivo no existe');
  const bytes = await srcFile.bytes();

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (e) {
    throw new Error('El archivo no es un ZIP válido');
  }

  const backupEntry = zip.file('backup.json');
  if (!backupEntry) throw new Error('El ZIP no contiene backup.json');
  const json = await backupEntry.async('text');
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error('backup.json corrupto: no es JSON válido');
  }
  if (!isExportedBackup(parsed)) {
    throw new Error('backup.json no tiene el formato esperado de TorchZhyla');
  }
  if (parsed.version > BACKUP_VERSION) {
    throw new Error(`Este backup es de una versión más reciente (v${parsed.version}). Actualiza la app.`);
  }

  // Install each unique sound once and share the uuid map across all packs —
  // a sound referenced by N packs only ends up on disk once.
  const uuidMap = new Map<string, string>();
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

  const packs: TriggerPack[] = parsed.packs.map((p) => ({
    id: newPackId(),
    name: p.name,
    triggers: p.triggers.map((t) => ({
      ...t,
      id: newTriggerId(),
      actions: t.actions.map((a) => rewriteActionSoundRef(a, uuidMap)),
    })),
    assignedServerIds: [],
  }));

  // Apply ambient mappings if the backup carries them. Strategy: merge
  // by category — categories present in the backup overwrite the user's
  // current set; categories absent are preserved. This lets a "solo
  // bosque" partial ZIP not destroy the user's other categories.
  let ambientCategoriesApplied = 0;
  if (parsed.ambientMappings) {
    const current = await loadAmbientMappings();
    const next = { ...current };
    for (const [cat, value] of Object.entries(parsed.ambientMappings) as Array<[
      RoomCategory,
      { sounds: string[] } | undefined,
    ]>) {
      if (!value || !Array.isArray(value.sounds)) continue;
      // Rewrite each ref through uuidMap so the new uuids in disk match
      // the imported wavs. Refs whose uuid wasn't found in uuidMap (e.g.
      // missing wav, or a custom: ref to a sound the user already has
      // under a different uuid) get filtered — better silent than dead.
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

  return { packs, importedSoundCount, missingSoundCount, ambientCategoriesApplied };
}

// Detects which kind of export the ZIP contains and dispatches. Saves the
// caller from sniffing the file twice.
export async function importFromZip(zipUri: string): Promise<ImportZipResult> {
  const srcFile = new File(zipUri);
  if (!srcFile.exists) throw new Error('El archivo no existe');
  const bytes = await srcFile.bytes();

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (e) {
    throw new Error('El archivo no es un ZIP válido');
  }

  if (zip.file('backup.json')) {
    const result = await importBackupFromZip(zipUri);
    return { kind: 'backup', result };
  }
  if (zip.file('pack.json')) {
    const result = await importPackFromZip(zipUri);
    return { kind: 'pack', result };
  }
  throw new Error('El ZIP no contiene ni backup.json ni pack.json — no es un export de TorchZhyla');
}
