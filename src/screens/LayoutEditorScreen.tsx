import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, Modal, TextInput, StyleSheet, useWindowDimensions, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { LayoutButton, ButtonLayout } from '../storage/layoutStorage';
import { loadLayoutProfile, saveLayoutProfile, updateLayoutProfile, listLayoutProfiles } from '../storage/layoutProfileStorage';
import { loadServers, saveServers } from '../storage/serverStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'LayoutEditor'>;

const HEADER_HEIGHT = 56;
const COLORS = ['#cc3333', '#3399cc', '#33cc33', '#cc9933', '#9933cc', '#cc3399', '#333333', '#666666'];

type ModalState =
  | { mode: 'edit-button'; button: LayoutButton | null; col: number; row: number }
  | null;

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function LayoutEditorScreen({ navigation, route }: Props) {
  const { width, height } = useWindowDimensions();
  const [layout, setLayout] = useState<ButtonLayout>({ buttons: [], gridSize: 11 });
  const [originalLayout, setOriginalLayout] = useState<ButtonLayout>({ buttons: [], gridSize: 11 });
  const [modalState, setModalState] = useState<ModalState>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editCommand, setEditCommand] = useState('');
  const [editColor, setEditColor] = useState('#666666');
  const [editOpacity, setEditOpacity] = useState(0.5);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editingServerId, setEditingServerId] = useState<string | null>(null);
  const [showGridSizeModal, setShowGridSizeModal] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [currentProfileName, setCurrentProfileName] = useState('');
  const hasChanges = useRef(false);

  const GRID_COLS = layout.gridSize;
  const GRID_ROWS = layout.gridSize;

  // Load layout on mount
  useEffect(() => {
    const profileId = route.params?.profileId;
    const serverId = route.params?.serverId;

    if (serverId) {
      // Load from server
      loadServers().then(servers => {
        const server = servers.find(s => s.id === serverId);
        if (server && server.buttonLayout) {
          setLayout(server.buttonLayout);
          setOriginalLayout(JSON.parse(JSON.stringify(server.buttonLayout)));
          setEditingServerId(serverId);
          setCurrentProfileName(server.name);
        }
      });
    } else if (profileId) {
      Promise.all([
        loadLayoutProfile(profileId),
        listLayoutProfiles()
      ]).then(([loaded, profiles]) => {
        if (loaded) {
          setLayout(loaded);
          setOriginalLayout(JSON.parse(JSON.stringify(loaded)));
          setEditingProfileId(profileId);
          const profile = profiles.find(p => p.id === profileId);
          if (profile) {
            setCurrentProfileName(profile.name);
          }
        }
      });
    } else {
      // New profile - show grid size selection modal
      setShowGridSizeModal(true);
      setEditingProfileId(null);
      setCurrentProfileName('');
    }
    hasChanges.current = false;
  }, [route.params?.profileId, route.params?.serverId]);

  const createDefaultButtons = (gridSize: number): LayoutButton[] => {
    const center = Math.floor(gridSize / 2);
    const offsets = [-1, 0, 1];
    const buttons: LayoutButton[] = [];

    // LOC en el centro
    buttons.push({
      id: genId(),
      col: center,
      row: center,
      label: 'LOC',
      command: 'locate',
      color: '#3399cc',
      opacity: 0.5,
    });

    // 8 direcciones alrededor del centro
    const directions = [
      { label: 'NO', command: 'noroeste', offset: [-1, -1] },
      { label: 'N', command: 'norte', offset: [0, -1] },
      { label: 'NE', command: 'noreste', offset: [1, -1] },
      { label: 'O', command: 'oeste', offset: [-1, 0] },
      { label: 'E', command: 'este', offset: [1, 0] },
      { label: 'SO', command: 'sudoeste', offset: [-1, 1] },
      { label: 'S', command: 'sur', offset: [0, 1] },
      { label: 'SE', command: 'sudeste', offset: [1, 1] },
    ];

    directions.forEach(dir => {
      const col = center + dir.offset[0];
      const row = center + dir.offset[1];
      // Validar que está dentro de la grilla
      if (col >= 0 && col < gridSize && row >= 0 && row < gridSize) {
        buttons.push({
          id: genId(),
          col,
          row,
          label: dir.label,
          command: dir.command,
          color: '#cc3333',
          opacity: 0.5,
        });
      }
    });

    return buttons;
  };

  const handleSelectGridSize = (gridSize: number) => {
    const defaultButtons = createDefaultButtons(gridSize);
    const newLayout: ButtonLayout = {
      buttons: defaultButtons,
      gridSize,
    };
    setLayout(newLayout);
    setOriginalLayout(JSON.parse(JSON.stringify(newLayout)));
    setShowGridSizeModal(false);
  };

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

    setLayout({ ...layout, buttons: updated });
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
            ...layout,
            buttons: layout.buttons.filter(b => b.id !== modalState.button!.id),
          });
          setModalState(null);
        },
        style: 'destructive',
      },
    ]);
  };

  const handleSave = async () => {
    if (editingServerId) {
      // Editing server configuration - update server
      try {
        const servers = await loadServers();
        const updated = servers.map(s =>
          s.id === editingServerId ? { ...s, buttonLayout: layout } : s
        );
        await saveServers(updated);
        setOriginalLayout(JSON.parse(JSON.stringify(layout)));
        hasChanges.current = false;
        navigation.goBack();
      } catch (error) {
        Alert.alert('Error', 'No se pudo guardar la configuración');
        console.error(error);
      }
    } else if (editingProfileId) {
      // Editing existing profile - just update and go back
      try {
        await updateLayoutProfile(editingProfileId, currentProfileName, layout);
        setOriginalLayout(JSON.parse(JSON.stringify(layout)));
        hasChanges.current = false;
        navigation.goBack();
      } catch (error) {
        Alert.alert('Error', 'No se pudo guardar el perfil');
        console.error(error);
      }
    } else {
      // Creating new profile - ask for name
      setShowNameModal(true);
    }
  };

  const handleSaveProfileName = async () => {
    if (!currentProfileName.trim()) {
      Alert.alert('Error', 'El nombre del perfil es requerido');
      return;
    }

    try {
      // Create new profile
      const newProfileId = await saveLayoutProfile(currentProfileName, layout);
      setEditingProfileId(newProfileId);
      setOriginalLayout(JSON.parse(JSON.stringify(layout)));
      hasChanges.current = false;
      setShowNameModal(false);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', 'No se pudo guardar el perfil');
      console.error(error);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.headerBtn}>{'< Volver'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {currentProfileName || 'Nuevo perfil'}
        </Text>
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

      {/* Profile Name Modal - only for new profiles */}
      <Modal
        visible={showNameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNameModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.nameModal}>
            <Text style={styles.nameModalTitle}>Guardar perfil como...</Text>
            <TextInput
              style={styles.nameModalInput}
              placeholder="Nombre del perfil"
              placeholderTextColor="#666"
              value={currentProfileName}
              onChangeText={setCurrentProfileName}
              autoFocus
            />
            <View style={styles.nameModalButtons}>
              <TouchableOpacity
                onPress={() => setShowNameModal(false)}
                style={styles.nameModalCancelBtn}
              >
                <Text style={styles.nameModalCancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveProfileName}
                style={styles.nameModalSaveBtn}
              >
                <Text style={styles.nameModalSaveBtnText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Grid Size Selection Modal */}
      <Modal
        visible={showGridSizeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGridSizeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.gridSizeModal}>
            <Text style={styles.gridSizeTitle}>Seleccionar tamaño de grilla</Text>
            <Text style={styles.gridSizeSubtitle}>
              Los botones por defecto (LOC + 8 direcciones) se crearán en el centro
            </Text>

            <View style={styles.gridSizeOptions}>
              {[8, 9, 10, 11].map(size => (
                <TouchableOpacity
                  key={size}
                  onPress={() => handleSelectGridSize(size)}
                  style={styles.gridSizeBtn}
                >
                  <Text style={styles.gridSizeBtnText}>{size}x{size}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

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
                placeholder="Ej: F1"
                placeholderTextColor="#666"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Comando</Text>
              <TextInput
                style={styles.input}
                value={editCommand}
                onChangeText={setEditCommand}
                placeholder="Ej: formular curar heridas ligeras:$arg:me$"
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
    fontSize: 13,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    justifyContent: 'center',
  },
  colorOption: {
    width: 40,
    height: 40,
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
    fontSize: 12,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  gridSizeModal: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: '#333',
    width: '100%',
    maxWidth: 400,
  },
  gridSizeTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    marginBottom: 8,
    textAlign: 'center',
  },
  gridSizeSubtitle: {
    color: '#999',
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 20,
    textAlign: 'center',
  },
  gridSizeOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 12,
  },
  gridSizeBtn: {
    flex: 1,
    backgroundColor: '#0a3a0a',
    borderWidth: 2,
    borderColor: '#0c0',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  gridSizeBtnText: {
    color: '#0c0',
    fontSize: 16,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  nameModal: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: '#333',
    width: '100%',
    maxWidth: 400,
  },
  nameModalTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    marginBottom: 16,
    textAlign: 'center',
  },
  nameModalInput: {
    backgroundColor: '#0a0a0a',
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 6,
    padding: 12,
    fontSize: 14,
    fontFamily: 'monospace',
    marginBottom: 20,
  },
  nameModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  nameModalCancelBtn: {
    flex: 1,
    backgroundColor: '#3a1a1a',
    borderWidth: 2,
    borderColor: '#cc3333',
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
  },
  nameModalCancelBtnText: {
    color: '#cc3333',
    fontSize: 14,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  nameModalSaveBtn: {
    flex: 1,
    backgroundColor: '#1a3a1a',
    borderWidth: 2,
    borderColor: '#0c0',
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
  },
  nameModalSaveBtnText: {
    color: '#0c0',
    fontSize: 14,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
});
