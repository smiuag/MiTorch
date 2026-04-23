import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'aljhtar_nicks_v1';
const MAX_NICKS = 500;
const SAVE_DEBOUNCE_MS = 1000;

export interface NickEntry {
  nick: string;
  lastSeen: number;
}

let memory: NickEntry[] = [];
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;

export async function loadNicks(): Promise<NickEntry[]> {
  if (loaded) return memory;
  try {
    const json = await AsyncStorage.getItem(STORAGE_KEY);
    if (json) {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) memory = parsed;
    }
  } catch {
    memory = [];
  }
  loaded = true;
  return memory;
}

function scheduleSave() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    if (!dirty) return;
    dirty = false;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
    } catch {
      // swallow — next save will retry
    }
  }, SAVE_DEBOUNCE_MS);
}

export function recordNickSeen(nick: string) {
  if (!nick) return;
  const now = Date.now();
  const idx = memory.findIndex(e => e.nick === nick);
  if (idx >= 0) {
    memory[idx].lastSeen = now;
  } else {
    memory.push({ nick, lastSeen: now });
    if (memory.length > MAX_NICKS) {
      memory.sort((a, b) => b.lastSeen - a.lastSeen);
      memory = memory.slice(0, MAX_NICKS);
    }
  }
  scheduleSave();
}

export function getRecentNicks(limit = 40): NickEntry[] {
  return [...memory].sort((a, b) => b.lastSeen - a.lastSeen).slice(0, limit);
}

export function filterNicks(prefix: string, limit = 8): NickEntry[] {
  if (!prefix) return getRecentNicks(limit);
  const p = prefix.toLowerCase();
  return memory
    .filter(e => e.nick.toLowerCase().startsWith(p))
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .slice(0, limit);
}

export async function clearNicks(): Promise<void> {
  memory = [];
  dirty = true;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
