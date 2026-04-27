import React, { useMemo, useRef, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AnchorMode, CaptureType, PatternBlock } from '../types';
import { captureColors, captureLabels, newCaptureId } from '../utils/triggerCompiler';

interface Props {
  blocks: PatternBlock[];
  anchorStart: AnchorMode;
  anchorEnd: AnchorMode;
  onChange: (blocks: PatternBlock[], anchorStart: AnchorMode, anchorEnd: AnchorMode) => void;
}

const ADD_TYPES: Array<{ key: 'text' | CaptureType; label: string; hint: string }> = [
  { key: 'text', label: 'Texto literal', hint: 'Texto exacto que debe aparecer' },
  { key: 'word', label: 'Palabra', hint: 'Captura una palabra (sin espacios)' },
  { key: 'phrase', label: 'Frase', hint: 'Captura cualquier texto' },
  { key: 'number', label: 'Número', hint: 'Captura un número entero' },
];

export function TriggerPatternBuilder({ blocks, anchorStart, anchorEnd, onChange }: Props) {
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const editInputRef = useRef<TextInput | null>(null);

  const colors = useMemo(() => captureColors(blocks), [blocks]);
  const labels = useMemo(() => captureLabels(blocks), [blocks]);

  const insertBlock = (index: number, block: PatternBlock) => {
    const next = [...blocks];
    next.splice(index, 0, block);
    onChange(next, anchorStart, anchorEnd);
    if (block.kind === 'text') {
      setEditingIndex(index);
      setTimeout(() => editInputRef.current?.focus(), 50);
    }
  };

  const removeBlock = (index: number) => {
    const next = blocks.filter((_, i) => i !== index);
    onChange(next, anchorStart, anchorEnd);
    if (editingIndex === index) setEditingIndex(null);
  };

  const updateTextBlock = (index: number, text: string) => {
    const next = blocks.map((b, i) =>
      i === index && b.kind === 'text' ? { ...b, text } : b,
    );
    onChange(next, anchorStart, anchorEnd);
  };

  const commitEdit = (index: number) => {
    setEditingIndex(null);
    if (blocks[index]?.kind === 'text' && (blocks[index] as any).text === '') {
      removeBlock(index);
    }
  };

  const toggleAnchor = (which: 'start' | 'end') => {
    if (which === 'start') {
      const next: AnchorMode = anchorStart === 'open' ? 'anchored' : 'open';
      onChange(blocks, next, anchorEnd);
    } else {
      const next: AnchorMode = anchorEnd === 'open' ? 'anchored' : 'open';
      onChange(blocks, anchorStart, next);
    }
  };

  const handlePick = (typeKey: 'text' | CaptureType) => {
    const idx = pickerIndex ?? blocks.length;
    setPickerIndex(null);
    if (typeKey === 'text') {
      insertBlock(idx, { kind: 'text', text: '' });
    } else {
      insertBlock(idx, { kind: 'capture', captureType: typeKey, id: newCaptureId() });
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        <AnchorBox mode={anchorStart} which="start" onPress={() => toggleAnchor('start')} />

        <PlusButton onPress={() => setPickerIndex(0)} />

        {blocks.map((block, idx) => {
          const isEditing = editingIndex === idx;
          return (
            <React.Fragment key={idx}>
              {block.kind === 'text' ? (
                isEditing ? (
                  <View style={[styles.block, styles.textBlock, styles.textBlockEditing]}>
                    <TextInput
                      ref={editInputRef}
                      style={styles.textBlockInput}
                      value={block.text}
                      onChangeText={(t) => updateTextBlock(idx, t)}
                      onBlur={() => commitEdit(idx)}
                      onSubmitEditing={() => commitEdit(idx)}
                      autoFocus
                      autoCorrect={false}
                      autoCapitalize="none"
                      placeholder="texto…"
                      placeholderTextColor="#777"
                    />
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.block, styles.textBlock]}
                    onPress={() => setEditingIndex(idx)}
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={`Texto: ${block.text || '(vacío)'}`}
                    accessibilityHint="Toca para editar"
                  >
                    <Text style={styles.textBlockText}>{block.text || '(vacío)'}</Text>
                    <DeleteX onPress={() => removeBlock(idx)} />
                  </TouchableOpacity>
                )
              ) : (
                <View
                  style={[styles.block, styles.captureBlock, { backgroundColor: colors.get(block.id) || '#666' }]}
                >
                  <Text style={styles.captureBlockText}>{labels.get(block.id)}</Text>
                  <DeleteX onPress={() => removeBlock(idx)} />
                </View>
              )}
              <PlusButton onPress={() => setPickerIndex(idx + 1)} />
            </React.Fragment>
          );
        })}

        <AnchorBox mode={anchorEnd} which="end" onPress={() => toggleAnchor('end')} />
      </ScrollView>

      <Modal
        visible={pickerIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerIndex(null)}
      >
        <TouchableOpacity
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={() => setPickerIndex(null)}
        >
          <View style={styles.pickerBox}>
            <Text style={styles.pickerTitle}>Añadir caja</Text>
            {ADD_TYPES.map((t) => (
              <TouchableOpacity
                key={t.key}
                style={styles.pickerItem}
                onPress={() => handlePick(t.key)}
              >
                <Text style={styles.pickerItemLabel}>{t.label}</Text>
                <Text style={styles.pickerItemHint}>{t.hint}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function AnchorBox({
  mode,
  which,
  onPress,
}: {
  mode: AnchorMode;
  which: 'start' | 'end';
  onPress: () => void;
}) {
  const anchored = mode === 'anchored';
  const label = anchored ? (which === 'start' ? 'INICIO' : 'FIN') : '…';
  const hint = anchored
    ? which === 'start'
      ? 'La línea debe empezar aquí. Toca para permitir cualquier prefijo.'
      : 'La línea debe terminar aquí. Toca para permitir cualquier sufijo.'
    : which === 'start'
    ? 'Cualquier cosa antes. Toca para anclar al inicio.'
    : 'Cualquier cosa después. Toca para anclar al final.';
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.anchor, anchored ? styles.anchorActive : styles.anchorOpen]}
      accessible
      accessibilityRole="button"
      accessibilityLabel={hint}
    >
      <Text style={[styles.anchorText, anchored && styles.anchorTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function PlusButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.plusBtn}
      accessible
      accessibilityRole="button"
      accessibilityLabel="Añadir caja"
    >
      <Text style={styles.plusText}>+</Text>
    </TouchableOpacity>
  );
}

function DeleteX({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.deleteX}
      accessible
      accessibilityRole="button"
      accessibilityLabel="Quitar caja"
    >
      <Text style={styles.deleteXText}>×</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 6,
    padding: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingRight: 8,
  },
  anchor: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderStyle: 'dashed',
    minWidth: 36,
    alignItems: 'center',
  },
  anchorOpen: { borderColor: '#555' },
  anchorActive: { borderStyle: 'solid', backgroundColor: '#552200', borderColor: '#cc6633' },
  anchorText: { color: '#888', fontSize: 11, fontFamily: 'monospace' },
  anchorTextActive: { color: '#ffaa66', fontWeight: 'bold' },
  plusBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#0c0',
    backgroundColor: '#0a3a0a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  plusText: { color: '#0c0', fontSize: 14, fontWeight: 'bold', lineHeight: 16 },
  block: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    minHeight: 32,
  },
  textBlock: { backgroundColor: '#3a3a3a', borderWidth: 1, borderColor: '#555' },
  textBlockEditing: { borderColor: '#0c0', backgroundColor: '#1a2a1a' },
  textBlockText: { color: '#ddd', fontFamily: 'monospace', fontSize: 13 },
  textBlockInput: {
    color: '#fff',
    fontFamily: 'monospace',
    fontSize: 13,
    minWidth: 60,
    paddingVertical: 0,
  },
  captureBlock: {},
  captureBlockText: { color: '#000', fontFamily: 'monospace', fontSize: 12, fontWeight: 'bold' },
  deleteX: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  deleteXText: { color: '#fff', fontSize: 12, lineHeight: 14, fontWeight: 'bold' },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 24,
  },
  pickerBox: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    padding: 16,
  },
  pickerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    marginBottom: 12,
  },
  pickerItem: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  pickerItemLabel: { color: '#fff', fontSize: 14, fontFamily: 'monospace', fontWeight: 'bold' },
  pickerItemHint: { color: '#888', fontSize: 11, fontFamily: 'monospace', marginTop: 2 },
});
