import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { RootStackParamList, MapLibraryEntry } from '../types';
import {
  listLibrary,
  saveImportedMap,
  renameMap,
  deleteMap,
} from '../storage/mapLibraryStorage';
import { parseMudletJson, DirectionPreset } from '../services/mudletMapParser';

type Props = NativeStackScreenProps<RootStackParamList, 'MyMaps'>;

interface PendingImport {
  uri: string;
  defaultName: string;
}

export function MapLibraryScreen({ navigation }: Props) {
  const [entries, setEntries] = useState<MapLibraryEntry[]>([]);
  const [renameTarget, setRenameTarget] = useState<MapLibraryEntry | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [pendingName, setPendingName] = useState('');
  const [pendingPreset, setPendingPreset] = useState<DirectionPreset>('spanish');
  const [importing, setImporting] = useState(false);

  const refresh = useCallback(async () => {
    const list = await listLibrary();
    setEntries(list);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const handlePick = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        // Mudlet exporta `.json`; algunos emisores guardan como octet-stream.
        // Aceptamos cualquier tipo y validamos contenido al parsear.
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const filename = asset.name || `map-${Date.now()}.json`;
      const baseName = filename.replace(/\.json$/i, '');
      setPending({ uri: asset.uri, defaultName: baseName });
      setPendingName(baseName);
      setPendingPreset('spanish');
    } catch (e: any) {
      Alert.alert('No se pudo abrir el archivo', e?.message ?? String(e));
    }
  };

  const handleConfirmImport = async () => {
    if (!pending) return;
    const name = pendingName.trim() || pending.defaultName || 'Mapa';
    setImporting(true);
    // Cedemos un frame para que el spinner aparezca antes de bloquear el JS
    // thread con el JSON.parse + transformación (~28 MB del map de Reinos
    // tarda 1-3 s en RN).
    await new Promise((r) => setTimeout(r, 50));
    try {
      const file = new File(pending.uri);
      if (!file.exists) {
        throw new Error('El archivo seleccionado ya no existe.');
      }
      const text = await file.text();
      const { map, stats } = parseMudletJson(text, { directionPreset: pendingPreset });
      if (stats.roomCount === 0) {
        throw new Error('El archivo no contiene salas válidas.');
      }
      await saveImportedMap(name, map);
      setPending(null);
      setPendingName('');
      await refresh();
      Alert.alert(
        'Importado',
        `${stats.roomCount} salas en ${stats.areaCount} áreas.${
          stats.skippedRooms ? ` ${stats.skippedRooms} ignoradas (vacías).` : ''
        }`,
      );
    } catch (e: any) {
      Alert.alert('No se pudo importar el mapa', e?.message ?? String(e));
    } finally {
      setImporting(false);
    }
  };

  const handleCancelImport = () => {
    if (importing) return;
    setPending(null);
    setPendingName('');
  };

  const handleDelete = (entry: MapLibraryEntry) => {
    if (entry.builtin) return;
    Alert.alert(
      'Borrar mapa',
      `¿Borrar "${entry.name}"? Los personajes que lo tengan asignado se quedarán sin mapa.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMap(entry.id);
              await refresh();
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? String(e));
            }
          },
        },
      ],
    );
  };

  const startRename = (entry: MapLibraryEntry) => {
    if (entry.builtin) return;
    setRenameTarget(entry);
    setRenameValue(entry.name);
  };

  const confirmRename = async () => {
    if (!renameTarget) return;
    const name = renameValue.trim();
    if (!name) {
      Alert.alert('Falta el nombre', 'El mapa necesita un nombre.');
      return;
    }
    try {
      await renameMap(renameTarget.id, name);
      setRenameTarget(null);
      setRenameValue('');
      await refresh();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? String(e));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Text style={styles.backText}>{'< Volver'}</Text>
        </TouchableOpacity>
        <Text style={styles.title} accessibilityRole="header">Mis mapas</Text>
        <Text style={styles.subtitle}>
          Biblioteca de mapas importados desde Mudlet. Asigna un mapa a cada personaje en la lista de
          servidores. Para exportar el mapa de Mudlet ejecuta en su línea de comandos:{'\n'}
          <Text style={styles.subtitleMono}>{'lua saveJsonMap(getMudletHomeDir() .. "/map.json")'}</Text>
        </Text>
      </View>

      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.importBtn} onPress={handlePick} accessibilityRole="button">
          <Text style={styles.importBtnText}>+ Importar mapa de Mudlet</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowName}>
                {item.name}
                {item.builtin && <Text style={styles.rowBadge}>  (incluido)</Text>}
              </Text>
              <Text style={styles.rowMeta}>
                {item.roomCount.toLocaleString('es-ES')} salas
                {item.importedAt > 0 &&
                  ` · importado ${new Date(item.importedAt).toLocaleDateString('es-ES')}`}
              </Text>
            </View>
            {!item.builtin && (
              <>
                <TouchableOpacity
                  style={styles.rowBtn}
                  onPress={() => startRename(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Renombrar ${item.name}`}
                >
                  <Text style={styles.rowBtnTextEdit}>✎</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.rowBtn}
                  onPress={() => handleDelete(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Borrar ${item.name}`}
                >
                  <Text style={styles.rowBtnTextDelete}>✕</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No hay mapas importados.</Text>}
      />

      <Modal
        visible={pending !== null}
        transparent
        animationType="fade"
        onRequestClose={handleCancelImport}
      >
        <View style={styles.modalOverlay} accessibilityViewIsModal>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle} accessibilityRole="header">Importar mapa</Text>
            <Text style={styles.label}>Nombre</Text>
            <TextInput
              style={styles.modalInput}
              value={pendingName}
              onChangeText={setPendingName}
              placeholder="Nombre del mapa"
              placeholderTextColor="#666"
              editable={!importing}
              accessibilityLabel="Nombre del mapa"
            />
            <Text style={[styles.label, { marginTop: 16 }]}>Idioma de las direcciones</Text>
            <Text style={styles.helperText}>
              Cómo traducir up/down/in/out al comando que el MUD acepta. Cardinales (n/s/e/w) son iguales en
              ambos.
            </Text>
            <View style={styles.presetRow}>
              <TouchableOpacity
                style={[styles.presetBtn, pendingPreset === 'spanish' && styles.presetBtnActive]}
                onPress={() => !importing && setPendingPreset('spanish')}
                accessibilityRole="radio"
                accessibilityState={{ selected: pendingPreset === 'spanish' }}
              >
                <Text style={styles.presetBtnText}>Español</Text>
                <Text style={styles.presetBtnHint}>ar / ab / de / fu</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.presetBtn, pendingPreset === 'english' && styles.presetBtnActive]}
                onPress={() => !importing && setPendingPreset('english')}
                accessibilityRole="radio"
                accessibilityState={{ selected: pendingPreset === 'english' }}
              >
                <Text style={styles.presetBtnText}>Inglés</Text>
                <Text style={styles.presetBtnHint}>u / d / in / out</Text>
              </TouchableOpacity>
            </View>

            {importing && (
              <View style={styles.importingBox}>
                <ActivityIndicator color="#0c0" />
                <Text style={styles.importingText}>Procesando… puede tardar unos segundos.</Text>
              </View>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={handleCancelImport}
                disabled={importing}
              >
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleConfirmImport}
                disabled={importing}
              >
                <Text style={styles.saveText}>{importing ? 'Importando…' : 'Importar'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={renameTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameTarget(null)}
      >
        <View style={styles.modalOverlay} accessibilityViewIsModal>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle} accessibilityRole="header">Renombrar mapa</Text>
            <TextInput
              style={styles.modalInput}
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="Nuevo nombre"
              placeholderTextColor="#666"
              autoFocus
              accessibilityLabel="Nuevo nombre del mapa"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setRenameTarget(null)}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={confirmRename}>
                <Text style={styles.saveText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  title: { color: '#fff', fontSize: 20, fontWeight: 'bold', fontFamily: 'monospace' },
  subtitle: { color: '#888', fontSize: 11, fontFamily: 'monospace', marginTop: 6, lineHeight: 16 },
  subtitleMono: { color: '#0c0', fontFamily: 'monospace' },
  toolbar: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#222' },
  importBtn: {
    backgroundColor: '#0a2a0a',
    borderWidth: 1,
    borderColor: '#1a4a1a',
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
  },
  importBtnText: { color: '#0c0', fontSize: 14, fontFamily: 'monospace', fontWeight: 'bold' },
  listContent: { padding: 12, paddingBottom: 40 },
  empty: { color: '#666', fontFamily: 'monospace', textAlign: 'center', marginTop: 24, fontSize: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  rowText: { flex: 1 },
  rowName: { color: '#fff', fontSize: 14, fontFamily: 'monospace', fontWeight: 'bold' },
  rowBadge: { color: '#888', fontWeight: 'normal', fontSize: 11 },
  rowMeta: { color: '#666', fontSize: 11, fontFamily: 'monospace', marginTop: 3 },
  rowBtn: { paddingHorizontal: 10, paddingVertical: 6, marginLeft: 4 },
  rowBtnTextEdit: { color: '#0c0', fontSize: 16, fontFamily: 'monospace' },
  rowBtnTextDelete: { color: '#dd5555', fontSize: 16, fontFamily: 'monospace' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modalBox: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    padding: 16,
  },
  modalTitle: { color: '#fff', fontSize: 16, fontFamily: 'monospace', fontWeight: 'bold', marginBottom: 12 },
  label: { color: '#888', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 },
  helperText: { color: '#666', fontSize: 11, fontFamily: 'monospace', lineHeight: 15, marginBottom: 8 },
  modalInput: {
    backgroundColor: '#0e0e0e',
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: 'monospace',
    fontSize: 14,
  },
  presetRow: { flexDirection: 'row', gap: 8 },
  presetBtn: {
    flex: 1,
    backgroundColor: '#0e0e0e',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 6,
    padding: 12,
    alignItems: 'center',
  },
  presetBtnActive: { backgroundColor: '#0a2a0a', borderColor: '#1a4a1a' },
  presetBtnText: { color: '#fff', fontSize: 13, fontFamily: 'monospace', fontWeight: 'bold' },
  presetBtnHint: { color: '#888', fontSize: 10, fontFamily: 'monospace', marginTop: 3 },
  importingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    padding: 10,
    backgroundColor: '#0e0e0e',
    borderRadius: 6,
  },
  importingText: { color: '#888', fontSize: 12, fontFamily: 'monospace' },
  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 6, backgroundColor: '#333' },
  cancelText: { color: '#fff', fontFamily: 'monospace', fontSize: 13 },
  saveBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 6, backgroundColor: '#0a2a0a', borderWidth: 1, borderColor: '#1a4a1a' },
  saveText: { color: '#0c0', fontFamily: 'monospace', fontSize: 13, fontWeight: 'bold' },
});
