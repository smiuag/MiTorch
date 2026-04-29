import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const [tick, setTick] = useState(0);
  const declared = userVariablesService.getDeclared();
  const insets = useSafeAreaInsets();

  // Ensure the persisted list is loaded before rendering. If the picker
  // opens before any other code has triggered the load, the list would
  // appear empty until the next render. Forcing a re-render via `tick` once
  // load completes avoids that flicker.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    userVariablesService.ensureLoaded().then(() => {
      if (!cancelled) setTick((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      {/*
        Overlay padding accounts for the system gesture/nav-bar inset so the
        centered picker box never extends behind the bottom buttons. Static
        24dp on top + 24dp + insets.bottom on the bottom gives a safe margin
        on any phone (gesture indicator ~24dp, 3-button nav ~48dp).
      */}
      <TouchableOpacity
        style={[
          styles.overlay,
          { paddingBottom: 24 + insets.bottom, paddingTop: 24 + insets.top },
        ]}
        activeOpacity={1}
        onPress={onCancel}
      >
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
    paddingHorizontal: 24,
    // paddingTop / paddingBottom set inline with safe-area insets above.
  },
  box: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#0c0',
    borderRadius: 10,
    padding: 16,
    // Hard-cap height: keep the picker compact so it never reaches the
    // bottom system-button area even when nested inside another Modal
    // where safe-area insets don't propagate cleanly. 60% of viewport
    // leaves 20% above and 20% below the centered box.
    maxHeight: '60%',
  },
  title: {
    color: '#0c0',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    marginBottom: 12,
  },
  item: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#0a3a0a',
  },
  itemSelected: { backgroundColor: '#0a3a0a' },
  itemName: { color: '#0c0', fontSize: 14, fontFamily: 'monospace', fontWeight: 'bold' },
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
