import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { userVariablesService } from '../services/userVariablesService';

type Props = NativeStackScreenProps<RootStackParamList, 'UserVariables'>;

interface VarRow {
  name: string;
  value: string;
}

export function UserVariablesScreen({ navigation }: Props) {
  const [vars, setVars] = useState<VarRow[]>(() => snapshot());

  useEffect(() => {
    // Subscribe to live updates from the service. Single-subscriber model —
    // we replace any previous handler when this screen mounts. On unmount
    // we clear so background updates don't keep React state alive.
    userVariablesService.setOnUpdateCallback((next) => {
      setVars(toRows(next));
    });
    return () => {
      userVariablesService.setOnUpdateCallback(undefined);
    };
  }, []);

  const handleResetAll = () => {
    if (vars.length === 0) return;
    Alert.alert(
      'Resetear variables',
      `¿Borrar todas las ${vars.length} variable${vars.length === 1 ? '' : 's'} del servidor activo? Solo afecta a esta sesión.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Resetear',
          style: 'destructive',
          onPress: () => {
            userVariablesService.reset();
            setVars([]);
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
          <Text style={styles.title}>Mis variables</Text>
          <TouchableOpacity
            style={[styles.resetBtn, vars.length === 0 && styles.resetBtnDisabled]}
            onPress={handleResetAll}
            disabled={vars.length === 0}
            accessibilityRole="button"
            accessibilityLabel="Resetear todas las variables"
            accessibilityHint="Borra todos los valores actuales. Las definiciones en triggers no se ven afectadas."
          >
            <Text style={styles.resetBtnText}>Resetear todas</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>
          Variables del servidor activo. Memoria-only — se borran al cambiar de servidor o reiniciar la app.
        </Text>
      </View>

      <FlatList
        data={vars}
        keyExtractor={(v) => v.name}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No hay variables todavía</Text>
            <Text style={styles.emptyText}>
              Las variables se crean automáticamente cuando un trigger usa la acción "Guardar en variable" por primera vez. Configura uno desde la pantalla de Triggers.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.varName}>{item.name}</Text>
            <Text style={styles.varValue} numberOfLines={2}>
              {item.value === '' ? '(vacía)' : item.value}
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function snapshot(): VarRow[] {
  return toRows(userVariablesService.getAll());
}

function toRows(record: Record<string, string>): VarRow[] {
  return Object.keys(record)
    .sort()
    .map((name) => ({ name, value: record[name] }));
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
  backText: { color: '#cc99ff', fontSize: 14, fontFamily: 'monospace' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: { color: '#fff', fontSize: 20, fontWeight: 'bold', fontFamily: 'monospace' },
  subtitle: {
    color: '#888',
    fontSize: 12,
    fontFamily: 'monospace',
    marginTop: 8,
  },
  resetBtn: {
    backgroundColor: '#3a0a0a',
    borderWidth: 1,
    borderColor: '#cc3333',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  resetBtnDisabled: { backgroundColor: '#1a1a1a', borderColor: '#333' },
  resetBtnText: {
    color: '#cc3333',
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
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
    borderColor: '#2a1a3a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  varName: { color: '#cc99ff', fontSize: 14, fontWeight: 'bold', fontFamily: 'monospace' },
  varValue: {
    color: '#ddd',
    fontSize: 13,
    fontFamily: 'monospace',
    marginTop: 4,
  },
});
