import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Tts from 'react-native-tts';
import { RootStackParamList } from '../../types';
import { BlindGestureContainer, SelfVoicingRow } from '../../components/SelfVoicingControls';
import { VolumeAdjuster } from '../../components/VolumeAdjuster';
import { AccessibleSelectModal, AccessibleSelectOption } from '../../components/AccessibleSelectModal';
import { activeConnection } from '../../services/activeConnection';
import { CANONICAL_PROMPT } from '../../services/promptParser';
import { speechQueue } from '../../services/speechQueueService';
import { logService, ExportRange, slugifyServerName } from '../../services/logService';
import { useSounds } from '../../contexts/SoundContext';
import { saveSettings, DEFAULT_SETTINGS } from '../../storage/settingsStorage';
import { loadServers } from '../../storage/serverStorage';
import { requestNotificationPermission, openNotificationSettings } from '../../services/foregroundService';
import {
  useSettings,
  useSettingsScope,
  useBlindNavAutoScroll,
  useSettingsWelcomeMessage,
  settingsStyles as s,
} from './settingsShared';

// Vista de Settings dentro del MUD (sourceLocation = 'terminal'). Todo
// inline en una sola pantalla — sin sub-categorías, sin selector de modo,
// sin codificación, sin Datos del usuario, sin editor de gestos, sin
// tamaño máximo de logs. Solo lo que tiene sentido tocar a media sesión.

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

const SCOPE = 'settings';

const SPEECH_CHAR_DURATION_MIN = 5;
const SPEECH_CHAR_DURATION_MAX = 150;
const SPEECH_CHAR_DURATION_STEP = 5;
const TTS_RATE_MIN = 0.1;
const TTS_RATE_MAX = 6.0;
const TTS_RATE_STEP = 0.1;
const TTS_PITCH_MIN = 0.5;
const TTS_PITCH_MAX = 2.0;
const TTS_PITCH_STEP = 0.1;

interface TtsEngineInfo { name: string; label: string; default: boolean; }
interface TtsVoiceInfo { id: string; name: string; language: string; quality?: number; networkConnectionRequired?: boolean; notInstalled?: boolean; }

