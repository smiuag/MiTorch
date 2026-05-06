import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';
import { captureConsoleIntegration } from '@sentry/core';
import { RootStackParamList } from './src/types';
import { ServerListScreen } from './src/screens/ServerListScreen';
import { TerminalScreen } from './src/screens/TerminalScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SettingsGeneralScreen } from './src/screens/settings/SettingsGeneralScreen';
import { SettingsAdvancedScreen } from './src/screens/settings/SettingsAdvancedScreen';
import { SettingsSystemScreen } from './src/screens/settings/SettingsSystemScreen';
import { SettingsGesturesScreen } from './src/screens/settings/SettingsGesturesScreen';
import { TriggersScreen } from './src/screens/TriggersScreen';
import { TriggerEditorScreen } from './src/screens/TriggerEditorScreen';
import { MySoundsScreen } from './src/screens/MySoundsScreen';
import { MyAmbientsScreen } from './src/screens/MyAmbientsScreen';
import { MapLibraryScreen } from './src/screens/MapLibraryScreen';
import { ConfigBackupScreen } from './src/screens/ConfigBackupScreen';
import { UserVariablesScreen } from './src/screens/UserVariablesScreen';
import { SoundProvider } from './src/contexts/SoundContext';
import { FloatingMessagesProvider } from './src/contexts/FloatingMessagesContext';
import { CountdownTimersProvider } from './src/contexts/CountdownTimersContext';
import { BlindKeyboardProvider } from './src/contexts/BlindKeyboardContext';
import { loadSettings } from './src/storage/settingsStorage';
import { applyScreenLock } from './src/utils/applyScreenLock';

Sentry.init({
  dsn: 'https://95bdcaa4f3edd2996d85375dd2f12807@o4511280046735360.ingest.de.sentry.io/4511280058597456',
  enabled: !__DEV__,
  tracesSampleRate: 0.0,
  integrations: [
    // Solo `error` — `warn` capturaba ruido benigno (audio focus en
    // background, refs legacy, etc.) que mancha el inbox sin aportar señal.
    // Los warnings siguen visibles en logcat para debug local; lo que
    // queremos en Sentry es lo que rompe experiencia del usuario.
    captureConsoleIntegration({ levels: ['error'] }),
  ],
});

const Stack = createNativeStackNavigator<RootStackParamList>();

function App() {
  // Aplica el bloqueo de orientación al arrancar — se respeta el setting
  // persistido. Si el user lo cambia desde Settings se reaplica desde ahí.
  useEffect(() => {
    (async () => {
      const s = await loadSettings();
      applyScreenLock(s.screenLockOrientation);
    })();
  }, []);

  return (
    <SafeAreaProvider>
    <SoundProvider>
      <FloatingMessagesProvider>
      <CountdownTimersProvider>
      <BlindKeyboardProvider>
      <NavigationContainer
        theme={DarkTheme}
        documentTitle={{
          enabled: false,
          formatter: (options) => `TorchZhyla - ${options?.title ?? ''}`,
        }}
      >
        <StatusBar hidden={true} />
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: '#111' },
            headerTintColor: '#00cc00',
            headerTitleStyle: { fontFamily: 'monospace' },
            contentStyle: { backgroundColor: '#000' },
          }}
        >
          <Stack.Screen
            name="ServerList"
            component={ServerListScreen}
            options={{
              headerShown: false,
              title: 'Server List',
            }}
          />
          <Stack.Screen
            name="Terminal"
            component={TerminalScreen}
            options={({ route }) => ({
              headerShown: false,
              title: `MUD Terminal - ${route.params?.server?.name || 'Conectando'}`,
              accessibilityLabel: `Terminal - ${route.params?.server?.name || 'Conectando'}`,
            })}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ headerShown: false, title: 'Settings' }}
          />
          <Stack.Screen
            name="SettingsGeneral"
            component={SettingsGeneralScreen}
            options={{ headerShown: false, title: 'General' }}
          />
          <Stack.Screen
            name="SettingsAdvanced"
            component={SettingsAdvancedScreen}
            options={{ headerShown: false, title: 'Avanzado' }}
          />
          <Stack.Screen
            name="SettingsSystem"
            component={SettingsSystemScreen}
            options={{ headerShown: false, title: 'Sistema' }}
          />
          <Stack.Screen
            name="SettingsGestures"
            component={SettingsGesturesScreen}
            options={{ headerShown: false, title: 'Configurar gestos' }}
          />
          <Stack.Screen
            name="Triggers"
            component={TriggersScreen}
            options={{ headerShown: false, title: 'Triggers' }}
          />
          <Stack.Screen
            name="TriggerEditor"
            component={TriggerEditorScreen}
            options={{ headerShown: false, title: 'Trigger Editor' }}
          />
          <Stack.Screen
            name="MySounds"
            component={MySoundsScreen}
            options={{ headerShown: false, title: 'Mis sonidos' }}
          />
          <Stack.Screen
            name="UserVariables"
            component={UserVariablesScreen}
            options={{ headerShown: false, title: 'Mis variables' }}
          />
          <Stack.Screen
            name="MyAmbients"
            component={MyAmbientsScreen}
            options={{ headerShown: false, title: 'Mis ambientes' }}
          />
          <Stack.Screen
            name="MyMaps"
            component={MapLibraryScreen}
            options={{ headerShown: false, title: 'Mis mapas' }}
          />
          <Stack.Screen
            name="ConfigBackup"
            component={ConfigBackupScreen}
            options={{ headerShown: false, title: 'Importar / exportar configuración' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
      </BlindKeyboardProvider>
      </CountdownTimersProvider>
      </FloatingMessagesProvider>
    </SoundProvider>
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(App);
