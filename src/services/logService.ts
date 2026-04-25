import { Paths, File, Directory } from 'expo-file-system';
import { getContentUriAsync } from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import type { LogsMaxLines } from '../storage/settingsStorage';
import { generateLogHtml } from '../utils/logHtmlGenerator';

const INTENT_FLAG_GRANT_READ_URI_PERMISSION = 1;
const INTENT_FLAG_ACTIVITY_NEW_TASK = 268435456;

const LOG_DIR_NAME = 'logs';
const LOG_FILE_NAME = 'log.txt';
const EXPORT_FILE_NAME = 'torchzhyla-log-export.html';
const FLUSH_INTERVAL_MS = 5000;
const FLUSH_BUFFER_THRESHOLD = 100;

export type ExportRange = '24h' | '7d' | 'all';

export function slugifyServerName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'server';
}

function isoTimestamp(): string {
  return new Date().toISOString();
}

class LogService {
  private enabled: boolean = false;
  private maxLines: LogsMaxLines = 20000;
  private buffer: string[] = [];
  private currentServerKey: string | null = null;
  private currentServerHost: string | null = null;
  private currentPasswordToScrub: string | null = null;
  private loggingActive: boolean = false;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private logDir: Directory | null = null;
  private logFile: File | null = null;

  private ensurePaths(): { dir: Directory; file: File } {
    if (!this.logDir || !this.logFile) {
      this.logDir = new Directory(Paths.document, LOG_DIR_NAME);
      this.logFile = new File(this.logDir, LOG_FILE_NAME);
      if (!this.logDir.exists) {
        this.logDir.create({ intermediates: true, idempotent: true });
      }
    }
    return { dir: this.logDir, file: this.logFile };
  }

  configure(enabled: boolean, maxLines: LogsMaxLines): void {
    const wasEnabled = this.enabled;
    this.enabled = enabled;
    const previousMax = this.maxLines;
    this.maxLines = maxLines;

    if (!wasEnabled && enabled) {
      this.startFlushTimer();
    } else if (wasEnabled && !enabled) {
      this.stopFlushTimer();
      this.buffer = [];
      this.deleteFile();
    }

    if (enabled && maxLines < previousMax) {
      this.flushAndTrim();
    }
  }

  setCurrentServer(name: string, host: string, password?: string): void {
    this.currentServerKey = slugifyServerName(name);
    this.currentServerHost = host;
    this.currentPasswordToScrub = password || null;
    this.loggingActive = false;
  }

  markLoginComplete(): void {
    if (this.loggingActive) return;
    this.loggingActive = true;
    this.appendRaw('=== Login completado ===', true);
  }

  private appendRaw(content: string, bypassLoginGate: boolean = false): void {
    if (!this.enabled || !this.currentServerKey) return;
    if (!bypassLoginGate && !this.loggingActive) return;
    const line = `[${isoTimestamp()}] [${this.currentServerKey}] ${content}`;
    this.buffer.push(line);
    if (this.buffer.length >= FLUSH_BUFFER_THRESHOLD) {
      this.flushAndTrim();
    }
  }

  appendIncoming(text: string): void {
    if (!this.enabled || !this.loggingActive) return;
    const lines = text.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, '');
      const stripped = line.replace(/\x1b\[[0-9;]*m/g, '').trim();
      if (!stripped) continue;
      if (!/[a-zA-Z0-9]/.test(stripped)) continue;
      if (this.currentPasswordToScrub && line.includes(this.currentPasswordToScrub)) {
        continue;
      }
      this.appendRaw(line);
    }
  }

  appendCommand(command: string): void {
    if (!this.enabled || !this.loggingActive || !command) return;
    if (this.currentPasswordToScrub && command === this.currentPasswordToScrub) {
      return;
    }
    this.appendRaw(`> ${command}`);
  }

  appendMarker(text: string): void {
    this.appendRaw(`=== ${text} ===`, true);
  }

  logConnect(host: string, port: number): void {
    this.appendMarker(`Conectado a ${host}:${port}`);
  }

  logDisconnect(): void {
    this.appendMarker('Desconectado');
  }

  private startFlushTimer(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      this.flushAndTrim();
    }, FLUSH_INTERVAL_MS);
  }

  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private flushAndTrim(): void {
    try {
      const { file } = this.ensurePaths();
      if (this.buffer.length === 0 && file.exists) {
        const existing = file.textSync();
        const lines = existing.split('\n').filter((l: string) => l.length > 0);
        if (lines.length > this.maxLines) {
          const trimmed = lines.slice(lines.length - this.maxLines).join('\n') + '\n';
          file.write(trimmed);
        }
        return;
      }
      if (this.buffer.length === 0) return;
      const newContent = this.buffer.join('\n') + '\n';
      this.buffer = [];
      let combined: string;
      if (file.exists) {
        const existing = file.textSync();
        combined = existing + newContent;
      } else {
        file.create({ intermediates: true, overwrite: false });
        combined = newContent;
      }
      const allLines = combined.split('\n').filter((l: string) => l.length > 0);
      if (allLines.length > this.maxLines) {
        combined = allLines.slice(allLines.length - this.maxLines).join('\n') + '\n';
      }
      file.write(combined);
    } catch (e) {
      console.warn('[logService] flush error:', e);
    }
  }

  async clearAll(): Promise<void> {
    this.buffer = [];
    this.deleteFile();
  }

  private deleteFile(): void {
    try {
      const { file } = this.ensurePaths();
      if (file.exists) {
        file.delete();
      }
    } catch (e) {
      console.warn('[logService] delete error:', e);
    }
  }

  hasLogs(): boolean {
    try {
      const { file } = this.ensurePaths();
      return file.exists && file.size > 0;
    } catch {
      return false;
    }
  }

  async exportToHtml(range: ExportRange, serverHostMap: Record<string, string>): Promise<void> {
    this.flushAndTrim();
    const { file } = this.ensurePaths();
    if (!file.exists) {
      throw new Error('No hay logs para exportar');
    }
    const raw = file.textSync();
    const cutoff = this.computeCutoff(range);
    const html = generateLogHtml(raw, cutoff, serverHostMap);
    const exportFile = new File(Paths.cache, EXPORT_FILE_NAME);
    if (exportFile.exists) {
      exportFile.delete();
    }
    exportFile.create();
    exportFile.write(html);
    const contentUri = await getContentUriAsync(exportFile.uri);
    try {
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        type: 'text/html',
        data: contentUri,
        flags: INTENT_FLAG_GRANT_READ_URI_PERMISSION | INTENT_FLAG_ACTIVITY_NEW_TASK,
      });
    } catch (viewError) {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(exportFile.uri, {
          mimeType: 'text/html',
          dialogTitle: 'Abrir log exportado',
          UTI: 'public.html',
        });
      } else {
        throw viewError;
      }
    }
  }

  private computeCutoff(range: ExportRange): number | null {
    if (range === 'all') return null;
    const now = Date.now();
    if (range === '24h') return now - 24 * 60 * 60 * 1000;
    if (range === '7d') return now - 7 * 24 * 60 * 60 * 1000;
    return null;
  }
}

export const logService = new LogService();
