import JSZip from 'jszip';
import { Paths, File, Directory } from 'expo-file-system';
import { Trigger, TriggerAction, TriggerPack } from '../types';
import {
  CustomSound,
  loadCustomSounds,
  addCustomSoundFromBytes,
} from '../storage/customSoundsStorage';
import { newPackId, newTriggerId } from '../storage/triggerStorage';

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

const BACKUP_FORMAT = 'torchzhyla-trigger-backup';
const BACKUP_VERSION = 1;

interface ExportedBackupPack {
  name: string;
  triggers: Trigger[];
}

interface ExportedBackupJson {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  packs: ExportedBackupPack[];
  soundsManifest: SoundManifestEntry[];
}

export interface BackupImportResult {
  packs: TriggerPack[];
  importedSoundCount: number;
  missingSoundCount: number;
}

export type ImportZipResult =
  | { kind: 'pack'; result: ImportResult }
  | { kind: 'backup'; result: BackupImportResult };

function collectReferencedCustomSoundsAcrossPacks(
  packs: TriggerPack[],
): Array<{ uuid: string; ext: string }> {
  const seen = new Map<string, string>();
  for (const p of packs) {
    for (const t of p.triggers) {
      for (const a of t.actions) {
        if (a.type !== 'play_sound') continue;
        if (!a.file || !a.file.startsWith(CUSTOM_PREFIX)) continue;
        const filename = a.file.slice(CUSTOM_PREFIX.length);
        const dot = filename.lastIndexOf('.');
        if (dot < 0) continue;
        const uuid = filename.slice(0, dot);
        const ext = filename.slice(dot + 1).toLowerCase();
        if (!seen.has(uuid)) seen.set(uuid, ext);
      }
    }
  }
  return Array.from(seen.entries()).map(([uuid, ext]) => ({ uuid, ext }));
}

export async function exportAllPacksToZip(packs: TriggerPack[]): Promise<string> {
  const allSounds = await loadCustomSounds();
  const referenced = collectReferencedCustomSoundsAcrossPacks(packs);

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
  zip.file('backup.json', JSON.stringify(exported, null, 2));

  const zipBytes = await zip.generateAsync({ type: 'uint8array' });

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `torchzhyla-triggers-${stamp}.zip`;
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
    obj.format === BACKUP_FORMAT &&
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

  return { packs, importedSoundCount, missingSoundCount };
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
