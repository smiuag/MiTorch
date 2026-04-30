import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import { RootStackParamList, TriggerPack } from '../types';
import {
  loadPacks,
  savePacks,
  assignAllCharactersToPacks,
} from '../storage/triggerStorage';
import { loadServers } from '../storage/serverStorage';
import { loadAmbientMappings } from '../storage/ambientStorage';
import { listCategories } from '../services/roomCategorizer';
import {
  exportAllPacksToZip,
  importFromZip,
} from '../services/triggerPackExport';
import { collectVarsReferencedByPacks } from '../utils/userVariablesUsage';
import { userVariablesService } from '../services/userVariablesService';
import { ambientPlayer } from '../services/ambientPlayer';

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
  const [ambientCount, setAmbientCount] = useState(0);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [packs, mappings] = await Promise.all([
      loadPacks(),
      loadAmbientMappings(),
    ]);
    setPackCount(packs.length);
    let count = 0;
    for (const cat of listCategories()) {
      if (mappings[cat]?.sounds.length > 0) count++;
    }
    setAmbientCount(count);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const handleExport = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const packs = await loadPacks();
      const zipUri = await exportAllPacksToZip(packs, { includeAmbients: true });
      await Share.share({ url: zipUri, message: 'Configuración de TorchZhyla' });
    } catch (e: any) {
      Alert.alert('No se pudo exportar', e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const zipResult = await importFromZip(asset.uri);
      if (zipResult.kind !== 'backup') {
        Alert.alert(
          'Tipo no soportado aquí',
          'Este archivo es un export de plantilla individual. Importa desde Triggers → "+ Nueva plantilla" → "Importar plantilla".',
        );
        return;
      }
      const r = zipResult.result;
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
          <Text style={styles.statsRow}>· {packCount} plantilla{packCount === 1 ? '' : 's'} de triggers</Text>
          <Text style={styles.statsRow}>· {ambientCount} categoría{ambientCount === 1 ? '' : 's'} de ambiente con sonidos asignados</Text>
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

        <Text style={styles.note}>
          Para exportar UNA plantilla concreta (sin tocar el resto de la config), usa el botón "Exportar"
          dentro de la plantilla en Triggers.
        </Text>
      </ScrollView>
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
  actionTitle: { color: '#0c0', fontSize: 16, fontFamily: 'monospace', fontWeight: 'bold', marginBottom: 6 },
  actionDesc: { color: '#aac0aa', fontSize: 12, fontFamily: 'monospace', lineHeight: 18 },
  note: { color: '#666', fontSize: 11, fontFamily: 'monospace', marginTop: 8, lineHeight: 16, fontStyle: 'italic' },
});
