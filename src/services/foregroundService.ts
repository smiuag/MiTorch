import { Linking, PermissionsAndroid, Platform } from 'react-native';
import TorchZhylaForeground from '../../modules/torchzhyla-foreground';

const APP_PACKAGE = 'com.smiaug.torchzhyla';

export async function openNotificationSettings(): Promise<void> {
  if (Platform.OS !== 'android') {
    Linking.openSettings();
    return;
  }
  try {
    await Linking.sendIntent('android.settings.APP_NOTIFICATION_SETTINGS', [
      { key: 'android.provider.extra.APP_PACKAGE', value: APP_PACKAGE },
    ]);
  } catch (e) {
    console.warn('[foregroundService] openNotificationSettings intent failed, falling back', e);
    Linking.openSettings();
  }
}

export type NotificationPermissionResult = 'granted' | 'denied' | 'blocked' | 'unsupported';

export async function requestNotificationPermission(): Promise<NotificationPermissionResult> {
  if (Platform.OS !== 'android') return 'unsupported';
  if (Platform.Version < 33) return 'granted';
  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    );
    if (result === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
    if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'blocked';
    return 'denied';
  } catch (e) {
    console.warn('[foregroundService] permission request failed', e);
    return 'denied';
  }
}

async function ensureNotificationPermission(): Promise<boolean> {
  const result = await requestNotificationPermission();
  return result === 'granted' || result === 'unsupported';
}

export async function startBackgroundConnection(serverName: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  const allowed = await ensureNotificationPermission();
  if (!allowed) {
    console.warn(
      '[foregroundService] notification permission denied; background connection will not survive screen lock'
    );
    return;
  }
  try {
    await TorchZhylaForeground.start('TorchZhyla conectado', `Manteniendo conexión con ${serverName}`);
  } catch (e) {
    console.warn('[foregroundService] start failed', e);
  }
}

export async function stopBackgroundConnection(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await TorchZhylaForeground.stop();
  } catch (e) {
    console.warn('[foregroundService] stop failed', e);
  }
}
