import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { AmbientMappings, RootStackParamList, RoomCategory, TriggerPack } from '../types';
import {
  loadPacks,
  savePacks,
  assignAllCharactersToPacks,
} from '../storage/triggerStorage';
import { loadServers } from '../storage/serverStorage';
import { loadAmbientMappings, saveAmbientMappings } from '../storage/ambientStorage';
import { listCategories } from '../services/roomCategorizer';
import {
  exportAllPacksToZip,
  importFromZip,
} from '../services/triggerPackExport';
import { collectVarsReferencedByPacks } from '../utils/userVariablesUsage';
import { userVariablesService } from '../services/userVariablesService';
import { ambientPlayer } from '../services/ambientPlayer';
import { triggerEngine } from '../services/triggerEngine';
import { loadCustomSounds, removeCustomSound } from '../storage/customSoundsStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'ConfigBackup'>;

// Pantalla de import/export de configuración. Es el reemplazo del botón
// "Backup" antiguo de TriggersScreen, ampliado para incluir mappings de
// ambient. Mismo formato ZIP `torchzhyla-config-backup` (con compat de
// lectura para el legacy `torchzhyla-trigger-backup`).
//
// La filosofía es "todo o nada en el ZIP": exporta packs + mappings +
// sonidos referenciados por ambos. Al importar, los packs se AÑADEN
// (con uuids frescos, sin merge por nombre) y los mappings se MERGEAN
// por categoría (las que vienen sobrescriben, las ausentes se conservan).

