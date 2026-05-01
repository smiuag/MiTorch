import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { AmbientMappings, RootStackParamList, RoomCategory, TriggerPack } from '../types';
import { loadPacks, savePacks, assignAllCharactersToPacks } from '../storage/triggerStorage';
import { loadServers } from '../storage/serverStorage';
import { loadAmbientMappings, saveAmbientMappings } from '../storage/ambientStorage';
import { listCategories } from '../services/roomCategorizer';
import {
  exportConfigToZip,
  readImportManifest,
  applyImport,
  ImportManifest,
} from '../services/triggerPackExport';
import { userVariablesService } from '../services/userVariablesService';
import { ambientPlayer } from '../services/ambientPlayer';
import { triggerEngine } from '../services/triggerEngine';
import { loadCustomSounds, removeCustomSound } from '../storage/customSoundsStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'ConfigBackup'>;

// Pantalla de import/export de configuración con selección granular.
// La pantalla en sí solo muestra los botones (Exportar / Importar / Borrar).
// Las opciones de qué incluir aparecen en un modal aparte al pulsar el
// botón correspondiente.
//
// Default: todo marcado al abrir el modal (caso típico "cambio de móvil").
// El usuario desmarca lo que no quiera llevar. Las contraseñas de los
// servidores NUNCA viajan en el ZIP — se quitan al exportar.
//
// El master "Todo" es un check derivado del estado de los sub-checks:
// se marca solo cuando todos están marcados; al desmarcarlo se desmarcan
// todos los demás.
//
// Política de import (decisiones cerradas con usuario):
// - Servidores: añadidos como duplicados; sin merge por nombre/host. Si
//   el usuario importa un personaje que ya tiene, ve dos en la lista.
// - Plantillas: añadidas con uuids frescos (sin merge por nombre).
// - Ambiente: merge por categoría (las que vienen pisan, las ausentes
//   se conservan).
// - Settings: blob completo sustituye al actual.

