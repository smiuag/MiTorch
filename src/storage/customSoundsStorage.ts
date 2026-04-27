import AsyncStorage from '@react-native-async-storage/async-storage';
import { Paths, File, Directory } from 'expo-file-system';

const KEY = 'aljhtar_custom_sounds';
const SOUNDS_DIR = 'sounds';

export interface CustomSound {
  uuid: string;
  name: string;
  filename: string;
  ext: string;
  addedAt: number;
}

const ALLOWED_EXTS = new Set(['wav', 'mp3', 'ogg', 'm4a', 'aac', 'flac']);

let counter = Date.now();
function genUuid(): string {
  return `cs_${(counter++).toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function ensureDir(): Directory {
  const dir = new Directory(Paths.document, SOUNDS_DIR);
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

function extractExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return '';
  return filename.slice(dot + 1).toLowerCase();
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return filename;
  return filename.slice(0, dot);
}

export async function loadCustomSounds(): Promise<CustomSound[]> {
  const json = await AsyncStorage.getItem(KEY);
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveCustomSounds(list: CustomSound[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
}

export async function addCustomSound(srcUri: string, originalFilename: string): Promise<CustomSound> {
  const ext = extractExtension(originalFilename);
  if (!ext || !ALLOWED_EXTS.has(ext)) {
    throw new Error(`Formato no soportado: .${ext || '?'}. Usa wav, mp3, ogg, m4a, aac o flac.`);
  }
  const uuid = genUuid();
  const filename = `${uuid}.${ext}`;
  const dir = ensureDir();
  const destFile = new File(dir, filename);

  const srcFile = new File(srcUri);
  srcFile.copy(destFile);

  const meta: CustomSound = {
    uuid,
    name: stripExtension(originalFilename) || 'Sonido',
    filename,
    ext,
    addedAt: Date.now(),
  };
  const list = await loadCustomSounds();
  list.push(meta);
  await saveCustomSounds(list);
  return meta;
}

export async function removeCustomSound(uuid: string): Promise<CustomSound[]> {
  const list = await loadCustomSounds();
  const target = list.find((s) => s.uuid === uuid);
  if (target) {
    try {
      const dir = ensureDir();
      const file = new File(dir, target.filename);
      if (file.exists) file.delete();
    } catch (e) {
      console.warn('[customSoundsStorage] delete file error:', e);
    }
  }
  const next = list.filter((s) => s.uuid !== uuid);
  await saveCustomSounds(next);
  return next;
}

export async function renameCustomSound(uuid: string, newName: string): Promise<CustomSound[]> {
  const list = await loadCustomSounds();
  const next = list.map((s) => (s.uuid === uuid ? { ...s, name: newName } : s));
  await saveCustomSounds(next);
  return next;
}

export function getCustomSoundUri(filename: string): string | null {
  try {
    const dir = ensureDir();
    const file = new File(dir, filename);
    if (!file.exists) return null;
    return file.uri;
  } catch {
    return null;
  }
}
