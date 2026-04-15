import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Macro } from '../types';

interface FKeyBarProps {
  macros: (Macro | null)[];
  onPress: (macro: Macro) => void;
  onLongPress: (macro: Macro | null, index: number) => void;
}

export function FKeyBar({ macros, onPress, onLongPress }: FKeyBarProps) {
  const slots = Array.from({ length: 7 }, (_, i) => macros[i] ?? null);

  return (
    <View style={styles.container}>
      {slots.map((macro, i) => (
        <TouchableOpacity
          key={i}
          style={[
            styles.fkeyBtn,
            macro ? { backgroundColor: macro.color + 'BB' } : styles.emptyBtn,
          ]}
          onPress={() => macro && onPress(macro)}
          onLongPress={() => onLongPress(macro, i)}
          activeOpacity={0.5}
        >
          <Text style={styles.fkeyLabel}>F{i + 1}</Text>
          {macro && (
            <Text style={styles.fkeyText} numberOfLines={1}>
              {macro.label}
            </Text>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 4,
    paddingTop: 2,
    paddingBottom: 0,
    gap: 3,
    backgroundColor: '#111',
  },
  fkeyBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
  },
  emptyBtn: {
    backgroundColor: 'rgba(40, 50, 40, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(80, 110, 80, 0.4)',
    borderStyle: 'dashed',
  },
  fkeyLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 9,
    fontFamily: 'monospace',
  },
  fkeyText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
});
