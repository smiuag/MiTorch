import { Platform } from 'react-native';
import TorchZhylaForeground from '../../modules/torchzhyla-foreground';

const ANSI_RE = /\x1b\[[0-9;]*m/g;

let nextNotificationId = 1000;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '');
}

export async function fireNotification(title: string, body: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await TorchZhylaForeground.notify(nextNotificationId++, title, body);
  } catch (e) {
    console.warn('[notificationService] fire failed', e);
  }
}
