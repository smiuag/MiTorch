import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  TextInput,
  Switch,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, Trigger, TriggerPack, ServerProfile } from '../types';
import { loadPacks, upsertPack, newTriggerId } from '../storage/triggerStorage';
import { loadServers } from '../storage/serverStorage';
import { TriggerEditModal } from '../components/TriggerEditModal';

type Props = NativeStackScreenProps<RootStackParamList, 'TriggerEditor'>;

export function TriggerEditorScreen({ route, navigation }: Props) {
  const { packId } = route.params;
  const [pack, setPack] = useState<TriggerPack | null>(null);
  const [editingTrigger, setEditingTrigger] = useState<Trigger | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [assignVisible, setAssignVisible] = useState(false);
  const [servers, setServers] = useState<ServerProfile[]>([]);

  const refresh = useCallback(async () => {
    const list = await loadPacks();
    const found = list.find((p) => p.id === packId);
    if (found) setPack(found);
  }, [packId]);

  useEffect(() => {
    refresh();
    loadServers().then(setServers);
  }, [refresh]);

  const persist = async (next: TriggerPack) => {
    setPack(next);
    await upsertPack(next);
  };

  const handleRename = (newName: string) => {
    if (!pack) return;
    persist({ ...pack, name: newName });
  };

  const handleAddTrigger = () => {
    setEditingTrigger({
      id: newTriggerId(),
      name: '',
      type: 'combo',
      enabled: true,
      source: { kind: 'regex', pattern: '', flags: 'i' },
      actions: [],
    });
    setEditorVisible(true);
  };

  const handleEditTrigger = (trigger: Trigger) => {
    setEditingTrigger(trigger);
    setEditorVisible(true);
  };

  const handleSaveTrigger = (trigger: Trigger) => {
    if (!pack) return;
    const exists = pack.triggers.some((t) => t.id === trigger.id);
    const triggers = exists
      ? pack.triggers.map((t) => (t.id === trigger.id ? trigger : t))
      : [...pack.triggers, trigger];
    persist({ ...pack, triggers });
    setEditorVisible(false);
    setEditingTrigger(null);
  };

  const handleDeleteTrigger = (trigger: Trigger) => {
    if (!pack) return;
    Alert.alert('Borrar trigger', `¿Borrar "${trigger.name || 'sin nombre'}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: () => {
          persist({ ...pack, triggers: pack.triggers.filter((t) => t.id !== trigger.id) });
        },
      },
    ]);
  };

  const handleToggleEnabled = (trigger: Trigger, enabled: boolean) => {
    if (!pack) return;
    persist({
      ...pack,
      triggers: pack.triggers.map((t) => (t.id === trigger.id ? { ...t, enabled } : t)),
    });
  };

  const handleToggleServer = (serverId: string) => {
    if (!pack) return;
    const isAssigned = pack.assignedServerIds.includes(serverId);
    const next = isAssigned
      ? pack.assignedServerIds.filter((id) => id !== serverId)
      : [...pack.assignedServerIds, serverId];
    persist({ ...pack, assignedServerIds: next });
  };

  if (!pack) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <Text style={styles.loadingText}>Cargando…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>{'< Volver'}</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.titleInput}
          value={pack.name}
          onChangeText={handleRename}
          placeholder="Nombre de la plantilla"
          placeholderTextColor="#555"
        />
        <TouchableOpacity style={styles.assignBtn} onPress={() => setAssignVisible(true)}>
          <Text style={styles.assignBtnText}>
            Servidores ({pack.assignedServerIds.length})
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.contentContainer}>
      <FlatList
        data={pack.triggers}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              Esta plantilla no tiene triggers todavía. Pulsa "+ Nuevo trigger" abajo.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.triggerItem}>
            <View style={styles.triggerHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.triggerName}>{item.name || '(sin nombre)'}</Text>
                <Text style={styles.triggerMeta}>
                  {labelForType(item.type)} · {item.actions.length} acción
                  {item.actions.length === 1 ? '' : 'es'}
                </Text>
              </View>
              <Switch
                value={item.enabled}
                onValueChange={(v) => handleToggleEnabled(item, v)}
                trackColor={{ false: '#333', true: '#0c0' }}
                thumbColor={item.enabled ? '#000' : '#666'}
              />
            </View>
            <Text style={styles.triggerRegex} numberOfLines={2}>
              /{item.source.pattern}/{item.source.flags || ''}
            </Text>
            <View style={styles.triggerActions}>
              <TouchableOpacity style={styles.iconBtn} onPress={() => handleEditTrigger(item)}>
                <Text style={styles.iconBtnText}>Editar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.iconBtn, styles.iconBtnDanger]}
                onPress={() => handleDeleteTrigger(item)}
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
          onPress={handleAddTrigger}
          accessible={true}
          accessibilityLabel="Nuevo trigger"
          accessibilityRole="button"
          accessibilityHint="Crear un trigger nuevo dentro de esta plantilla"
        >
          <Text style={styles.addText}>+</Text>
        </TouchableOpacity>
      </View>

      {editingTrigger && (
        <TriggerEditModal
          visible={editorVisible}
          initialTrigger={editingTrigger}
          onSave={handleSaveTrigger}
          onCancel={() => {
            setEditorVisible(false);
            setEditingTrigger(null);
          }}
        />
      )}

      {/* Assign servers modal */}
      <Modal
        visible={assignVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAssignVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Asignar a servidores</Text>
            <Text style={styles.modalSubtitle}>
              Esta plantilla se aplicará a los servidores marcados.
            </Text>
            {servers.length === 0 ? (
              <Text style={styles.emptyText}>No tienes servidores guardados.</Text>
            ) : (
              <FlatList
                data={servers}
                keyExtractor={(s) => s.id}
                style={{ maxHeight: 360 }}
                renderItem={({ item }) => {
                  const checked = pack.assignedServerIds.includes(item.id);
                  return (
                    <TouchableOpacity
                      style={styles.serverRow}
                      onPress={() => handleToggleServer(item.id)}
                    >
                      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                        {checked && <Text style={styles.checkmark}>✓</Text>}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.serverName}>{item.name}</Text>
                        <Text style={styles.serverHost}>
                          {item.host}:{item.port}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
            <TouchableOpacity
              style={[styles.modalBtn, styles.modalBtnConfirm, { marginTop: 14 }]}
              onPress={() => setAssignVisible(false)}
            >
              <Text style={styles.modalBtnText}>Hecho</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function labelForType(t: string): string {
  switch (t) {
    case 'gag': return 'Gag';
    case 'color': return 'Color';
    case 'sound': return 'Sonido';
    case 'notify': return 'Notificación';
    case 'command': return 'Comando';
    case 'replace': return 'Reemplazar';
    case 'combo': return 'Combo';
    default: return t;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: {
    paddingTop: 16,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backBtn: { marginBottom: 8 },
  backText: { color: '#0c0', fontSize: 14, fontFamily: 'monospace' },
  titleInput: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  assignBtn: {
    backgroundColor: '#0a3a0a',
    borderWidth: 1,
    borderColor: '#0c0',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  assignBtnText: { color: '#0c0', fontSize: 12, fontFamily: 'monospace', fontWeight: 'bold' },
  loadingText: { color: '#666', textAlign: 'center', marginTop: 40, fontFamily: 'monospace' },
  contentContainer: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 16 },
  emptyBox: { padding: 24, alignItems: 'center' },
  emptyText: {
    color: '#666',
    fontSize: 12,
    fontFamily: 'monospace',
    textAlign: 'center',
    lineHeight: 18,
  },
  triggerItem: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 8,
    marginBottom: 10,
    overflow: 'hidden',
  },
  triggerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  triggerName: { color: '#fff', fontSize: 14, fontWeight: 'bold', fontFamily: 'monospace' },
  triggerMeta: { color: '#888', fontSize: 11, fontFamily: 'monospace', marginTop: 2 },
  triggerRegex: {
    color: '#88aaff',
    fontSize: 11,
    fontFamily: 'monospace',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  triggerActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#2a2a2a' },
  iconBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
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
    marginBottom: 6,
  },
  modalSubtitle: {
    color: '#888',
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 14,
  },
  serverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: '#666',
    borderRadius: 4,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: { borderColor: '#0c0', backgroundColor: '#0a3a0a' },
  checkmark: { color: '#0c0', fontSize: 14, fontWeight: 'bold' },
  serverName: { color: '#fff', fontSize: 14, fontFamily: 'monospace', fontWeight: 'bold' },
  serverHost: { color: '#666', fontSize: 11, fontFamily: 'monospace', marginTop: 2 },
  modalBtn: { paddingVertical: 12, borderRadius: 6, alignItems: 'center' },
  modalBtnConfirm: { backgroundColor: '#0a3a0a', borderWidth: 1, borderColor: '#0c0' },
  modalBtnText: { color: '#fff', fontSize: 14, fontFamily: 'monospace', fontWeight: 'bold' },
});
