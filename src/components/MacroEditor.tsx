import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Macro } from '../types';

const PRESET_COLORS = [
  '#cc0000', '#00cc00', '#0066cc', '#cc6600', '#6600cc',
  '#00cccc', '#cc00cc', '#cccc00', '#444444', '#666666',
  '#2a6e2a', '#2a4e6e', '#6e5a2a', '#6e2a4e', '#2a6e6e',
];

interface MacroEditorProps {
  visible: boolean;
  macro: Macro | null; // null = adding new
  onSave: (macro: Macro) => void;
  onDelete: (macroId: string) => void;
  onClose: () => void;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function MacroEditor({ visible, macro, onSave, onDelete, onClose }: MacroEditorProps) {
  const [label, setLabel] = useState('');
  const [command, setCommand] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);

  useEffect(() => {
    if (macro) {
      setLabel(macro.label);
      setCommand(macro.command);
      setColor(macro.color);
    } else {
      setLabel('');
      setCommand('');
      setColor(PRESET_COLORS[0]);
    }
  }, [macro, visible]);

  const handleSave = () => {
    if (!label.trim() || !command.trim()) return;
    onSave({
      id: macro?.id ?? generateId(),
      label: label.trim(),
      command: command.trim(),
      color,
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.content}>
          <Text style={styles.title}>
            {macro ? 'Edit Macro' : 'New Macro'}
          </Text>

          <Text style={styles.label}>Label (shown on button)</Text>
          <TextInput
            style={styles.input}
            value={label}
            onChangeText={setLabel}
            placeholder="e.g. Attack"
            placeholderTextColor="#666"
            maxLength={12}
          />

          <Text style={styles.label}>Command (sent to MUD)</Text>
          <TextInput
            style={[styles.input, styles.commandInput]}
            value={command}
            onChangeText={setCommand}
            placeholder="e.g. kill $target"
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
            multiline
          />
          <Text style={styles.hint}>
            Use ; to chain commands (e.g. "get all;put all bag")
          </Text>

          <Text style={styles.label}>Color</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.colorRow}>
              {PRESET_COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: c },
                    color === c && styles.colorSelected,
                  ]}
                  onPress={() => setColor(c)}
                />
              ))}
            </View>
          </ScrollView>

          <View style={styles.preview}>
            <Text style={styles.previewLabel}>Preview:</Text>
            <View style={[styles.previewBtn, { backgroundColor: color }]}>
              <Text style={styles.previewText}>{label || '...'}</Text>
            </View>
          </View>

          <View style={styles.buttons}>
            {macro && (
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => onDelete(macro.id)}
              >
                <Text style={styles.deleteText}>Delete</Text>
              </TouchableOpacity>
            )}
            <View style={styles.spacer} />
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveText}>Save</Text>
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
  content: {
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
    marginBottom: 16,
    fontFamily: 'monospace',
  },
  label: {
    color: '#888',
    fontSize: 12,
    marginBottom: 4,
    marginTop: 12,
    fontFamily: 'monospace',
  },
  input: {
    backgroundColor: '#0a0a0a',
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 6,
    padding: 12,
    fontSize: 16,
    fontFamily: 'monospace',
  },
  commandInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  hint: {
    color: '#555',
    fontSize: 11,
    marginTop: 4,
    fontFamily: 'monospace',
  },
  colorRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
  },
  colorSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSelected: {
    borderColor: '#fff',
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 12,
  },
  previewLabel: {
    color: '#666',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  previewBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  previewText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  buttons: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 12,
  },
  spacer: {
    flex: 1,
  },
  deleteBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: '#331111',
  },
  deleteText: {
    color: '#cc0000',
    fontSize: 14,
    fontWeight: 'bold',
  },
  cancelBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: '#2a2a2a',
  },
  cancelText: {
    color: '#999',
    fontSize: 14,
  },
  saveBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: '#00cc00',
  },
  saveText: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
