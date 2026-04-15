import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './src/types';
import { ServerListScreen } from './src/screens/ServerListScreen';
import { TerminalScreen } from './src/screens/TerminalScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
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
          options={{ title: 'Terminal' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
