import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Modal, TextInput, FlatList, ScrollView,
  StyleSheet, useWindowDimensions, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, FloatingLayout, LayoutItem, LayoutItemType } from '../types';
import { loadLayout, saveLayout } from '../storage/layoutStorage';
import { loadSettings } from '../storage/settingsStorage';
import { computeGridMetrics, hasCollision, occupiedCells } from '../utils/gridUtils';

type Props = NativeStackScreenProps<RootStackParamList, 'LayoutEditor'>;

const HEADER_HEIGHT = 56;
const COLORS = ['#cc3333', '#3399cc', '#33cc33', '#cc9933', '#9933cc', '#cc3399', '#333333', '#666666'];

const DEFAULT_SPANS: Record<LayoutItemType, { colSpan: number; rowSpan: number }> = {
  button: { colSpan: 1, rowSpan: 1 },
  vitalbars: { colSpan: 8, rowSpan: 1 },
  input: { colSpan: 8, rowSpan: 1 },
  chat: { colSpan: 6, rowSpan: 6 },
  terminal: { colSpan: 6, rowSpan: 8 },
};

const MIN_SPANS: Record<LayoutItemType, { minCols: number; minRows: number }> = {
  button: { minCols: 1, minRows: 1 },
  vitalbars: { minCols: 8, minRows: 1 },
  input: { minCols: 8, minRows: 1 },
  chat: { minCols: 6, minRows: 6 },
  terminal: { minCols: 4, minRows: 3 },
};

// Fixed row spans for widgets that shouldn't be resizable vertically
const FIXED_ROW_SPANS: Partial<Record<LayoutItemType, number>> = {
  vitalbars: 1,
};

