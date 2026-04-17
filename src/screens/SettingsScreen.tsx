import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { loadSettings, saveSettings, AppSettings } from '../storage/settingsStorage';
import { saveLayout, createDefaultLayout } from '../storage/layoutStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const [settings, setSettings] = useState<AppSettings>({ useChannels: true, fontSize: 14, useFloatingButtons: false, floatingOrientation: 'portrait' });

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    saveSettings(updated);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>{'< Volver'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Configuración</Text>
      </View>

      <View style={styles.section}>
        <View style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.rowTitle}>Gestionar canales</Text>
            <Text style={styles.rowDesc}>
              Separar los canales (chat, bando...) en pestañas con panel propio. Si se desactiva, los mensajes aparecen en la pantalla principal.
            </Text>
          </View>
          <Switch
            value={settings.useChannels}
            onValueChange={(v) => updateSetting('useChannels', v)}
            trackColor={{ false: '#333', true: '#0a5a0a' }}
            thumbColor={settings.useChannels ? '#0c0' : '#666'}
          />
        </View>

        <View style={[styles.row, styles.marginTop]}>
          <View style={styles.rowInfo}>
            <Text style={styles.rowTitle}>Usar botones flotantes</Text>
            <Text style={styles.rowDesc}>
              Modo alternativo de interfaz con botones flotantes en lugar de los controles tradicionales
            </Text>
          </View>
          <Switch
            value={settings.useFloatingButtons}
            onValueChange={(v) => updateSetting('useFloatingButtons', v)}
            trackColor={{ false: '#333', true: '#0a5a0a' }}
            thumbColor={settings.useFloatingButtons ? '#0c0' : '#666'}
          />
        </View>

        {settings.useFloatingButtons && (
          <>
            <View style={[styles.row, styles.marginTop, styles.orientationRow]}>
              <View style={[styles.rowInfo, styles.orientationRowInfo]}>
                <Text style={styles.rowTitle}>Orientación preferida</Text>
                <Text style={styles.rowDesc}>
                  Orientación por defecto para configurar el layout (la pantalla se adapta al girar el dispositivo)
                </Text>
              </View>
              <View style={styles.orientationControls}>
                <TouchableOpacity
                  style={[styles.orientBtn, styles.orientBtnFlex, settings.floatingOrientation === 'portrait' && styles.orientBtnActive]}
                  onPress={() => updateSetting('floatingOrientation', 'portrait')}
                >
                  <Text style={styles.orientBtnText}>Vertical</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.orientBtn, styles.orientBtnFlex, settings.floatingOrientation === 'landscape' && styles.orientBtnActive]}
                  onPress={() => updateSetting('floatingOrientation', 'landscape')}
                >
                  <Text style={styles.orientBtnText}>Horizontal</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.row, styles.marginTop, styles.defaultBtn]}
              onPress={() => {
                Alert.alert(
                  'Cargar configuración por defecto',
                  '¿Reemplazar la configuración actual con la configuración por defecto? Se perderá la configuración actual.',
                  [
                    { text: 'Cancelar', onPress: () => {}, style: 'cancel' },
                    {
                      text: 'Cargar',
                      onPress: async () => {
                        const defaultLayout = createDefaultLayout(settings.floatingOrientation);
                        await saveLayout(defaultLayout);
                      },
                      style: 'destructive',
                    },
                  ]
                );
              }}
            >
              <Text style={styles.defaultBtnText}>Cargar configuración por defecto</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.row, styles.marginTop, styles.configBtn]}
              onPress={() => navigation.navigate('LayoutEditor')}
            >
              <Text style={styles.configBtnText}>Configurar pantalla flotante →</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={[styles.row, styles.marginTop]}>
          <View style={styles.rowInfo}>
            <Text style={styles.rowTitle}>Tamaño de fuente</Text>
            <Text style={styles.rowDesc}>
              Ajusta el tamaño de letra en la terminal y canales
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
      </View>
    </View>
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
    paddingHorizontal: 16,
    paddingTop: 16,
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
  defaultBtn: {
    justifyContent: 'center',
    backgroundColor: '#2a1a0a',
    borderColor: '#cc9933',
  },
  defaultBtnText: {
    color: '#cc9933',
    fontSize: 14,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
});
