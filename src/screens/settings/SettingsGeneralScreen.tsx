import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Tts from 'react-native-tts';
import { RootStackParamList } from '../../types';
import { BlindGestureContainer, SelfVoicingRow } from '../../components/SelfVoicingControls';
import { VolumeAdjuster } from '../../components/VolumeAdjuster';
import { AccessibleSelectModal, AccessibleSelectOption } from '../../components/AccessibleSelectModal';
import { speechQueue } from '../../services/speechQueueService';
import { useSounds } from '../../contexts/SoundContext';
import {
  useSettings,
  useSettingsScope,
  useBlindNavAutoScroll,
  useSettingsWelcomeMessage,
  settingsStyles as s,
} from './settingsShared';

type Props = NativeStackScreenProps<RootStackParamList, 'SettingsGeneral'>;

const SCOPE = 'settings-general';

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

export function SettingsGeneralScreen({ navigation, route }: Props) {
  const sourceLocation = route.params?.sourceLocation ?? 'serverlist';
  const { settings, updateSetting, settingsSelfVoicingActive, selfVoicingActive } = useSettings(sourceLocation);
  const { setEffectsVolume } = useSounds();

  const [ttsEngineModalVisible, setTtsEngineModalVisible] = useState(false);
  const [ttsVoiceModalVisible, setTtsVoiceModalVisible] = useState(false);
  const [ttsEngines, setTtsEngines] = useState<TtsEngineInfo[]>([]);
  const [ttsVoices, setTtsVoices] = useState<TtsVoiceInfo[]>([]);
  const [ttsAvailable, setTtsAvailable] = useState(false);

  const anyModalOpen = ttsEngineModalVisible || ttsVoiceModalVisible;
  const blindNavActive = settingsSelfVoicingActive && !anyModalOpen;
  useSettingsScope(SCOPE, settingsSelfVoicingActive);
  const { scrollViewRef, onScroll, onLayout } = useBlindNavAutoScroll(blindNavActive);
  const welcome = useSettingsWelcomeMessage('General');

  // Self-voicing show condition: solo en blind
  const showVoice = settings.uiMode === 'blind';
  // Apariencia se oculta en self-voicing porque solo hay tamaño de fuente
  const showAppearance = !settingsSelfVoicingActive;

  useEffect(() => {
    if (!showVoice) return;
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
  }, [showVoice]);

  const refreshVoices = async () => {
    try {
      const v = (await Tts.voices()) as TtsVoiceInfo[];
      setTtsVoices(v || []);
    } catch (_) { /* tolerar */ }
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
        <Text style={s.title} accessibilityRole="header">General</Text>
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
            <>
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
                  <Text style={s.fontSizeValue}>{settings.fontSize}</Text>
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
            </>
          )}

          <SelfVoicingRow
            svActive={settingsSelfVoicingActive}
            svScope={SCOPE}
            svKey="sounds"
            svLabel={`Usar sonidos. Kill-switch global. ${settings.soundsEnabled ? 'Activado' : 'Desactivado'}`}
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
            svLabel={`Música ambiente. Loop de fondo que cambia con el tipo de sala. ${settings.ambientEnabled ? 'Activado' : 'Desactivado'}`}
            onActivate={() => updateSetting('ambientEnabled', !settings.ambientEnabled)}
            style={s.row}
          >
            <View style={s.rowInfo}>
              <Text style={s.rowTitle}>Música ambiente</Text>
              <Text style={s.rowDesc}>
                Loop de fondo que cambia con el tipo de sala. Asigna sonidos en "Mis ambientes".
              </Text>
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

          {showVoice && (
            <>
              <Text style={[s.sectionTitle, { marginTop: 24 }]} accessibilityRole="header">Voz</Text>

              <SelfVoicingRow
                svActive={settingsSelfVoicingActive}
                svScope={SCOPE}
                svKey="use-self-voicing"
                svLabel={`Self-voicing TTS propio. Beta. Hace que TorchZhyla hable con su propio motor en vez de delegar en TalkBack. ${settings.useSelfVoicing ? 'Activado' : 'Desactivado'}`}
                onActivate={() => updateSetting('useSelfVoicing', !settings.useSelfVoicing)}
                style={s.row}
              >
                <View style={s.rowInfo}>
                  <Text style={s.rowTitle}>Self-voicing (TTS propio) — BETA</Text>
                  <Text style={s.rowDesc}>
                    ⚠️ Función beta en desarrollo. Hace que TorchZhyla hable con su propio motor TTS en vez de delegar en
                    TalkBack. Para que funcione bien, desactiva TalkBack al jugar (atajo de accesibilidad del sistema).
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
                    <Text style={s.rowDesc}>
                      Tiempo estimado por carácter al encolar mensajes para el lector de pantalla. Afecta solo al backend
                      TalkBack.
                    </Text>
                  </View>
                  <View style={s.fontSizeControls}>
                    <TouchableOpacity
                      style={[s.fontBtn, settings.speechCharDurationMs <= SPEECH_CHAR_DURATION_MIN && s.fontBtnDisabled]}
                      onPress={() => {
                        if (settings.speechCharDurationMs > SPEECH_CHAR_DURATION_MIN) {
                          updateSetting(
                            'speechCharDurationMs',
                            Math.max(SPEECH_CHAR_DURATION_MIN, settings.speechCharDurationMs - SPEECH_CHAR_DURATION_STEP),
                          );
                        }
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Bajar velocidad de lectura"
                      accessibilityState={{ disabled: settings.speechCharDurationMs <= SPEECH_CHAR_DURATION_MIN }}
                    >
                      <Text style={[s.fontBtnText, settings.speechCharDurationMs <= SPEECH_CHAR_DURATION_MIN && s.fontBtnTextDisabled]}>−</Text>
                    </TouchableOpacity>
                    <Text style={s.fontSizeValue} accessibilityLabel={`Velocidad de lectura: ${settings.speechCharDurationMs} milisegundos por carácter`}>{settings.speechCharDurationMs}</Text>
                    <TouchableOpacity
                      style={[s.fontBtn, settings.speechCharDurationMs >= SPEECH_CHAR_DURATION_MAX && s.fontBtnDisabled]}
                      onPress={() => {
                        if (settings.speechCharDurationMs < SPEECH_CHAR_DURATION_MAX) {
                          updateSetting(
                            'speechCharDurationMs',
                            Math.min(SPEECH_CHAR_DURATION_MAX, settings.speechCharDurationMs + SPEECH_CHAR_DURATION_STEP),
                          );
                        }
                      }}
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
                    <Text style={s.rowDesc}>
                      Instala uno (Google TTS suele venir preinstalado; si lo desinstalaste, instálalo desde Play Store).
                    </Text>
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
                      if (dir === 'inc' && settings.ttsRate < TTS_RATE_MAX) {
                        updateSetting('ttsRate', Math.min(TTS_RATE_MAX, +(settings.ttsRate + TTS_RATE_STEP).toFixed(1)));
                      } else if (dir === 'dec' && settings.ttsRate > TTS_RATE_MIN) {
                        updateSetting('ttsRate', Math.max(TTS_RATE_MIN, +(settings.ttsRate - TTS_RATE_STEP).toFixed(1)));
                      }
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
                      if (dir === 'inc' && settings.ttsPitch < TTS_PITCH_MAX) {
                        updateSetting('ttsPitch', Math.min(TTS_PITCH_MAX, +(settings.ttsPitch + TTS_PITCH_STEP).toFixed(1)));
                      } else if (dir === 'dec' && settings.ttsPitch > TTS_PITCH_MIN) {
                        updateSetting('ttsPitch', Math.max(TTS_PITCH_MIN, +(settings.ttsPitch - TTS_PITCH_STEP).toFixed(1)));
                      }
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
                    svLabel="Probar voz. Reproduce una frase corta con la configuración actual."
                    onActivate={() => speechQueue.preview('Hola, esta es la voz de TorchZhyla en modo blind.')}
                    style={s.row}
                  >
                    <View style={s.rowInfo}>
                      <Text style={s.rowTitle}>Probar voz</Text>
                      <Text style={s.rowDesc}>
                        Reproduce una frase corta con la configuración actual. Usa siempre el TTS propio.
                      </Text>
                    </View>
                    <View style={s.encodingBtn}>
                      <Text style={s.encodingBtnText}>Probar</Text>
                    </View>
                  </SelfVoicingRow>
                </>
              )}
            </>
          )}
        </ScrollView>
      </BlindGestureContainer>

      <AccessibleSelectModal
        visible={ttsEngineModalVisible}
        title="Selecciona motor TTS"
        scope="tts-engine-modal-general"
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
        scope="tts-voice-modal-general"
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
    </SafeAreaView>
  );
}
