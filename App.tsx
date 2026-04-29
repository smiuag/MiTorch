import React from 'react';
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
import { TriggersScreen } from './src/screens/TriggersScreen';
import { TriggerEditorScreen } from './src/screens/TriggerEditorScreen';
import { MySoundsScreen } from './src/screens/MySoundsScreen';
import { UserVariablesScreen } from './src/screens/UserVariablesScreen';
import { SoundProvider } from './src/contexts/SoundContext';
import { FloatingMessagesProvider } from './src/contexts/FloatingMessagesContext';

Sentry.init({
  dsn: 'https://95bdcaa4f3edd2996d85375dd2f12807@o4511280046735360.ingest.de.sentry.io/4511280058597456',
  enabled: !__DEV__,
  tracesSampleRate: 0.0,
  integrations: [
    captureConsoleIntegration({ levels: ['warn', 'error'] }),
  ],
});

const Stack = createNativeStackNavigator<RootStackParamList>();

function App() {
  return (
    <SafeAreaProvider>
    <SoundProvider>
      <FloatingMessagesProvider>
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
            options={{
              headerShown: false,
              title: 'Settings',
            }}
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
        </Stack.Navigator>
      </NavigationContainer>
      </FloatingMessagesProvider>
    </SoundProvider>
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(App);
