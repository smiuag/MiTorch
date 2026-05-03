import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../types';
import { BlindGestureContainer, SelfVoicingRow } from '../../components/SelfVoicingControls';
import { AccessibleSelectModal, AccessibleSelectOption } from '../../components/AccessibleSelectModal';
import { requestNotificationPermission, openNotificationSettings } from '../../services/foregroundService';
import { logService, ExportRange, slugifyServerName } from '../../services/logService';
import { saveSettings, LogsMaxLines } from '../../storage/settingsStorage';
import { loadServers } from '../../storage/serverStorage';
import {
  useSettings,
  useSettingsScope,
  useBlindNavAutoScroll,
  useSettingsWelcomeMessage,
  settingsStyles as s,
} from './settingsShared';

type Props = NativeStackScreenProps<RootStackParamList, 'SettingsSystem'>;

const SCOPE = 'settings-system';

const ENCODING_OPTIONS = [
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
];

const LOG_SIZE_OPTIONS: { value: LogsMaxLines; mb: string }[] = [
  { value: 5000, mb: '~1 MB' },
  { value: 10000, mb: '~2 MB' },
  { value: 20000, mb: '~4 MB' },
  { value: 50000, mb: '~10 MB' },
  { value: 100000, mb: '~20 MB' },
];

export function SettingsSystemScreen({ navigation, route }: Props) {
  const sourceLocation = route.params?.sourceLocation ?? 'serverlist';
  const { settings, setSettings, updateSetting, settingsSelfVoicingActive } = useSettings(sourceLocation);
  const [encodingModalVisible, setEncodingModalVisible] = useState(false);
  const [exportRangeModalVisible, setExportRangeModalVisible] = useState(false);
  const anyModalOpen = encodingModalVisible || exportRangeModalVisible;
  const blindNavActive = settingsSelfVoicingActive && !anyModalOpen;
  useSettingsScope(SCOPE, settingsSelfVoicingActive);
  const { scrollViewRef, onScroll, onLayout } = useBlindNavAutoScroll(blindNavActive);
  const welcome = useSettingsWelcomeMessage('Sistema');

  // Codificación solo se puede cambiar fuera del MUD (cambiarla mid-session
  // dejaría el socket leyendo bytes con el encoding nuevo).
  const showEncoding = sourceLocation !== 'terminal';

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

  const onToggleLogs = (value: boolean) => {
    const updated = { ...settings, logsEnabled: value };
    setSettings(updated);
    saveSettings(updated);
    logService.configure(value, updated.logsMaxLines);
  };

  const onSelectLogSize = (n: LogsMaxLines) => {
    const updated = { ...settings, logsMaxLines: n };
    setSettings(updated);
    saveSettings(updated);
    logService.configure(true, n);
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
        <Text style={s.title} accessibilityRole="header">Sistema</Text>
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
          <Text style={s.sectionTitle} accessibilityRole="header">Conexión</Text>

          {showEncoding && (
            <SelfVoicingRow
              svActive={settingsSelfVoicingActive}
              svScope={SCOPE}
              svKey="encoding-row"
              svLabel={`Codificación: ${settings.encoding === 'utf8' ? 'UTF-8' : (settings.encoding || 'UTF-8').toUpperCase()}. Pulsa para cambiar.`}
              onActivate={() => setEncodingModalVisible(true)}
              style={s.row}
            >
              <View style={s.rowInfo}>
                <Text style={s.rowTitle}>Codificación</Text>
                <Text style={s.rowDesc}>Codificación de la conexión Telnet. Solo editable fuera del MUD.</Text>
              </View>
              <TouchableOpacity
                style={s.encodingBtn}
                onPress={() => setEncodingModalVisible(true)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Cambiar codificación"
              >
                <Text style={s.encodingBtnText} numberOfLines={1} ellipsizeMode="tail">
                  {settings.encoding === 'utf8' ? 'UTF-8' : (settings.encoding || 'UTF-8').toUpperCase()}
                </Text>
              </TouchableOpacity>
            </SelfVoicingRow>
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
                Mantiene el MUD conectado aunque la pantalla se bloquee o la app pase a segundo plano. Necesario para
                que los triggers sigan procesando líneas y para que las notificaciones lleguen.
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
              <Text style={s.rowDesc}>
                Evita que el teléfono se bloquee por inactividad mientras estás conectado a un personaje.
              </Text>
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
                  ? 'Permite que los triggers disparen notificaciones del sistema. Solo se muestran cuando la app no está en primer plano. Configura las notificaciones concretas en Triggers.'
                  : 'Requiere "Conexión en segundo plano" activa — sin ella las notificaciones no llegan cuando la app no está en pantalla.'}
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

          <Text style={[s.sectionTitle, { marginTop: 24 }]} accessibilityRole="header">Logs</Text>

          <SelfVoicingRow
            svActive={settingsSelfVoicingActive}
            svScope={SCOPE}
            svKey="logs-enabled"
            svLabel={`Guardar logs para soporte. ${settings.logsEnabled ? 'Activado' : 'Desactivado'}`}
            onActivate={() => onToggleLogs(!settings.logsEnabled)}
            style={s.row}
          >
            <View style={s.rowInfo}>
              <Text style={s.rowTitle}>Guardar logs para soporte</Text>
              <Text style={s.rowDesc}>
                Captura la actividad del terminal para exportarla como HTML (útil para compartir con soporte o subir a
                deathlogs.com). Desactivar borra todos los logs.
              </Text>
            </View>
            <Switch
              value={settings.logsEnabled}
              onValueChange={onToggleLogs}
              trackColor={{ false: '#333', true: '#0c0' }}
              thumbColor={settings.logsEnabled ? '#000' : '#666'}
              accessibilityLabel={`Guardar logs para soporte. ${settings.logsEnabled ? 'Activado' : 'Desactivado'}`}
            />
          </SelfVoicingRow>

          {settings.logsEnabled && (
            <>
              {!settingsSelfVoicingActive && (
                <View style={s.row}>
                  <View style={s.rowInfo}>
                    <Text style={s.rowTitle}>Tamaño máximo</Text>
                    <Text style={s.rowDesc}>
                      Cuántas líneas como máximo guarda el log. Al superar el tope se borran las más antiguas.
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
                      {LOG_SIZE_OPTIONS.map(({ value, mb }) => {
                        const active = settings.logsMaxLines === value;
                        return (
                          <TouchableOpacity
                            key={value}
                            style={[localStyles.logSizeBtn, active && localStyles.logSizeBtnActive]}
                            onPress={() => onSelectLogSize(value)}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: active }}
                            accessibilityLabel={`${value.toLocaleString('es')} líneas ${mb}`}
                          >
                            <Text style={[localStyles.logSizeText, active && localStyles.logSizeTextActive]}>
                              {value.toLocaleString('es')}
                            </Text>
                            <Text style={[localStyles.logSizeSubtext, active && localStyles.logSizeTextActive]}>{mb}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </View>
              )}

              {settingsSelfVoicingActive ? (
                <>
                  <SelfVoicingRow
                    svActive={settingsSelfVoicingActive}
                    svScope={SCOPE}
                    svKey="export-log"
                    svLabel="Exportar log. Genera un archivo HTML con la actividad capturada del terminal."
                    onActivate={() => setExportRangeModalVisible(true)}
                    style={s.row}
                  >
                    <View style={s.rowInfo}>
                      <Text style={s.rowTitle}>Exportar log</Text>
                      <Text style={s.rowDesc}>Genera un HTML con la actividad capturada para compartir con soporte.</Text>
                    </View>
                    <View style={localStyles.logActionBtn}>
                      <Text style={localStyles.logActionBtnText}>Exportar</Text>
                    </View>
                  </SelfVoicingRow>
                  <SelfVoicingRow
                    svActive={settingsSelfVoicingActive}
                    svScope={SCOPE}
                    svKey="clear-logs"
                    svLabel="Borrar todos los logs guardados. Acción destructiva, pide confirmación."
                    onActivate={onClearLogs}
                    style={s.row}
                  >
                    <View style={s.rowInfo}>
                      <Text style={s.rowTitle}>Borrar logs</Text>
                      <Text style={s.rowDesc}>Elimina todos los logs guardados. Pide confirmación antes.</Text>
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
              )}
            </>
          )}
        </ScrollView>
      </BlindGestureContainer>

      <AccessibleSelectModal
        visible={encodingModalVisible}
        title="Selecciona codificación"
        scope="encoding-modal"
        selfVoicingActive={settingsSelfVoicingActive}
        options={ENCODING_OPTIONS.map((opt) => ({
          key: opt.value,
          label: opt.label,
          selected: settings.encoding === opt.value,
        }))}
        onSelect={(value) => {
          updateSetting('encoding', value);
          setEncodingModalVisible(false);
        }}
        onCancel={() => setEncodingModalVisible(false)}
      />

      <AccessibleSelectModal<ExportRange>
        visible={exportRangeModalVisible}
        title="¿Qué rango exportar?"
        scope="export-range-modal-system"
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
  logSizeBtnActive: { backgroundColor: '#336633', borderColor: '#558855' },
  logSizeText: { color: '#ccc', fontSize: 13, fontWeight: 'bold' },
  logSizeSubtext: { color: '#888', fontSize: 11 },
  logSizeTextActive: { color: '#fff' },
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
