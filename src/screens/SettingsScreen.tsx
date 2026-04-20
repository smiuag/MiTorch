import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { loadSettings, saveSettings, AppSettings } from '../storage/settingsStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const [settings, setSettings] = useState<AppSettings>({ fontSize: 14, encoding: 'utf8', uiMode: 'completo', onboardingDone: false });
  const [encodingModalVisible, setEncodingModalVisible] = useState(false);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);


  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    let updated = { ...settings, [key]: value };

    // When switching to blind mode, auto-set encoding to latin1 (ISO-8859-1)
    if (key === 'uiMode' && value === 'blind') {
      updated = { ...updated, encoding: 'latin1' };
    }

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

        {/* Encoding Section */}
        <View style={[styles.sectionHeader, styles.marginTop]}>
          <Text style={styles.sectionTitle}>Codificación de caracteres</Text>
        </View>

        <View style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.rowTitle}>Codificación</Text>
            <Text style={styles.rowDesc}>
              {settings.uiMode === 'blind' ? 'Automáticamente ISO-8859-1 en blind mode' : 'Selecciona la codificación para la conexión'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.encodingBtn}
            onPress={() => setEncodingModalVisible(true)}
          >
            <Text style={styles.encodingBtnText}>
              {settings.encoding === 'utf8' ? 'UTF-8' : settings.encoding.toUpperCase()}
            </Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* Encoding Selector Modal */}
      <Modal
        visible={encodingModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEncodingModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.encodingModalContent}>
            <Text style={styles.encodingModalTitle}>Selecciona codificación</Text>
            <FlatList
              data={[
                { label: 'UTF-8 (recomendado)', value: 'utf8' },
                { label: 'ISO-8859-1 / Latin1', value: 'latin1' },
                { label: 'ASCII', value: 'ascii' },
                { label: 'CP437', value: 'cp437' },
                { label: 'CP869', value: 'cp869' },
                { label: 'ISO-8859-2', value: 'iso-8859-2' },
                { label: 'ISO-8859-3', value: 'iso-8859-3' },
                { label: 'ISO-8859-4', value: 'iso-8859-4' },
                { label: 'ISO-8859-15', value: 'iso-8859-15' },
                { label: 'ISO-8859-16', value: 'iso-8859-16' },
                { label: 'Windows-1250', value: 'windows-1250' },
                { label: 'Windows-1252', value: 'windows-1252' },
                { label: 'MACINTOSH', value: 'macintosh' },
              ]}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.encodingOption,
                    settings.encoding === item.value && styles.encodingOptionSelected,
                  ]}
                  onPress={() => {
                    updateSetting('encoding', item.value);
                    setEncodingModalVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.encodingOptionText,
                      settings.encoding === item.value && styles.encodingOptionTextSelected,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              )}
              scrollEnabled={true}
              nestedScrollEnabled={true}
            />
            <TouchableOpacity
              style={styles.encodingModalCloseBtn}
              onPress={() => setEncodingModalVisible(false)}
            >
              <Text style={styles.encodingModalCloseBtnText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
  encodingBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: '#0a3a0a',
    borderWidth: 1,
    borderColor: '#0c0',
  },
  encodingBtnDisabled: {
    backgroundColor: '#1a1a1a',
    borderColor: '#333',
  },
  encodingBtnText: {
    color: '#0c0',
    fontSize: 13,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  encodingBtnTextDisabled: {
    color: '#333',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  encodingModalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: '#333',
    overflow: 'hidden',
  },
  encodingModalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    padding: 16,
    fontFamily: 'monospace',
  },
  encodingOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  encodingOptionSelected: {
    backgroundColor: '#0a3a0a',
  },
  encodingOptionText: {
    color: '#888',
    fontSize: 14,
    fontFamily: 'monospace',
  },
  encodingOptionTextSelected: {
    color: '#0c0',
    fontWeight: 'bold',
  },
  encodingModalCloseBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0c0',
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  encodingModalCloseBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    fontFamily: 'monospace',
  },
});