export function ConfigBackupScreen({ navigation }: Props) {
  // ----- Estado de exportación -------------------------------------------
  const [packs, setPacks] = useState<TriggerPack[]>([]);
  const [selectedPackIds, setSelectedPackIds] = useState<Set<string>>(new Set());
  const [exportAmbient, setExportAmbient] = useState(true);
  const [exportServers, setExportServers] = useState(false);
  const [exportSettings, setExportSettings] = useState(false);
  const [exportModalVisible, setExportModalVisible] = useState(false);

  // Stats descriptivos en la cabecera ("X plantillas, Y categorías…").
  const [ambientCount, setAmbientCount] = useState(0);
  const [serverCount, setServerCount] = useState(0);
  const [soundCount, setSoundCount] = useState(0);

  // ----- Estado de importación ------------------------------------------
  // null = aún no se ha seleccionado ZIP. Cuando hay manifest, mostramos
  // el modal con los checkboxes de lo que el ZIP contiene.
  const [importManifest, setImportManifest] = useState<ImportManifest | null>(null);
  const [importPackIndices, setImportPackIndices] = useState<Set<number>>(new Set());
  const [importAmbient, setImportAmbient] = useState(false);
  const [importServers, setImportServers] = useState(false);
  const [importSettings, setImportSettings] = useState(false);

  // ----- Estado de operaciones largas ------------------------------------
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');

  const refresh = useCallback(async () => {
    const [loadedPacks, mappings, sounds, servers] = await Promise.all([
      loadPacks(),
      loadAmbientMappings(),
      loadCustomSounds(),
      loadServers(),
    ]);
    setPacks(loadedPacks);
    let count = 0;
    for (const cat of listCategories()) {
      if (mappings[cat]?.sounds.length > 0) count++;
    }
    setAmbientCount(count);
    setSoundCount(sounds.length);
    setServerCount(servers.length);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // ----- Helpers de selección -------------------------------------------
  const allPacksSelected = packs.length > 0 && packs.every((p) => selectedPackIds.has(p.id));
  const anySectionOn =
    selectedPackIds.size > 0 || exportAmbient || exportServers || exportSettings;
  const allSectionsOn =
    allPacksSelected && exportAmbient && exportServers && exportSettings;

  const togglePack = (id: string) => {
    setSelectedPackIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllExport = () => {
    if (allSectionsOn) {
      setSelectedPackIds(new Set());
      setExportAmbient(false);
      setExportServers(false);
      setExportSettings(false);
    } else {
      setSelectedPackIds(new Set(packs.map((p) => p.id)));
      setExportAmbient(true);
      setExportServers(true);
      setExportSettings(true);
    }
  };

  // Misma lógica para el master del import.
  const allImportPacksSelected =
    !!importManifest &&
    importManifest.packs.length > 0 &&
    importManifest.packs.every((_, i) => importPackIndices.has(i));
  const allImportSectionsOn =
    !!importManifest &&
    allImportPacksSelected &&
    (!importManifest.hasAmbient || importAmbient) &&
    (!importManifest.hasServers || importServers) &&
    (!importManifest.hasSettings || importSettings);

  const toggleImportPack = (i: number) => {
    setImportPackIndices((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const toggleAllImport = () => {
    if (!importManifest) return;
    if (allImportSectionsOn) {
      setImportPackIndices(new Set());
      setImportAmbient(false);
      setImportServers(false);
      setImportSettings(false);
    } else {
      setImportPackIndices(new Set(importManifest.packs.map((_, i) => i)));
      setImportAmbient(importManifest.hasAmbient);
      setImportServers(importManifest.hasServers);
      setImportSettings(importManifest.hasSettings);
    }
  };

  // ----- Export ----------------------------------------------------------

  const openExportModal = () => {
    if (busy) return;
    // Default: todo marcado. El check "Todo" es derivado, así arranca
    // marcado y el usuario desmarca lo que no quiera. La contraseña de
    // los servidores NUNCA viaja en el ZIP (stripped en exportConfigToZip).
    setSelectedPackIds(new Set(packs.map((p) => p.id)));
    setExportAmbient(true);
    setExportServers(true);
    setExportSettings(true);
    setExportModalVisible(true);
  };

  const handleExport = async () => {
    if (busy) return;
    if (!anySectionOn) {
      Alert.alert('Nada que exportar', 'Marca al menos una sección antes de exportar.');
      return;
    }
    setBusyLabel('Exportando configuración…');
    setBusy(true);
    try {
      const zipUri = await exportConfigToZip({
        packIds: Array.from(selectedPackIds),
        includeAmbient: exportAmbient,
        includeServers: exportServers,
        includeSettings: exportSettings,
      });
      // expo-sharing en lugar del Share API de RN (el de RN en Android
      // manda como texto cuando le pasas `url`; expo-sharing adjunta el
      // ZIP como attachment con su mimeType correcto).
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Compartir no disponible', `El archivo está en:\n${zipUri}`);
      } else {
        await Sharing.shareAsync(zipUri, {
          mimeType: 'application/zip',
          dialogTitle: 'Compartir configuración de TorchZhyla',
          UTI: 'public.zip-archive',
        });
      }
      setExportModalVisible(false);
    } catch (e: any) {
      Alert.alert('No se pudo exportar', e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  // ----- Import ----------------------------------------------------------

  const handlePickFile = async () => {
    if (busy) return;
    setBusyLabel('Esperando selección de archivo…');
    setBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setBusyLabel('Leyendo archivo…');
      const manifest = await readImportManifest(asset.uri);
      // Default: todo lo que venga en el ZIP marcado. El usuario desmarca
      // lo que no quiera traer. (Espejo del export.)
      setImportPackIndices(new Set(manifest.packs.map((_, i) => i)));
      setImportAmbient(manifest.hasAmbient);
      setImportServers(manifest.hasServers);
      setImportSettings(manifest.hasSettings);
      // Setear el manifest activa el modal de import.
      setImportManifest(manifest);
    } catch (e: any) {
      Alert.alert('No se pudo leer el archivo', e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleApplyImport = async () => {
    if (busy || !importManifest) return;
    const noneSelected =
      importPackIndices.size === 0 && !importAmbient && !importServers && !importSettings;
    if (noneSelected) {
      Alert.alert('Nada seleccionado', 'Marca al menos una sección antes de importar.');
      return;
    }
    setBusyLabel('Importando configuración…');
    setBusy(true);
    try {
      const result = await applyImport(importManifest, {
        packIndices: Array.from(importPackIndices),
        importAmbient,
        importServers,
        importSettings,
      });
      if (result.ambientCategoriesApplied > 0) {
        await ambientPlayer.reloadMappings();
      }

      const parts: string[] = [];
      if (result.importedPacks.length > 0) {
        parts.push(
          `${result.importedPacks.length} plantilla${result.importedPacks.length === 1 ? '' : 's'}`,
        );
      }
      if (result.ambientCategoriesApplied > 0) {
        parts.push(
          `${result.ambientCategoriesApplied} categoría${result.ambientCategoriesApplied === 1 ? '' : 's'} de ambiente`,
        );
      }
      if (result.importedServerCount > 0) {
        parts.push(
          `${result.importedServerCount} personaje${result.importedServerCount === 1 ? '' : 's'}`,
        );
      }
      if (result.importedSettingsApplied) {
        parts.push('settings de la app');
      }
      if (result.importedSoundCount > 0) {
        parts.push(
          `${result.importedSoundCount} sonido${result.importedSoundCount === 1 ? '' : 's'}`,
        );
      }
      if (result.missingSoundCount > 0) {
        parts.push(
          `⚠ ${result.missingSoundCount} sonido${result.missingSoundCount === 1 ? '' : 's'} no extraído${result.missingSoundCount === 1 ? '' : 's'}`,
        );
      }
      if (result.newlyDeclaredVarNames.length > 0) {
        parts.push(
          `${result.newlyDeclaredVarNames.length} variable${result.newlyDeclaredVarNames.length === 1 ? '' : 's'} nueva${result.newlyDeclaredVarNames.length === 1 ? '' : 's'}`,
        );
      }

      setImportManifest(null);
      await refresh();

      const summary = parts.length > 0 ? parts.join(', ') : 'nada nuevo';
      if (result.importedPacks.length > 0) {
        const servers = await loadServers();
        if (servers.length > 0) {
          const addedIds = result.importedPacks.map((p) => p.id);
          Alert.alert(
            'Importación completa',
            `Importado: ${summary}.\n\n¿Asignar las plantillas a tus ${servers.length} personaje${servers.length === 1 ? '' : 's'}?`,
            [
              { text: 'No', style: 'cancel' },
              {
                text: 'Sí, asignar',
                onPress: async () => {
                  await assignAllCharactersToPacks(addedIds);
                },
              },
            ],
          );
        } else {
          Alert.alert('Importación completa', `Importado: ${summary}.`);
        }
      } else {
        Alert.alert('Importación completa', `Importado: ${summary}.`);
      }
    } catch (e: any) {
      Alert.alert('No se pudo importar', e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleCancelImport = () => {
    setImportManifest(null);
  };

  // ----- Borrado total --------------------------------------------------
  // Borra plantillas + ambient + sonidos + user vars. NO toca servidores
  // ni layouts ni settings. Puede usarse antes de un import limpio.
  const handleDeleteAll = () => {
    if (busy) return;
    Alert.alert(
      'Borrar configuración importable',
      'Esto va a borrar TODAS tus plantillas de triggers, mappings de ambiente, sonidos personalizados y variables de usuario.\n\nNO toca servidores, layouts de botones ni settings de la app.\n\n¿Continuar? No se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            setBusyLabel('Borrando configuración…');
            setBusy(true);
            try {
              ambientPlayer.stop();
              triggerEngine.clear();
              await savePacks([]);
              const declared = userVariablesService.getDeclared();
              for (const name of declared) {
                await userVariablesService.undeclare(name);
              }
              const empty = {} as AmbientMappings;
              for (const cat of listCategories() as RoomCategory[]) {
                empty[cat] = { sounds: [] };
              }
              await saveAmbientMappings(empty);
              await ambientPlayer.reloadMappings();
              const sounds = await loadCustomSounds();
              for (const s of sounds) {
                await removeCustomSound(s.uuid);
              }
              await refresh();
              Alert.alert(
                'Configuración borrada',
                `Eliminados: ${declared.length} variables, ${sounds.length} sonidos y todas las plantillas y mappings de ambiente.`,
              );
            } catch (e: any) {
              Alert.alert('Error al borrar', e?.message ?? String(e));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  // ----- Render del modal de export -------------------------------------

  const renderExportModal = () => (
    <Modal
      visible={exportModalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setExportModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>📤 Exportar configuración</Text>
            <Text style={styles.modalSubtitle}>
              Marca lo que quieras incluir en el ZIP.
            </Text>
          </View>

          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
            <Checkbox
              checked={allSectionsOn}
              label="Todo"
              desc="Marca/desmarca todas las casillas de abajo"
              onToggle={toggleAllExport}
              emphasis
            />

            <Text style={styles.subSection}>
              Plantillas de triggers ({packs.length})
            </Text>
            {packs.length === 0 ? (
              <Text style={styles.emptyHint}>
                No hay plantillas guardadas. Crea o importa alguna desde Triggers.
              </Text>
            ) : (
              packs.map((p) => (
                <Checkbox
                  key={p.id}
                  checked={selectedPackIds.has(p.id)}
                  label={p.name}
                  desc={`${p.triggers.length} trigger${p.triggers.length === 1 ? '' : 's'} · sus user vars y sonidos referenciados se incluyen`}
                  onToggle={() => togglePack(p.id)}
                  indented
                />
              ))
            )}

            <Text style={styles.subSection}>Otros</Text>
            <Checkbox
              checked={exportAmbient}
              label="Ambiente"
              desc={`${ambientCount} categoría${ambientCount === 1 ? '' : 's'} con sonidos asignados`}
              onToggle={() => setExportAmbient((v) => !v)}
              indented
            />
            <Checkbox
              checked={exportServers}
              label="Personajes"
              desc={`${serverCount} personaje${serverCount === 1 ? '' : 's'} (incluye su layout de botones y aliases de canales). Las contraseñas NO se exportan — el destino tendrá que reescribirlas.`}
              onToggle={() => setExportServers((v) => !v)}
              indented
            />
            <Checkbox
              checked={exportSettings}
              label="Settings de la app"
              desc="Tema, fuente, gestos, volúmenes, kill-switches… Sustituyen los settings del móvil destino al importar."
              onToggle={() => setExportSettings((v) => !v)}
              indented
            />
          </ScrollView>

          <View style={styles.modalButtonRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.cancelBtn, styles.flex1, busy && styles.actionBtnDisabled]}
              onPress={() => setExportModalVisible(false)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Cancelar exportación"
            >
              <Text style={styles.actionTitle}>✕ Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.actionBtn,
                styles.flex1,
                (!anySectionOn || busy) && styles.actionBtnDisabled,
              ]}
              onPress={handleExport}
              disabled={busy || !anySectionOn}
              accessibilityRole="button"
              accessibilityLabel="Exportar la selección"
            >
              <Text style={styles.actionTitle}>✓ Exportar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  // ----- Render del modal de import -------------------------------------

  const renderImportModal = () => (
    <Modal
      visible={!!importManifest}
      transparent
      animationType="fade"
      onRequestClose={handleCancelImport}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          {importManifest && (
            <>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>📥 Importar configuración</Text>
                <Text style={styles.modalSubtitle}>
                  Contenido del archivo (v{importManifest.version}). Desmarca lo
                  que no quieras traer.
                </Text>
              </View>

              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.modalScrollContent}
              >
                <Checkbox
                  checked={allImportSectionsOn}
                  label="Todo"
                  desc="Marca/desmarca todas las casillas de abajo"
                  onToggle={toggleAllImport}
                  emphasis
                />

                {importManifest.packs.length > 0 && (
                  <>
                    <Text style={styles.subSection}>
                      Plantillas ({importManifest.packs.length})
                    </Text>
                    {importManifest.packs.map((p, i) => (
                      <Checkbox
                        key={`mpack-${i}`}
                        checked={importPackIndices.has(i)}
                        label={p.name}
                        desc={`${p.triggerCount} trigger${p.triggerCount === 1 ? '' : 's'}`}
                        onToggle={() => toggleImportPack(i)}
                        indented
                      />
                    ))}
                  </>
                )}

                {(importManifest.hasAmbient ||
                  importManifest.hasServers ||
                  importManifest.hasSettings) && (
                  <Text style={styles.subSection}>Otros</Text>
                )}
                {importManifest.hasAmbient && (
                  <Checkbox
                    checked={importAmbient}
                    label="Ambiente"
                    desc={`${importManifest.ambientCategoryCount} categoría${importManifest.ambientCategoryCount === 1 ? '' : 's'} con sonidos. Las categorías que vengan sustituyen las tuyas; las ausentes se conservan.`}
                    onToggle={() => setImportAmbient((v) => !v)}
                    indented
                  />
                )}
                {importManifest.hasServers && (
                  <Checkbox
                    checked={importServers}
                    label="Personajes"
                    desc={`${importManifest.serverCount} personaje${importManifest.serverCount === 1 ? '' : 's'}. Se AÑADEN como nuevos (si ya tienes uno con el mismo nombre, verás dos en la lista).`}
                    onToggle={() => setImportServers((v) => !v)}
                    indented
                  />
                )}
                {importManifest.hasSettings && (
                  <Checkbox
                    checked={importSettings}
                    label="Settings de la app"
                    desc="Sustituye TODOS tus settings actuales por los del archivo. Tema, fuente, volúmenes, etc."
                    onToggle={() => setImportSettings((v) => !v)}
                    indented
                  />
                )}
              </ScrollView>

              <View style={styles.modalButtonRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.cancelBtn, styles.flex1, busy && styles.actionBtnDisabled]}
                  onPress={handleCancelImport}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="Cancelar importación"
                >
                  <Text style={styles.actionTitle}>✕ Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.flex1, busy && styles.actionBtnDisabled]}
                  onPress={handleApplyImport}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="Importar la selección"
                >
                  <Text style={styles.actionTitle}>✓ Importar</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>{'< Volver'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Importar / exportar configuración</Text>
        <Text style={styles.subtitle}>
          Llévate tu setup en un ZIP. Útil para cambiar de móvil o compartir con
          otro jugador.
        </Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <TouchableOpacity
          style={[styles.actionBtn, busy && styles.actionBtnDisabled]}
          onPress={openExportModal}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Abrir opciones de exportación"
        >
          <Text style={styles.actionTitle}>📤 Exportar</Text>
          <Text style={styles.actionDesc}>
            Elige qué partes incluir y genera un ZIP para compartir.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, busy && styles.actionBtnDisabled]}
          onPress={handlePickFile}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Seleccionar archivo ZIP para importar"
        >
          <Text style={styles.actionTitle}>📥 Importar</Text>
          <Text style={styles.actionDesc}>
            Selecciona un ZIP y elige qué partes traer al móvil.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnDanger, busy && styles.actionBtnDisabled]}
          onPress={handleDeleteAll}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Borrar configuración importable"
        >
          <Text style={[styles.actionTitle, styles.actionTitleDanger]}>
            🗑 Borrar configuración importable
          </Text>
          <Text style={styles.actionDesc}>
            Elimina plantillas, mappings de ambiente, sonidos y user vars. NO
            toca personajes, layouts ni settings.
          </Text>
        </TouchableOpacity>

        <Text style={styles.note}>
          Para exportar UNA plantilla concreta, usa el botón "Exportar" dentro
          de la plantilla en Triggers.
        </Text>
      </ScrollView>

      {renderExportModal()}
      {renderImportModal()}

      {busy && (
        <View
          style={styles.busyOverlay}
          accessibilityViewIsModal
          accessibilityLiveRegion="polite"
          importantForAccessibility="yes"
        >
          <View style={styles.busyBox}>
            <ActivityIndicator size="large" color="#0c0" />
            <Text style={styles.busyText}>{busyLabel || 'Trabajando…'}</Text>
            <Text style={styles.busySubtext}>No cierres la app</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

// ----- Componente Checkbox accesible --------------------------------------
interface CheckboxProps {
  checked: boolean;
  label: string;
  desc?: string;
  onToggle: () => void;
  indented?: boolean;
  emphasis?: boolean;
}

function Checkbox({ checked, label, desc, onToggle, indented, emphasis }: CheckboxProps) {
  return (
    <TouchableOpacity
      style={[styles.checkRow, indented && styles.checkRowIndented]}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={`${label}${checked ? ', marcado' : ', sin marcar'}`}
      accessibilityHint={desc}
    >
      <View style={[styles.checkBox, checked && styles.checkBoxOn]}>
        {checked && <Text style={styles.checkMark}>✓</Text>}
      </View>
      <View style={styles.checkText}>
        <Text style={[styles.checkLabel, emphasis && styles.checkLabelEmph]}>{label}</Text>
        {desc && <Text style={styles.checkDesc}>{desc}</Text>}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: {
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backBtn: { marginBottom: 8 },
  backText: { color: '#0c0', fontSize: 14, fontFamily: 'monospace' },
  title: { color: '#fff', fontSize: 18, fontWeight: 'bold', fontFamily: 'monospace' },
  subtitle: { color: '#888', fontSize: 11, fontFamily: 'monospace', marginTop: 6, lineHeight: 16 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  subSection: {
    color: '#888',
    fontSize: 11,
    fontFamily: 'monospace',
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 4,
  },
  emptyHint: {
    color: '#555',
    fontSize: 12,
    fontFamily: 'monospace',
    fontStyle: 'italic',
    marginLeft: 12,
    marginVertical: 4,
  },
  // Checkbox row
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 4,
    minHeight: 44, // accessibility tap target
  },
  checkRowIndented: { paddingLeft: 16 },
  checkBox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: '#0c0',
    borderRadius: 4,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  checkBoxOn: { backgroundColor: '#0c0' },
  checkMark: { color: '#000', fontWeight: 'bold', fontSize: 14 },
  checkText: { flex: 1 },
  checkLabel: { color: '#ccc', fontSize: 14, fontFamily: 'monospace' },
  checkLabelEmph: { color: '#fff', fontWeight: 'bold' },
  checkDesc: { color: '#777', fontSize: 11, fontFamily: 'monospace', marginTop: 2, lineHeight: 16 },
  // Action buttons
  actionBtn: {
    backgroundColor: '#0e2a0e',
    borderWidth: 1,
    borderColor: '#0c6c0c',
    borderRadius: 10,
    padding: 14,
    marginTop: 14,
  },
  actionBtnDisabled: { opacity: 0.4 },
  actionBtnDanger: {
    backgroundColor: '#3a0a0a',
    borderColor: '#cc3333',
  },
  actionTitle: {
    color: '#0c0',
    fontSize: 15,
    fontFamily: 'monospace',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  actionTitleDanger: { color: '#ff5555' },
  actionDesc: { color: '#aac0aa', fontSize: 11, fontFamily: 'monospace', lineHeight: 16 },
  cancelBtn: {
    backgroundColor: '#222',
    borderColor: '#666',
  },
  flex1: { flex: 1 },
  note: {
    color: '#666',
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 14,
    lineHeight: 16,
    fontStyle: 'italic',
  },
  // Modal (export / import)
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#0c0',
    borderRadius: 12,
    width: '100%',
    maxWidth: 560,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  modalHeader: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    backgroundColor: '#111',
  },
  modalTitle: {
    color: '#0c0',
    fontSize: 16,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  modalSubtitle: {
    color: '#888',
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 6,
    lineHeight: 16,
  },
  modalScroll: { flexGrow: 0 },
  modalScrollContent: { padding: 16 },
  modalButtonRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#222',
    backgroundColor: '#0d0d0d',
  },
  // Busy overlay
  busyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  busyBox: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#0c0',
    borderRadius: 12,
    paddingVertical: 24,
    paddingHorizontal: 32,
    alignItems: 'center',
    minWidth: 220,
  },
  busyText: {
    color: '#0c0',
    fontSize: 14,
    fontFamily: 'monospace',
    fontWeight: 'bold',
    marginTop: 14,
    textAlign: 'center',
  },
  busySubtext: {
    color: '#888',
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 6,
    fontStyle: 'italic',
  },
});
