import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, Modal, TextInput, StyleSheet, useWindowDimensions, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { loadLayout, saveLayout, LayoutButton, ButtonLayout } from '../storage/layoutStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'LayoutEditor'>;

const HEADER_HEIGHT = 56;
const COLORS = ['#cc3333', '#3399cc', '#33cc33', '#cc9933', '#9933cc', '#cc3399', '#333333', '#666666'];

type ModalState =
  | { mode: 'edit-button'; button: LayoutButton | null; col: number; row: number }
  | null;

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function LayoutEditorScreen({ navigation }: Props) {
  const { width, height } = useWindowDimensions();
  const [layout, setLayout] = useState<ButtonLayout>({ buttons: [], gridSize: 11 });
  const [originalLayout, setOriginalLayout] = useState<ButtonLayout>({ buttons: [], gridSize: 11 });
  const [modalState, setModalState] = useState<ModalState>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editCommand, setEditCommand] = useState('');
  const [editColor, setEditColor] = useState('#666666');
  const [editOpacity, setEditOpacity] = useState(0.5);
  const hasChanges = useRef(false);

  const GRID_COLS = layout.gridSize;
  const GRID_ROWS = layout.gridSize;

  // Load layout on mount
  useEffect(() => {
    loadLayout().then(loaded => {
      setLayout(loaded);
      setOriginalLayout(JSON.parse(JSON.stringify(loaded)));
      hasChanges.current = false;
    });
  }, []);

  // Detect changes
  useEffect(() => {
    hasChanges.current = JSON.stringify(layout) !== JSON.stringify(originalLayout);
  }, [layout, originalLayout]);

  // Handle back navigation with unsaved changes check
  useFocusEffect(
    useCallback(() => {
      const unsubscribe = navigation.addListener('beforeRemove', (e) => {
        if (!hasChanges.current) return;

        e.preventDefault();

        Alert.alert(
          'Cambios sin guardar',
          '¿Salir sin guardar los cambios?',
          [
            { text: 'Cancelar', onPress: () => {} },
            {
              text: 'Salir',
              onPress: () => navigation.dispatch(e.data.action),
              style: 'destructive',
            },
          ]
        );
      });

      return unsubscribe;
    }, [navigation])
  );

  // Calculate grid dimensions
  const portraitWidth = Math.min(width, height);
  const cellSize = Math.max(20, Math.min(50, Math.floor((portraitWidth - 32) / GRID_COLS)));
  const gridWidth = cellSize * GRID_COLS;
  const gridHeight = cellSize * GRID_ROWS;
  const offsetX = Math.floor((width - gridWidth) / 2);
  const offsetY = Math.floor((height - HEADER_HEIGHT - gridHeight) / 2);

  const handleCellPress = (col: number, row: number) => {
    const existingButton = layout.buttons.find(b => b.col === col && b.row === row);
    if (existingButton) {
      setEditLabel(existingButton.label);
      setEditCommand(existingButton.command);
      setEditColor(existingButton.color);
      setEditOpacity(existingButton.opacity);
    } else {
      setEditLabel('');
      setEditCommand('');
      setEditColor('#666666');
      setEditOpacity(0.5);
    }
    setModalState({ mode: 'edit-button', button: existingButton || null, col, row });
  };

  const handleSaveButton = () => {
    if (!editLabel.trim() || !editCommand.trim()) {
      Alert.alert('Error', 'Label y Command son requeridos');
      return;
    }

    if (!modalState || modalState.mode !== 'edit-button') return;

    const { col, row, button } = modalState;
    let updated = [...layout.buttons];

    if (button) {
      // Edit existing button
      updated = updated.map(b =>
        b.id === button.id
          ? { ...b, label: editLabel, command: editCommand, color: editColor, opacity: editOpacity }
          : b
      );
    } else {
      // Create new button
      updated.push({
        id: genId(),
        col,
        row,
        label: editLabel,
        command: editCommand,
        color: editColor,
        opacity: editOpacity,
      });
    }

    setLayout({ buttons: updated });
    setModalState(null);
  };

  const handleDeleteButton = () => {
    if (!modalState || modalState.mode !== 'edit-button' || !modalState.button) return;

    Alert.alert('Eliminar', '¿Eliminar este botón?', [
      { text: 'Cancelar', onPress: () => {} },
      {
        text: 'Eliminar',
        onPress: () => {
          setLayout({
            buttons: layout.buttons.filter(b => b.id !== modalState.button!.id),
          });
          setModalState(null);
        },
        style: 'destructive',
      },
    ]);
  };

  const handleSave = async () => {
    await saveLayout(layout);
    setOriginalLayout(JSON.parse(JSON.stringify(layout)));
    hasChanges.current = false;
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.headerBtn}>{'< Volver'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Editor de botones</Text>
        <TouchableOpacity onPress={handleSave}>
          <Text style={styles.headerBtn}>Guardar</Text>
        </TouchableOpacity>
      </View>

      <View style={[
        styles.gridContainer,
        {
          width: gridWidth + 2,
          height: gridHeight + 2,
          marginLeft: offsetX,
          marginTop: offsetY,
        },
      ]}>
        {/* Grid lines and cells */}
        {Array.from({ length: GRID_ROWS }).map((_, row) =>
          Array.from({ length: GRID_COLS }).map((_, col) => {
            const button = layout.buttons.find(b => b.col === col && b.row === row);
            const x = col * cellSize;
            const y = row * cellSize;

            return (
              <TouchableOpacity
                key={`${col}-${row}`}
                onPress={() => handleCellPress(col, row)}
                style={[
                  styles.cell,
                  {
                    left: x,
                    top: y,
                    width: cellSize,
                    height: cellSize,
                    backgroundColor: button ? button.color : '#1a1a1a',
                    borderColor: '#333',
                    opacity: button ? button.opacity : 1,
                  },
                ]}
                activeOpacity={0.7}
              >
                {button && (
                  <Text style={styles.cellText}>{button.label}</Text>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* Edit Button Modal */}
      <Modal
        visible={modalState?.mode === 'edit-button'}
        transparent
        animationType="slide"
        onRequestClose={() => setModalState(null)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Editar botón</Text>
          </View>

          <View style={styles.modalContent}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Label</Text>
              <TextInput
                style={styles.input}
                value={editLabel}
                onChangeText={setEditLabel}
                placeholder="Ej: Norte"
                placeholderTextColor="#666"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Comando</Text>
              <TextInput
                style={styles.input}
                value={editCommand}
                onChangeText={setEditCommand}
                placeholder="Ej: norte"
                placeholderTextColor="#666"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Color</Text>
              <View style={styles.colorGrid}>
                {COLORS.map(color => (
                  <TouchableOpacity
                    key={color}
                    onPress={() => setEditColor(color)}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color },
                      editColor === color && styles.colorOptionSelected,
                    ]}
                  >
                    {editColor === color && <Text style={styles.checkmark}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Opacidad: {Math.round(editOpacity * 100)}%</Text>
              <View style={styles.sliderContainer}>
                <TouchableOpacity
                  onPress={() => setEditOpacity(Math.max(0, editOpacity - 0.1))}
                  style={styles.sliderBtn}
                >
                  <Text style={styles.sliderBtnText}>−</Text>
                </TouchableOpacity>
                <View
                  style={[
                    styles.sliderTrack,
                    {
                      backgroundColor: editColor,
                      opacity: editOpacity,
                    },
                  ]}
                />
                <TouchableOpacity
                  onPress={() => setEditOpacity(Math.min(1, editOpacity + 0.1))}
                  style={styles.sliderBtn}
                >
                  <Text style={styles.sliderBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {modalState?.mode === 'edit-button' && modalState.button && (
              <TouchableOpacity
                onPress={handleDeleteButton}
                style={styles.deleteBtn}
              >
                <Text style={styles.deleteBtnText}>Eliminar botón</Text>
              </TouchableOpacity>
            )}

            <View style={styles.buttonRow}>
              <TouchableOpacity
                onPress={() => setModalState(null)}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveButton}
                style={styles.saveBtn}
              >
                <Text style={styles.saveBtnText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    height: HEADER_HEIGHT,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  headerBtn: {
    color: '#0c0',
    fontSize: 14,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  gridContainer: {
    position: 'relative',
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#333',
  },
  cell: {
    position: 'absolute',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cellText: {
    color: '#fff',
    fontSize: 9,
    fontFamily: 'monospace',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  modalHeader: {
    height: HEADER_HEIGHT,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    color: '#0c0',
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontFamily: 'monospace',
    fontSize: 14,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  colorOption: {
    width: 50,
    height: 50,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorOptionSelected: {
    borderColor: '#0c0',
  },
  checkmark: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sliderBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0a3a0a',
    borderWidth: 1,
    borderColor: '#0c0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sliderBtnText: {
    color: '#0c0',
    fontSize: 18,
    fontWeight: 'bold',
  },
  sliderTrack: {
    flex: 1,
    height: 36,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#333',
  },
  deleteBtn: {
    backgroundColor: '#2a1a1a',
    borderWidth: 1,
    borderColor: '#cc3333',
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  deleteBtnText: {
    color: '#cc3333',
    fontSize: 14,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#3a1a1a',
    borderWidth: 2,
    borderColor: '#cc3333',
    borderRadius: 6,
    paddingVertical: 14,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  cancelBtnText: {
    color: '#cc3333',
    fontSize: 14,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  saveBtn: {
    flex: 1,
    backgroundColor: '#1a3a1a',
    borderWidth: 2,
    borderColor: '#0c0',
    borderRadius: 6,
    paddingVertical: 14,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  saveBtnText: {
    color: '#0c0',
    fontSize: 14,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
});
