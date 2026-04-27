import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ActionTextBlock, PatternBlock } from '../types';
import { captureColors, captureLabels } from '../utils/triggerCompiler';

interface Props {
  blocks: ActionTextBlock[];
  patternBlocks: PatternBlock[];
  placeholder?: string;
  onChange: (blocks: ActionTextBlock[]) => void;
}

export function TriggerActionTextBuilder({ blocks, patternBlocks, placeholder, onChange }: Props) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const editInputRef = useRef<TextInput | null>(null);

  const colors = React.useMemo(() => captureColors(patternBlocks), [patternBlocks]);
  const labels = React.useMemo(() => captureLabels(patternBlocks), [patternBlocks]);
  const captureIds = React.useMemo(
    () => patternBlocks.filter((b) => b.kind === 'capture').map((b) => (b as any).id as string),
    [patternBlocks],
  );

  const insertBlock = (block: ActionTextBlock) => {
    const next = [...blocks, block];
    onChange(next);
    if (block.kind === 'text') {
      setEditingIndex(next.length - 1);
      setTimeout(() => editInputRef.current?.focus(), 50);
    }
  };

  const removeBlock = (index: number) => {
    const next = blocks.filter((_, i) => i !== index);
    onChange(next);
    if (editingIndex === index) setEditingIndex(null);
  };

  const updateText = (index: number, text: string) => {
    const next = blocks.map((b, i) => (i === index && b.kind === 'text' ? { ...b, text } : b));
    onChange(next);
  };

  const commitEdit = (index: number) => {
    setEditingIndex(null);
    if (blocks[index]?.kind === 'text' && (blocks[index] as any).text === '') {
      removeBlock(index);
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
        {blocks.length === 0 && (
          <Text style={styles.empty}>{placeholder || 'Vacío.'}</Text>
        )}
        {blocks.map((block, idx) => {
          if (block.kind === 'text') {
            const isEditing = editingIndex === idx;
            return isEditing ? (
              <View key={idx} style={[styles.chip, styles.textChip, styles.textChipEditing]}>
                <TextInput
                  ref={editInputRef}
                  style={styles.textChipInput}
                  value={block.text}
                  onChangeText={(t) => updateText(idx, t)}
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
                key={idx}
                style={[styles.chip, styles.textChip]}
                onPress={() => setEditingIndex(idx)}
              >
                <Text style={styles.textChipText}>{block.text || '(vacío)'}</Text>
                <DeleteX onPress={() => removeBlock(idx)} />
              </TouchableOpacity>
            );
          }
          // capture_ref chip
          const exists = labels.has(block.captureId);
          const bg = colors.get(block.captureId) || '#700';
          return (
            <View
              key={idx}
              style={[
                styles.chip,
                styles.captureChip,
                { backgroundColor: bg },
                !exists && styles.captureChipMissing,
              ]}
            >
              <Text style={styles.captureChipText}>
                {exists ? labels.get(block.captureId) : '⚠ borrada'}
              </Text>
              <DeleteX onPress={() => removeBlock(idx)} />
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.toolbar}>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => insertBlock({ kind: 'text', text: '' })}
        >
          <Text style={styles.addBtnText}>+ Texto</Text>
        </TouchableOpacity>
        {captureIds.map((id) => (
          <TouchableOpacity
            key={id}
            style={[styles.addCaptureBtn, { backgroundColor: colors.get(id) || '#666' }]}
            onPress={() => insertBlock({ kind: 'capture_ref', captureId: id })}
            accessible
            accessibilityRole="button"
            accessibilityLabel={`Insertar captura ${labels.get(id)}`}
          >
            <Text style={styles.addCaptureBtnText}>+ {labels.get(id)}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function DeleteX({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.deleteX}>
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
    minHeight: 32,
    paddingRight: 8,
  },
  empty: { color: '#666', fontSize: 12, fontStyle: 'italic', fontFamily: 'monospace' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    minHeight: 32,
  },
  textChip: { backgroundColor: '#3a3a3a', borderWidth: 1, borderColor: '#555' },
  textChipEditing: { borderColor: '#0c0', backgroundColor: '#1a2a1a' },
  textChipText: { color: '#ddd', fontFamily: 'monospace', fontSize: 13 },
  textChipInput: {
    color: '#fff',
    fontFamily: 'monospace',
    fontSize: 13,
    minWidth: 60,
    paddingVertical: 0,
  },
  captureChip: {},
  captureChipMissing: { backgroundColor: '#700' },
  captureChipText: { color: '#000', fontFamily: 'monospace', fontSize: 12, fontWeight: 'bold' },
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
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  addBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#555',
    borderRadius: 4,
  },
  addBtnText: { color: '#ddd', fontSize: 11, fontFamily: 'monospace', fontWeight: 'bold' },
  addCaptureBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
  },
  addCaptureBtnText: { color: '#000', fontSize: 11, fontFamily: 'monospace', fontWeight: 'bold' },
});
