import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './src/types';
import { ServerListScreen } from './src/screens/ServerListScreen';
import { TerminalScreen } from './src/screens/TerminalScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SoundProvider } from './src/contexts/SoundContext';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SoundProvider>
      <NavigationContainer
        theme={DarkTheme}
        documentTitle={{
          enabled: false,
          formatter: (options) => `BlowTorch - ${options.title}`,
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
              accessibilityLabel: 'Server List Screen',
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
              accessibilityLabel: 'Settings Screen',
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SoundProvider>
  );
}
