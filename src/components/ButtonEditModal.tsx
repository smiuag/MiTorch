import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Text,
  ScrollView,
} from 'react-native';
import { LayoutButton } from '../storage/layoutStorage';

interface ButtonEditModalProps {
  visible: boolean;
  col: number;
  row: number;
  button: LayoutButton | null;
  onSave: (btn: LayoutButton) => void;
  onDelete: () => void;
  onMove: () => void;
  onClose: () => void;
}

const PRESET_COLORS = [
  '#662222',
  '#223366',
  '#226622',
  '#663322',
  '#662266',
  '#226666',
  '#444444',
];

export function ButtonEditModal({
  visible,
  col,
  row,
  button,
  onSave,
  onDelete,
  onMove,
  onClose,
}: ButtonEditModalProps) {
  const [label, setLabel] = useState('');
  const [command, setCommand] = useState('');
  const [secondaryCommand, setSecondaryCommand] = useState('');
  const [color, setColor] = useState('#662222');
  const [addText, setAddText] = useState(false);

  useEffect(() => {
    if (button) {
      setLabel(button.label);
      setCommand(button.command);
      setSecondaryCommand(button.secondaryCommand ?? '');
      setColor(button.color);
      setAddText(button.addText ?? false);
    } else {
      setLabel('');
      setCommand('');
      setSecondaryCommand('');
      setColor('#662222');
      setAddText(false);
    }
  }, [button, visible]);

  const handleSave = () => {
    const newButton: LayoutButton = {
      id: button?.id || `btn_${Date.now()}`,
      col,
      row,
      label: label || '—',
      command: command || '',
      color,
      textColor: '#ffffff',
      addText,
      secondaryCommand: secondaryCommand || undefined,
    };
    onSave(newButton);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {button ? 'Editar Botón' : 'Nuevo Botón'} ({col}, {row})
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>Etiqueta</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: cc"
              placeholderTextColor="#888"
              value={label}
              onChangeText={setLabel}
              autoCapitalize="none"
            />

            <Text style={styles.label}>Comando</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: enterrar"
              placeholderTextColor="#888"
              value={command}
              onChangeText={setCommand}
              autoCapitalize="none"
            />

            <Text style={styles.label}>Comando Secundario (Swipe)</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: soltar (opcional)"
              placeholderTextColor="#888"
              value={secondaryCommand}
              onChangeText={setSecondaryCommand}
              autoCapitalize="none"
            />

            <Text style={styles.label}>Color Fondo</Text>
            <View style={styles.colorGrid}>
              {PRESET_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.colorOption,
                    { backgroundColor: c, borderWidth: color === c ? 3 : 0, borderColor: '#fff' },
                  ]}
                  onPress={() => setColor(c)}
                />
              ))}
            </View>

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setAddText(!addText)}
            >
              <View style={[styles.checkbox, addText && styles.checkboxChecked]}>
                {addText && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>Añadir texto al input</Text>
            </TouchableOpacity>

            <View style={styles.preview}>
              <Text style={styles.previewLabel}>Preview:</Text>
              <TouchableOpacity
                style={[
                  styles.previewButton,
                  { backgroundColor: color },
                ]}
                disabled
              >
                <Text style={[styles.previewText, { color: '#ffffff' }]}>
                  {label || '—'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          <View style={styles.actions}>
            {button && (
              <>
                <TouchableOpacity style={[styles.button, styles.deleteButton]} onPress={onDelete}>
                  <Text style={styles.buttonText}>Borrar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.button, styles.moveButton]} onPress={onMove}>
                  <Text style={styles.buttonText}>Mover</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onClose}>
              <Text style={styles.buttonText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.saveButton]} onPress={handleSave}>
              <Text style={styles.buttonText}>Guardar</Text>
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
    maxHeight: '80%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: '#3399cc',
    backgroundColor: '#0f0f0f',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#3399cc',
  },
  closeButton: {
    fontSize: 26,
    color: '#888',
    fontWeight: 'bold',
  },
  content: {
    padding: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3399cc',
    marginTop: 14,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#0f0f0f',
    borderWidth: 2,
    borderColor: '#3399cc',
    borderRadius: 6,
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '500',
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 6,
    marginTop: 8,
  },
  colorOption: {
    width: '12%',
    aspectRatio: 1,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#444',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  textColorOption: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 6,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#3399cc',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    backgroundColor: '#0f0f0f',
  },
  checkboxChecked: {
    backgroundColor: '#3399cc',
  },
  checkmark: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  preview: {
    marginTop: 18,
    paddingTop: 14,
    paddingBottom: 14,
    borderTopWidth: 2,
    borderTopColor: '#3399cc',
    borderBottomWidth: 2,
    borderBottomColor: '#3399cc',
    alignItems: 'center',
    backgroundColor: '#0f0f0f',
  },
  previewLabel: {
    fontSize: 11,
    color: '#888',
    marginBottom: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  previewButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 120,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  previewText: {
    fontWeight: '700',
    fontSize: 15,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderTopWidth: 2,
    borderTopColor: '#3399cc',
    backgroundColor: '#0f0f0f',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  deleteButton: {
    backgroundColor: '#cc3333',
    borderColor: '#ff5555',
  },
  moveButton: {
    backgroundColor: '#226622',
    borderColor: '#44aa44',
  },
  cancelButton: {
    backgroundColor: '#444',
    borderColor: '#666',
  },
  saveButton: {
    backgroundColor: '#3399cc',
    borderColor: '#55bbff',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
