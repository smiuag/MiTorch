import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Modal, View, StyleSheet, Text, TextInput } from 'react-native';
import { LayoutButton } from '../storage/layoutStorage';
import { buttonRegistry } from '../utils/selfVoicingPress';
import { SelfVoicingRow, SelfVoicingTextInput, BlindGestureContainer } from './SelfVoicingControls';
import { ButtonFormState, loadButtonFormState, buildLayoutButton } from './buttonEditShared';

// Modal de edición de botón dedicado a blind + self-voicing.
//
// Diseño: lista plana de items navegables con swipe vertical (next/prev).
// Cada item es un `SelfVoicingRow` con `onActivate` (tap = activar) y/o
// `onAdjust` (swipe horizontal = cambiar valor). Sin colores, sin preview,
// sin labels-título — el svLabel de cada row ya da contexto suficiente al
// TTS. Sin "Mover" (los gestos de mover en grid blind cubren ese caso).
//
// Orden de navegación:
//   Etiqueta → Tipo → Comando/Mensaje → [Borrar] → Cancelar → Guardar
//
// Borrar solo aparece si el botón ya existe y no está locked. Etiqueta vacía
// al guardar = borra (consistente con el modal completo).

interface BlindButtonEditModalProps {
  visible: boolean;
  col: number;
  row: number;
  button: LayoutButton | null;
  onSave: (btn: LayoutButton) => void;
  onDelete: () => void;
  onClose: () => void;
}

const SCOPE = 'editButton';
const MAX_COMMANDS = 1;