type ModalState =
  | { mode: 'pick-type'; col: number; row: number }
  | { mode: 'edit-button'; item: LayoutItem }
  | { mode: 'edit-widget'; item: LayoutItem }
  | null;

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function LayoutEditorScreen({ navigation }: Props) {
  const { width, height } = useWindowDimensions();
  const [layout, setLayout] = useState<FloatingLayout>({ gridCols: 6, gridRows: 8, items: [] });
  const [preferredOrientation, setPreferredOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [modalState, setModalState] = useState<ModalState>(null);

  // Load layout and preferred orientation on mount
  useEffect(() => {
    loadSettings().then(s => {
      setPreferredOrientation(s.floatingOrientation);
    });
    loadLayout().then(setLayout);
  }, []);

  // Detect actual device orientation from current dimensions
  const actualOrientation = width > height ? 'landscape' : 'portrait';

  // Calculate cellSize based on portrait orientation (smaller dimension = width when portrait)
  // This ensures cellSize is CONSISTENT between portrait and landscape
  // Get the "portrait width" (the smaller dimension)
  const portraitWidth = Math.min(width, height);

  // Grid dimensions are FIXED based on preferred orientation
  // Portrait: 12 columns × 22 rows
  // Landscape: 24 columns × 10 rows
  const targetGridCols = preferredOrientation === 'portrait' ? 12 : 24;
  const targetGridRows = preferredOrientation === 'portrait' ? 22 : 10;

  // Calculate cellSize based on portrait width divided by target columns
  const cellSize = Math.max(30, Math.min(70, Math.floor(portraitWidth / targetGridCols)));

  // Grid dimensions are FIXED
  const gridCols = targetGridCols;
  const gridRows = targetGridRows;
  const gridWidth = cellSize * gridCols;
  const gridHeight = cellSize * gridRows;
  const offsetX = Math.floor((width - gridWidth) / 2);
  const offsetY = Math.floor(((height - HEADER_HEIGHT) - gridHeight) / 2);

  const metrics = { cellSize, gridCols, gridRows, gridWidth, gridHeight, offsetX, offsetY };

  const handlePickType = (col: number, row: number) => {
    setModalState({ mode: 'pick-type', col, row });
  };

  const handleAddItem = (type: LayoutItemType, col: number, row: number) => {
    // Check if this type already exists (only buttons can be multiple)
    if (type !== 'button' && layout.items.some(item => item.type === type)) {
      Alert.alert('Error', `Solo puede haber un elemento de tipo ${type}`);
      return;
    }

    const spans = DEFAULT_SPANS[type];
    const newItem: LayoutItem = {
      id: genId(),
      type,
      col,
      row,
      colSpan: spans.colSpan,
      rowSpan: spans.rowSpan,
      ...(type === 'button' ? { label: '', command: '', color: COLORS[0], opacity: 1 } : {}),
    };

    if (hasCollision(newItem, layout.items, metrics.gridCols, metrics.gridRows)) {
      Alert.alert('Colisión', 'No cabe en esa posición');
      return;
    }

    setLayout(prev => ({ ...prev, items: [...prev.items, newItem] }));

    // Auto-open edit for buttons
    if (type === 'button') {
      setModalState({ mode: 'edit-button', item: newItem });
    } else {
      setModalState(null);
    }
  };

  const handleEditItem = (item: LayoutItem) => {
    if (item.type === 'button') {
      setModalState({ mode: 'edit-button', item });
    } else {
      setModalState({ mode: 'edit-widget', item });
    }
  };

  const handleUpdateItem = (updated: LayoutItem) => {
    if (hasCollision(updated, layout.items, metrics.gridCols, metrics.gridRows, updated.id)) {
      Alert.alert('Colisión', 'No cabe con ese tamaño');
      return;
    }
    setLayout(prev => ({
      ...prev,
      items: prev.items.map(it => it.id === updated.id ? updated : it),
    }));
    setModalState(null);
  };

  const handleDeleteItem = (id: string) => {
    setLayout(prev => ({
      ...prev,
      items: prev.items.filter(it => it.id !== id),
    }));
  };

  const handleSave = async () => {
    await saveLayout(layout);
    navigation.goBack();
  };

  const handleDeleteItemWithConfirm = (id: string) => {
    Alert.alert('Eliminar', '¿Seguro?', [
      { text: 'Cancelar', onPress: () => {} },
      { text: 'Eliminar', onPress: () => handleDeleteItem(id), style: 'destructive' },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.headerBtn}>{'< Volver'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Editor de pantalla</Text>
        <TouchableOpacity onPress={handleSave}>
          <Text style={styles.headerBtn}>Guardar</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View
          style={{
            position: 'relative',
            width: metrics.gridWidth + metrics.offsetX * 2,
            marginLeft: metrics.offsetX,
            marginTop: metrics.offsetY,
            marginRight: metrics.offsetX,
          }}
        >
          {/* Render terminal borders first (behind grid) */}
          {layout.items
            .filter(item => item.type === 'terminal')
            .map(item => renderTerminalBorders(item, metrics.cellSize))}

          <View
            style={[
              styles.gridArea,
              {
                width: metrics.gridWidth,
              },
            ]}
          >
            {renderGridCells(metrics, layout, handlePickType, handleEditItem)}

            {/* Render all items on top */}
            {layout.items.map(item => renderItem(item, metrics.cellSize, handleEditItem, true, metrics))}
          </View>
        </View>
      </ScrollView>

      {modalState && renderModal(modalState, setModalState, handleAddItem, handleUpdateItem, handleDeleteItemWithConfirm, metrics, layout)}
    </SafeAreaView>
  );
}

function renderTerminalBorders(item: LayoutItem, cellSize: number) {
  const x = item.col * cellSize;
  const y = item.row * cellSize;
  const w = item.colSpan * cellSize;
  const h = item.rowSpan * cellSize;
  const borderWidth = 2;

  return (
    <View key={`terminal-borders-${item.id}`} pointerEvents="none" style={{ zIndex: 5 }}>
      {/* Top border */}
      <View style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: borderWidth,
        backgroundColor: '#cc6600',
        zIndex: 5,
      }} />
      {/* Bottom border */}
      <View style={{
        position: 'absolute',
        left: x,
        top: y + h - borderWidth,
        width: w,
        height: borderWidth,
        backgroundColor: '#cc6600',
        zIndex: 5,
      }} />
      {/* Left border */}
      <View style={{
        position: 'absolute',
        left: x,
        top: y,
        width: borderWidth,
        height: h,
        backgroundColor: '#cc6600',
        zIndex: 5,
      }} />
      {/* Right border */}
      <View style={{
        position: 'absolute',
        left: x + w - borderWidth,
        top: y,
        width: borderWidth,
        height: h,
        backgroundColor: '#cc6600',
        zIndex: 5,
      }} />
    </View>
  );
}

function renderGridCells(
  metrics: any,
  layout: FloatingLayout,
  onPickType: (col: number, row: number) => void,
  onEditItem: (item: LayoutItem) => void,
) {
  const occupied = new Set<string>();
  for (const item of layout.items) {
    for (const cell of occupiedCells(item)) {
      occupied.add(cell);
    }
  }

  const rows: JSX.Element[] = [];
  for (let r = 0; r < metrics.gridRows; r++) {
    const cells: JSX.Element[] = [];
    for (let c = 0; c < metrics.gridCols; c++) {
      const key = `${c},${r}`;
      const isOccupied = occupied.has(key);
      cells.push(
        <TouchableOpacity
          key={key}
          style={[
            styles.cell,
            { width: metrics.cellSize, height: metrics.cellSize },
            isOccupied && styles.cellOccupied,
          ]}
          onPress={() => !isOccupied && onPickType(c, r)}
          activeOpacity={isOccupied ? 1 : 0.7}
        >
          {!isOccupied && <Text style={styles.cellPlus}>+</Text>}
        </TouchableOpacity>
      );
    }
    rows.push(
      <View key={r} style={styles.row}>
        {cells}
      </View>
    );
  }
  return rows;
}

function renderItem(
  item: LayoutItem,
  cellSize: number,
  onEdit: (item: LayoutItem) => void,
  isEditable: boolean = true,
  metrics?: any,
) {
  // Terminal element: show as single small square with gear icon
  // Borders are rendered separately and first (behind the grid)
  if (item.type === 'terminal' && metrics) {
    const x = item.col * cellSize;
    const y = item.row * cellSize;

    return (
      <TouchableOpacity
        key={item.id}
        style={[
          styles.itemContainer,
          {
            left: x,
            top: y,
            width: cellSize,
            height: cellSize,
          },
        ]}
        onPress={() => isEditable && onEdit(item)}
        activeOpacity={isEditable ? 0.8 : 1}
        disabled={!isEditable}
      >
        <View style={[
          styles.itemPreview,
          styles.terminalPreview,
          { backgroundColor: '#cc6600' },
        ]}>
          <Text style={styles.terminalCornerText}>⚙</Text>
        </View>
      </TouchableOpacity>
    );
  }

  const bgColor = item.type === 'button' ? item.color : '#111';
  return (
    <TouchableOpacity
      key={item.id}
      style={[
        styles.itemContainer,
        {
          left: item.col * cellSize,
          top: item.row * cellSize,
          width: item.colSpan * cellSize,
          height: item.rowSpan * cellSize,
        },
      ]}
      onPress={() => isEditable && onEdit(item)}
      activeOpacity={isEditable ? 0.8 : 1}
      disabled={!isEditable}
    >
      <View style={[
        styles.itemPreview,
        { backgroundColor: bgColor, opacity: item.opacity || 1 },
      ]}>
        {item.type === 'button' && <Text style={styles.itemText} numberOfLines={1}>{item.label || 'Botón'}</Text>}
        {item.type === 'vitalbars' && <Text style={styles.itemText}>VitalBars</Text>}
        {item.type === 'input' && <Text style={styles.itemText}>Input</Text>}
        {item.type === 'chat' && <Text style={styles.itemText}>Chat</Text>}
      </View>
    </TouchableOpacity>
  );
}

function renderModal(
  modalState: ModalState,
  setModalState: (state: ModalState) => void,
  handleAddItem: (type: LayoutItemType, col: number, row: number) => void,
  handleUpdateItem: (item: LayoutItem) => void,
  handleDeleteItemWithConfirm: (id: string) => void,
  metrics: any,
  layout: FloatingLayout,
): JSX.Element {
  if (!modalState) return <></>;

  if (modalState.mode === 'pick-type') {
    const typeButtons: Array<{ type: LayoutItemType; label: string }> = [
      { type: 'button', label: 'Botón' },
      { type: 'vitalbars', label: 'VitalBars' },
      { type: 'input', label: 'Input' },
      { type: 'chat', label: 'Chat' },
      { type: 'terminal', label: 'Pantalla' },
    ];

    const isTypeDisabled = (type: LayoutItemType) => type !== 'button' && layout.items.some(item => item.type === type);

    return (
      <Modal transparent animationType="fade" visible onRequestClose={() => setModalState(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>¿Qué colocar aquí?</Text>
            <View style={styles.typeGrid}>
              {typeButtons.map(({ type, label }) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.typeOption, isTypeDisabled(type) && styles.typeOptionDisabled]}
                  onPress={() => {
                    handleAddItem(type, modalState.col, modalState.row);
                    setModalState(null);
                  }}
                  disabled={isTypeDisabled(type)}
                >
                  <Text style={[styles.typeOptionText, isTypeDisabled(type) && styles.typeOptionTextDisabled]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalState(null)}>
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  if (modalState.mode === 'edit-button') {
    return <ButtonEditorModal item={modalState.item} onSave={handleUpdateItem} onDelete={() => {}} onDeleteWithConfirm={handleDeleteItemWithConfirm} onClose={() => setModalState(null)} />;
  }

  if (modalState.mode === 'edit-widget') {
    return <WidgetEditorModal item={modalState.item} onUpdate={handleUpdateItem} onDelete={() => {}} onDeleteWithConfirm={handleDeleteItemWithConfirm} onClose={() => setModalState(null)} metrics={metrics} layout={{ items: [] }} />;
  }

  return <></>;
}

function ButtonEditorModal({
  item,
  onSave,
  onDelete,
  onClose,
  onDeleteWithConfirm,
}: {
  item: LayoutItem;
  onSave: (item: LayoutItem) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  onDeleteWithConfirm: (id: string) => void;
}) {
  const [label, setLabel] = useState(item.label || '');
  const [command, setCommand] = useState(item.command || '');
  const [color, setColor] = useState(item.color || COLORS[0]);
  const [opacity, setOpacity] = useState(item.opacity ?? 1);
  const [colSpan, setColSpan] = useState(item.colSpan);
  const [rowSpan, setRowSpan] = useState(item.rowSpan);

  const handleSave = () => {
    onSave({
      ...item,
      label,
      command,
      color,
      opacity,
      colSpan,
      rowSpan,
    });
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <ScrollView style={styles.modalContentScroll} contentContainerStyle={styles.modalContentScrollContent} pointerEvents="box-none">
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Editar botón</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Etiqueta</Text>
              <TextInput
                style={styles.textInput}
                value={label}
                onChangeText={setLabel}
                placeholder="Texto del botón"
                placeholderTextColor="#666"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Comando</Text>
              <TextInput
                style={styles.textInput}
                value={command}
                onChangeText={setCommand}
                placeholder="Comando a enviar"
                placeholderTextColor="#666"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Color</Text>
              <View style={styles.colorPalette}>
                {COLORS.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.colorOption, { backgroundColor: c }, color === c && styles.colorOptionSelected]}
                    onPress={() => setColor(c)}
                  />
                ))}
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Opacidad: {opacity.toFixed(1)}</Text>
              <View style={styles.opacityControls}>
                <TouchableOpacity style={styles.opacityBtn} onPress={() => setOpacity(Math.max(0, opacity - 0.1))}>
                  <Text style={styles.opacityBtnText}>−</Text>
                </TouchableOpacity>
                <View style={styles.opacityValue}>
                  <Text style={styles.opacityValueText}>{opacity.toFixed(1)}</Text>
                </View>
                <TouchableOpacity style={styles.opacityBtn} onPress={() => setOpacity(Math.min(1, opacity + 0.1))}>
                  <Text style={styles.opacityBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Tamaño (columnas: {colSpan}, filas: {rowSpan})</Text>
              <View style={styles.sizeControls}>
                <View style={styles.sizeRow}>
                  <Text style={styles.sizeLabel}>Cols:</Text>
                  <TouchableOpacity style={styles.sizeBtn} onPress={() => setColSpan(Math.max(1, colSpan - 1))}>
                    <Text style={styles.sizeBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.sizeValue}>{colSpan}</Text>
                  <TouchableOpacity style={styles.sizeBtn} onPress={() => setColSpan(colSpan + 1)}>
                    <Text style={styles.sizeBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.sizeRow}>
                  <Text style={styles.sizeLabel}>Filas:</Text>
                  <TouchableOpacity style={styles.sizeBtn} onPress={() => setRowSpan(Math.max(1, rowSpan - 1))}>
                    <Text style={styles.sizeBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.sizeValue}>{rowSpan}</Text>
                  <TouchableOpacity style={styles.sizeBtn} onPress={() => setRowSpan(rowSpan + 1)}>
                    <Text style={styles.sizeBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.buttonGroup}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.deleteActionBtn]}
                onPress={() => onDeleteWithConfirm(item.id)}
              >
                <Text style={styles.deleteActionBtnText}>Eliminar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.saveActionBtn]} onPress={() => { handleSave(); onClose(); }}>
                <Text style={styles.saveActionBtnText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </TouchableOpacity>
    </Modal>
  );
}

