import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  AccessibilityInfo,
} from 'react-native';

interface ActionSelectionModalProps {
  visible: boolean;
  buttonLabel: string;
  actions: { label: string; command: string }[];
  onSelectAction: (command: string) => void;
  onCancel: () => void;
  onConfigure?: () => void;
  showConfigure?: boolean;
}

export function ActionSelectionModal({
  visible,
  buttonLabel,
  actions,
  onSelectAction,
  onCancel,
  onConfigure,
  showConfigure = false,
}: ActionSelectionModalProps) {
  const handleSelectAction = async (command: string) => {
    await AccessibilityInfo.announceForAccessibility(command);
    onSelectAction(command);
  };

  const handleConfigure = async () => {
    await AccessibilityInfo.announceForAccessibility('Configurar');
    onConfigure?.();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      accessible={true}
      accessibilityLabel={`Selecciona acción para ${buttonLabel}`}
      accessibilityRole="dialog"
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>{buttonLabel}</Text>
          <Text style={styles.subtitle}>Selecciona una acción:</Text>

          {actions.map((action, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.actionButton}
              onPress={() => handleSelectAction(action.command)}
              accessible={true}
              accessibilityLabel={action.label}
              accessibilityRole="button"
              accessibilityHint={`Ejecutar comando: ${action.command}`}
            >
              <Text style={styles.actionButtonText}>{action.label}</Text>
            </TouchableOpacity>
          ))}

          {showConfigure && onConfigure && (
            <TouchableOpacity
              style={[styles.actionButton, styles.configureButton]}
              onPress={handleConfigure}
              accessible={true}
              accessibilityLabel="Configurar"
              accessibilityRole="button"
              accessibilityHint="Abre el menú de configuración de comandos"
            >
              <Text style={[styles.actionButtonText, styles.configureText]}>
                ⚙️ Configurar
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.actionButton, styles.cancelButton]}
            onPress={onCancel}
            accessible={true}
            accessibilityLabel="Cancelar"
            accessibilityRole="button"
          >
            <Text style={[styles.actionButtonText, styles.cancelText]}>
              Cancelar
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#222',
    borderRadius: 8,
    padding: 20,
    minWidth: 280,
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#444',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#aaa',
    marginBottom: 16,
    textAlign: 'center',
  },
  actionButton: {
    backgroundColor: '#336633',
    borderRadius: 6,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#558855',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  configureButton: {
    backgroundColor: '#334466',
    borderColor: '#556688',
  },
  configureText: {
    color: '#88ccff',
  },
  cancelButton: {
    backgroundColor: '#443333',
    borderColor: '#664444',
  },
  cancelText: {
    color: '#ffcccc',
  },
});
