import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './src/types';
import { ServerListScreen } from './src/screens/ServerListScreen';
import { TerminalScreen } from './src/screens/TerminalScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
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
          }}
        />
        <Stack.Screen
          name="Terminal"
          component={TerminalScreen}
          options={{
            headerShown: false,
            title: 'MUD Terminal',
          }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            headerShown: false,
            title: 'Settings',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
