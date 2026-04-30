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
  uiMode?: 'completo' | 'blind';
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
  uiMode,
}: ButtonEditModalProps) {
  const [label, setLabel] = useState('');
  const [commands, setCommands] = useState<string[]>([]);
  const [color, setColor] = useState('#662222');
  const [addText, setAddText] = useState(false);
  const [textColor, setTextColor] = useState('#ffffff');
  const [kind, setKind] = useState<'command' | 'floating'>('command');

  // In blind mode: 1 command (simple config), in completo mode: 2 commands
  // Floating buttons only need 1 payload regardless of mode.
  const maxCommands = kind === 'floating' ? 1 : (uiMode === 'blind' ? 1 : 2);

  useEffect(() => {
    if (button) {
      setLabel(button.label);
      const allCmds = [button.command, ...(button.alternativeCommands ?? [])];
      // Pad to max slots
      while (allCmds.length < maxCommands) {
        allCmds.push('');
      }
      setCommands(allCmds.slice(0, maxCommands));
      setColor(button.color);
      setTextColor(button.textColor ?? '#ffffff');
      setAddText(button.addText ?? false);
      setKind(button.kind ?? 'command');
    } else {
      setLabel('');
      setCommands(Array(maxCommands).fill(''));
      setColor('#662222');
      setTextColor('#ffffff');
      setAddText(false);
      setKind('command');
    }
  }, [button, visible, uiMode, maxCommands]);

  const handleSave = () => {
    // Filter out empty commands
    const nonEmptyCommands = commands.filter(cmd => cmd.trim() !== '');

    const newButton: LayoutButton = {
      id: button?.id || `btn_${Date.now()}`,
      col,
      row,
      label: label || '—',
      command: nonEmptyCommands[0] || '',
      color,
      textColor,
      // Floating buttons never inject text into the input or carry alternatives.
      addText: kind === 'floating' ? false : addText,
      alternativeCommands: kind === 'floating' || nonEmptyCommands.length <= 1
        ? undefined
        : nonEmptyCommands.slice(1),
      kind,
      // Preserve fixed and locked flags from original button
      fixed: button?.fixed,
      locked: button?.locked,
    };
    onSave(newButton);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>Etiqueta</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: cc"
              placeholderTextColor="#888"
              value={label}
              onChangeText={setLabel}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              accessible={true}
              accessibilityLabel="Etiqueta del botón"
              accessibilityHint="Texto corto que se muestra en el botón"
            />

            <Text style={styles.label}>Tipo</Text>
            <View style={styles.kindRow}>
              <TouchableOpacity
                style={[styles.kindOption, kind === 'command' && styles.kindOptionActive]}
                onPress={() => setKind('command')}
                accessible={true}
                accessibilityRole="radio"
                accessibilityLabel="Comando"
                accessibilityHint="El botón envía el comando al MUD"
                accessibilityState={{ selected: kind === 'command' }}
              >
                <Text style={[styles.kindOptionText, kind === 'command' && styles.kindOptionTextActive]}>Comando</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.kindOption, kind === 'floating' && styles.kindOptionActive]}
                onPress={() => setKind('floating')}
                accessible={true}
                accessibilityRole="radio"
                accessibilityLabel="Aviso"
                accessibilityHint="El botón muestra un mensaje flotante en pantalla"
                accessibilityState={{ selected: kind === 'floating' }}
              >
                <Text style={[styles.kindOptionText, kind === 'floating' && styles.kindOptionTextActive]}>Aviso</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>{kind === 'floating' ? 'Mensaje' : 'Comando'}</Text>
            <Text style={styles.hint}>{kind === 'floating'
              ? 'Texto que se muestra al pulsar. Puedes usar variables: ${vida}, ${energia}, ${xp}, ${salidas}…'
              : (uiMode === 'blind'
                ? 'Comando que se ejecuta al pulsar. Variables disponibles: ${vida}, ${energia}…'
                : 'El primero se ejecuta al pulsar. El segundo aparece como alternativa. Variables disponibles: ${vida}, ${energia}…')
            }</Text>

            {commands.map((cmd, idx) => (
              <View key={idx}>
                <TextInput
                  style={[
                    styles.input,
                    styles.commandInput,
                    button?.locked && idx === 0 && { opacity: 0.5 }
                  ]}
                  placeholder={idx === 0 ? 'Comando principal' : `Opción ${idx} (opcional)`}
                  placeholderTextColor="#888"
                  value={cmd}
                  onChangeText={(text) => {
                    const newCmds = [...commands];
                    newCmds[idx] = text;
                    setCommands(newCmds);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  editable={!(button?.locked && idx === 0)}
                  accessible={true}
                  accessibilityLabel={idx === 0 ? 'Comando primario' : `Comando alternativo ${idx}`}
                  accessibilityHint={idx === 0 ? 'Comando que se ejecuta al pulsar' : 'Comando alternativo que aparece en el modal'}
                />
              </View>
            ))}

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
                  accessible={true}
                  accessibilityLabel={`Color option: ${c}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: color === c }}
                />
              ))}
            </View>

            {uiMode !== 'blind' && kind === 'command' && (
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setAddText(!addText)}
                accessible={true}
                accessibilityLabel="Añadir texto al input"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: addText }}
              >
                <View style={[styles.checkbox, addText && styles.checkboxChecked]}>
                  {addText && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.checkboxLabel}>Añadir texto al input</Text>
              </TouchableOpacity>
            )}

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
            {button && !button.locked && uiMode !== 'blind' && (
              <>
                <TouchableOpacity
                  style={[styles.button, styles.deleteButton]}
                  onPress={onDelete}
                  accessible={true}
                  accessibilityLabel="Delete"
                  accessibilityRole="button"
                  accessibilityHint="Delete this button from the layout"
                >
                  <Text style={styles.buttonText}>Borrar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.moveButton]}
                  onPress={onMove}
                  accessible={true}
                  accessibilityLabel="Move"
                  accessibilityRole="button"
                  accessibilityHint="Move this button to a different location"
                >
                  <Text style={styles.buttonText}>Mover</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
              accessible={true}
              accessibilityLabel="Cancel"
              accessibilityRole="button"
              accessibilityHint="Close without saving changes"
            >
              <Text style={styles.buttonText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.saveButton]}
              onPress={handleSave}
              accessible={true}
              accessibilityLabel="Save"
              accessibilityRole="button"
              accessibilityHint="Save button configuration"
            >
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
  commandInput: {
    marginBottom: 8,
    fontSize: 13,
  },
  hint: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
    marginBottom: 10,
  },
  kindRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  kindOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: '#0f0f0f',
    borderWidth: 2,
    borderColor: '#333',
    alignItems: 'center',
  },
  kindOptionActive: {
    backgroundColor: '#3399cc',
    borderColor: '#55bbff',
  },
  kindOptionText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
  },
  kindOptionTextActive: {
    color: '#fff',
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
