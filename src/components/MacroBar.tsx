import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Macro } from '../types';

interface MacroBarProps {
  macros: Macro[];
  onPress: (macro: Macro) => void;
  onLongPress: (macro: Macro) => void;
  onAddPress: () => void;
}

export function MacroBar({ macros, onPress, onLongPress, onAddPress }: MacroBarProps) {
  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="always"
      >
        {macros.map(macro => (
          <TouchableOpacity
            key={macro.id}
            style={[styles.macroBtn, { backgroundColor: macro.color }]}
            onPress={() => onPress(macro)}
            onLongPress={() => onLongPress(macro)}
            activeOpacity={0.6}
          >
            <Text style={styles.macroLabel} numberOfLines={1}>
              {macro.label}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={styles.addBtn}
          onPress={onAddPress}
        >
          <Text style={styles.addText}>+</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: '#333',
    backgroundColor: '#111',
  },
  scrollContent: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 6,
  },
  macroBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    minWidth: 44,
    alignItems: 'center',
  },
  macroLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  addBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#444',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: {
    color: '#666',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
