import React, { useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { BlindGestureContainer, SelfVoicingRow } from './SelfVoicingControls';
import { buttonRegistry } from '../utils/selfVoicingPress';

// Modal genérico para que un gesto de tipo `pick` ofrezca al usuario una
// lista de opciones (salidas, nicks, aliases, custom). Diseño guiado por
// accesibilidad blind:
//   - selfVoicingActive=true → BlindGestureContainer envuelve la lista,
//     cada opción es un SelfVoicingRow con onActivate. Swipe vertical
//     navega; tap activa; swipe horizontal no se usa aquí. El primer item
//     se enfoca solo (blindNav.enter dentro del container).
//   - selfVoicingActive=false (TalkBack o modo completo) → lista normal
//     con TouchableOpacity + accessibilityRole="button". TalkBack lo
//     navega como cualquier otro listado.
//
// El picker reserva un scope propio en buttonRegistry mientras está abierto,
// para que el grid del Terminal no aparezca al drag-explore. Se restaura
// 'default' al cerrar.

const PICKER_SCOPE = 'gesturePicker';

interface GesturePickerModalProps {
  visible: boolean;
  title: string;
  options: string[];
  selfVoicingActive: boolean;
  onPick: (option: string) => void;
  onCancel: () => void;
}

export function GesturePickerModal({
  visible, title, options, selfVoicingActive, onPick, onCancel,
}: GesturePickerModalProps) {
  // Cambiar el scope activo cuando el modal abre/cierra. Sin esto, los
  // botones del Terminal seguirían siendo navegables por drag-explore aunque
  // el modal estuviera tapando la UI.
  useEffect(() => {
    if (!visible || !selfVoicingActive) return;
    const prev = buttonRegistry.getActiveScope();
    buttonRegistry.setActiveScope(PICKER_SCOPE);
    return () => { buttonRegistry.setActiveScope(prev); };
  }, [visible, selfVoicingActive]);

  const welcomeMessage = options.length > 0
    ? `${title}. ${options.length} opcione${options.length === 1 ? '' : 's'}. Desliza arriba o abajo para navegar, toca para elegir.`
    : `${title}. Sin opciones disponibles.`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View
        style={styles.overlay}
        accessibilityViewIsModal
        importantForAccessibility="yes"
      >
        <BlindGestureContainer
          active={selfVoicingActive}
          welcomeMessage={welcomeMessage}
          style={styles.cardWrapper}
        >
          <View style={styles.card}>
            <Text style={styles.title} accessibilityRole="header">{title}</Text>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              {options.length === 0 ? (
                <Text style={styles.empty}>Sin opciones disponibles.</Text>
              ) : (
                options.map((opt, idx) => {
                  const label = `Opción ${idx + 1} de ${options.length}: ${opt}`;
                  return (
                    <SelfVoicingRow
                      key={`${idx}-${opt}`}
                      svActive={selfVoicingActive}
                      svScope={PICKER_SCOPE}
                      svKey={`opt-${idx}`}
                      svLabel={label}
                      onActivate={() => onPick(opt)}
                    >
                      <TouchableOpacity
                        style={styles.option}
                        onPress={() => onPick(opt)}
                        accessibilityRole="button"
                        accessibilityLabel={label}
                      >
                        <Text style={styles.optionText}>{opt}</Text>
                      </TouchableOpacity>
                    </SelfVoicingRow>
                  );
                })
              )}
            </ScrollView>

            <SelfVoicingRow
              svActive={selfVoicingActive}
              svScope={PICKER_SCOPE}
              svKey="cancel"
              svLabel="Cancelar"
              onActivate={onCancel}
            >
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={onCancel}
                accessibilityRole="button"
                accessibilityLabel="Cancelar"
              >
                <Text style={styles.cancelText}>✕ Cancelar</Text>
              </TouchableOpacity>
            </SelfVoicingRow>
          </View>
        </BlindGestureContainer>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  cardWrapper: {
    width: '100%',
    maxWidth: 480,
  },
  card: {
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#0c0',
    borderRadius: 12,
    width: '100%',
    maxHeight: '85%',
    overflow: 'hidden',
  },
  title: {
    color: '#0c0',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    backgroundColor: '#111',
  },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingVertical: 4 },
  empty: {
    color: '#666',
    fontSize: 13,
    fontFamily: 'monospace',
    fontStyle: 'italic',
    padding: 18,
    textAlign: 'center',
  },
  option: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    minHeight: 48,
    justifyContent: 'center',
  },
  optionText: {
    color: '#ccc',
    fontSize: 15,
    fontFamily: 'monospace',
  },
  cancelBtn: {
    backgroundColor: '#222',
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  cancelText: {
    color: '#999',
    fontSize: 14,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
});
