import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { userVariablesService } from '../services/userVariablesService';

interface Props {
  visible: boolean;
  selectedName: string | null;
  onPick: (name: string) => void;
  onCancel: () => void;
  // Optional title override.
  title?: string;
  // If true, also shows a "Crear desde Mis variables" hint when empty.
  // Always shows the empty-state when there are no declared vars.
  emptyHint?: string;
}

// Reusable picker for user-defined variables. Lists ONLY the currently
// declared user vars (from userVariablesService). No free typing — the
// new design enforces "create from Mis variables, then select here". If
// the declared set is empty, shows an empty state and the cancel option.
export function VariablePicker({ visible, selectedName, onPick, onCancel, title, emptyHint }: Props) {
  const declared = userVariablesService.getDeclared();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onCancel}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.box}>
          <Text style={styles.title}>{title || 'Elegir variable'}</Text>

          {declared.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No hay variables declaradas</Text>
              <Text style={styles.emptyText}>
                {emptyHint ||
                  'Crea variables desde Settings → Mis variables. Luego podrás seleccionarlas aquí.'}
              </Text>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled">
              {declared.map((name) => (
                <TouchableOpacity
                  key={name}
                  style={[styles.item, selectedName === name && styles.itemSelected]}
                  onPress={() => onPick(name)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedName === name }}
                >
                  <Text style={styles.itemName}>{name}</Text>
                  <Text style={styles.itemValue} numberOfLines={1}>
                    = "{userVariablesService.get(name)}"
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelBtnText}>Cancelar</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 24,
  },
  box: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#9966cc',
    borderRadius: 10,
    padding: 16,
    maxHeight: '80%',
  },
  title: {
    color: '#cc99ff',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    marginBottom: 12,
  },
  item: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2a1a3a',
  },
  itemSelected: { backgroundColor: '#2a1a3a' },
  itemName: { color: '#cc99ff', fontSize: 14, fontFamily: 'monospace', fontWeight: 'bold' },
  itemValue: { color: '#888', fontSize: 11, fontFamily: 'monospace', marginTop: 2 },
  emptyBox: { padding: 16, alignItems: 'center' },
  emptyTitle: { color: '#888', fontSize: 14, fontFamily: 'monospace', marginBottom: 8 },
  emptyText: {
    color: '#666',
    fontSize: 12,
    fontFamily: 'monospace',
    textAlign: 'center',
    lineHeight: 18,
  },
  cancelBtn: {
    marginTop: 12,
    paddingVertical: 10,
    backgroundColor: '#333',
    borderRadius: 6,
    alignItems: 'center',
  },
  cancelBtnText: { color: '#fff', fontSize: 13, fontFamily: 'monospace', fontWeight: 'bold' },
});
