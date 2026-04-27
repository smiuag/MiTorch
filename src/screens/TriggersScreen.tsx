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
import { RootStackParamList, TriggerPack } from '../types';
import { loadPacks, savePacks, newPackId, deletePack as removePack, duplicatePack } from '../storage/triggerStorage';

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
        <Text style={styles.title}>Plantillas de triggers</Text>
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
          <View style={styles.packItem}>
            <TouchableOpacity
              style={styles.packMain}
              onPress={() => navigation.navigate('TriggerEditor', { packId: item.id })}
            >
              <Text style={styles.packName}>{item.name}</Text>
              <Text style={styles.packMeta}>
                {item.triggers.length} trigger{item.triggers.length === 1 ? '' : 's'} ·{' '}
                {item.assignedServerIds.length} servidor
                {item.assignedServerIds.length === 1 ? '' : 'es'}
              </Text>
            </TouchableOpacity>
            <View style={styles.packActions}>
              <TouchableOpacity style={styles.iconBtn} onPress={() => handleDuplicate(item.id)}>
                <Text style={styles.iconBtnText}>Duplicar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.iconBtn, styles.iconBtnDanger]}
                onPress={() => handleDelete(item)}
              >
                <Text style={[styles.iconBtnText, styles.iconBtnTextDanger]}>Borrar</Text>
              </TouchableOpacity>
            </View>
          </View>
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
  packItem: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 8,
    marginBottom: 10,
    overflow: 'hidden',
  },
  packMain: { padding: 14 },
  packName: { color: '#fff', fontSize: 15, fontWeight: 'bold', fontFamily: 'monospace' },
  packMeta: { color: '#666', fontSize: 11, fontFamily: 'monospace', marginTop: 4 },
  packActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  iconBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#2a2a2a',
  },
  iconBtnDanger: { borderRightWidth: 0 },
  iconBtnText: { color: '#0c0', fontSize: 12, fontFamily: 'monospace', fontWeight: 'bold' },
  iconBtnTextDanger: { color: '#dd5555' },
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
