import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { RootStackParamList, TriggerPack } from '../types';
import { loadPacks, savePacks, newPackId, deletePack as removePack, duplicatePack } from '../storage/triggerStorage';
import { exportPackToZip, exportAllPacksToZip, importFromZip } from '../services/triggerPackExport';

type Props = NativeStackScreenProps<RootStackParamList, 'Triggers'>;

export function TriggersScreen({ navigation }: Props) {
  const [packs, setPacks] = useState<TriggerPack[]>([]);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newPackName, setNewPackName] = useState('');

  const refresh = useCallback(async () => {
    const list = await loadPacks();
    setPacks(list);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const handleCreate = async () => {
    const name = newPackName.trim();
    if (!name) {
      Alert.alert('Falta el nombre', 'La plantilla necesita un nombre.');
      return;
    }
    const pack: TriggerPack = {
      id: newPackId(),
      name,
      triggers: [],
      assignedServerIds: [],
    };
    const list = [...packs, pack];
    await savePacks(list);
    setPacks(list);
    setNewPackName('');
    setCreateModalVisible(false);
    navigation.navigate('TriggerEditor', { packId: pack.id });
  };

  const handleDuplicate = async (id: string) => {
    const list = await duplicatePack(id);
    setPacks(list);
  };

  const handleShare = async (pack: TriggerPack) => {
    try {
      const zipUri = await exportPackToZip(pack);
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Compartir no disponible', `El archivo está en:\n${zipUri}`);
        return;
      }
      await Sharing.shareAsync(zipUri, {
        mimeType: 'application/zip',
        dialogTitle: `Compartir "${pack.name}"`,
        UTI: 'public.zip-archive',
      });
    } catch (e: any) {
      Alert.alert('No se pudo exportar', e?.message ?? String(e));
    }
  };

  const handleExportAll = async () => {
    if (packs.length === 0) {
      Alert.alert('No hay plantillas', 'No hay nada que exportar todavía.');
      return;
    }
    try {
      const zipUri = await exportAllPacksToZip(packs);
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Compartir no disponible', `El archivo está en:\n${zipUri}`);
        return;
      }
      await Sharing.shareAsync(zipUri, {
        mimeType: 'application/zip',
        dialogTitle: 'Compartir backup de triggers',
        UTI: 'public.zip-archive',
      });
    } catch (e: any) {
      Alert.alert('No se pudo exportar', e?.message ?? String(e));
    }
  };

  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/zip', 'application/x-zip-compressed', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      const zipResult = await importFromZip(asset.uri);
      if (zipResult.kind === 'pack') {
        await handleSinglePackImport(zipResult.result);
      } else {
        await handleBackupImport(zipResult.result);
      }
    } catch (e: any) {
      Alert.alert('No se pudo importar', e?.message ?? String(e));
    }
  };

  const handleSinglePackImport = async (
    result: { pack: TriggerPack; importedSoundCount: number; missingSoundCount: number },
  ) => {
    const { pack: imported, importedSoundCount, missingSoundCount } = result;
    const existing = await loadPacks();
    const collision = existing.find((p) => p.name === imported.name);

    const finalize = async (toSave: TriggerPack, list: TriggerPack[]) => {
      const next = [...list, toSave];
      await savePacks(next);
      setPacks(next);
      const parts = [`"${toSave.name}" importada con ${toSave.triggers.length} triggers`];
      if (importedSoundCount > 0) parts.push(`${importedSoundCount} sonido${importedSoundCount === 1 ? '' : 's'} añadido${importedSoundCount === 1 ? '' : 's'}`);
      if (missingSoundCount > 0) parts.push(`⚠ ${missingSoundCount} sonido${missingSoundCount === 1 ? '' : 's'} no se pudieron extraer (las acciones quedan marcadas como "(falta)")`);
      Alert.alert('Importación completa', parts.join('. ') + '.');
    };

    if (!collision) {
      await finalize(imported, existing);
      return;
    }

    Alert.alert(
      'Ya existe una plantilla con ese nombre',
      `Ya tienes "${imported.name}". ¿Qué hago con la importada?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sustituir',
          style: 'destructive',
          onPress: async () => {
            const filtered = existing.filter((p) => p.id !== collision.id);
            await finalize(imported, filtered);
          },
        },
        {
          text: 'Duplicar',
          onPress: async () => {
            const renamed: TriggerPack = { ...imported, name: `${imported.name} (importada)` };
            await finalize(renamed, existing);
          },
        },
      ],
    );
  };

  const handleBackupImport = async (
    result: { packs: TriggerPack[]; importedSoundCount: number; missingSoundCount: number },
  ) => {
    const { packs: imported, importedSoundCount, missingSoundCount } = result;
    if (imported.length === 0) {
      Alert.alert('Backup vacío', 'El archivo no contiene plantillas.');
      return;
    }
    const existing = await loadPacks();
    const existingNames = new Set(existing.map((p) => p.name));
    const collisions = imported.filter((ip) => existingNames.has(ip.name));

    const finalize = async (toAdd: TriggerPack[], cleanedExisting: TriggerPack[]) => {
      const next = [...cleanedExisting, ...toAdd];
      await savePacks(next);
      setPacks(next);
      const parts = [`${toAdd.length} plantilla${toAdd.length === 1 ? '' : 's'} importada${toAdd.length === 1 ? '' : 's'}`];
      if (importedSoundCount > 0) parts.push(`${importedSoundCount} sonido${importedSoundCount === 1 ? '' : 's'} añadido${importedSoundCount === 1 ? '' : 's'}`);
      if (missingSoundCount > 0) parts.push(`⚠ ${missingSoundCount} sonido${missingSoundCount === 1 ? '' : 's'} no se pudieron extraer`);
      parts.push('Las plantillas se importan sin asignación a servidores — reasígnalas en el editor');
      Alert.alert('Importación completa', parts.join('. ') + '.');
    };

    if (collisions.length === 0) {
      await finalize(imported, existing);
      return;
    }

    const collisionList = collisions.map((p) => `"${p.name}"`).join(', ');
    Alert.alert(
      `Hay ${collisions.length} plantilla${collisions.length === 1 ? '' : 's'} con el mismo nombre`,
      `Ya tienes: ${collisionList}.\n\n• Saltar: importa solo las nuevas, conserva las tuyas.\n• Sustituir: reemplaza las tuyas con las del backup.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Saltar',
          onPress: async () => {
            const onlyNew = imported.filter((ip) => !existingNames.has(ip.name));
            await finalize(onlyNew, existing);
          },
        },
        {
          text: 'Sustituir',
          style: 'destructive',
          onPress: async () => {
            const collisionNames = new Set(collisions.map((c) => c.name));
            const cleaned = existing.filter((ep) => !collisionNames.has(ep.name));
            await finalize(imported, cleaned);
          },
        },
      ],
    );
  };

  const handleDelete = (pack: TriggerPack) => {
    Alert.alert(
      'Borrar plantilla',
      `¿Borrar "${pack.name}" y sus ${pack.triggers.length} triggers? No se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            const list = await removePack(pack.id);
            setPacks(list);
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
        <View style={styles.headerRow}>
          <Text style={styles.title}>Plantillas de triggers</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={handleExportAll}
              accessible={true}
              accessibilityLabel="Exportar todas las plantillas"
              accessibilityRole="button"
              accessibilityHint="Genera un ZIP con todas las plantillas y sus sonidos personalizados para hacer backup"
            >
              <Text style={styles.headerBtnText}>Exportar todo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={handleImport}
              accessible={true}
              accessibilityLabel="Importar plantilla o backup"
              accessibilityRole="button"
              accessibilityHint="Abre el selector de archivos para importar una plantilla individual o un backup completo desde un ZIP"
            >
              <Text style={styles.headerBtnText}>Importar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.contentContainer}>
      <FlatList
        data={packs}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No hay plantillas todavía</Text>
            <Text style={styles.emptyText}>
              Una plantilla es un grupo de triggers que puedes asignar a uno o varios servidores.
              Crea la primera con el botón de abajo.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.packCard}
            onPress={() => navigation.navigate('TriggerEditor', { packId: item.id })}
            onLongPress={() => navigation.navigate('TriggerEditor', { packId: item.id })}
            accessible={true}
            accessibilityLabel={`Plantilla ${item.name}`}
            accessibilityHint={`Tap para editar. ${item.triggers.length} triggers, ${item.assignedServerIds.length} servidores asignados.`}
          >
            <View style={styles.packInfo}>
              <Text style={styles.packName}>{item.name}</Text>
              <Text style={styles.packMeta}>
                {item.triggers.length} trigger{item.triggers.length === 1 ? '' : 's'} ·{' '}
                {item.assignedServerIds.length} servidor
                {item.assignedServerIds.length === 1 ? '' : 'es'}
              </Text>
            </View>
            <View style={styles.packActions}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.editBtn]}
                onPress={() => navigation.navigate('TriggerEditor', { packId: item.id })}
                accessible={true}
                accessibilityLabel="Editar"
                accessibilityRole="button"
                accessibilityHint={`Editar plantilla ${item.name}`}
              >
                <Text style={[styles.actionBtnText, styles.editBtnText]}>✎</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.duplicateBtn]}
                onPress={() => handleDuplicate(item.id)}
                accessible={true}
                accessibilityLabel="Duplicar"
                accessibilityRole="button"
                accessibilityHint={`Crear una copia de ${item.name}`}
              >
                <Text style={[styles.actionBtnText, styles.duplicateBtnText]}>⬚</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.shareBtn]}
                onPress={() => handleShare(item)}
                accessible={true}
                accessibilityLabel="Compartir"
                accessibilityRole="button"
                accessibilityHint={`Exportar ${item.name} como ZIP con sus sonidos`}
              >
                <Text style={[styles.actionBtnText, styles.shareBtnText]}>↗</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.deleteBtn]}
                onPress={() => handleDelete(item)}
                accessible={true}
                accessibilityLabel="Borrar"
                accessibilityRole="button"
                accessibilityHint={`Borrar plantilla ${item.name}`}
              >
                <Text style={[styles.actionBtnText, styles.deleteBtnText]}>✕</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
      />
      </View>

      <View style={styles.addButtonContainer}>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setCreateModalVisible(true)}
          accessible={true}
          accessibilityLabel="Nueva plantilla"
          accessibilityRole="button"
          accessibilityHint="Crear una plantilla nueva de triggers"
        >
          <Text style={styles.addText}>+</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={createModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Nueva plantilla</Text>
            <TextInput
              style={styles.modalInput}
              value={newPackName}
              onChangeText={setNewPackName}
              placeholder="ej. Combate básico RdL"
              placeholderTextColor="#555"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => {
                  setCreateModalVisible(false);
                  setNewPackName('');
                }}
              >
                <Text style={styles.modalBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnConfirm]}
                onPress={handleCreate}
              >
                <Text style={styles.modalBtnText}>Crear</Text>
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
  contentContainer: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 16 },
  emptyBox: { padding: 24, alignItems: 'center' },
  emptyTitle: {
    color: '#888',
    fontSize: 15,
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  emptyText: {
    color: '#555',
    fontSize: 12,
    fontFamily: 'monospace',
    textAlign: 'center',
    lineHeight: 18,
  },
  packCard: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  packInfo: { flex: 1 },
  packName: { color: '#ffffff', fontSize: 18, fontWeight: 'bold', fontFamily: 'monospace' },
  packMeta: { color: '#888', fontSize: 13, fontFamily: 'monospace', marginTop: 4 },
  packActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editBtn: { backgroundColor: '#0a3a0a' },
  duplicateBtn: { backgroundColor: '#0a2a3a' },
  shareBtn: { backgroundColor: '#3a2a0a' },
  deleteBtn: { backgroundColor: '#3a0a0a' },
  actionBtnText: { fontSize: 20, fontWeight: 'bold' },
  editBtnText: { color: '#0c0' },
  duplicateBtnText: { color: '#0099ff' },
  shareBtnText: { color: '#ffaa33' },
  deleteBtnText: { color: '#cc3333' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerBtn: {
    backgroundColor: '#0a3a0a',
    borderWidth: 1,
    borderColor: '#0c0',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerBtnText: {
    color: '#0c0',
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  addButtonContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: '#0a0a0a',
  },
  addBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#00cc00',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#00cc00',
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  addText: {
    fontSize: 28,
    color: '#000000',
    fontWeight: 'bold',
    lineHeight: 30,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    padding: 20,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    marginBottom: 14,
  },
  modalInput: {
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
    fontFamily: 'monospace',
    marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 6, alignItems: 'center' },
  modalBtnCancel: { backgroundColor: '#333' },
  modalBtnConfirm: { backgroundColor: '#0a3a0a', borderWidth: 1, borderColor: '#0c0' },
  modalBtnText: { color: '#fff', fontSize: 14, fontFamily: 'monospace', fontWeight: 'bold' },
});
