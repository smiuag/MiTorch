import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { loadSettings, saveSettings, AppSettings, rebuildGestures } from '../storage/settingsStorage';
import { DEFAULT_SETTINGS } from '../storage/settingsStorage';
import { speechQueue } from '../services/speechQueueService';
import { settingsStyles as s } from './settings/settingsShared';
import { SettingsTerminalScreen } from './settings/SettingsTerminalScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

// SettingsScreen actúa como router según el origen:
//   - Desde Terminal (sourceLocation='terminal'): renderiza la versión inline
//     compacta `SettingsTerminalScreen` con solo lo básico (sin Avanzado, sin
//     codificación, sin selector de modo, sin editor de gestos).
//   - Desde fuera (ServerList, default): menú con selector Modo Normal/
//     Accesible top-level + 3 categorías navegables (General/Avanzado/Sistema).

export function SettingsScreen(props: Props) {
  const sourceLocation = props.route.params?.sourceLocation ?? 'serverlist';
  if (sourceLocation === 'terminal') {
    return <SettingsTerminalScreen {...props} />;
  }
  return <SettingsRootMenu {...props} />;
}

function SettingsRootMenu({ navigation, route }: Props) {
  const sourceLocation = route.params?.sourceLocation ?? 'serverlist';
  const [settings, setSettings] = useState<AppSettings>(() => ({ ...DEFAULT_SETTINGS }));

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const updateMode = (value: 'completo' | 'blind') => {
    let updated: AppSettings = { ...settings, uiMode: value };
    updated = rebuildGestures(updated);
    setSettings(updated);
    saveSettings(updated);
    speechQueue.applyConfig(updated);
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backText}>{'< Volver'}</Text>
        </TouchableOpacity>
        <Text style={s.title} accessibilityRole="header">Configuración</Text>
      </View>

      <ScrollView style={s.section} contentContainerStyle={s.sectionContent}>
        {/* Selector de modo top-level — siempre visible y a primer plano. */}
        <View style={localStyles.modeButtonsRow}>
          <TouchableOpacity
            style={[localStyles.modeButton, settings.uiMode === 'completo' && localStyles.modeButtonActive]}
            onPress={() => updateMode('completo')}
            accessibilityRole="radio"
            accessibilityState={{ selected: settings.uiMode === 'completo' }}
            accessibilityLabel="Modo normal"
          >
            <Text style={[localStyles.modeButtonText, settings.uiMode === 'completo' && localStyles.modeButtonTextActive]}>
              Normal
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[localStyles.modeButton, settings.uiMode === 'blind' && localStyles.modeButtonActive]}
            onPress={() => updateMode('blind')}
            accessibilityRole="radio"
            accessibilityState={{ selected: settings.uiMode === 'blind' }}
            accessibilityLabel="Modo accesible"
          >
            <Text style={[localStyles.modeButtonText, settings.uiMode === 'blind' && localStyles.modeButtonTextActive]}>
              Accesible
            </Text>
          </TouchableOpacity>
        </View>

        <CategoryRow
          title="General"
          desc="Apariencia, sonido y voz."
          onPress={() => navigation.navigate('SettingsGeneral', { sourceLocation })}
        />
        <CategoryRow
          title="Avanzado"
          desc="Gestos y datos del usuario (triggers, sonidos, mapas, ambientes, configuración)."
          onPress={() => navigation.navigate('SettingsAdvanced', { sourceLocation })}
        />
        <CategoryRow
          title="Sistema"
          desc="Conexión, codificación, notificaciones y logs."
          onPress={() => navigation.navigate('SettingsSystem', { sourceLocation })}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

interface CategoryRowProps {
  title: string;
  desc: string;
  onPress: () => void;
}

function CategoryRow({ title, desc, onPress }: CategoryRowProps) {
  return (
    <TouchableOpacity
      style={[s.row, localStyles.categoryRow]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${desc}`}
    >
      <View style={s.rowInfo}>
        <Text style={localStyles.categoryTitle}>{title}</Text>
        <Text style={s.rowDesc}>{desc}</Text>
      </View>
      <Text style={localStyles.categoryChevron}>›</Text>
    </TouchableOpacity>
  );
}

const localStyles = StyleSheet.create({
  modeButtonsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  modeButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#333',
    alignItems: 'center',
  },
  modeButtonActive: { backgroundColor: '#0a3a0a', borderColor: '#0c0' },
  modeButtonText: { color: '#666', fontSize: 14, fontWeight: 'bold', fontFamily: 'monospace' },
  modeButtonTextActive: { color: '#0c0' },
  categoryRow: { paddingVertical: 20 },
  categoryTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', fontFamily: 'monospace', marginBottom: 4 },
  categoryChevron: { color: '#0c0', fontSize: 24, fontWeight: 'bold', marginLeft: 8 },
});
