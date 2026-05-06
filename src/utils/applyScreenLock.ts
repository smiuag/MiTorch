import * as ScreenOrientation from 'expo-screen-orientation';

// Aplica el bloqueo de orientación de pantalla según el setting del usuario.
// `'none'` libera (rota con el dispositivo). `'vertical'` fuerza portrait.
// `'horizontal'` fuerza landscape (cualquier sentido).
//
// Se llama desde App.tsx al arrancar y desde SettingsSystemScreen al cambiar
// el valor — para que el efecto sea inmediato sin necesidad de reiniciar la
// app. Falla silenciosamente: si la API no está disponible (raro en bare
// workflow estable) la app sigue funcionando con la orientación que tenga.

export type ScreenLockOrientation = 'none' | 'horizontal' | 'vertical';

export async function applyScreenLock(value: ScreenLockOrientation): Promise<void> {
  try {
    if (value === 'vertical') {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
    } else if (value === 'horizontal') {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    } else {
      await ScreenOrientation.unlockAsync();
    }
  } catch (e) {
    console.warn('[applyScreenLock] failed:', e);
  }
}
