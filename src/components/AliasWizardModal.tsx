import React, { useState, useEffect } from 'react';
import {
  View,
  Modal,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { ParsedAlias } from '../utils/aliasParser';
import { LayoutButton, ButtonLayout } from '../storage/layoutStorage';

export interface WizardResult {
  buttons: LayoutButton[];
  channelAliasUpdates: Record<string, string>;
  gridSize: number;
}

interface AliasWizardModalProps {
  visible: boolean;
  aliases: ParsedAlias[];
  channels: string[];
  onSave: (result: WizardResult) => void;
  onDiscard: () => void;
}

type SubStep = 'main' | 'choose-type' | 'pick-grid' | 'pick-channel';

const COLORS = ['#cc3333', '#3399cc', '#33cc33', '#cc9933', '#9933cc', '#cc3399', '#333333', '#666666'];

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function AliasWizardModal({
  visible,
  aliases,
  channels,
  onSave,
  onDiscard,
}: AliasWizardModalProps) {
  const { width, height } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [subStep, setSubStep] = useState<SubStep>('main');
  const [gridSize, setGridSize] = useState(11);
  const [pendingButtons, setPendingButtons] = useState<LayoutButton[]>([]);
  const [pendingAliases, setPendingAliases] = useState<Record<string, string>>({});
  const [selectedCol, setSelectedCol] = useState<number | null>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [editColor, setEditColor] = useState('#cc3333');
  const [editOpacity, setEditOpacity] = useState(0.5);
  const [showingGridSize, setShowingGridSize] = useState(visible && aliases.length > 0);

  const currentAlias = aliases[currentIndex];

  // Reset when modal opens
  useEffect(() => {
    if (visible && aliases.length > 0) {
      setCurrentIndex(0);
      setSubStep('main');
      setGridSize(11);
      setPendingButtons([]);
      setPendingAliases({});
      setShowingGridSize(true);
    }
  }, [visible, aliases]);

  const moveToNext = () => {
    if (currentIndex < aliases.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setSubStep('main');
      setSelectedCol(null);
      setSelectedRow(null);
    } else {
      // Último alias — mostrar confirmación
      showSaveConfirmation();
    }
  };

  const handleOmitRest = () => {
    showSaveConfirmation();
  };

  const showSaveConfirmation = () => {
    Alert.alert(
      'Guardar configuración',
      `Se han configurado ${pendingButtons.length} botones y ${Object.keys(pendingAliases).length} alias de canal.`,
      [
        {
          text: 'Descartar',
          onPress: onDiscard,
          style: 'destructive',
        },
        {
          text: 'Guardar',
          onPress: () => {
            onSave({
              buttons: pendingButtons,
              channelAliasUpdates: pendingAliases,
              gridSize,
            });
          },
        },
      ]
    );
  };

  const handleConfigureAsButton = () => {
    setSubStep('pick-grid');
  };

  const handleGridCellPress = (col: number, row: number) => {
    setSelectedCol(col);
    setSelectedRow(row);
  };

  const handleConfirmButton = () => {
    if (selectedCol !== null && selectedRow !== null && currentAlias) {
      const newButton: LayoutButton = {
        id: genId(),
        col: selectedCol,
        row: selectedRow,
        label: currentAlias.name,
        command: currentAlias.command,
        color: editColor,
        opacity: editOpacity,
      };
      setPendingButtons([...pendingButtons, newButton]);
      moveToNext();
    }
  };

  const handleConfigureAsChannel = () => {
    setSubStep('pick-channel');
  };

  const handleChannelSelect = (channel: string) => {
    if (currentAlias) {
      setPendingAliases({ ...pendingAliases, [channel]: currentAlias.name });
      moveToNext();
    }
  };

  // ===== GRID SIZE SELECTION =====
  if (showingGridSize) {
    return (
      <Modal visible={visible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.title}>Tamaño de grilla</Text>
            <Text style={styles.subtitle}>Selecciona el tamaño de la grilla de botones</Text>

            <View style={styles.gridSizeGrid}>
              {[7, 9, 11, 13].map(size => (
                <TouchableOpacity
                  key={size}
                  style={[styles.gridSizeBtn, gridSize === size && styles.gridSizeBtnSelected]}
                  onPress={() => setGridSize(size)}
                >
                  <Text style={[styles.gridSizeText, gridSize === size && styles.gridSizeTextSelected]}>
                    {size}×{size}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onDiscard}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.nextBtn} onPress={() => setShowingGridSize(false)}>
                <Text style={styles.nextText}>Continuar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  // ===== MAIN WIZARD =====
  if (!currentAlias) {
    return null;
  }

  // ===== PICK GRID SUBSCREEN =====
  if (subStep === 'pick-grid') {
    const cellSize = Math.floor((width - 40) / gridSize);
    const occupiedCells = new Set(pendingButtons.map(b => `${b.col},${b.row}`));

    return (
      <Modal visible={visible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.modal, { maxHeight: height * 0.9 }]}>
            <Text style={styles.title}>Selecciona casilla</Text>
            <Text style={styles.subtitle}>
              {currentAlias.name} → {currentAlias.command}
            </Text>

            <ScrollView style={styles.gridContainer} showsVerticalScrollIndicator={false}>
              <View style={{ marginBottom: 12 }}>
                {Array.from({ length: gridSize }, (_, row) => (
                  <View key={row} style={styles.gridRow}>
                    {Array.from({ length: gridSize }, (_, col) => {
                      const occupied = occupiedCells.has(`${col},${row}`);
                      const selected = selectedCol === col && selectedRow === row;
                      return (
                        <TouchableOpacity
                          key={`${col},${row}`}
                          style={[
                            styles.gridCell,
                            { width: cellSize - 2, height: cellSize - 2 },
                            occupied && styles.gridCellOccupied,
                            selected && styles.gridCellSelected,
                          ]}
                          onPress={() => !occupied && handleGridCellPress(col, row)}
                          disabled={occupied}
                        >
                          {selected && <Text style={styles.gridCellText}>✓</Text>}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>

            <View style={styles.colorPickerRow}>
              <Text style={styles.colorLabel}>Color</Text>
              <View style={styles.colors}>
                {COLORS.map(color => (
                  <TouchableOpacity
                    key={color}
                    style={[styles.colorOption, { backgroundColor: color }, editColor === color && styles.colorOptionSelected]}
                    onPress={() => setEditColor(color)}
                  />
                ))}
              </View>
            </View>

            <View style={styles.opacityRow}>
              <Text style={styles.opacityLabel}>Opacidad</Text>
              <View style={styles.opacityOptions}>
                {[0.3, 0.5, 0.7, 1].map(op => (
                  <TouchableOpacity
                    key={op}
                    style={[styles.opacityBtn, editOpacity === op && styles.opacityBtnSelected]}
                    onPress={() => setEditOpacity(op)}
                  >
                    <Text style={[styles.opacityText, editOpacity === op && styles.opacityTextSelected]}>
                      {Math.round(op * 100)}%
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setSubStep('main')}>
                <Text style={styles.cancelText}>Atrás</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.nextBtn, selectedCol === null && styles.nextBtnDisabled]}
                onPress={handleConfirmButton}
                disabled={selectedCol === null}
              >
                <Text style={[styles.nextText, selectedCol === null && styles.nextTextDisabled]}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  // ===== PICK CHANNEL SUBSCREEN =====
  if (subStep === 'pick-channel') {
    return (
      <Modal visible={visible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.title}>Selecciona canal</Text>
            <Text style={styles.subtitle}>
              {currentAlias.name} → {currentAlias.command}
            </Text>

            <ScrollView style={styles.channelList}>
              {channels.map(channel => (
                <TouchableOpacity
                  key={channel}
                  style={styles.channelOption}
                  onPress={() => handleChannelSelect(channel)}
                >
                  <Text style={styles.channelOptionText}>{channel}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setSubStep('main')}>
                <Text style={styles.cancelText}>Atrás</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  // ===== MAIN SCREEN =====
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.progressText}>
            {currentIndex + 1} de {aliases.length}
          </Text>

          <Text style={styles.typeTag}>{currentAlias.type === 'direction' ? '↔' : currentAlias.type === 'locate' ? '◎' : '→'}</Text>

          <Text style={styles.aliasName}>{currentAlias.name}</Text>
          <Text style={styles.aliasCommand} numberOfLines={2}>
            {currentAlias.command}
          </Text>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.omitBtn} onPress={() => moveToNext()}>
              <Text style={styles.omitText}>Omitir</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.configBtn} onPress={() => setSubStep('choose-type')}>
              <Text style={styles.configText}>Configurar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.omitRestBtn} onPress={handleOmitRest}>
              <Text style={styles.omitRestText}>Omitir resto</Text>
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
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: '#333',
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    fontFamily: 'monospace',
  },
  subtitle: {
    color: '#666',
    fontSize: 12,
    marginBottom: 16,
    fontFamily: 'monospace',
  },
  progressText: {
    color: '#0c0',
    fontSize: 11,
    fontFamily: 'monospace',
    marginBottom: 12,
  },
  typeTag: {
    color: '#0c0',
    fontSize: 28,
    marginBottom: 8,
  },
  aliasName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
    fontFamily: 'monospace',
  },
  aliasCommand: {
    color: '#999',
    fontSize: 12,
    marginBottom: 16,
    fontFamily: 'monospace',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  configBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#0c0',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  configText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 13,
    fontFamily: 'monospace',
  },
  omitBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#333',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  omitText: {
    color: '#666',
    fontWeight: 'bold',
    fontSize: 13,
    fontFamily: 'monospace',
  },
  omitRestBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#3a2a2a',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  omitRestText: {
    color: '#cc6666',
    fontWeight: 'bold',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#2a2a2a',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelText: {
    color: '#666',
    fontWeight: 'bold',
    fontSize: 13,
    fontFamily: 'monospace',
  },
  nextBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#0c0',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextBtnDisabled: {
    backgroundColor: '#333',
  },
  nextText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 13,
    fontFamily: 'monospace',
  },
  nextTextDisabled: {
    color: '#666',
  },
  gridSizeBtn: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#2a2a2a',
    borderRadius: 6,
    margin: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridSizeBtnSelected: {
    backgroundColor: '#0c0',
  },
  gridSizeText: {
    color: '#666',
    fontWeight: 'bold',
    fontSize: 14,
  },
  gridSizeTextSelected: {
    color: '#000',
  },
  gridSizeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  gridContainer: {
    maxHeight: 300,
    marginBottom: 12,
  },
  gridRow: {
    flexDirection: 'row',
    marginBottom: 1,
  },
  gridCell: {
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    margin: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridCellOccupied: {
    backgroundColor: '#1a1a1a',
    opacity: 0.5,
  },
  gridCellSelected: {
    backgroundColor: '#0c0',
    borderColor: '#0c0',
  },
  gridCellText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 12,
  },
  colorPickerRow: {
    marginBottom: 12,
  },
  colorLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 6,
    fontFamily: 'monospace',
  },
  colors: {
    flexDirection: 'row',
    gap: 6,
  },
  colorOption: {
    width: 32,
    height: 32,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorOptionSelected: {
    borderColor: '#fff',
  },
  opacityRow: {
    marginBottom: 12,
  },
  opacityLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 6,
    fontFamily: 'monospace',
  },
  opacityOptions: {
    flexDirection: 'row',
    gap: 6,
  },
  opacityBtn: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#2a2a2a',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  opacityBtnSelected: {
    backgroundColor: '#0c0',
  },
  opacityText: {
    color: '#666',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  opacityTextSelected: {
    color: '#000',
    fontWeight: 'bold',
  },
  channelList: {
    maxHeight: 300,
    marginBottom: 12,
  },
  channelOption: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#0a0a0a',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  channelOptionText: {
    color: '#0c0',
    fontWeight: 'bold',
    fontSize: 14,
    fontFamily: 'monospace',
  },
});
