import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { isValidUserVarName, userVariablesService } from '../services/userVariablesService';
import { isPredefinedVariable } from '../utils/variableMap';
import { loadPacks } from '../storage/triggerStorage';
import { findTriggersUsingVar, VarUsage } from '../utils/userVariablesUsage';

type Props = NativeStackScreenProps<RootStackParamList, 'UserVariables'>;

interface VarRow {
  name: string;
  value: string;
  usage: VarUsage[];
}

export function UserVariablesScreen({ navigation }: Props) {
  const [vars, setVars] = useState<VarRow[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newName, setNewName] = useState('');

  const refresh = useCallback(async () => {
    // Make sure the persisted declared list is loaded before rendering.
    // Idempotent — only the first call hits AsyncStorage.
    await userVariablesService.ensureLoaded();
    const declared = userVariablesService.getDeclared();
    const packs = await loadPacks();
    const rows: VarRow[] = declared.map((name) => ({
      name,
      value: userVariablesService.get(name),
      usage: findTriggersUsingVar(name, packs),
    }));
    setVars(rows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  useEffect(() => {
    // Live updates: when an action sets a value somewhere, refresh just the
    // values column (usage doesn't change unless the user edits triggers).
    userVariablesService.setOnUpdateCallback(({ values }) => {
      setVars((prev) => prev.map((r) => ({ ...r, value: values[r.name] ?? '' })));
    });
    return () => {
      userVariablesService.setOnUpdateCallback(undefined);
    };
  }, []);

  const handleCreate = async () => {
    const name = newName.trim().toLowerCase();
    if (!isValidUserVarName(name)) {
      Alert.alert(
        'Nombre inválido',
        'Solo letras minúsculas, números y guiones bajos. Empieza por letra.',
      );
      return;
    }
    if (isPredefinedVariable(name)) {
      Alert.alert('Nombre reservado', `"${name}" es una variable del sistema. Elige otro nombre.`);
      return;
    }
    if (userVariablesService.isDeclared(name)) {
      Alert.alert('Ya existe', `La variable "${name}" ya está declarada.`);
      return;
    }
    await userVariablesService.declare(name);
    setNewName('');
    setCreateModalVisible(false);
    await refresh();
  };

  const handleDelete = (row: VarRow) => {
    const usageCount = row.usage.length;
    const message =
      usageCount === 0
        ? `Borrar la variable "${row.name}". No la usa ningún trigger.`
        : `La variable "${row.name}" la usan ${usageCount} trigger${usageCount === 1 ? '' : 's'}. Si la borras, las referencias quedarán como variable inexistente y se sustituirán por texto vacío en los templates. Las acciones set_var sobre ella se ignorarán.`;
    Alert.alert('Borrar variable', message, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          await userVariablesService.undeclare(row.name);
          await refresh();
        },
      },
    ]);
  };

  const handleResetAll = () => {
    if (vars.length === 0) return;
    Alert.alert(
      'Resetear valores',
      `¿Vaciar todos los valores actuales (${vars.length} variable${vars.length === 1 ? '' : 's'})? Las declaraciones se mantienen — solo se borran los valores en memoria.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Resetear',
          style: 'destructive',
          onPress: () => {
            userVariablesService.resetValues();
            refresh();
          },
        },
      ],
    );
  };

  const toggleExpand = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const goToTrigger = (usage: VarUsage) => {
    navigation.navigate('TriggerEditor', {
      packId: usage.packId,
      autoOpenTriggerId: usage.triggerId,
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>{'< Volver'}</Text>
        </TouchableOpacity>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Mis variables</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.resetBtn, vars.length === 0 && styles.btnDisabled]}
              onPress={handleResetAll}
              disabled={vars.length === 0}
              accessibilityRole="button"
              accessibilityLabel="Resetear valores"
            >
              <Text style={styles.resetBtnText}>Resetear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.createBtn}
              onPress={() => setCreateModalVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Crear nueva variable"
            >
              <Text style={styles.createBtnText}>+ Nueva</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.subtitle}>
          Variables del servidor activo. Las declaraciones persisten; los valores son memoria-only.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.listContent}>
        {vars.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No hay variables declaradas</Text>
            <Text style={styles.emptyText}>
              Pulsa "+ Nueva" para crear una. Después podrás usarla en cualquier trigger
              seleccionándola del picker (acciones "Guardar en variable" y "Alarma de variable",
              o como referencia ${'${nombre}'} en mensajes/comandos).
            </Text>
          </View>
        ) : (
          vars.map((row) => {
            const isExpanded = expanded.has(row.name);
            return (
              <View key={row.name} style={styles.row}>
                <TouchableOpacity
                  style={styles.rowHeader}
                  onPress={() => toggleExpand(row.name)}
                  accessibilityRole="button"
                  accessibilityLabel={`${row.name}, valor ${row.value || 'vacío'}, usada en ${row.usage.length} triggers`}
                  accessibilityHint="Expandir para ver triggers que la usan"
                >
                  <View style={styles.rowInfo}>
                    <Text style={styles.varName}>{row.name}</Text>
                    <Text style={styles.varValue} numberOfLines={1}>
                      = {row.value === '' ? '(vacía)' : `"${row.value}"`}
                    </Text>
                    <Text style={styles.usageCount}>
                      {row.usage.length === 0
                        ? 'Sin uso en triggers'
                        : `Usada en ${row.usage.length} trigger${row.usage.length === 1 ? '' : 's'}`}
                      {row.usage.length > 0 && (isExpanded ? ' ▾' : ' ▸')}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDelete(row)}
                    accessibilityRole="button"
                    accessibilityLabel={`Borrar variable ${row.name}`}
                  >
                    <Text style={styles.deleteBtnText}>✕</Text>
                  </TouchableOpacity>
                </TouchableOpacity>

                {isExpanded && row.usage.length > 0 && (
                  <View style={styles.usageList}>
                    {row.usage.map((u) => (
                      <TouchableOpacity
                        key={u.triggerId}
                        style={styles.usageRow}
                        onPress={() => goToTrigger(u)}
                        accessibilityRole="button"
                        accessibilityLabel={`Editar trigger ${u.triggerName} en plantilla ${u.packName}`}
                      >
                        <Text style={styles.usagePack}>{u.packName} →</Text>
                        <Text style={styles.usageTrigger}>{u.triggerName || '(sin nombre)'}</Text>
                        <Text style={styles.usageRoles}>
                          {u.roles.map(roleLabel).join(' · ')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal
        visible={createModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Nueva variable</Text>
            <Text style={styles.modalHint}>
              Solo letras minúsculas, números y guiones bajos. Debe empezar por letra. No puedes
              usar nombres reservados del sistema (vida, energia, imagenes, …).
            </Text>
            <TextInput
              style={styles.modalInput}
              value={newName}
              onChangeText={(t) => setNewName(t.toLowerCase())}
              placeholder="ej. ultima_direccion"
              placeholderTextColor="#555"
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => {
                  setCreateModalVisible(false);
                  setNewName('');
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

function roleLabel(r: 'writer' | 'reader' | 'watcher'): string {
  switch (r) {
    case 'writer': return 'escribe';
    case 'reader': return 'lee';
    case 'watcher': return 'vigila';
  }
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: { color: '#fff', fontSize: 20, fontWeight: 'bold', fontFamily: 'monospace' },
  subtitle: { color: '#888', fontSize: 12, fontFamily: 'monospace', marginTop: 8 },
  headerActions: { flexDirection: 'row', gap: 8 },
  resetBtn: {
    backgroundColor: '#3a0a0a',
    borderWidth: 1,
    borderColor: '#cc3333',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  resetBtnText: { color: '#cc3333', fontSize: 12, fontFamily: 'monospace', fontWeight: 'bold' },
  createBtn: {
    backgroundColor: '#0a3a0a',
    borderWidth: 1,
    borderColor: '#0c0',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  createBtnText: { color: '#0c0', fontSize: 12, fontFamily: 'monospace', fontWeight: 'bold' },
  btnDisabled: { backgroundColor: '#1a1a1a', borderColor: '#333' },
  listContent: { padding: 16 },
  emptyBox: { padding: 24, alignItems: 'center' },
  emptyTitle: { color: '#888', fontSize: 15, fontFamily: 'monospace', marginBottom: 8 },
  emptyText: {
    color: '#555',
    fontSize: 12,
    fontFamily: 'monospace',
    textAlign: 'center',
    lineHeight: 18,
  },
  row: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#0a3a0a',
    borderRadius: 8,
    marginBottom: 8,
    overflow: 'hidden',
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  rowInfo: { flex: 1 },
  varName: { color: '#0c0', fontSize: 14, fontWeight: 'bold', fontFamily: 'monospace' },
  varValue: { color: '#ddd', fontSize: 13, fontFamily: 'monospace', marginTop: 4 },
  usageCount: { color: '#777', fontSize: 11, fontFamily: 'monospace', marginTop: 6 },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#3a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtnText: { color: '#cc3333', fontSize: 18, fontWeight: 'bold' },
  usageList: {
    backgroundColor: '#0a0a0a',
    borderTopWidth: 1,
    borderTopColor: '#0a3a0a',
  },
  usageRow: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  usagePack: { color: '#888', fontSize: 11, fontFamily: 'monospace' },
  usageTrigger: { color: '#0c0', fontSize: 13, fontFamily: 'monospace', fontWeight: 'bold', marginTop: 2 },
  usageRoles: { color: '#666', fontSize: 10, fontFamily: 'monospace', marginTop: 2 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#0c0',
    borderRadius: 10,
    padding: 20,
  },
  modalTitle: {
    color: '#0c0',
    fontSize: 17,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  modalHint: {
    color: '#888',
    fontSize: 11,
    fontFamily: 'monospace',
    marginBottom: 12,
    lineHeight: 16,
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
