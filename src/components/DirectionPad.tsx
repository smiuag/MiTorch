import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Macro } from '../types';

interface DirectionPadProps {
  onDirection: (command: string) => void;
  extraButtons: (Macro | null)[];
  onExtraLongPress: (index: number) => void;
  fkeys: (Macro | null)[];
  onFKeyPress: (macro: Macro) => void;
  onFKeyLongPress: (index: number) => void;
}

export function DirectionPad({ onDirection, extraButtons, onExtraLongPress, fkeys, onFKeyPress, onFKeyLongPress }: DirectionPadProps) {
  const dir = (label: string, command: string) => (
    <TouchableOpacity
      style={[styles.btn, styles.dirBtn]}
      onPress={() => onDirection(command)}
      activeOpacity={0.5}
    >
      <Text style={styles.btnText}>{label}</Text>
    </TouchableOpacity>
  );

  const alt = (label: string, command: string) => (
    <TouchableOpacity
      style={[styles.btn, styles.altDirBtn]}
      onPress={() => onDirection(command)}
      activeOpacity={0.5}
    >
      <Text style={styles.btnText}>{label}</Text>
    </TouchableOpacity>
  );

  const action = (label: string, command: string) => (
    <TouchableOpacity
      style={[styles.btn, styles.actionBtn]}
      onPress={() => onDirection(command)}
      activeOpacity={0.5}
    >
      <Text style={styles.btnText}>{label}</Text>
    </TouchableOpacity>
  );

  const extra = (index: number) => {
    const macro = extraButtons[index] ?? null;
    return (
      <TouchableOpacity
        style={[styles.btn, macro ? styles.actionBtn : styles.emptyBtn]}
        onPress={() => macro && onDirection(macro.command)}
        onLongPress={() => onExtraLongPress(index)}
        activeOpacity={0.5}
      >
        <Text style={[styles.btnText, !macro && styles.emptyText]}>
          {macro ? macro.label : '...'}
        </Text>
      </TouchableOpacity>
    );
  };

  const fkey = (index: number) => {
    const macro = fkeys[index] ?? null;
    return (
      <TouchableOpacity
        style={[styles.btn, macro ? { backgroundColor: macro.color + 'BB', borderColor: 'rgba(80, 110, 80, 0.4)', borderWidth: 1 } : styles.fkeyEmptyBtn]}
        onPress={() => macro && onFKeyPress(macro)}
        onLongPress={() => onFKeyLongPress(index)}
        activeOpacity={0.5}
      >
        <Text style={styles.fkeyLabel}>F{index + 1}</Text>
        {macro && (
          <Text style={styles.fkeyText} numberOfLines={1}>{macro.label}</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {dir('NW', 'noroeste')}
        {dir('N', 'norte')}
        {dir('NE', 'noreste')}
        {alt('DE', 'dentro')}
        {alt('FU', 'fuera')}
        {action('buscar', 'buscar')}
        {fkey(7)}
      </View>
      <View style={styles.row}>
        {dir('W', 'oeste')}
        {action('mirar', 'mirar')}
        {dir('E', 'este')}
        {alt('AR', 'arriba')}
        {alt('AB', 'abajo')}
        {action('estado', 'estado -b todo')}
        {fkey(8)}
      </View>
      <View style={styles.row}>
        {dir('SW', 'suroeste')}
        {dir('S', 'sur')}
        {dir('SE', 'sureste')}
        {action('score', 'score')}
        {action('who', 'who')}
        {extra(0)}
        {fkey(9)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111',
    paddingTop: 3,
    paddingBottom: 4,
    paddingHorizontal: 4,
    gap: 3,
  },
  row: {
    flexDirection: 'row',
    gap: 3,
  },
  btn: {
    flex: 1,
    height: 38,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  dirBtn: {
    backgroundColor: '#1a2a3a',
    borderColor: '#2a4a6a',
  },
  altDirBtn: {
    backgroundColor: '#2a1a3a',
    borderColor: '#4a2a6a',
  },
  actionBtn: {
    backgroundColor: '#2a2a2a',
    borderColor: '#4a4a4a',
  },
  emptyBtn: {
    backgroundColor: '#1a1a1a',
    borderColor: '#333',
    borderStyle: 'dashed',
  },
  fkeyEmptyBtn: {
    backgroundColor: 'rgba(40, 50, 40, 0.6)',
    borderColor: 'rgba(80, 110, 80, 0.4)',
    borderStyle: 'dashed',
  },
  btnText: {
    color: '#ccc',
    fontSize: 10,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  emptyText: {
    color: '#555',
  },
  fkeyLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 8,
    fontFamily: 'monospace',
  },
  fkeyText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
});
