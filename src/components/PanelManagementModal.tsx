import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';

// Modal de gestión de paneles del modo completo. Se abre con long-press en
// el botón switch del grid (TerminalScreen.handleEditButton intercepta
// cuando el botón es __SWITCH_PANEL__ y abre este modal en lugar del editor
// de botón, que no aplica al switch porque es fixed/locked).
//
// Reglas:
//   - Mínimo 2 paneles. Los IDs `panels[0]` y `panels[1]` no se pueden
//     eliminar (botón × deshabilitado en esas filas).
//   - Máximo 6 paneles. Si ya hay 6 el botón "+ Añadir" queda deshabilitado.
//   - Tap en una fila salta a ese panel (cierra el modal).
//   - Tap en × pide confirmación antes de borrar (destructivo: borra todos
//     los botones del panel, irreversible).

interface Props {
  visible: boolean;
  panels: number[];
  currentPanel: number;
  onClose: () => void;
  onAddPanel: () => void;
  onDeletePanel: (id: number) => void;
  onSelectPanel: (id: number) => void;
}

const MAX_PANELS = 6;

export function PanelManagementModal({ visible, panels, currentPanel, onClose, onAddPanel, onDeletePanel, onSelectPanel }: Props) {
  const canAdd = panels.length < MAX_PANELS;
  const canDelete = (idx: number) => idx >= 2;

  const handleDelete = (id: number) => {
    Alert.alert(
      'Eliminar panel',
      `¿Seguro que quieres eliminar el panel ${id}? Se borrarán todos los botones de ese panel. No se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => onDeletePanel(id) },
      ]
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>Gestionar paneles</Text>
          <Text style={styles.subtitle}>
            Toca un panel para ir a él. Mínimo 2, máximo {MAX_PANELS}. Los 2 primeros no se pueden eliminar.
          </Text>
          <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 8 }}>
            {panels.map((id, idx) => {
              const isCurrent = currentPanel === id;
              return (
                <View key={id} style={[styles.row, isCurrent && styles.rowActive]}>
                  <TouchableOpacity
                    style={styles.rowMain}
                    onPress={() => onSelectPanel(id)}
                    accessible={true}
                    accessibilityRole="button"
                    accessibilityLabel={`Panel ${id}${isCurrent ? ' actual' : ''}`}
                  >
                    <Text style={[styles.panelLabel, isCurrent && styles.panelLabelActive]}>
                      Panel {id}{isCurrent ? ' · actual' : ''}
                    </Text>
                  </TouchableOpacity>
                  {canDelete(idx) ? (
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => handleDelete(id)}
                      accessible={true}
                      accessibilityRole="button"
                      accessibilityLabel={`Eliminar panel ${id}`}
                    >
                      <Text style={styles.deleteBtnText}>×</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={[styles.deleteBtn, styles.deleteBtnDisabled]}>
                      <Text style={styles.deleteBtnTextDisabled}>—</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.addBtn, !canAdd && styles.actionBtnDisabled]}
              onPress={canAdd ? onAddPanel : undefined}
              disabled={!canAdd}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel={canAdd ? 'Añadir panel' : 'Máximo de paneles alcanzado'}
            >
              <Text style={styles.actionBtnText}>{canAdd ? '+ Añadir panel' : `Máximo ${MAX_PANELS}`}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.closeBtn]}
              onPress={onClose}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
            >
              <Text style={styles.actionBtnText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#1f1f1f',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#3399cc',
    width: '85%',
    maxHeight: '70%',
    padding: 18,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#3399cc',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
    marginBottom: 12,
    lineHeight: 16,
  },
  list: {
    maxHeight: 300,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 6,
    backgroundColor: '#0f0f0f',
    borderWidth: 1,
    borderColor: '#333',
  },
  rowActive: {
    backgroundColor: '#0a3a4a',
    borderColor: '#3399cc',
  },
  rowMain: {
    flex: 1,
  },
  panelLabel: {
    color: '#ccc',
    fontSize: 14,
    fontFamily: 'monospace',
  },
  panelLabelActive: {
    color: '#88ccff',
    fontWeight: 'bold',
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#3a1a1a',
    borderWidth: 1,
    borderColor: '#cc3333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnDisabled: {
    backgroundColor: '#1a1a1a',
    borderColor: '#333',
  },
  deleteBtnText: {
    color: '#ff5555',
    fontSize: 22,
    fontWeight: 'bold',
  },
  deleteBtnTextDisabled: {
    color: '#444',
    fontSize: 22,
    fontWeight: 'bold',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 2,
  },
  addBtn: {
    backgroundColor: '#0a3a0a',
    borderColor: '#0c0',
  },
  closeBtn: {
    backgroundColor: '#444',
    borderColor: '#666',
  },
  actionBtnDisabled: {
    opacity: 0.4,
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
