import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { loadSettings, saveSettings, AppSettings } from '../storage/settingsStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const [settings, setSettings] = useState<AppSettings>({ fontSize: 14 });

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);


  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    saveSettings(updated);
  };


  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessible={true}
          accessibilityLabel="Back"
          accessibilityRole="button"
          accessibilityHint="Return to server list"
        >
          <Text style={styles.backText}>{'< Volver'}</Text>
        </TouchableOpacity>
        <Text
          style={styles.title}
          accessible={true}
          accessibilityLabel="Settings"
          accessibilityRole="header"
        >
          Configuración
        </Text>
      </View>

      <ScrollView style={styles.section} contentContainerStyle={styles.sectionContent}>
        {/* Font Size Section - FIRST */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Configuración general</Text>
        </View>

        <View style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.rowTitle}>Tamaño de fuente</Text>
            <Text style={styles.rowDesc}>
              Tamaño de fuente del terminal y canales.
            </Text>
          </View>
          <View style={styles.fontSizeControls}>
            <TouchableOpacity
              style={[styles.fontBtn, settings.fontSize <= 10 && styles.fontBtnDisabled]}
              onPress={() => settings.fontSize > 10 && updateSetting('fontSize', settings.fontSize - 1)}
              accessible={true}
              accessibilityLabel="Decrease font size"
              accessibilityRole="button"
              accessibilityState={{ disabled: settings.fontSize <= 10 }}
              accessibilityHint={`Current size: ${settings.fontSize}px. Tap to decrease.`}
              accessibilityActions={settings.uiMode === 'blind' ? [{ name: 'decrement' }] : undefined}
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === 'decrement' && settings.fontSize > 10) {
                  updateSetting('fontSize', settings.fontSize - 1);
                }
              }}
            >
              <Text style={[styles.fontBtnText, settings.fontSize <= 10 && styles.fontBtnTextDisabled]}>−</Text>
            </TouchableOpacity>
            <Text
              style={styles.fontSizeValue}
              accessible={true}
              accessibilityLabel={`Font size: ${settings.fontSize} pixels`}
            >
              {settings.fontSize}
            </Text>
            <TouchableOpacity
              style={[styles.fontBtn, settings.fontSize >= 20 && styles.fontBtnDisabled]}
              onPress={() => settings.fontSize < 20 && updateSetting('fontSize', settings.fontSize + 1)}
              accessible={true}
              accessibilityLabel="Increase font size"
              accessibilityRole="button"
              accessibilityState={{ disabled: settings.fontSize >= 20 }}
              accessibilityHint={`Current size: ${settings.fontSize}px. Tap to increase.`}
              accessibilityActions={settings.uiMode === 'blind' ? [{ name: 'increment' }] : undefined}
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === 'increment' && settings.fontSize < 20) {
                  updateSetting('fontSize', settings.fontSize + 1);
                }
              }}
            >
              <Text style={[styles.fontBtnText, settings.fontSize >= 20 && styles.fontBtnTextDisabled]}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* UI Mode Section */}
        <View style={[styles.sectionHeader, styles.marginTop]}>
          <Text style={styles.sectionTitle}>Interfaz</Text>
        </View>

        <View style={styles.modeRow}>
          <View style={styles.rowInfo}>
            <Text style={styles.rowTitle}>Modo de interfaz</Text>
            <Text style={styles.rowDesc}>
              Mostrar todos los controles o solo lo esencial para lectores de pantalla.
            </Text>
          </View>
        </View>

        <View style={styles.modeButtonsRow}>
          <TouchableOpacity
            style={[
              styles.modeButton,
              settings.uiMode === 'completo' && styles.modeButtonActive,
            ]}
            onPress={() => updateSetting('uiMode', 'completo')}
            accessible={true}
            accessibilityLabel="Complete mode"
            accessibilityRole="radio"
            accessibilityState={{ selected: settings.uiMode === 'completo' }}
          >
            <Text
              style={[
                styles.modeButtonText,
                settings.uiMode === 'completo' && styles.modeButtonTextActive,
              ]}
            >
              Completo
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.modeButton,
              settings.uiMode === 'blind' && styles.modeButtonActive,
            ]}
            onPress={() => updateSetting('uiMode', 'blind')}
            accessible={true}
            accessibilityLabel="Blind mode"
            accessibilityRole="radio"
            accessibilityState={{ selected: settings.uiMode === 'blind' }}
          >
            <Text
              style={[
                styles.modeButtonText,
                settings.uiMode === 'blind' && styles.modeButtonTextActive,
              ]}
            >
              Blind mode
            </Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backBtn: {
    marginBottom: 8,
  },
  backText: {
    color: '#0c0',
    fontSize: 14,
    fontFamily: 'monospace',
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  section: {
    flex: 1,
  },
  sectionContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#0c0',
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  rowInfo: {
    flex: 1,
    marginRight: 12,
  },
  rowTitle: {
    color: '#ccc',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  rowDesc: {
    color: '#666',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  marginTop: {
    marginTop: 12,
  },
  fontSizeControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  fontBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0a3a0a',
    borderWidth: 1,
    borderColor: '#0c0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fontBtnDisabled: {
    backgroundColor: '#1a1a1a',
    borderColor: '#333',
  },
  fontBtnText: {
    color: '#0c0',
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  fontBtnTextDisabled: {
    color: '#333',
  },
  fontSizeValue: {
    color: '#0c0',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    minWidth: 30,
    textAlign: 'center',
  },
  modeRow: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 12,
  },
  modeButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#333',
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#0a3a0a',
    borderColor: '#0c0',
  },
  modeButtonText: {
    color: '#666',
    fontSize: 13,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  modeButtonTextActive: {
    color: '#0c0',
  },
});
