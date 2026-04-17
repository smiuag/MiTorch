import React from 'react';
import { useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './src/types';
import { ServerListScreen } from './src/screens/ServerListScreen';
import { TerminalScreen } from './src/screens/TerminalScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { LayoutEditorScreen } from './src/screens/LayoutEditorScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer theme={DarkTheme}>
      <StatusBar style="light" />
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
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Terminal"
          component={TerminalScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="LayoutEditor"
          component={LayoutEditorScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