function WidgetEditorModal({
  item,
  onUpdate,
  onDelete,
  onClose,
  onDeleteWithConfirm,
  metrics,
  layout,
}: {
  item: LayoutItem;
  onUpdate: (item: LayoutItem) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  onDeleteWithConfirm: (id: string) => void;
  metrics: any;
  layout: any;
}) {
  const [colSpan, setColSpan] = useState(item.colSpan);
  const [rowSpan, setRowSpan] = useState(item.rowSpan);
  const [opacity, setOpacity] = useState(item.opacity ?? 1);
  const min = MIN_SPANS[item.type];

  const handleUpdateSize = (newCols: number, newRows: number) => {
    if (newCols >= min.minCols && newRows >= min.minRows) {
      setColSpan(newCols);
      setRowSpan(newRows);
    }
  };

  const handleUpdateOpacity = (newOpacity: number) => {
    const clamped = Math.max(0, Math.min(1, newOpacity));
    setOpacity(clamped);
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <ScrollView style={styles.modalContentScroll} contentContainerStyle={styles.modalContentScrollContent} pointerEvents="box-none">
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{item.type === 'vitalbars' ? 'VitalBars' : item.type === 'input' ? 'Input' : item.type === 'chat' ? 'Chat' : 'Pantalla'}</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                Tamaño (cols: {colSpan}, filas: {rowSpan}) mín: {min.minCols}×{min.minRows}
              </Text>
              <View style={styles.sizeControls}>
                <View style={styles.sizeRow}>
                  <Text style={styles.sizeLabel}>Cols:</Text>
                  <TouchableOpacity
                    style={[styles.sizeBtn, colSpan <= min.minCols && styles.sizeBtnDisabled]}
                    onPress={() => handleUpdateSize(colSpan - 1, rowSpan)}
                  >
                    <Text style={styles.sizeBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.sizeValue}>{colSpan}</Text>
                  <TouchableOpacity style={styles.sizeBtn} onPress={() => handleUpdateSize(colSpan + 1, rowSpan)}>
                    <Text style={styles.sizeBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
                    {!FIXED_ROW_SPANS[item.type] ? (
                  <View style={styles.sizeRow}>
                    <Text style={styles.sizeLabel}>Filas:</Text>
                    <TouchableOpacity
                      style={[styles.sizeBtn, rowSpan <= min.minRows && styles.sizeBtnDisabled]}
                      onPress={() => handleUpdateSize(colSpan, rowSpan - 1)}
                    >
                      <Text style={styles.sizeBtnText}>−</Text>
                    </TouchableOpacity>
                    <Text style={styles.sizeValue}>{rowSpan}</Text>
                    <TouchableOpacity style={styles.sizeBtn} onPress={() => handleUpdateSize(colSpan, rowSpan + 1)}>
                      <Text style={styles.sizeBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.sizeRow}>
                    <Text style={styles.sizeLabel}>Filas:</Text>
                    <Text style={[styles.sizeValue, { color: '#999' }]}>{rowSpan} (fijo)</Text>
                  </View>
                )}
              </View>
            </View>

            {item.type !== 'terminal' && (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Opacidad: {opacity.toFixed(1)}</Text>
                <View style={styles.opacityControls}>
                  <TouchableOpacity style={styles.opacityBtn} onPress={() => handleUpdateOpacity(opacity - 0.1)}>
                    <Text style={styles.opacityBtnText}>−</Text>
                  </TouchableOpacity>
                  <View style={styles.opacityValue}>
                    <Text style={styles.opacityValueText}>{opacity.toFixed(1)}</Text>
                  </View>
                  <TouchableOpacity style={styles.opacityBtn} onPress={() => handleUpdateOpacity(opacity + 0.1)}>
                    <Text style={styles.opacityBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <View style={styles.buttonGroup}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.deleteActionBtn]}
                onPress={() => onDeleteWithConfirm(item.id)}
              >
                <Text style={styles.deleteActionBtnText}>Eliminar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.saveActionBtn]} onPress={() => {
                const updated = item.type === 'terminal'
                  ? { ...item, colSpan, rowSpan }
                  : { ...item, colSpan, rowSpan, opacity };
                onUpdate(updated);
                onClose();
              }}>
                <Text style={styles.saveActionBtnText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
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
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingVertical: 16,
  },
  gridArea: {
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#222',
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    borderWidth: 1,
    borderColor: '#222',
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cellOccupied: {
    backgroundColor: '#111',
  },
  cellPlus: {
    color: '#333',
    fontSize: 16,
    fontWeight: 'bold',
  },
  itemContainer: {
    position: 'absolute',
    padding: 2,
  },
  itemPreview: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#0c0',
  },
  terminalPreview: {
    borderColor: '#cc9933',
    borderWidth: 2,
  },
  itemText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 16,
    maxWidth: 350,
    minWidth: 280,
    borderWidth: 1,
    borderColor: '#333',
  },
  modalContentScroll: {
    flex: 1,
  },
  modalContentScrollContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
    justifyContent: 'center',
  },
  typeOption: {
    backgroundColor: '#0a2a0a',
    borderWidth: 1,
    borderColor: '#0c0',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  typeOptionText: {
    color: '#0c0',
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  typeOptionDisabled: {
    backgroundColor: '#0a0a0a',
    borderColor: '#333',
  },
  typeOptionTextDisabled: {
    color: '#666',
  },
  cancelBtn: {
    backgroundColor: '#2a2a2a',
    borderRadius: 4,
    paddingVertical: 10,
    marginTop: 12,
  },
  cancelBtnText: {
    color: '#ccc',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  fieldGroup: {
    marginBottom: 12,
  },
  fieldLabel: {
    color: '#ccc',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 4,
    color: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  colorPalette: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
  },
  colorOption: {
    width: 32,
    height: 32,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorOptionSelected: {
    borderColor: '#0c0',
  },
  opacityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  opacityBtn: {
    width: 32,
    height: 32,
    borderRadius: 4,
    backgroundColor: '#0a2a0a',
    borderWidth: 1,
    borderColor: '#0c0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  opacityBtnText: {
    color: '#0c0',
    fontSize: 16,
    fontWeight: 'bold',
  },
  opacityValue: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 6,
  },
  opacityValueText: {
    color: '#0c0',
    fontSize: 12,
    fontWeight: 'bold',
  },
  sizeControls: {
    gap: 8,
  },
  sizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sizeLabel: {
    color: '#ccc',
    fontSize: 12,
    minWidth: 40,
  },
  sizeBtn: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: '#0a2a0a',
    borderWidth: 1,
    borderColor: '#0c0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sizeBtnDisabled: {
    backgroundColor: '#1a1a1a',
    borderColor: '#333',
  },
  sizeBtnText: {
    color: '#0c0',
    fontSize: 14,
    fontWeight: 'bold',
  },
  sizeValue: {
    color: '#0c0',
    fontSize: 12,
    fontWeight: 'bold',
    minWidth: 24,
    textAlign: 'center',
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveActionBtn: {
    backgroundColor: '#0a3a0a',
    borderWidth: 1,
    borderColor: '#0c0',
  },
  saveActionBtnText: {
    color: '#0c0',
    fontSize: 12,
    fontWeight: 'bold',
  },
  deleteActionBtn: {
    backgroundColor: '#3a0a0a',
    borderWidth: 1,
    borderColor: '#cc3333',
  },
  deleteActionBtnText: {
    color: '#cc3333',
    fontSize: 12,
    fontWeight: 'bold',
  },
  terminalFrame: {
    position: 'absolute',
    backgroundColor: 'transparent',
  },
  terminalCorner: {
    backgroundColor: '#cc6600',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  terminalCornerText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