export function ConfigBackupScreen({ navigation }: Props) {
  const [packCount, setPackCount] = useState(0);
  const [triggerCount, setTriggerCount] = useState(0);
  const [ambientCount, setAmbientCount] = useState(0);
  const [soundCount, setSoundCount] = useState(0);
  // busy + busyLabel funcionan juntos: cuando busy es true mostramos un
  // overlay no-cancelable con spinner y la etiqueta. Las operaciones de
  // import/export pueden tardar 5-30 s con ZIPs grandes (200 MB+) y sin
  // este feedback el usuario no sabe si la app se ha colgado.
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');

  const refresh = useCallback(async () => {
    const [packs, mappings, sounds] = await Promise.all([
      loadPacks(),
      loadAmbientMappings(),
      loadCustomSounds(),
    ]);
    setPackCount(packs.length);
    setTriggerCount(packs.reduce((acc, p) => acc + p.triggers.length, 0));
    let count = 0;
    for (const cat of listCategories()) {
      if (mappings[cat]?.sounds.length > 0) count++;
    }
    setAmbientCount(count);
    setSoundCount(sounds.length);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const handleExport = async () => {
    if (busy) return;
    setBusyLabel('Exportando configuración…');
    setBusy(true);
    try {
      const packs = await loadPacks();
      const zipUri = await exportAllPacksToZip(packs, { includeAmbients: true });
      // Usamos expo-sharing en lugar del Share API de RN — el de RN en
      // Android solo manda texto cuando le pasas `url` (apps como WhatsApp
      // lo interpretan como mensaje, no como fichero). expo-sharing adjunta
      // el ZIP como attachment con su mimeType correcto.
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Compartir no disponible', `El archivo está en:\n${zipUri}`);
        return;
      }
      await Sharing.shareAsync(zipUri, {
        mimeType: 'application/zip',
        dialogTitle: 'Compartir configuración de TorchZhyla',
        UTI: 'public.zip-archive',
      });
    } catch (e: any) {
      Alert.alert('No se pudo exportar', e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
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
      // Cambiamos el label una vez seleccionado: la fase de extracción
      // del ZIP es la más larga (puede tardar 10-30 s con 200 MB).
      setBusyLabel('Importando configuración…');
      const zipResult = await importFromZip(asset.uri);
      // Single-pack ZIPs (export individual de una plantilla) llegan
      // como `kind: 'pack'`. Los normalizamos al shape de "backup" para
      // tratarlos uniformemente: 1 pack importado, sin mappings.
      const r = zipResult.kind === 'backup'
        ? zipResult.result
        : {
            packs: [zipResult.result.pack],
            importedSoundCount: zipResult.result.importedSoundCount,
            missingSoundCount: zipResult.result.missingSoundCount,
            ambientCategoriesApplied: 0,
          };
      // Guarda los packs nuevos junto a los existentes y refresca la pantalla
      // de mis ambientes recargando el AmbientPlayer.
      const existing = await loadPacks();
      const mergedPacks: TriggerPack[] = [...existing, ...r.packs];
      if (r.packs.length > 0) await savePacks(mergedPacks);
      // Auto-declare user vars referenciadas en los packs importados.
      const refs = collectVarsReferencedByPacks(r.packs);
      const newlyAdded = refs.length > 0 ? await userVariablesService.declareMany(refs) : [];
      // El AmbientPlayer relee los mappings (cambian si el import los tocó).
      await ambientPlayer.reloadMappings();

      const parts: string[] = [];
      if (r.packs.length > 0) parts.push(`${r.packs.length} plantilla${r.packs.length === 1 ? '' : 's'} importada${r.packs.length === 1 ? '' : 's'}`);
      if (r.ambientCategoriesApplied > 0) parts.push(`${r.ambientCategoriesApplied} categoría${r.ambientCategoriesApplied === 1 ? '' : 's'} de ambiente actualizada${r.ambientCategoriesApplied === 1 ? '' : 's'}`);
      if (r.importedSoundCount > 0) parts.push(`${r.importedSoundCount} sonido${r.importedSoundCount === 1 ? '' : 's'} añadido${r.importedSoundCount === 1 ? '' : 's'}`);
      if (r.missingSoundCount > 0) parts.push(`⚠ ${r.missingSoundCount} sonido${r.missingSoundCount === 1 ? '' : 's'} no se pudieron extraer`);
      if (newlyAdded.length > 0) parts.push(`${newlyAdded.length} variable${newlyAdded.length === 1 ? '' : 's'} de usuario declarada${newlyAdded.length === 1 ? '' : 's'}`);

      if (parts.length === 0) {
        Alert.alert('Importación vacía', 'El archivo no contenía contenido nuevo.');
      } else if (r.packs.length === 0) {
        // Solo ambientes — no hay nada que asignar a personajes.
        Alert.alert('Importación completa', parts.join('. ') + '.');
      } else {
        const servers = await loadServers();
        if (servers.length === 0) {
          Alert.alert('Importación completa', parts.join('. ') + '.');
        } else {
          const addedIds = r.packs.map((p) => p.id);
          Alert.alert(
            'Importación completa',
            `${parts.join('. ')}.\n\n¿Asignar las plantillas importadas a tus ${servers.length} personaje${servers.length === 1 ? '' : 's'}?`,
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
        }
      }
      await refresh();
    } catch (e: any) {
      Alert.alert('No se pudo importar', e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  // Borrado total de la configuración importable: plantillas, mappings de
  // ambiente, sonidos custom y user vars declaradas. NO toca servidores,
  // layouts de botones ni settings — esas son configuraciones del usuario
  // que no se exportan en este ZIP, y borrarlas sería destructivo
  // inesperadamente.
  const handleDeleteAll = () => {
    if (busy) return;
    Alert.alert(
      'Borrar configuración actual',
      'Esto va a borrar TODAS tus plantillas de triggers, mappings de ambiente, sonidos personalizados y variables de usuario.\n\nNO toca servidores, layouts de botones ni settings de la app.\n\n¿Continuar? No se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar todo',
          style: 'destructive',
          onPress: async () => {
            setBusyLabel('Borrando configuración…');
            setBusy(true);
            try {
              // 1) Para el ambient en marcha y limpia el motor de triggers
              //    para que ninguna referencia siga viva.
              ambientPlayer.stop();
              triggerEngine.clear();

              // 2) Plantillas y user vars (los packs referencian variables;
              //    al desaparecer los packs, las declaraciones quedan
              //    huérfanas, así que las quitamos).
              await savePacks([]);
              const declared = userVariablesService.getDeclared();
              for (const name of declared) {
                await userVariablesService.undeclare(name);
              }

              // 3) Mappings de ambient — todos vacíos.
              const empty = {} as AmbientMappings;
              for (const cat of listCategories() as RoomCategory[]) {
                empty[cat] = { sounds: [] };
              }
              await saveAmbientMappings(empty);
              await ambientPlayer.reloadMappings();

              // 4) Sonidos custom — borrado uno a uno (también borra el
              //    fichero del disco, ver customSoundsStorage).
              const sounds = await loadCustomSounds();
              for (const s of sounds) {
                await removeCustomSound(s.uuid);
              }

              await refresh();
              Alert.alert(
                'Configuración borrada',
                `Eliminados: ${declared.length} variables de usuario, ${sounds.length} sonidos custom y todas las plantillas y mappings de ambiente.`,
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

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>{'< Volver'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Importar / exportar configuración</Text>
        <Text style={styles.subtitle}>
          Empaqueta tus plantillas de triggers, mappings de ambiente y los sonidos personalizados que usen en
          un único archivo ZIP. Útil para compartir setups o para mover tu config a otro móvil. NO incluye
          servidores, layouts de botones ni settings de la app.
        </Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.statsBlock}>
          <Text style={styles.statsTitle}>Estado actual</Text>
          <Text style={styles.statsRow}>· {packCount} plantilla{packCount === 1 ? '' : 's'} de triggers ({triggerCount} trigger{triggerCount === 1 ? '' : 's'} en total)</Text>
          <Text style={styles.statsRow}>· {ambientCount} categoría{ambientCount === 1 ? '' : 's'} de ambiente con sonidos asignados</Text>
          <Text style={styles.statsRow}>· {soundCount} sonido{soundCount === 1 ? '' : 's'} personalizado{soundCount === 1 ? '' : 's'}</Text>
        </View>

        <TouchableOpacity
          style={[styles.actionBtn, busy && styles.actionBtnDisabled]}
          onPress={handleExport}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Exportar configuración"
        >
          <Text style={styles.actionTitle}>📤 Exportar configuración</Text>
          <Text style={styles.actionDesc}>
            Genera un ZIP con todo lo de arriba y abre el panel de compartir.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, busy && styles.actionBtnDisabled]}
          onPress={handleImport}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Importar configuración"
        >
          <Text style={styles.actionTitle}>📥 Importar configuración</Text>
          <Text style={styles.actionDesc}>
            Selecciona un ZIP. Las plantillas se añaden, las categorías de ambiente que vengan en el ZIP
            sustituyen a las actuales (las demás se conservan).
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnDanger, busy && styles.actionBtnDisabled]}
          onPress={handleDeleteAll}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Borrar configuración actual"
        >
          <Text style={[styles.actionTitle, styles.actionTitleDanger]}>🗑 Borrar configuración actual</Text>
          <Text style={styles.actionDesc}>
            Elimina TODAS las plantillas, mappings de ambiente, sonidos personalizados y variables de
            usuario. Útil antes de importar un setup nuevo desde cero. NO toca servidores ni layouts.
          </Text>
        </TouchableOpacity>

        <Text style={styles.note}>
          Para exportar UNA plantilla concreta (sin tocar el resto de la config), usa el botón "Exportar"
          dentro de la plantilla en Triggers.
        </Text>
      </ScrollView>

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
  statsBlock: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 8,
    padding: 14,
    marginBottom: 18,
  },
  statsTitle: { color: '#888', fontSize: 12, fontFamily: 'monospace', textTransform: 'uppercase', marginBottom: 6 },
  statsRow: { color: '#ccc', fontSize: 13, fontFamily: 'monospace', marginTop: 2 },
  actionBtn: {
    backgroundColor: '#0e2a0e',
    borderWidth: 1,
    borderColor: '#0c6c0c',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
  },
  actionBtnDisabled: { opacity: 0.5 },
  actionBtnDanger: {
    backgroundColor: '#3a0a0a',
    borderColor: '#cc3333',
  },
  actionTitle: { color: '#0c0', fontSize: 16, fontFamily: 'monospace', fontWeight: 'bold', marginBottom: 6 },
  actionTitleDanger: { color: '#ff5555' },
  actionDesc: { color: '#aac0aa', fontSize: 12, fontFamily: 'monospace', lineHeight: 18 },
  note: { color: '#666', fontSize: 11, fontFamily: 'monospace', marginTop: 8, lineHeight: 16, fontStyle: 'italic' },
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
