import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal, FlatList, Switch, TextInput, Alert } from 'react-native';
import { requestNotificationPermission, openNotificationSettings } from '../services/foregroundService';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, GestureConfig } from '../types';
import { loadSettings, saveSettings, AppSettings, rebuildGestures } from '../storage/settingsStorage';
import { DEFAULT_SETTINGS } from '../storage/settingsStorage';
import { blindModeService } from '../services/blindModeService';
import { logService, ExportRange, slugifyServerName } from '../services/logService';
import { loadServers } from '../storage/serverStorage';
import { LogsMaxLines } from '../storage/settingsStorage';
import { activeConnection } from '../services/activeConnection';
import { CANONICAL_PROMPT } from '../services/promptParser';
import { speechQueue } from '../services/speechQueueService';

const SPEECH_CHAR_DURATION_MIN = 5;
const SPEECH_CHAR_DURATION_MAX = 150;
const SPEECH_CHAR_DURATION_STEP = 5;

type Props = {
  navigation: NativeStackScreenProps<RootStackParamList, 'Settings'>['navigation'];
  route?: NativeStackScreenProps<RootStackParamList, 'Settings'>['route'];
  sourceLocation?: 'terminal' | 'serverlist';
  onFontSizeChange?: (size: number) => void;
  onSoundToggle?: (enabled: boolean) => void;
  onGesturesEnabledChange?: (enabled: boolean) => void;
};