export function BlindButtonEditModal({
  visible,
  col,
  row,
  button,
  onSave,
  onDelete,
  onClose,
}: BlindButtonEditModalProps) {
  const [state, setState] = useState<ButtonFormState>(() => loadButtonFormState(null, MAX_COMMANDS));

  const labelInputRef = useRef<TextInput | null>(null);
  const commandInputRef = useRef<TextInput | null>(null);

  // Reset form cuando cambia el botón objetivo o la visibilidad. Sin esto,
  // abrir el modal sobre un slot distinto reusaría el state del anterior.
  useEffect(() => {
    setState(loadButtonFormState(button, MAX_COMMANDS));
  }, [button, visible]);

  // Cambiar el scope activo del registry mientras el modal está visible:
  // los botones del Terminal (scope='default') quedan ocultos al drag-explore,
  // solo los rows del modal son navegables.
  useEffect(() => {
    if (visible) {
      buttonRegistry.setActiveScope(SCOPE);
      return () => buttonRegistry.setActiveScope('default');
    }
  }, [visible]);

  const editWelcome = useMemo(
    () =>
      `Editar botón fila ${row + 1} columna ${col + 1}. Desliza arriba o abajo para cambiar de opción. Toca para activar la opción actual. Mantén pulsado para repetir.`,
    [row, col],
  );

  const cmdLabelName = state.kind === 'floating' ? 'Mensaje' : 'Comando';

  const handleSave = () => {
    const newButton = buildLayoutButton(state, { col, row, button });
    if (!state.label.trim()) {
      // Etiqueta vacía = borrar (mismo criterio que ButtonEditModal).
      onDelete();
      return;
    }
    onSave(newButton);
    onClose();
  };

  const setLabel = (label: string) => setState((s) => ({ ...s, label }));
  const setCommand = (cmd: string) => setState((s) => ({ ...s, commands: [cmd] }));
  const toggleKind = () =>
    setState((s) => ({ ...s, kind: s.kind === 'command' ? 'floating' : 'command' }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <BlindGestureContainer
            active={visible}
            welcomeMessage={editWelcome}
            style={styles.container}
          >
            <View style={styles.content}>
              {/* Etiqueta */}
              <SelfVoicingRow
                svActive={visible}
                svScope={SCOPE}
                svKey="row-label"
                svLabel={`Etiqueta del botón. Texto corto que se muestra en el botón. Valor actual: ${state.label || 'vacío'}. Toca para abrir el teclado y editar.`}
                onActivate={() => labelInputRef.current?.focus()}
                style={styles.row}
              >
                <SelfVoicingTextInput
                  svActive={visible}
                  svScope={SCOPE}
                  svKey="input-label"
                  svLabel="Etiqueta del botón"
                  svInputRef={(node) => {
                    labelInputRef.current = node;
                  }}
                  style={styles.input}
                  placeholder="Ej: cc"
                  placeholderTextColor="#888"
                  value={state.label}
                  onChangeText={setLabel}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                />
              </SelfVoicingRow>

              {/* Tipo (Comando ↔ Aviso por swipe horizontal) */}
              <SelfVoicingRow
                svActive={visible}
                svScope={SCOPE}
                svKey="kind"
                svLabel={`Tipo: ${state.kind === 'command' ? 'Comando. Envía un comando al MUD' : 'Aviso. Muestra un mensaje flotante en pantalla'}. Desliza horizontal para cambiar.`}
                onAdjust={toggleKind}
                style={styles.row}
              >
                <Text style={styles.rowValue}>
                  {state.kind === 'command' ? 'Comando' : 'Aviso'}
                </Text>
              </SelfVoicingRow>

              {/* Comando/Mensaje */}
              <SelfVoicingRow
                svActive={visible}
                svScope={SCOPE}
                svKey="row-command"
                svLabel={`${cmdLabelName} primario. Valor actual: ${state.commands[0] || 'vacío'}. Toca para abrir el teclado y editar.`}
                onActivate={() => commandInputRef.current?.focus()}
                style={styles.row}
              >
                <SelfVoicingTextInput
                  svActive={visible}
                  svScope={SCOPE}
                  svKey="input-command"
                  svLabel={cmdLabelName}
                  svInputRef={(node) => {
                    commandInputRef.current = node;
                  }}
                  style={styles.input}
                  placeholder={state.kind === 'floating' ? 'Texto a mostrar' : 'Comando'}
                  placeholderTextColor="#888"
                  value={state.commands[0] || ''}
                  onChangeText={setCommand}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                />
              </SelfVoicingRow>

              {/* Guardar */}
              <SelfVoicingRow
                svActive={visible}
                svScope={SCOPE}
                svKey="action-save"
                svLabel="Guardar. Guarda la configuración del botón y cierra."
                onActivate={handleSave}
                style={[styles.row, styles.actionRow, styles.saveRow]}
              >
                <Text style={styles.actionText}>Guardar</Text>
              </SelfVoicingRow>

              {/* Cancelar */}
              <SelfVoicingRow
                svActive={visible}
                svScope={SCOPE}
                svKey="action-cancel"
                svLabel="Cancelar. Cierra sin guardar cambios."
                onActivate={onClose}
                style={[styles.row, styles.actionRow, styles.cancelRow]}
              >
                <Text style={styles.actionText}>Cancelar</Text>
              </SelfVoicingRow>

              {/* Borrar — solo si hay botón existente y no locked */}
              {button && !button.locked && (
                <SelfVoicingRow
                  svActive={visible}
                  svScope={SCOPE}
                  svKey="action-delete"
                  svLabel="Borrar botón. Elimina este botón del grid."
                  onActivate={onDelete}
                  style={[styles.row, styles.actionRow, styles.deleteRow]}
                >
                  <Text style={styles.actionText}>Borrar</Text>
                </SelfVoicingRow>
              )}
            </View>
          </BlindGestureContainer>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#1f1f1f',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#3399cc',
    width: '90%',
    height: '80%',
    overflow: 'hidden',
  },
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  row: {
    backgroundColor: '#0f0f0f',
    borderWidth: 1,
    borderColor: '#3399cc',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 56,
    justifyContent: 'center',
  },
  rowValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  input: {
    backgroundColor: 'transparent',
    color: '#fff',
    fontSize: 16,
    paddingVertical: 0,
  },
  actionRow: {
    alignItems: 'center',
    minHeight: 52,
  },
  deleteRow: {
    backgroundColor: '#5a1a1a',
    borderColor: '#cc4444',
  },
  cancelRow: {
    backgroundColor: '#444',
    borderColor: '#888',
  },
  saveRow: {
    backgroundColor: '#1a5a1a',
    borderColor: '#44cc44',
  },
  actionText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
});
