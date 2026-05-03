import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../types';
import { BlindGestureContainer, SelfVoicingRow } from '../../components/SelfVoicingControls';
import { DEFAULT_SETTINGS } from '../../storage/settingsStorage';
import {
  useSettings,
  useSettingsScope,
  useBlindNavAutoScroll,
  useSettingsWelcomeMessage,
  settingsStyles as s,
} from './settingsShared';

type Props = NativeStackScreenProps<RootStackParamList, 'SettingsAdvanced'>;

const SCOPE = 'settings-advanced';

export function SettingsAdvancedScreen({ navigation, route }: Props) {
  const sourceLocation = route.params?.sourceLocation ?? 'serverlist';
  const { settings, updateSetting, settingsSelfVoicingActive } = useSettings(sourceLocation);
  const blindNavActive = settingsSelfVoicingActive;
  useSettingsScope(SCOPE, settingsSelfVoicingActive);
  const { scrollViewRef, onScroll, onLayout } = useBlindNavAutoScroll(blindNavActive);
  const welcome = useSettingsWelcomeMessage('Avanzado');

  // Gestos en blind+TalkBack (sin self-voicing) los consume el lector — el
  // editor se vuelve inutilizable. Replicamos el gating del Settings antiguo.
  const showGestures =
    settings.uiMode === 'completo' || (settings.uiMode === 'blind' && settings.useSelfVoicing);

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

  return (
    <SafeAreaView
      style={s.container}
      edges={['top', 'left', 'right', 'bottom']}
      importantForAccessibility={settingsSelfVoicingActive ? 'no-hide-descendants' : 'auto'}
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
        <Text style={s.title} accessibilityRole="header">Avanzado</Text>
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
          {showGestures && (
            <>
              <SelfVoicingRow
                svActive={settingsSelfVoicingActive}
                svScope={SCOPE}
                svKey="gestures-enabled"
                svLabel={`Usar gestos. Ejecuta comandos con gestos en la zona del terminal. ${settings.gesturesEnabled ? 'Activado' : 'Desactivado'}`}
                onActivate={() => onToggleGestures(!settings.gesturesEnabled)}
                style={s.row}
              >
                <View style={s.rowInfo}>
                  <Text style={s.rowTitle}>Usar gestos</Text>
                  <Text style={s.rowDesc}>
                    Ejecuta comandos con gestos en la zona del terminal (doble tap, swipes, dos dedos…).
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

              {settings.gesturesEnabled && (
                <TouchableOpacity
                  style={s.row}
                  onPress={() => navigation.navigate('SettingsGestures', { sourceLocation })}
                  accessibilityRole="button"
                  accessibilityLabel="Configurar gestos. Asocia un comando a cada gesto y elige si abre teclado tras ejecutar."
                >
                  <View style={s.rowInfo}>
                    <Text style={s.rowTitle}>Configurar gestos</Text>
                    <Text style={s.rowDesc}>Asocia un comando a cada gesto y elige si abre teclado tras ejecutar.</Text>
                  </View>
                  <View style={s.encodingBtn}>
                    <Text style={s.encodingBtnText}>Abrir</Text>
                  </View>
                </TouchableOpacity>
              )}
            </>
          )}

          <DataLink title="Plantillas de triggers" desc="Reglas que reaccionan a líneas del MUD." onPress={() => navigation.navigate('Triggers')} />
          <DataLink title="Mis sonidos" desc="Sube wavs, mp3, ogg, m4a, aac, flac para usarlos en triggers." onPress={() => navigation.navigate('MySounds')} />
          <DataLink title="Mis variables" desc="Variables de usuario rellenadas desde acciones Guardar en variable." onPress={() => navigation.navigate('UserVariables')} />
          <DataLink title="Mis ambientes" desc="Música de fondo asignada por tipo de sala." onPress={() => navigation.navigate('MyAmbients')} />
          <DataLink title="Mis mapas" desc="Biblioteca de mapas para minimap e irsala. Importa desde Mudlet." onPress={() => navigation.navigate('MyMaps')} />
          <DataLink title="Importar / exportar configuración" desc="Empaqueta plantillas, ambientes y sonidos personalizados en un ZIP." onPress={() => navigation.navigate('ConfigBackup')} />
        </ScrollView>
      </BlindGestureContainer>
    </SafeAreaView>
  );
}

interface DataLinkProps { title: string; desc: string; onPress: () => void; }

function DataLink({ title, desc, onPress }: DataLinkProps) {
  return (
    <TouchableOpacity
      style={s.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${desc}`}
    >
      <View style={s.rowInfo}>
        <Text style={s.rowTitle}>{title}</Text>
        <Text style={s.rowDesc}>{desc}</Text>
      </View>
      <View style={s.encodingBtn}>
        <Text style={s.encodingBtnText}>Abrir</Text>
      </View>
    </TouchableOpacity>
  );
}