export function SettingsScreen({ navigation, sourceLocation = 'serverlist', onFontSizeChange, onSoundToggle, onGesturesEnabledChange }: Props) {
  const [settings, setSettings] = useState<AppSettings>(() => ({ ...DEFAULT_SETTINGS }));
  const [encodingModalVisible, setEncodingModalVisible] = useState(false);
  const [gestureModalVisible, setGestureModalVisible] = useState(false);
  const [exportRangeModalVisible, setExportRangeModalVisible] = useState(false);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);


  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    let updated = { ...settings, [key]: value };

    // Rebuild gestures when switching modes
    if (key === 'uiMode') {
      updated = rebuildGestures(updated);
    }

    setSettings(updated);
    saveSettings(updated);

    if (key === 'speechCharDurationMs') {
      speechQueue.setCharDurationMs(value as number);
    }

    // Trigger callbacks for immediate changes in terminal mode
    if (sourceLocation === 'terminal') {
      if (key === 'fontSize' && onFontSizeChange) {
        onFontSizeChange(value as number);
      }
      if (key === 'soundsEnabled' && onSoundToggle) {
        onSoundToggle(value as boolean);
      }
      if (key === 'gesturesEnabled' && onGesturesEnabledChange) {
        onGesturesEnabledChange(value as boolean);
      }
    }
  };


  const handleApplyPrompt = () => {
    if (!activeConnection.isAnyConnected()) {
      Alert.alert(
        'No hay conexión activa',
        'Conéctate primero al personaje y vuelve a intentarlo desde aquí.',
      );
      return;
    }
    Alert.alert(
      'Aplicar prompt TorchZhyla',
      'Esto sobrescribirá tu prompt actual en el MUD para este personaje. Es necesario para que las variables (vida, energía, salidas, espejos, pieles…) se capturen y puedan usarse en triggers. ¿Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aplicar',
          onPress: () => {
            const ok =
              activeConnection.sendActive(`prompt ${CANONICAL_PROMPT}`) &&
              activeConnection.sendActive(`promptcombate ${CANONICAL_PROMPT}`);
            if (ok) {
              Alert.alert(
                'Prompt aplicado',
                'El MUD recibió el nuevo prompt. A partir de ahora capturaremos las variables.',
              );
            } else {
              Alert.alert(
                'No se pudo enviar',
                'La conexión se ha perdido. Reconéctate y vuelve a intentarlo.',
              );
            }
          },
        },
      ],
    );
  };

  // When opened from the terminal modal, the modal already provides its
  // own header (close button) and safe-area insets. Rendering another
  // SafeAreaView here breaks the ScrollView height, so use a plain View
  // and skip the redundant inner header.
  const isInTerminalModal = sourceLocation === 'terminal';
  const Container: React.ComponentType<any> = isInTerminalModal ? View : SafeAreaView;
  const containerProps = isInTerminalModal
    ? { style: styles.container }
    : { style: styles.container, edges: ['top', 'left', 'right', 'bottom'] };

  return (
    <Container {...containerProps}>
      {!isInTerminalModal && (
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
      )}

      <ScrollView
        style={styles.section}
        contentContainerStyle={styles.sectionContent}
        nestedScrollEnabled={true}
        showsVerticalScrollIndicator={true}
      >
        {/* Mode Buttons - FIRST (only show outside terminal modal) */}
        {sourceLocation !== 'terminal' && (
          <View style={styles.modeButtonsRow}>
            <TouchableOpacity
              style={[
                styles.modeButton,
                settings.uiMode === 'completo' && styles.modeButtonActive,
              ]}
              onPress={() => updateSetting('uiMode', 'completo')}
              accessible={true}
              accessibilityLabel="Normal mode"
              accessibilityRole="radio"
              accessibilityState={{ selected: settings.uiMode === 'completo' }}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  settings.uiMode === 'completo' && styles.modeButtonTextActive,
                ]}
              >
                Normal
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modeButton,
                settings.uiMode === 'blind' && styles.modeButtonActive,
              ]}
              onPress={() => updateSetting('uiMode', 'blind')}
              accessible={true}
              accessibilityLabel="Accessible mode"
              accessibilityRole="radio"
              accessibilityState={{ selected: settings.uiMode === 'blind' }}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  settings.uiMode === 'blind' && styles.modeButtonTextActive,
                ]}
              >
                Accesible
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Configuración general Section */}
        <View style={[styles.sectionHeader, styles.marginTop]}>
          <Text style={styles.sectionTitle}>Configuración general</Text>
        </View>

        {/* Font Size */}
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

        {/* Encoding Section - Only show outside terminal modal */}
        {sourceLocation !== 'terminal' && (
          <View style={styles.row}>
            <View style={styles.rowInfo}>
              <Text style={styles.rowTitle}>Codificación</Text>
              <Text style={styles.rowDesc}>
                Selecciona la codificación para la conexión
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
        )}

        {/* Gestures Section - Only in complete mode */}
        {settings.uiMode === 'completo' && (
          <View style={styles.row}>
            <View style={styles.rowInfo}>
              <Text style={styles.rowTitle}>Usar atajos de gestos</Text>
              <Text style={styles.rowDesc}>
                Ejecuta comandos con gestos en la zona del terminal (doble tap, swipes).
              </Text>
            </View>
            {settings.gesturesEnabled && (
              <TouchableOpacity
                style={styles.configIconBtn}
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
                <Text style={styles.configIcon}>✏️</Text>
              </TouchableOpacity>
            )}
            <Switch
              value={settings.gesturesEnabled}
              onValueChange={(value) => {
                updateSetting('gesturesEnabled', value);
                if (value) {
                  let gestures = settings.gestures || [];
                  let isFirstTime = false;
                  if (gestures.length === 0) {
                    gestures = DEFAULT_SETTINGS.gestures;
                    isFirstTime = true;
                  } else {
                    const validTypes = new Set(DEFAULT_SETTINGS.gestures.map(g => g.type));
                    gestures = gestures.filter(g => validTypes.has(g.type));
                  }
                  const updated = { ...settings, gesturesEnabled: true, gestures };
                  setSettings(updated);
                  if (isFirstTime) {
                    saveSettings(updated);
                  }
                  setGestureModalVisible(true);
                }
              }}
              trackColor={{ false: '#333', true: '#0c0' }}
              thumbColor={settings.gesturesEnabled ? '#000' : '#666'}
            />
          </View>
        )}


        {/* UI Section */}
        <View style={[styles.sectionHeader, styles.marginTop]}>
          <Text style={styles.sectionTitle}>UI</Text>
        </View>

        {/* Sounds Section */}
        <View style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.rowTitle}>Usar sonidos</Text>
            <Text style={styles.rowDesc}>
              Kill-switch global. Configura qué sonidos suenan en Triggers.
            </Text>
          </View>
          <Switch
            value={settings.soundsEnabled}
            onValueChange={(value) => {
              const updated = { ...settings, soundsEnabled: value };
              setSettings(updated);
              saveSettings(updated);
              if (sourceLocation === 'terminal' && onSoundToggle) {
                onSoundToggle(value);
              }
            }}
            trackColor={{ false: '#333', true: '#0c0' }}
            thumbColor={settings.soundsEnabled ? '#000' : '#666'}
          />
        </View>

        {/* Pantalla encendida */}
        <View style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.rowTitle}>Mantener pantalla encendida</Text>
            <Text style={styles.rowDesc}>
              Evita que el teléfono se bloquee por inactividad mientras estás conectado a un personaje.
            </Text>
          </View>
          <Switch
            value={settings.keepAwakeEnabled}
            onValueChange={(value) => updateSetting('keepAwakeEnabled', value)}
            trackColor={{ false: '#333', true: '#0c0' }}
            thumbColor={settings.keepAwakeEnabled ? '#000' : '#666'}
          />
        </View>

        {/* Velocidad de lectura */}
        <View style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.rowTitle}>Velocidad de lectura</Text>
            <Text style={styles.rowDesc}>
              Tiempo estimado por carácter al encolar mensajes para el lector de pantalla. Más bajo = los avisos siguientes empiezan antes (lector rápido). Más alto = más espacio entre avisos (lector lento). Sin efecto si el lector está apagado.
            </Text>
          </View>
          <View style={styles.fontSizeControls}>
            <TouchableOpacity
              style={[
                styles.fontBtn,
                settings.speechCharDurationMs <= SPEECH_CHAR_DURATION_MIN && styles.fontBtnDisabled,
              ]}
              onPress={() => {
                if (settings.speechCharDurationMs > SPEECH_CHAR_DURATION_MIN) {
                  updateSetting(
                    'speechCharDurationMs',
                    Math.max(SPEECH_CHAR_DURATION_MIN, settings.speechCharDurationMs - SPEECH_CHAR_DURATION_STEP),
                  );
                }
              }}
              accessible={true}
              accessibilityLabel="Decrease speech duration"
              accessibilityRole="button"
              accessibilityState={{ disabled: settings.speechCharDurationMs <= SPEECH_CHAR_DURATION_MIN }}
              accessibilityHint={`Current: ${settings.speechCharDurationMs} ms per character. Tap to decrease.`}
              accessibilityActions={settings.uiMode === 'blind' ? [{ name: 'decrement' }] : undefined}
              onAccessibilityAction={(event) => {
                if (
                  event.nativeEvent.actionName === 'decrement' &&
                  settings.speechCharDurationMs > SPEECH_CHAR_DURATION_MIN
                ) {
                  updateSetting(
                    'speechCharDurationMs',
                    Math.max(SPEECH_CHAR_DURATION_MIN, settings.speechCharDurationMs - SPEECH_CHAR_DURATION_STEP),
                  );
                }
              }}
            >
              <Text
                style={[
                  styles.fontBtnText,
                  settings.speechCharDurationMs <= SPEECH_CHAR_DURATION_MIN && styles.fontBtnTextDisabled,
                ]}
              >
                −
              </Text>
            </TouchableOpacity>
            <Text
              style={styles.fontSizeValue}
              accessible={true}
              accessibilityLabel={`Speech duration: ${settings.speechCharDurationMs} milliseconds per character`}
            >
              {settings.speechCharDurationMs}
            </Text>
            <TouchableOpacity
              style={[
                styles.fontBtn,
                settings.speechCharDurationMs >= SPEECH_CHAR_DURATION_MAX && styles.fontBtnDisabled,
              ]}
              onPress={() => {
                if (settings.speechCharDurationMs < SPEECH_CHAR_DURATION_MAX) {
                  updateSetting(
                    'speechCharDurationMs',
                    Math.min(SPEECH_CHAR_DURATION_MAX, settings.speechCharDurationMs + SPEECH_CHAR_DURATION_STEP),
                  );
                }
              }}
              accessible={true}
              accessibilityLabel="Increase speech duration"
              accessibilityRole="button"
              accessibilityState={{ disabled: settings.speechCharDurationMs >= SPEECH_CHAR_DURATION_MAX }}
              accessibilityHint={`Current: ${settings.speechCharDurationMs} ms per character. Tap to increase.`}
              accessibilityActions={settings.uiMode === 'blind' ? [{ name: 'increment' }] : undefined}
              onAccessibilityAction={(event) => {
                if (
                  event.nativeEvent.actionName === 'increment' &&
                  settings.speechCharDurationMs < SPEECH_CHAR_DURATION_MAX
                ) {
                  updateSetting(
                    'speechCharDurationMs',
                    Math.min(SPEECH_CHAR_DURATION_MAX, settings.speechCharDurationMs + SPEECH_CHAR_DURATION_STEP),
                  );
                }
              }}
            >
              <Text
                style={[
                  styles.fontBtnText,
                  settings.speechCharDurationMs >= SPEECH_CHAR_DURATION_MAX && styles.fontBtnTextDisabled,
                ]}
              >
                +
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Notifications Section */}
        <View style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.rowTitle}>Usar notificaciones</Text>
            <Text style={styles.rowDesc}>
              Permite que los triggers disparen notificaciones del sistema. Solo se muestran cuando la app no está en primer plano. Configura las notificaciones concretas en Triggers.
            </Text>
          </View>
          <Switch
            value={settings.notificationsEnabled}
            onValueChange={async (value) => {
              if (value) {
                const result = await requestNotificationPermission();
                if (result === 'blocked') {
                  Alert.alert(
                    'Permiso necesario',
                    'Has denegado el permiso de notificaciones. Para recibir avisos, ábrelo en los ajustes del sistema.',
                    [
                      { text: 'Cancelar', style: 'cancel' },
                      { text: 'Abrir ajustes', onPress: () => openNotificationSettings() },
                    ]
                  );
                } else if (result === 'denied') {
                  Alert.alert(
                    'Permiso denegado',
                    'Sin permiso de notificaciones no podremos mostrarte avisos.'
                  );
                }
              }
              const updated = value
                ? { ...settings, notificationsEnabled: true, backgroundConnectionEnabled: true }
                : { ...settings, notificationsEnabled: false };
              setSettings(updated);
              saveSettings(updated);
            }}
            trackColor={{ false: '#333', true: '#0c0' }}
            thumbColor={settings.notificationsEnabled ? '#000' : '#666'}
          />
        </View>

        {/* Background connection */}
        <View style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.rowTitle}>Conexión en segundo plano</Text>
            <Text style={styles.rowDesc}>
              Mantiene el MUD conectado aunque la pantalla se bloquee o la app pase a segundo plano. Necesario para que los triggers sigan procesando líneas y para que las notificaciones lleguen.
            </Text>
          </View>
          <Switch
            value={settings.backgroundConnectionEnabled}
            onValueChange={(value) => updateSetting('backgroundConnectionEnabled', value)}
            trackColor={{ false: '#333', true: '#0c0' }}
            thumbColor={settings.backgroundConnectionEnabled ? '#000' : '#666'}
          />
        </View>

        {/* Logs Section */}
        <View style={[styles.sectionHeader, styles.marginTop]}>
          <Text style={styles.sectionTitle}>Logs</Text>
        </View>

        <View style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.rowTitle}>Guardar logs para soporte</Text>
            <Text style={styles.rowDesc}>
              Captura la actividad del terminal para exportarla como HTML (útil para compartir con soporte o subir a deathlogs.com). Desactivar borra todos los logs.
            </Text>
          </View>
          <Switch
            value={settings.logsEnabled}
            onValueChange={(value) => {
              const updated = { ...settings, logsEnabled: value };
              setSettings(updated);
              saveSettings(updated);
              logService.configure(value, updated.logsMaxLines);
            }}
            trackColor={{ false: '#333', true: '#0c0' }}
            thumbColor={settings.logsEnabled ? '#000' : '#666'}
          />
        </View>

        {settings.logsEnabled && (
          <>
            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>Tamaño máximo</Text>
                <Text style={styles.rowDesc}>
                  Cuántas líneas como máximo guarda el log. Al superar el tope se borran las más antiguas.
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
                  {([5000, 10000, 20000, 50000, 100000] as LogsMaxLines[]).map((n) => {
                    const active = settings.logsMaxLines === n;
                    const labelMB = n <= 5000 ? '~1 MB' : n <= 10000 ? '~2 MB' : n <= 20000 ? '~4 MB' : n <= 50000 ? '~10 MB' : '~20 MB';
                    return (
                      <TouchableOpacity
                        key={n}
                        style={[styles.logSizeBtn, active && styles.logSizeBtnActive]}
                        onPress={() => {
                          const updated = { ...settings, logsMaxLines: n };
                          setSettings(updated);
                          saveSettings(updated);
                          logService.configure(true, n);
                        }}
                        accessible={true}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`${n.toLocaleString('es')} líneas ${labelMB}`}
                      >
                        <Text style={[styles.logSizeText, active && styles.logSizeTextActive]}>
                          {n.toLocaleString('es')}
                        </Text>
                        <Text style={[styles.logSizeSubtext, active && styles.logSizeTextActive]}>
                          {labelMB}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>

            <View style={styles.row}>
              <TouchableOpacity
                style={styles.logActionBtn}
                onPress={() => setExportRangeModalVisible(true)}
                accessible={true}
                accessibilityLabel="Exportar log"
                accessibilityRole="button"
              >
                <Text style={styles.logActionBtnText}>Exportar log</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.logActionBtn, styles.logActionBtnDanger]}
                onPress={() => {
                  Alert.alert(
                    'Borrar todos los logs',
                    '¿Seguro que quieres borrar todos los logs guardados? No se puede deshacer.',
                    [
                      { text: 'Cancelar', style: 'cancel' },
                      {
                        text: 'Borrar',
                        style: 'destructive',
                        onPress: async () => {
                          await logService.clearAll();
                        },
                      },
                    ]
                  );
                }}
                accessible={true}
                accessibilityLabel="Borrar todos los logs"
                accessibilityRole="button"
              >
                <Text style={styles.logActionBtnText}>Borrar logs</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Triggers Section */}
        <View style={[styles.sectionHeader, styles.marginTop]}>
          <Text style={styles.sectionTitle}>Triggers</Text>
        </View>

        <View style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.rowTitle}>Plantillas de triggers</Text>
            <Text style={styles.rowDesc}>
              Configura reglas que reaccionan a líneas del MUD: silenciar, recolorear, sonidos, comandos o notificaciones. Las plantillas se asignan a uno o varios personajes.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.encodingBtn}
            onPress={() => navigation.navigate('Triggers')}
            accessible={true}
            accessibilityLabel="Abrir plantillas de triggers"
            accessibilityRole="button"
          >
            <Text style={styles.encodingBtnText}>Abrir</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.rowTitle}>Mis sonidos</Text>
            <Text style={styles.rowDesc}>
              Sube archivos de audio del móvil (wav, mp3, ogg, m4a, aac, flac) para usarlos en triggers de tipo "Reproducir sonido".
            </Text>
          </View>
          <TouchableOpacity
            style={styles.encodingBtn}
            onPress={() => navigation.navigate('MySounds')}
            accessible={true}
            accessibilityLabel="Abrir mis sonidos personalizados"
            accessibilityRole="button"
          >
            <Text style={styles.encodingBtnText}>Abrir</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.rowTitle}>Mis variables</Text>
            <Text style={styles.rowDesc}>
              Variables de usuario que se rellenan desde acciones "Guardar en variable" en triggers. Memoria-only — se borran al cambiar de personaje o reiniciar la app.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.encodingBtn}
            onPress={() => navigation.navigate('UserVariables')}
            accessible={true}
            accessibilityLabel="Abrir mis variables de usuario"
            accessibilityRole="button"
          >
            <Text style={styles.encodingBtnText}>Abrir</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.rowTitle}>Mis ambientes</Text>
            <Text style={styles.rowDesc}>
              Música de fondo que cambia con el tipo de sala (bosque, ciudad, subterráneo…). Asigna 1-4 sonidos por categoría y se elige uno al azar al entrar.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.encodingBtn}
            onPress={() => navigation.navigate('MyAmbients')}
            accessible={true}
            accessibilityLabel="Abrir mis ambientes"
            accessibilityRole="button"
          >
            <Text style={styles.encodingBtnText}>Abrir</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.rowTitle}>Importar / exportar configuración</Text>
            <Text style={styles.rowDesc}>
              Empaqueta plantillas de triggers, mappings de ambiente y sus sonidos personalizados en un único ZIP. Útil para mover tu setup entre móviles o compartirlo.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.encodingBtn}
            onPress={() => navigation.navigate('ConfigBackup')}
            accessible={true}
            accessibilityLabel="Abrir importar exportar configuración"
            accessibilityRole="button"
          >
            <Text style={styles.encodingBtnText}>Abrir</Text>
          </TouchableOpacity>
        </View>

        {sourceLocation === 'terminal' && (
          <View style={styles.row}>
            <View style={styles.rowInfo}>
              <Text style={styles.rowTitle}>Aplicar prompt TorchZhyla</Text>
              <Text style={styles.rowDesc}>
                Configura el prompt del MUD para este personaje (sobrescribe el actual). Necesario para que las variables (vida, energía, salidas, espejos, pieles…) se capturen y puedan usarse en triggers de variable.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.encodingBtn}
              onPress={handleApplyPrompt}
              accessible={true}
              accessibilityLabel="Aplicar prompt TorchZhyla"
              accessibilityRole="button"
              accessibilityHint="Sobrescribe el prompt del MUD para este personaje"
            >
              <Text style={styles.encodingBtnText}>Aplicar</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>

      {/* Export Range Modal */}
      <Modal
        visible={exportRangeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setExportRangeModalVisible(false)}
      >
        <View style={styles.exportRangeOverlay}>
          <View style={styles.exportRangeBox}>
            <Text style={styles.exportRangeTitle} accessibilityRole="header">¿Qué rango exportar?</Text>
            {(['24h', '7d', 'all'] as ExportRange[]).map((range) => {
              const label = range === '24h' ? 'Últimas 24 horas' : range === '7d' ? 'Últimos 7 días' : 'Todo';
              return (
                <TouchableOpacity
                  key={range}
                  style={styles.exportRangeBtn}
                  onPress={async () => {
                    setExportRangeModalVisible(false);
                    try {
                      const servers = await loadServers();
                      const serverHostMap: Record<string, string> = {};
                      for (const s of servers) {
                        serverHostMap[slugifyServerName(s.name)] = s.host;
                      }
                      await logService.exportToHtml(range, serverHostMap);
                    } catch (e: any) {
                      Alert.alert('No se pudo exportar', e?.message ?? String(e));
                    }
                  }}
                  accessible={true}
                  accessibilityLabel={label}
                  accessibilityRole="button"
                >
                  <Text style={styles.exportRangeBtnText}>{label}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[styles.exportRangeBtn, styles.exportRangeCancel]}
              onPress={() => setExportRangeModalVisible(false)}
              accessible={true}
              accessibilityLabel="Cancelar"
              accessibilityRole="button"
            >
              <Text style={styles.exportRangeBtnText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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

    </Container>
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
    marginBottom: 10,
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
  rowControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  configButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#0a3a0a',
    borderWidth: 1,
    borderColor: '#0c0',
  },
  configButtonText: {
    color: '#0c0',
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  configIconBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#0a3a0a',
    borderWidth: 1,
    borderColor: '#0c0',
    marginRight: 8,
  },
  configIcon: {
    fontSize: 16,
    color: '#0c0',
  },
  configIconDisabled: {
    color: '#333',
  },
  marginTop: {
    marginTop: 0,
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
    marginBottom: 24,
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#0a3a0a',
    borderWidth: 1,
    borderColor: '#0c0',
    borderRadius: 6,
  },
  gestureConfigBtnText: {
    color: '#0c0',
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'monospace',
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
  logSizeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#444',
    backgroundColor: '#1a1a1a',
    marginRight: 8,
    marginBottom: 8,
    alignItems: 'center',
    minWidth: 80,
  },
  logSizeBtnActive: {
    backgroundColor: '#336633',
    borderColor: '#558855',
  },
  logSizeText: {
    color: '#ccc',
    fontSize: 13,
    fontWeight: 'bold',
  },
  logSizeSubtext: {
    color: '#888',
    fontSize: 11,
  },
  logSizeTextActive: {
    color: '#fff',
  },
  logActionBtn: {
    flex: 1,
    backgroundColor: '#334466',
    borderWidth: 1,
    borderColor: '#556688',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
    marginRight: 8,
  },
  logActionBtnDanger: {
    backgroundColor: '#663333',
    borderColor: '#884444',
    marginRight: 0,
  },
  logActionBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  exportRangeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  exportRangeBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    padding: 20,
    minWidth: 280,
    maxWidth: 400,
  },
  exportRangeTitle: {
    color: '#00cc00',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  exportRangeBtn: {
    backgroundColor: '#336633',
    borderWidth: 1,
    borderColor: '#558855',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
    marginBottom: 10,
  },
  exportRangeCancel: {
    backgroundColor: '#443333',
    borderColor: '#664444',
    marginBottom: 0,
    marginTop: 6,
  },
  exportRangeBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
