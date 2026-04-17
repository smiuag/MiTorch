import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { loadSettings, saveSettings, AppSettings } from '../storage/settingsStorage';
import { loadLayout, saveLayout } from '../storage/layoutStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const [settings, setSettings] = useState<AppSettings>({ fontSize: 14 });
  const [gridSize, setGridSize] = useState(11);

  useEffect(() => {
    loadSettings().then(setSettings);
    loadLayout().then(layout => setGridSize(layout.gridSize));
  }, []);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    saveSettings(updated);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>{'< Volver'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Configuración</Text>
      </View>

      <ScrollView style={styles.section} contentContainerStyle={styles.sectionContent}>
        <TouchableOpacity
          style={[styles.row, styles.configBtn]}
          onPress={() => navigation.navigate('LayoutEditor')}
        >
          <Text style={styles.configBtnText}>Configurar layout ⚙️</Text>
        </TouchableOpacity>

        <View style={[styles.row, styles.marginTop]}>
          <View style={styles.rowInfo}>
            <Text style={styles.rowTitle}>Tamaño de grid</Text>
            <Text style={styles.rowDesc}>
              Selecciona el tamaño de la cuadrícula de botones.
            </Text>
          </View>
          <View style={styles.gridSizeControls}>
            {[11, 10, 9, 8].map(size => (
              <TouchableOpacity
                key={size}
                style={[
                  styles.gridSizeBtn,
                  gridSize === size && styles.gridSizeBtnActive,
                ]}
                onPress={async () => {
                  const layout = await loadLayout();
                  layout.gridSize = size;
                  await saveLayout(layout);
                  setGridSize(size);
                }}
              >
                <Text style={styles.gridSizeBtnText}>{size}×{size}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={[styles.row, styles.marginTop]}>
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
            >
              <Text style={[styles.fontBtnText, settings.fontSize <= 10 && styles.fontBtnTextDisabled]}>−</Text>
            </TouchableOpacity>
            <Text style={styles.fontSizeValue}>{settings.fontSize}</Text>
            <TouchableOpacity
              style={[styles.fontBtn, settings.fontSize >= 20 && styles.fontBtnDisabled]}
              onPress={() => settings.fontSize < 20 && updateSetting('fontSize', settings.fontSize + 1)}
            >
              <Text style={[styles.fontBtnText, settings.fontSize >= 20 && styles.fontBtnTextDisabled]}>+</Text>
            </TouchableOpacity>
          </View>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  orientationRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  rowInfo: {
    flex: 1,
    marginRight: 12,
    marginBottom: 0,
  },
  orientationRowInfo: {
    flex: 0,
    marginRight: 0,
    marginBottom: 12,
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
  orientationControls: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    width: '100%',
  },
  orientBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1a1a1a',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  orientBtnFlex: {
    flex: 1,
  },
  orientBtnActive: {
    backgroundColor: '#0a3a0a',
    borderColor: '#0c0',
  },
  orientBtnText: {
    color: '#ccc',
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  configBtn: {
    justifyContent: 'center',
    backgroundColor: '#0a2a0a',
    borderColor: '#0c0',
  },
  configBtnText: {
    color: '#0c0',
    fontSize: 14,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  sectionLabel: {
    color: '#666',
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  gridSizeControls: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  gridSizeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1a1a1a',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#333',
  },
  gridSizeBtnActive: {
    backgroundColor: '#0a3a0a',
    borderColor: '#0c0',
  },
  gridSizeBtnText: {
    color: '#ccc',
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
});
