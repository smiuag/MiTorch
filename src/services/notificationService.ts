import { Platform } from 'react-native';
import TorchZhylaForeground from '../../modules/torchzhyla-foreground';
import notificationPatternsData from '../config/notificationPatterns.json';
import { AVAILABLE_NOTIFICATIONS } from '../storage/settingsStorage';

interface NotificationPattern {
  id: string;
  regexes: string[];
}

const ANSI_RE = /\x1b\[[0-9;]*m/g;

const patterns: NotificationPattern[] = (notificationPatternsData as any).patterns ?? [];

const compiled = patterns.map((p) => ({
  id: p.id,
  res: p.regexes.map((r) => new RegExp(r, 'i')),
}));

let nextNotificationId = 1000;

export type DetectedNotification = {
  id: string;
  label: string;
};

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '');
}

export function detectNotification(text: string): DetectedNotification | undefined {
  const clean = stripAnsi(text);
  for (const { id, res } of compiled) {
    for (const re of res) {
      if (re.test(clean)) {
        const label = (AVAILABLE_NOTIFICATIONS as Record<string, string>)[id] ?? id;
        return { id, label };
      }
    }
  }
  return undefined;
}

export async function fireNotification(title: string, body: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await TorchZhylaForeground.notify(nextNotificationId++, title, body);
  } catch (e) {
    console.warn('[notificationService] fire failed', e);
  }
}
