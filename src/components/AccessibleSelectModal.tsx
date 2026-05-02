import React, { useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { BlindGestureContainer, SelfVoicingRow } from './SelfVoicingControls';
import { buttonRegistry } from '../utils/selfVoicingPress';

// Modal de selección de UNA opción de una lista (motor TTS, voz TTS, rango
// de exportación de logs, etc.). Diseñado para ambos modos de accesibilidad:
//   - selfVoicingActive=true → BlindGestureContainer envuelve la lista y
//     cada opción es un SelfVoicingRow. Swipe vertical navega; tap activa.
//     El primer item se enfoca solo (vía blindNav.enter dentro del container).
//   - selfVoicingActive=false (TalkBack o modo completo) → lista normal con
//     TouchableOpacity + accessibilityLabel/Role. TalkBack la navega como
//     cualquier listado.
//
// Reserva un scope propio en buttonRegistry mientras está abierto para que
// los rows de la pantalla padre dejen de ser navegables vía drag-explore;
// se restaura el scope previo al cerrar.

export interface AccessibleSelectOption<K extends string = string> {
  key: K;
  label: string;
  // Texto secundario opcional (ej. idioma de la voz, "(sistema)" en motor
  // por defecto). Se concatena al label hablado para TalkBack/TTS.
  sublabel?: string;
  selected?: boolean;
}

interface AccessibleSelectModalProps<K extends string = string> {
  visible: boolean;
  title: string;
  options: AccessibleSelectOption<K>[];
  selfVoicingActive: boolean;
  // Scope único para este modal — evita colisiones con otros modales que se
  // monten simultáneamente. Convención: kebab-case acabado en "-modal".
  scope: string;
  onSelect: (key: K) => void;
  onCancel: () => void;
}

export function AccessibleSelectModal<K extends string = string>({
  visible, title, options, selfVoicingActive, scope, onSelect, onCancel,
}: AccessibleSelectModalProps<K>) {
  useEffect(() => {
    if (!visible || !selfVoicingActive) return;
    const prev = buttonRegistry.getActiveScope();
    buttonRegistry.setActiveScope(scope);
    return () => { buttonRegistry.setActiveScope(prev); };
  }, [visible, selfVoicingActive, scope]);

  const welcome = `${title}. ${options.length} opcione${options.length === 1 ? '' : 's'}. Desliza arriba o abajo para navegar, toca para elegir.`;

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
          active={visible && selfVoicingActive}
          welcomeMessage={welcome}
          style={styles.cardWrapper}
        >
          <View style={styles.card}>
            <Text style={styles.title} accessibilityRole="header">{title}</Text>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              {options.length === 0 ? (
                <Text style={styles.empty}>Sin opciones disponibles.</Text>
              ) : (
                options.map((opt, idx) => {
                  const spoken = [
                    `Opción ${idx + 1} de ${options.length}: ${opt.label}`,
                    opt.sublabel || null,
                    opt.selected ? 'seleccionado' : null,
                  ].filter(Boolean).join('. ');
                  return (
                    <SelfVoicingRow
                      key={opt.key || `opt-${idx}`}
                      svActive={selfVoicingActive}
                      svScope={scope}
                      svKey={`opt-${idx}`}
                      svLabel={spoken}
                      onActivate={() => onSelect(opt.key)}
                    >
                      <TouchableOpacity
                        style={[styles.option, opt.selected && styles.optionSelected]}
                        onPress={() => onSelect(opt.key)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: !!opt.selected }}
                        accessibilityLabel={spoken}
                      >
                        <Text style={[styles.optionText, opt.selected && styles.optionTextSelected]}>
                          {opt.label}
                          {opt.sublabel ? `  ·  ${opt.sublabel}` : ''}
                        </Text>
                      </TouchableOpacity>
                    </SelfVoicingRow>
                  );
                })
              )}
            </ScrollView>

            <SelfVoicingRow
              svActive={selfVoicingActive}
              svScope={scope}
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
  cardWrapper: { width: '100%', maxWidth: 480 },
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
  optionSelected: { backgroundColor: '#0a3a0a' },
  optionText: { color: '#ccc', fontSize: 14, fontFamily: 'monospace' },
  optionTextSelected: { color: '#0c0', fontWeight: 'bold' },
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
