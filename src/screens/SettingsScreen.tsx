import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal, FlatList, Switch, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, GestureConfig } from '../types';
import { loadSettings, saveSettings, AppSettings, rebuildGestures, AVAILABLE_SOUNDS, rebuildSounds } from '../storage/settingsStorage';
import { DEFAULT_SETTINGS } from '../storage/settingsStorage';
import { blindModeService } from '../services/blindModeService';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const [settings, setSettings] = useState<AppSettings>(() => ({ ...DEFAULT_SETTINGS }));
  const [encodingModalVisible, setEncodingModalVisible] = useState(false);
  const [gestureModalVisible, setGestureModalVisible] = useState(false);
  const [soundModalVisible, setSoundModalVisible] = useState(false);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);


  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    let updated = { ...settings, [key]: value };

    // When switching to blind mode, auto-set encoding to latin1 (ISO-8859-1)
    if (key === 'uiMode' && value === 'blind') {
      updated = { ...updated, encoding: 'latin1' };
    }

    // Rebuild gestures when switching modes
    if (key === 'uiMode') {
      updated = rebuildGestures(updated);
      updated = rebuildSounds(updated);
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

        {/* Gestures Section - Only in complete mode */}
        {settings.uiMode === 'completo' && (
          <>
            <View style={[styles.sectionHeader, styles.marginTop]}>
              <Text style={styles.sectionTitle}>Atajos de gestos</Text>
            </View>

            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>Usar atajos de gestos</Text>
                <Text style={styles.rowDesc}>
                  Ejecuta comandos con gestos en la zona del terminal (doble tap, swipes).
                </Text>
              </View>
              <Switch
                value={settings.gesturesEnabled}
                onValueChange={(value) => updateSetting('gesturesEnabled', value)}
                trackColor={{ false: '#333', true: '#0c0' }}
                thumbColor={settings.gesturesEnabled ? '#000' : '#666'}
              />
            </View>

            {settings.gesturesEnabled && (
              <TouchableOpacity
                style={[styles.row, styles.gestureConfigBtn]}
                onPress={() => {
                  let gestures = settings.gestures || [];
                  let isFirstTime = false;
                  if (gestures.length === 0) {
                    gestures = DEFAULT_SETTINGS.gestures;
                    isFirstTime = true;
                  } else {
                    const validTypes = new Set(DEFAULT_SETTINGS.gestures.map(g => g.type));
                    gestures = gestures.filter(g => validTypes.has(g.type));
                  }
                  const updated = { ...settings, gestures };
                  setSettings(updated);
                  if (isFirstTime) {
                    saveSettings(updated);
                  }
                  setGestureModalVisible(true);
                }}
              >
                <Text style={styles.gestureConfigBtnText}>⚙ Configurar atajos</Text>
              </TouchableOpacity>
            )}
          </>
        )}

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
              {settings.encoding === 'utf8' ? 'UTF-8' : (settings.encoding || 'UTF-8').toUpperCase()}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Sounds Section */}
        <View style={[styles.sectionHeader, styles.marginTop]}>
          <Text style={styles.sectionTitle}>Sonidos</Text>
        </View>

        <View style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.rowTitle}>Usar sonidos</Text>
            <Text style={styles.rowDesc}>
              {settings.uiMode === 'blind'
                ? 'Sonidos activados por defecto en modo blind'
                : 'Activa sonidos para eventos del juego'}
            </Text>
          </View>
          <Switch
            value={settings.soundsEnabled}
            onValueChange={(value) => {
              const enabledSounds = Object.keys(settings.enabledSounds).reduce((acc, sound) => ({
                ...acc,
                [sound]: settings.uiMode === 'blind' ? true : false,
              }), {});
              updateSetting('soundsEnabled', value);
              updateSetting('enabledSounds', enabledSounds);
            }}
            trackColor={{ false: '#333', true: '#0c0' }}
            thumbColor={settings.soundsEnabled ? '#000' : '#666'}
          />
        </View>

        {settings.soundsEnabled && (
          <TouchableOpacity
            style={[styles.row, styles.gestureConfigBtn]}
            onPress={() => setSoundModalVisible(true)}
          >
            <Text style={styles.gestureConfigBtnText}>🔊 Configurar sonidos</Text>
          </TouchableOpacity>
        )}

      </ScrollView>

      {/* Gesture Configuration Modal */}
      <Modal
        visible={gestureModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setGestureModalVisible(false)}
      >
        <SafeAreaView style={styles.gestureModalContainer} edges={['top', 'left', 'right', 'bottom']}>
          <View style={styles.gestureModalHeader}>
            <TouchableOpacity
              onPress={() => setGestureModalVisible(false)}
              style={styles.gestureModalBackBtn}
            >
              <Text style={styles.gestureModalBackText}>{'< Volver'}</Text>
            </TouchableOpacity>
            <Text style={styles.gestureModalTitle}>Configurar atajos</Text>
          </View>

          <FlatList
            data={settings.gestures}
            keyExtractor={(item) => item.type}
            contentContainerStyle={styles.gestureListContent}
            renderItem={({ item, index }) => {
              const gestureSymbols: Record<string, string> = {
                'doubletap': '✌️',
                'swipe_up': '↑', 'swipe_down': '↓', 'swipe_left': '←', 'swipe_right': '→',
                'swipe_up_right': '↗', 'swipe_up_left': '↖', 'swipe_down_right': '↘', 'swipe_down_left': '↙',
                'twofingers_up': '↑', 'twofingers_down': '↓', 'twofingers_left': '←', 'twofingers_right': '→',
                'twofingers_up_right': '↗', 'twofingers_up_left': '↖', 'twofingers_down_right': '↘', 'twofingers_down_left': '↙',
                'pinch_in': '→ ←', 'pinch_out': '← →',
              };

              const getSection = (type: string) => {
                if (type === 'doubletap') return 'Doble tap';
                if (type.startsWith('swipe_')) return '1 dedo';
                if (type.startsWith('twofingers_')) return '2 dedos';
                if (type.startsWith('pinch_')) return 'Pinch';
                return '';
              };

              const currentSection = getSection(item.type);
              const prevSection = index > 0 ? getSection(settings.gestures[index - 1].type) : null;
              const showSectionHeader = currentSection !== prevSection;

              const symbol = gestureSymbols[item.type] || '';
              const isPinch = item.type.startsWith('pinch_');
              const isDoubleTap = item.type === 'doubletap';

              return (
                <View>
                  {showSectionHeader && (
                    <View style={styles.gestureSectionHeader}>
                      <Text style={styles.gestureSectionTitle}>{currentSection}</Text>
                    </View>
                  )}
                  <View style={item.enabled ? styles.gestureCardContainer : undefined}>
                    <View style={[styles.gestureCompactRow, item.enabled && styles.gestureCompactRowTop]}>
                      <Text style={styles.gestureSymbol}>{symbol}</Text>
                      {item.enabled ? (
                        <TextInput
                          style={styles.gestureCompactInput}
                          value={item.command}
                          onChangeText={(text) => {
                            const updated = settings.gestures.map(g =>
                              g.type === item.type ? { ...g, command: text } : g
                            );
                            updateSetting('gestures', updated);
                          }}
                          placeholder="cmd"
                          placeholderTextColor="#444"
                          maxLength={30}
                          autoCapitalize="none"
                          autoCorrect={false}
                          spellCheck={false}
                        />
                      ) : (
                        <View style={{ flex: 1, minHeight: 32 }} />
                      )}
                      <Switch
                        value={item.enabled}
                        onValueChange={(value) => {
                          const updated = settings.gestures.map(g =>
                            g.type === item.type ? { ...g, enabled: value } : g
                          );
                          updateSetting('gestures', updated);
                        }}
                        trackColor={{ false: '#333', true: '#0c0' }}
                        thumbColor={item.enabled ? '#000' : '#666'}
                      />
                    </View>
                    {item.enabled && (
                      <View style={styles.gestureKeyboardButtonsRow}>
                        <TouchableOpacity
                          style={[
                            styles.gestureKeyboardButton,
                            !item.opensKeyboard && styles.gestureKeyboardButtonActive,
                          ]}
                          onPress={() => {
                            const updated = settings.gestures.map(g =>
                              g.type === item.type ? { ...g, opensKeyboard: false } : g
                            );
                            updateSetting('gestures', updated);
                          }}
                        >
                          <Text
                            style={[
                              styles.gestureKeyboardButtonText,
                              !item.opensKeyboard && styles.gestureKeyboardButtonTextActive,
                            ]}
                          >
                            Automático
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.gestureKeyboardButton,
                            item.opensKeyboard && styles.gestureKeyboardButtonActive,
                          ]}
                          onPress={() => {
                            const updated = settings.gestures.map(g =>
                              g.type === item.type ? { ...g, opensKeyboard: true } : g
                            );
                            updateSetting('gestures', updated);
                          }}
                        >
                          <Text
                            style={[
                              styles.gestureKeyboardButtonText,
                              item.opensKeyboard && styles.gestureKeyboardButtonTextActive,
                            ]}
                          >
                            Con teclado
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              );
            }}
          />
        </SafeAreaView>
      </Modal>

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

      {/* Sounds Configuration Modal */}
      <Modal
        visible={soundModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSoundModalVisible(false)}
      >
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => setSoundModalVisible(false)}
              style={styles.backBtn}
            >
              <Text style={styles.backText}>{'< Volver'}</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Configurar Sonidos</Text>
          </View>

          <FlatList
            data={Object.entries(AVAILABLE_SOUNDS)}
            renderItem={({ item: [soundPath, soundLabel] }) => (
              <View style={styles.soundRow}>
                <View style={styles.soundRowInfo}>
                  <Text style={styles.rowTitle}>{soundLabel}</Text>
                </View>
                <TouchableOpacity
                  style={styles.soundPreviewBtn}
                  onPress={() => blindModeService.playSound(soundPath)}
                  accessible={true}
                  accessibilityLabel={`Preescuchar ${soundLabel}`}
                  accessibilityRole="button"
                >
                  <Text style={styles.soundPreviewBtnText}>🔊</Text>
                </TouchableOpacity>
                <Switch
                  value={settings.enabledSounds[soundPath] ?? false}
                  onValueChange={(value) => {
                    const updated = {
                      ...settings,
                      enabledSounds: {
                        ...settings.enabledSounds,
                        [soundPath]: value,
                      },
                    };
                    setSettings(updated);
                    saveSettings(updated);
                  }}
                  trackColor={{ false: '#333', true: '#0c0' }}
                  thumbColor={settings.enabledSounds[soundPath] ? '#000' : '#666'}
                />
              </View>
            )}
            keyExtractor={([soundPath]) => soundPath}
            scrollEnabled={true}
            contentContainerStyle={styles.sectionContent}
          />
        </SafeAreaView>
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
  gestureConfigBtn: {
    justifyContent: 'center',
    marginTop: 8,
  },
  gestureConfigBtnText: {
    color: '#0c0',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  gestureModalContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  gestureModalHeader: {
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  gestureModalBackBtn: {
    marginBottom: 8,
  },
  gestureModalBackText: {
    color: '#0c0',
    fontSize: 14,
    fontFamily: 'monospace',
  },
  gestureModalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  gestureListContent: {
    padding: 16,
    gap: 12,
  },
  gestureItem: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  gestureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  gestureName: {
    color: '#ccc',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  gestureInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  gestureInputLabel: {
    color: '#666',
    fontSize: 12,
    fontFamily: 'monospace',
    minWidth: 80,
  },
  gestureInputField: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    color: '#0c0',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  gestureSectionHeader: {
    backgroundColor: '#0a0a0a',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    marginTop: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#0c0',
  },
  gestureSectionTitle: {
    color: '#0c0',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  gestureCardContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 6,
    overflow: 'hidden',
  },
  gestureCompactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    gap: 10,
  },
  gestureCompactRowTop: {
    marginBottom: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
  },
  gestureSymbol: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0c0',
    minWidth: 24,
    textAlign: 'center',
  },
  pinchLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#666',
    backgroundColor: '#0a0a0a',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  gestureCompactInput: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    color: '#0c0',
    fontSize: 12,
    fontFamily: 'monospace',
    minHeight: 32,
  },
  keyboardLabel: {
    fontSize: 14,
    color: '#0c0',
  },
  gestureKeyboardButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  gestureKeyboardButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#333',
    alignItems: 'center',
  },
  gestureKeyboardButtonActive: {
    backgroundColor: '#0a3a0a',
    borderColor: '#0c0',
  },
  gestureKeyboardButtonText: {
    color: '#666',
    fontSize: 11,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  gestureKeyboardButtonTextActive: {
    color: '#0c0',
  },
  soundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    gap: 12,
  },
  soundRowInfo: {
    flex: 1,
  },
  soundPreviewBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1a1a2a',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#333',
  },
  soundPreviewBtnText: {
    fontSize: 18,
  },
});