export function SettingsTerminalScreen({ navigation }: Props) {
  const { settings, setSettings, updateSetting, settingsSelfVoicingActive, selfVoicingActive } = useSettings('terminal');
  const { setEffectsVolume } = useSounds();

  const [ttsEngineModalVisible, setTtsEngineModalVisible] = useState(false);
  const [ttsVoiceModalVisible, setTtsVoiceModalVisible] = useState(false);
  const [exportRangeModalVisible, setExportRangeModalVisible] = useState(false);
  const [ttsEngines, setTtsEngines] = useState<TtsEngineInfo[]>([]);
  const [ttsVoices, setTtsVoices] = useState<TtsVoiceInfo[]>([]);
  const [ttsAvailable, setTtsAvailable] = useState(false);

  const anyModalOpen = ttsEngineModalVisible || ttsVoiceModalVisible || exportRangeModalVisible;
  const blindNavActive = settingsSelfVoicingActive && !anyModalOpen;
  useSettingsScope(SCOPE, settingsSelfVoicingActive);
  const { scrollViewRef, onScroll, onLayout } = useBlindNavAutoScroll(blindNavActive);
  const welcome = useSettingsWelcomeMessage('Configuración');

  const isBlind = settings.uiMode === 'blind';
  const showAppearance = !settingsSelfVoicingActive;
  const showGestures = !isBlind || (isBlind && settings.useSelfVoicing);

  useEffect(() => {
    if (!isBlind) return;
    let mounted = true;
    Tts.getInitStatus()
      .then(async () => {
        if (!mounted) return;
        setTtsAvailable(true);
        try {
          const e = (await Tts.engines()) as TtsEngineInfo[];
          if (mounted) setTtsEngines(e || []);
        } catch (_) { /* engines() no soportado */ }
        try {
          const v = (await Tts.voices()) as TtsVoiceInfo[];
          if (mounted) setTtsVoices(v || []);
        } catch (_) { /* voices() puede tirar antes de init */ }
      })
      .catch(() => { if (mounted) setTtsAvailable(false); });
    return () => { mounted = false; };
  }, [isBlind]);

  const refreshVoices = async () => {
    try {
      const v = (await Tts.voices()) as TtsVoiceInfo[];
      setTtsVoices(v || []);
    } catch (_) { /* tolerar */ }
  };

  const onToggleNotifications = async (value: boolean) => {
    if (value) {
      const result = await requestNotificationPermission();
      if (result === 'blocked') {
        Alert.alert(
          'Permiso necesario',
          'Has denegado el permiso de notificaciones. Para recibir avisos, ábrelo en los ajustes del sistema.',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Abrir ajustes', onPress: () => openNotificationSettings() },
          ],
        );
      } else if (result === 'denied') {
        Alert.alert('Permiso denegado', 'Sin permiso de notificaciones no podremos mostrarte avisos.');
      }
    }
    const updated = value
      ? { ...settings, notificationsEnabled: true, backgroundConnectionEnabled: true }
      : { ...settings, notificationsEnabled: false };
    setSettings(updated);
    saveSettings(updated);
  };

  const onClearLogs = () => {
    Alert.alert(
      'Borrar todos los logs',
      '¿Seguro que quieres borrar todos los logs guardados? No se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Borrar', style: 'destructive', onPress: async () => { await logService.clearAll(); } },
      ],
    );
  };

  const onToggleGestures = (value: boolean) => {
    if (value) {
      let gestures = settings.gestures || [];
      if (gestures.length === 0) gestures = DEFAULT_SETTINGS.gestures;
      updateSetting('gestures', gestures);
      updateSetting('gesturesEnabled', true);
    } else {
      updateSetting('gesturesEnabled', false);
    }
  };

  const handleApplyPrompt = () => {
    if (!activeConnection.isAnyConnected()) {
      Alert.alert('No hay conexión activa', 'Conéctate primero al personaje y vuelve a intentarlo desde aquí.');
      return;
    }
    Alert.alert(
      'Aplicar prompt TorchZhyla',
      'Esto sobrescribirá tu prompt actual en el MUD para este personaje. Necesario para que las variables se capturen y puedan usarse en triggers. ¿Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aplicar',
          onPress: () => {
            const ok =
              activeConnection.sendActive(`prompt ${CANONICAL_PROMPT}`) &&
              activeConnection.sendActive(`promptcombate ${CANONICAL_PROMPT}`);
            if (ok) {
              Alert.alert('Prompt aplicado', 'El MUD recibió el nuevo prompt. A partir de ahora capturaremos las variables.');
            } else {
              Alert.alert('No se pudo enviar', 'La conexión se ha perdido. Reconéctate y vuelve a intentarlo.');
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView
      style={s.container}
      edges={['top', 'left', 'right', 'bottom']}
      importantForAccessibility={selfVoicingActive ? 'no-hide-descendants' : 'auto'}
    >
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={s.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Text style={s.backText}>{'< Volver'}</Text>
        </TouchableOpacity>
        <Text style={s.title} accessibilityRole="header">Configuración</Text>
      </View>

      <BlindGestureContainer active={blindNavActive} welcomeMessage={welcome} style={{ flex: 1 }}>
        <ScrollView
          ref={scrollViewRef}
          style={s.section}
          contentContainerStyle={s.sectionContent}
          scrollEnabled={!blindNavActive}
          scrollEventThrottle={16}
          onScroll={onScroll}
          onLayout={onLayout}
        >
          {showAppearance && (
            <View style={s.row}>
              <View style={s.rowInfo}>
                <Text style={s.rowTitle}>Tamaño de fuente</Text>
                <Text style={s.rowDesc}>Tamaño de fuente del terminal y canales.</Text>
              </View>
              <View style={s.fontSizeControls}>
                <TouchableOpacity
                  style={[s.fontBtn, settings.fontSize <= 10 && s.fontBtnDisabled]}
                  onPress={() => settings.fontSize > 10 && updateSetting('fontSize', settings.fontSize - 1)}
                  accessibilityRole="button"
                  accessibilityLabel="Bajar tamaño de fuente"
                  accessibilityState={{ disabled: settings.fontSize <= 10 }}
                >
                  <Text style={[s.fontBtnText, settings.fontSize <= 10 && s.fontBtnTextDisabled]}>−</Text>
                </TouchableOpacity>
                <Text style={s.fontSizeValue} accessibilityLabel={`Tamaño de fuente: ${settings.fontSize}`}>{settings.fontSize}</Text>
                <TouchableOpacity
                  style={[s.fontBtn, settings.fontSize >= 20 && s.fontBtnDisabled]}
                  onPress={() => settings.fontSize < 20 && updateSetting('fontSize', settings.fontSize + 1)}
                  accessibilityRole="button"
                  accessibilityLabel="Subir tamaño de fuente"
                  accessibilityState={{ disabled: settings.fontSize >= 20 }}
                >
                  <Text style={[s.fontBtnText, settings.fontSize >= 20 && s.fontBtnTextDisabled]}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <SelfVoicingRow
            svActive={settingsSelfVoicingActive}
            svScope={SCOPE}
            svKey="sounds"
            svLabel={`Usar sonidos. ${settings.soundsEnabled ? 'Activado' : 'Desactivado'}`}
            onActivate={() => updateSetting('soundsEnabled', !settings.soundsEnabled)}
            style={s.row}
          >
            <View style={s.rowInfo}>
              <Text style={s.rowTitle}>Usar sonidos</Text>
              <Text style={s.rowDesc}>Kill-switch global. Configura qué sonidos suenan en Triggers.</Text>
            </View>
            <Switch
              value={settings.soundsEnabled}
              onValueChange={(v) => updateSetting('soundsEnabled', v)}
              trackColor={{ false: '#333', true: '#0c0' }}
              thumbColor={settings.soundsEnabled ? '#000' : '#666'}
              accessibilityLabel={`Usar sonidos. ${settings.soundsEnabled ? 'Activado' : 'Desactivado'}`}
            />
          </SelfVoicingRow>

          <SelfVoicingRow
            svActive={settingsSelfVoicingActive}
            svScope={SCOPE}
            svKey="ambient"
            svLabel={`Música ambiente. ${settings.ambientEnabled ? 'Activado' : 'Desactivado'}`}
            onActivate={() => updateSetting('ambientEnabled', !settings.ambientEnabled)}
            style={s.row}
          >
            <View style={s.rowInfo}>
              <Text style={s.rowTitle}>Música ambiente</Text>
              <Text style={s.rowDesc}>Loop de fondo que cambia con el tipo de sala.</Text>
            </View>
            <Switch
              value={settings.ambientEnabled}
              onValueChange={(v) => updateSetting('ambientEnabled', v)}
              trackColor={{ false: '#333', true: '#0c0' }}
              thumbColor={settings.ambientEnabled ? '#000' : '#666'}
              accessibilityLabel={`Música ambiente. ${settings.ambientEnabled ? 'Activado' : 'Desactivado'}`}
            />
          </SelfVoicingRow>

          <View style={s.audioVolumesBlock}>
            <VolumeAdjuster
              label="Volumen ambiente"
              value={settings.ambientVolume}
              onChange={(v) => updateSetting('ambientVolume', v)}
              svActive={settingsSelfVoicingActive}
              svScope={SCOPE}
              svKeyPrefix="vol-ambient"
            />
            <VolumeAdjuster
              label="Volumen efectos (triggers)"
              value={settings.effectsVolume}
              onChange={(v) => { updateSetting('effectsVolume', v); setEffectsVolume(v); }}
              svActive={settingsSelfVoicingActive}
              svScope={SCOPE}
              svKeyPrefix="vol-effects"
            />
          </View>

          {isBlind && (
            <>
              <SelfVoicingRow
                svActive={settingsSelfVoicingActive}
                svScope={SCOPE}
                svKey="use-self-voicing"
                svLabel={`Self-voicing TTS propio. Beta. ${settings.useSelfVoicing ? 'Activado' : 'Desactivado'}`}
                onActivate={() => updateSetting('useSelfVoicing', !settings.useSelfVoicing)}
                style={s.row}
              >
                <View style={s.rowInfo}>
                  <Text style={s.rowTitle}>Self-voicing (TTS propio) — BETA</Text>
                  <Text style={s.rowDesc}>
                    ⚠️ Función beta. Hace que TorchZhyla hable con su propio motor TTS en vez de delegar en TalkBack.
                  </Text>
                </View>
                <Switch
                  value={settings.useSelfVoicing}
                  onValueChange={(v) => updateSetting('useSelfVoicing', v)}
                  trackColor={{ false: '#333', true: '#0c0' }}
                  thumbColor={settings.useSelfVoicing ? '#000' : '#666'}
                  accessibilityLabel={`Self-voicing TTS propio. Beta. ${settings.useSelfVoicing ? 'Activado' : 'Desactivado'}`}
                />
              </SelfVoicingRow>

              {!settings.useSelfVoicing && (
                <View style={s.row}>
                  <View style={s.rowInfo}>
                    <Text style={s.rowTitle}>Velocidad de lectura</Text>
                    <Text style={s.rowDesc}>Tiempo estimado por carácter al encolar mensajes para TalkBack.</Text>
                  </View>
                  <View style={s.fontSizeControls}>
                    <TouchableOpacity
                      style={[s.fontBtn, settings.speechCharDurationMs <= SPEECH_CHAR_DURATION_MIN && s.fontBtnDisabled]}
                      onPress={() => settings.speechCharDurationMs > SPEECH_CHAR_DURATION_MIN && updateSetting('speechCharDurationMs', Math.max(SPEECH_CHAR_DURATION_MIN, settings.speechCharDurationMs - SPEECH_CHAR_DURATION_STEP))}
                      accessibilityRole="button"
                      accessibilityLabel="Bajar velocidad de lectura"
                      accessibilityState={{ disabled: settings.speechCharDurationMs <= SPEECH_CHAR_DURATION_MIN }}
                    >
                      <Text style={[s.fontBtnText, settings.speechCharDurationMs <= SPEECH_CHAR_DURATION_MIN && s.fontBtnTextDisabled]}>−</Text>
                    </TouchableOpacity>
                    <Text style={s.fontSizeValue} accessibilityLabel={`Velocidad de lectura: ${settings.speechCharDurationMs} milisegundos por carácter`}>{settings.speechCharDurationMs}</Text>
                    <TouchableOpacity
                      style={[s.fontBtn, settings.speechCharDurationMs >= SPEECH_CHAR_DURATION_MAX && s.fontBtnDisabled]}
                      onPress={() => settings.speechCharDurationMs < SPEECH_CHAR_DURATION_MAX && updateSetting('speechCharDurationMs', Math.min(SPEECH_CHAR_DURATION_MAX, settings.speechCharDurationMs + SPEECH_CHAR_DURATION_STEP))}
                      accessibilityRole="button"
                      accessibilityLabel="Subir velocidad de lectura"
                      accessibilityState={{ disabled: settings.speechCharDurationMs >= SPEECH_CHAR_DURATION_MAX }}
                    >
                      <Text style={[s.fontBtnText, settings.speechCharDurationMs >= SPEECH_CHAR_DURATION_MAX && s.fontBtnTextDisabled]}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {settings.useSelfVoicing && !ttsAvailable && (
                <View style={s.row}>
                  <View style={s.rowInfo}>
                    <Text style={[s.rowTitle, { color: '#f80' }]}>Motor TTS no disponible</Text>
                    <Text style={s.rowDesc}>Instala uno (Google TTS suele venir preinstalado).</Text>
                  </View>
                </View>
              )}

              {settings.useSelfVoicing && ttsAvailable && (
                <>
                  <SelfVoicingRow
                    svActive={settingsSelfVoicingActive}
                    svScope={SCOPE}
                    svKey="tts-engine"
                    svLabel={`Motor TTS. Actual: ${settings.ttsEngine ? (ttsEngines.find(e => e.name === settings.ttsEngine)?.label || settings.ttsEngine) : 'Default del sistema'}.`}
                    onActivate={() => setTtsEngineModalVisible(true)}
                    style={s.row}
                  >
                    <View style={s.rowInfo}>
                      <Text style={s.rowTitle}>Motor TTS</Text>
                      <Text style={s.rowDesc}>Engine que produce la voz.</Text>
                    </View>
                    <View style={s.encodingBtn}>
                      <Text style={s.encodingBtnText} numberOfLines={1}>
                        {settings.ttsEngine
                          ? (ttsEngines.find(e => e.name === settings.ttsEngine)?.label || settings.ttsEngine)
                          : 'Default'}
                      </Text>
                    </View>
                  </SelfVoicingRow>

                  <SelfVoicingRow
                    svActive={settingsSelfVoicingActive}
                    svScope={SCOPE}
                    svKey="tts-voice"
                    svLabel={`Voz. Actual: ${settings.ttsVoice ? (ttsVoices.find(v => v.id === settings.ttsVoice)?.name || settings.ttsVoice) : 'Default'}.`}
                    onActivate={() => setTtsVoiceModalVisible(true)}
                    style={s.row}
                  >
                    <View style={s.rowInfo}>
                      <Text style={s.rowTitle}>Voz</Text>
                      <Text style={s.rowDesc}>Voz concreta del motor seleccionado.</Text>
                    </View>
                    <View style={s.encodingBtn}>
                      <Text style={s.encodingBtnText} numberOfLines={1}>
                        {settings.ttsVoice
                          ? (ttsVoices.find(v => v.id === settings.ttsVoice)?.name || settings.ttsVoice)
                          : 'Default'}
                      </Text>
                    </View>
                  </SelfVoicingRow>

                  <SelfVoicingRow
                    svActive={settingsSelfVoicingActive}
                    svScope={SCOPE}
                    svKey="tts-rate"
                    svLabel={`Velocidad TTS. Actual ${settings.ttsRate.toFixed(1)}.`}
                    onAdjust={(dir) => {
                      if (dir === 'inc' && settings.ttsRate < TTS_RATE_MAX) updateSetting('ttsRate', Math.min(TTS_RATE_MAX, +(settings.ttsRate + TTS_RATE_STEP).toFixed(1)));
                      else if (dir === 'dec' && settings.ttsRate > TTS_RATE_MIN) updateSetting('ttsRate', Math.max(TTS_RATE_MIN, +(settings.ttsRate - TTS_RATE_STEP).toFixed(1)));
                    }}
                    style={s.row}
                  >
                    <View style={s.rowInfo}>
                      <Text style={s.rowTitle}>Velocidad TTS</Text>
                      <Text style={s.rowDesc}>1.0 normal, 2.0 doble, 5.0 quíntuple.</Text>
                    </View>
                    <View style={s.fontSizeControls}>
                      <TouchableOpacity
                        style={[s.fontBtn, settings.ttsRate <= TTS_RATE_MIN && s.fontBtnDisabled]}
                        disabled={settings.ttsRate <= TTS_RATE_MIN}
                        onPress={() => settings.ttsRate > TTS_RATE_MIN && updateSetting('ttsRate', Math.max(TTS_RATE_MIN, +(settings.ttsRate - TTS_RATE_STEP).toFixed(1)))}
                        accessibilityRole="button"
                        accessibilityLabel="Bajar velocidad TTS"
                        accessibilityState={{ disabled: settings.ttsRate <= TTS_RATE_MIN }}
                      >
                        <Text style={[s.fontBtnText, settings.ttsRate <= TTS_RATE_MIN && s.fontBtnTextDisabled]}>−</Text>
                      </TouchableOpacity>
                      <Text style={s.fontSizeValue} accessibilityLabel={`Velocidad TTS: ${settings.ttsRate.toFixed(1)}`}>{settings.ttsRate.toFixed(1)}</Text>
                      <TouchableOpacity
                        style={[s.fontBtn, settings.ttsRate >= TTS_RATE_MAX && s.fontBtnDisabled]}
                        disabled={settings.ttsRate >= TTS_RATE_MAX}
                        onPress={() => settings.ttsRate < TTS_RATE_MAX && updateSetting('ttsRate', Math.min(TTS_RATE_MAX, +(settings.ttsRate + TTS_RATE_STEP).toFixed(1)))}
                        accessibilityRole="button"
                        accessibilityLabel="Subir velocidad TTS"
                        accessibilityState={{ disabled: settings.ttsRate >= TTS_RATE_MAX }}
                      >
                        <Text style={[s.fontBtnText, settings.ttsRate >= TTS_RATE_MAX && s.fontBtnTextDisabled]}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </SelfVoicingRow>

                  <SelfVoicingRow
                    svActive={settingsSelfVoicingActive}
                    svScope={SCOPE}
                    svKey="tts-pitch"
                    svLabel={`Tono TTS. Actual ${settings.ttsPitch.toFixed(1)}.`}
                    onAdjust={(dir) => {
                      if (dir === 'inc' && settings.ttsPitch < TTS_PITCH_MAX) updateSetting('ttsPitch', Math.min(TTS_PITCH_MAX, +(settings.ttsPitch + TTS_PITCH_STEP).toFixed(1)));
                      else if (dir === 'dec' && settings.ttsPitch > TTS_PITCH_MIN) updateSetting('ttsPitch', Math.max(TTS_PITCH_MIN, +(settings.ttsPitch - TTS_PITCH_STEP).toFixed(1)));
                    }}
                    style={s.row}
                  >
                    <View style={s.rowInfo}>
                      <Text style={s.rowTitle}>Tono TTS</Text>
                      <Text style={s.rowDesc}>Pitch del motor (0.5 grave, 1.0 normal, 2.0 muy agudo).</Text>
                    </View>
                    <View style={s.fontSizeControls}>
                      <TouchableOpacity
                        style={[s.fontBtn, settings.ttsPitch <= TTS_PITCH_MIN && s.fontBtnDisabled]}
                        disabled={settings.ttsPitch <= TTS_PITCH_MIN}
                        onPress={() => settings.ttsPitch > TTS_PITCH_MIN && updateSetting('ttsPitch', Math.max(TTS_PITCH_MIN, +(settings.ttsPitch - TTS_PITCH_STEP).toFixed(1)))}
                        accessibilityRole="button"
                        accessibilityLabel="Bajar tono TTS"
                        accessibilityState={{ disabled: settings.ttsPitch <= TTS_PITCH_MIN }}
                      >
                        <Text style={[s.fontBtnText, settings.ttsPitch <= TTS_PITCH_MIN && s.fontBtnTextDisabled]}>−</Text>
                      </TouchableOpacity>
                      <Text style={s.fontSizeValue} accessibilityLabel={`Tono TTS: ${settings.ttsPitch.toFixed(1)}`}>{settings.ttsPitch.toFixed(1)}</Text>
                      <TouchableOpacity
                        style={[s.fontBtn, settings.ttsPitch >= TTS_PITCH_MAX && s.fontBtnDisabled]}
                        disabled={settings.ttsPitch >= TTS_PITCH_MAX}
                        onPress={() => settings.ttsPitch < TTS_PITCH_MAX && updateSetting('ttsPitch', Math.min(TTS_PITCH_MAX, +(settings.ttsPitch + TTS_PITCH_STEP).toFixed(1)))}
                        accessibilityRole="button"
                        accessibilityLabel="Subir tono TTS"
                        accessibilityState={{ disabled: settings.ttsPitch >= TTS_PITCH_MAX }}
                      >
                        <Text style={[s.fontBtnText, settings.ttsPitch >= TTS_PITCH_MAX && s.fontBtnTextDisabled]}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </SelfVoicingRow>

                  <View style={s.audioVolumesBlock}>
                    <VolumeAdjuster
                      label="Volumen TTS"
                      value={settings.ttsVolume}
                      onChange={(v) => updateSetting('ttsVolume', v)}
                      svActive={settingsSelfVoicingActive}
                      svScope={SCOPE}
                      svKeyPrefix="vol-tts"
                    />
                  </View>

                  <SelfVoicingRow
                    svActive={settingsSelfVoicingActive}
                    svScope={SCOPE}
                    svKey="probar-voz"
                    svLabel="Probar voz."
                    onActivate={() => speechQueue.preview('Hola, esta es la voz de TorchZhyla en modo blind.')}
                    style={s.row}
                  >
                    <View style={s.rowInfo}>
                      <Text style={s.rowTitle}>Probar voz</Text>
                      <Text style={s.rowDesc}>Reproduce una frase corta con la configuración actual.</Text>
                    </View>
                    <View style={s.encodingBtn}>
                      <Text style={s.encodingBtnText}>Probar</Text>
                    </View>
                  </SelfVoicingRow>
                </>
              )}
            </>
          )}

          <SelfVoicingRow
            svActive={settingsSelfVoicingActive}
            svScope={SCOPE}
            svKey="background-connection"
            svLabel={`Conexión en segundo plano. ${settings.backgroundConnectionEnabled ? 'Activado' : 'Desactivado'}`}
            onActivate={() => updateSetting('backgroundConnectionEnabled', !settings.backgroundConnectionEnabled)}
            style={s.row}
          >
            <View style={s.rowInfo}>
              <Text style={s.rowTitle}>Conexión en segundo plano</Text>
              <Text style={s.rowDesc}>
                Mantiene el MUD conectado aunque la pantalla se bloquee o la app pase a segundo plano.
              </Text>
            </View>
            <Switch
              value={settings.backgroundConnectionEnabled}
              onValueChange={(v) => updateSetting('backgroundConnectionEnabled', v)}
              trackColor={{ false: '#333', true: '#0c0' }}
              thumbColor={settings.backgroundConnectionEnabled ? '#000' : '#666'}
              accessibilityLabel={`Conexión en segundo plano. ${settings.backgroundConnectionEnabled ? 'Activado' : 'Desactivado'}`}
            />
          </SelfVoicingRow>

          <SelfVoicingRow
            svActive={settingsSelfVoicingActive}
            svScope={SCOPE}
            svKey="keep-awake"
            svLabel={`Mantener pantalla encendida. ${settings.keepAwakeEnabled ? 'Activado' : 'Desactivado'}`}
            onActivate={() => updateSetting('keepAwakeEnabled', !settings.keepAwakeEnabled)}
            style={s.row}
          >
            <View style={s.rowInfo}>
              <Text style={s.rowTitle}>Mantener pantalla encendida</Text>
              <Text style={s.rowDesc}>Evita que el teléfono se bloquee mientras estás conectado.</Text>
            </View>
            <Switch
              value={settings.keepAwakeEnabled}
              onValueChange={(v) => updateSetting('keepAwakeEnabled', v)}
              trackColor={{ false: '#333', true: '#0c0' }}
              thumbColor={settings.keepAwakeEnabled ? '#000' : '#666'}
              accessibilityLabel={`Mantener pantalla encendida. ${settings.keepAwakeEnabled ? 'Activado' : 'Desactivado'}`}
            />
          </SelfVoicingRow>

          <SelfVoicingRow
            svActive={settingsSelfVoicingActive}
            svScope={SCOPE}
            svKey="notifications"
            svLabel={
              settings.backgroundConnectionEnabled
                ? `Usar notificaciones. ${settings.notificationsEnabled ? 'Activado' : 'Desactivado'}`
                : 'Usar notificaciones. Deshabilitado: requiere conexión en segundo plano.'
            }
            onActivate={settings.backgroundConnectionEnabled ? () => onToggleNotifications(!settings.notificationsEnabled) : () => {}}
            style={s.row}
          >
            <View style={s.rowInfo}>
              <Text style={[s.rowTitle, !settings.backgroundConnectionEnabled && { color: '#555' }]}>
                Usar notificaciones
              </Text>
              <Text style={s.rowDesc}>
                {settings.backgroundConnectionEnabled
                  ? 'Permite que los triggers disparen notificaciones del sistema.'
                  : 'Requiere "Conexión en segundo plano" activa.'}
              </Text>
            </View>
            <Switch
              value={settings.notificationsEnabled && settings.backgroundConnectionEnabled}
              onValueChange={onToggleNotifications}
              disabled={!settings.backgroundConnectionEnabled}
              trackColor={{ false: '#333', true: '#0c0' }}
              thumbColor={settings.notificationsEnabled && settings.backgroundConnectionEnabled ? '#000' : '#666'}
              accessibilityLabel={
                !settings.backgroundConnectionEnabled
                  ? 'Usar notificaciones. Deshabilitado: requiere conexión en segundo plano'
                  : `Usar notificaciones. ${settings.notificationsEnabled ? 'Activado' : 'Desactivado'}`
              }
            />
          </SelfVoicingRow>

          {showGestures && (
            <SelfVoicingRow
              svActive={settingsSelfVoicingActive}
              svScope={SCOPE}
              svKey="gestures-enabled"
              svLabel={`Usar gestos. ${settings.gesturesEnabled ? 'Activado' : 'Desactivado'}`}
              onActivate={() => onToggleGestures(!settings.gesturesEnabled)}
              style={s.row}
            >
              <View style={s.rowInfo}>
                <Text style={s.rowTitle}>Usar gestos</Text>
                <Text style={s.rowDesc}>
                  Ejecuta comandos con gestos en la zona del terminal. Configura los gestos desde fuera del MUD.
                </Text>
              </View>
              <Switch
                value={settings.gesturesEnabled}
                onValueChange={onToggleGestures}
                trackColor={{ false: '#333', true: '#0c0' }}
                thumbColor={settings.gesturesEnabled ? '#000' : '#666'}
                accessibilityLabel={`Usar gestos. ${settings.gesturesEnabled ? 'Activado' : 'Desactivado'}`}
              />
            </SelfVoicingRow>
          )}

          {/* Toggle "Guardar logs" se configura SOLO desde fuera del MUD
              (Sistema → Logs). Aquí solo exponemos las acciones de gestión
              cuando los logs ya están activos: exportar HTML para soporte,
              borrar todo. Mantener el toggle aquí no aporta — apagarlo a
              media sesión borraría TODO el log capturado de la sesión. */}
          {settings.logsEnabled && (
            settingsSelfVoicingActive ? (
              <>
                <SelfVoicingRow
                  svActive={settingsSelfVoicingActive}
                  svScope={SCOPE}
                  svKey="export-log"
                  svLabel="Exportar log."
                  onActivate={() => setExportRangeModalVisible(true)}
                  style={s.row}
                >
                  <View style={s.rowInfo}>
                    <Text style={s.rowTitle}>Exportar log</Text>
                    <Text style={s.rowDesc}>Genera un HTML con la actividad capturada.</Text>
                  </View>
                  <View style={localStyles.logActionBtn}>
                    <Text style={localStyles.logActionBtnText}>Exportar</Text>
                  </View>
                </SelfVoicingRow>
                <SelfVoicingRow
                  svActive={settingsSelfVoicingActive}
                  svScope={SCOPE}
                  svKey="clear-logs"
                  svLabel="Borrar logs."
                  onActivate={onClearLogs}
                  style={s.row}
                >
                  <View style={s.rowInfo}>
                    <Text style={s.rowTitle}>Borrar logs</Text>
                    <Text style={s.rowDesc}>Elimina todos los logs guardados.</Text>
                  </View>
                  <View style={[localStyles.logActionBtn, localStyles.logActionBtnDanger]}>
                    <Text style={localStyles.logActionBtnText}>Borrar</Text>
                  </View>
                </SelfVoicingRow>
              </>
            ) : (
              <View style={s.row}>
                <TouchableOpacity
                  style={localStyles.logActionBtn}
                  onPress={() => setExportRangeModalVisible(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Exportar log"
                >
                  <Text style={localStyles.logActionBtnText}>Exportar log</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[localStyles.logActionBtn, localStyles.logActionBtnDanger]}
                  onPress={onClearLogs}
                  accessibilityRole="button"
                  accessibilityLabel="Borrar todos los logs"
                >
                  <Text style={localStyles.logActionBtnText}>Borrar logs</Text>
                </TouchableOpacity>
              </View>
            )
          )}

          <SelfVoicingRow
            svActive={settingsSelfVoicingActive}
            svScope={SCOPE}
            svKey="apply-prompt"
            svLabel="Aplicar prompt TorchZhyla. Configura el prompt del MUD para este personaje."
            onActivate={handleApplyPrompt}
            style={s.row}
          >
            <View style={s.rowInfo}>
              <Text style={s.rowTitle}>Aplicar prompt TorchZhyla</Text>
              <Text style={s.rowDesc}>
                Sobrescribe el prompt del MUD para este personaje. Necesario para que las variables (vida, energía,
                salidas, espejos, pieles…) se capturen y puedan usarse en triggers.
              </Text>
            </View>
            <TouchableOpacity
              style={s.encodingBtn}
              onPress={handleApplyPrompt}
              accessibilityRole="button"
              accessibilityLabel="Aplicar prompt TorchZhyla"
            >
              <Text style={s.encodingBtnText}>Aplicar</Text>
            </TouchableOpacity>
          </SelfVoicingRow>
        </ScrollView>
      </BlindGestureContainer>

      <AccessibleSelectModal
        visible={ttsEngineModalVisible}
        title="Selecciona motor TTS"
        scope="tts-engine-modal"
        selfVoicingActive={settingsSelfVoicingActive}
        options={[
          { key: '', label: 'Default del sistema', sublabel: 'sistema', selected: settings.ttsEngine === '' },
          ...ttsEngines.map((e) => ({
            key: e.name,
            label: e.label,
            selected: settings.ttsEngine === e.name,
          })) as AccessibleSelectOption[],
        ]}
        onSelect={async (name) => {
          updateSetting('ttsEngine', name);
          setTtsEngineModalVisible(false);
          await refreshVoices();
        }}
        onCancel={() => setTtsEngineModalVisible(false)}
      />

      <AccessibleSelectModal
        visible={ttsVoiceModalVisible}
        title="Selecciona voz"
        scope="tts-voice-modal"
        selfVoicingActive={settingsSelfVoicingActive}
        options={(() => {
          const all = ttsVoices.filter((v) => !v.notInstalled);
          const spanish = all.filter((v) => v.language?.toLowerCase().startsWith('es'));
          const list = spanish.length > 0 ? spanish : all;
          const opts: AccessibleSelectOption[] = [
            { key: '', label: 'Default del motor', selected: settings.ttsVoice === '' },
          ];
          for (const v of list) {
            const sublabelParts: string[] = [];
            if (v.language) sublabelParts.push(v.language);
            if (v.networkConnectionRequired) sublabelParts.push('online');
            opts.push({
              key: v.id,
              label: v.name || v.id || 'Default',
              sublabel: sublabelParts.join(' · ') || undefined,
              selected: settings.ttsVoice === v.id,
            });
          }
          return opts;
        })()}
        onSelect={(id) => {
          updateSetting('ttsVoice', id);
          setTtsVoiceModalVisible(false);
        }}
        onCancel={() => setTtsVoiceModalVisible(false)}
      />

      <AccessibleSelectModal<ExportRange>
        visible={exportRangeModalVisible}
        title="¿Qué rango exportar?"
        scope="export-range-modal"
        selfVoicingActive={settingsSelfVoicingActive}
        options={[
          { key: '24h' as ExportRange, label: 'Últimas 24 horas' },
          { key: '7d' as ExportRange, label: 'Últimos 7 días' },
          { key: 'all' as ExportRange, label: 'Todo' },
        ]}
        onSelect={async (range) => {
          setExportRangeModalVisible(false);
          try {
            const servers = await loadServers();
            const serverHostMap: Record<string, string> = {};
            for (const sv of servers) {
              serverHostMap[slugifyServerName(sv.name)] = sv.host;
            }
            await logService.exportToHtml(range, serverHostMap);
          } catch (e: any) {
            Alert.alert('No se pudo exportar', e?.message ?? String(e));
          }
        }}
        onCancel={() => setExportRangeModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
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
  logActionBtnDanger: { backgroundColor: '#663333', borderColor: '#884444', marginRight: 0 },
  logActionBtnText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
});
