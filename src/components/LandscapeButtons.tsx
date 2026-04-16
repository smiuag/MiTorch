import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Macro } from '../types';

interface LandscapeButtonsProps {
  fkeys: (Macro | null)[];
  extraButtons: (Macro | null)[];
  onFKeyPress: (macro: Macro) => void;
  onFKeyLongPress: (index: number) => void;
  onExtraLongPress: (index: number) => void;
  onDirection: (command: string) => void;
  onLocate: () => void;
  onExtraPress: (macro: Macro) => void;
}

export function LandscapeButtons({
  fkeys, extraButtons,
  onFKeyPress, onFKeyLongPress,
  onExtraLongPress, onExtraPress,
  onDirection, onLocate,
}: LandscapeButtonsProps) {

  const fkey = (index: number) => {
    const macro = fkeys[index] ?? null;
    return (
      <TouchableOpacity
        key={`f${index}`}
        style={[styles.btn, macro ? { backgroundColor: macro.color + 'BB' } : styles.fkeyEmpty]}
        onPress={() => macro && onFKeyPress(macro)}
        onLongPress={() => onFKeyLongPress(index)}
        activeOpacity={0.5}
      >
        <Text style={styles.fkeyLabel}>F{index + 1}</Text>
        {macro && <Text style={styles.fkeyText} numberOfLines={1}>{macro.label}</Text>}
      </TouchableOpacity>
    );
  };

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
        key={`e${index}`}
        style={[styles.btn, macro ? styles.actionBtn : styles.emptyBtn]}
        onPress={() => macro && onExtraPress(macro)}
        onLongPress={() => onExtraLongPress(index)}
        activeOpacity={0.5}
      >
        <Text style={[styles.btnText, !macro && styles.emptyText]}>
          {macro ? macro.label : '...'}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* F1-F5 */}
      <View style={styles.row}>
        {fkey(0)}{fkey(1)}{fkey(2)}{fkey(3)}{fkey(4)}
      </View>
      {/* F6-F10 */}
      <View style={styles.row}>
        {fkey(5)}{fkey(6)}{fkey(7)}{fkey(8)}{fkey(9)}
      </View>
      {/* Directions row 1 */}
      <View style={styles.row}>
        {dir('NW', 'noroeste')}
        {dir('N', 'norte')}
        {dir('NE', 'noreste')}
        {alt('DE', 'dentro')}
        {alt('FU', 'fuera')}
      </View>
      {/* Directions row 2 */}
      <View style={styles.row}>
        {dir('W', 'oeste')}
        <TouchableOpacity
          style={[styles.btn, styles.locateBtn]}
          onPress={onLocate}
          activeOpacity={0.5}
        >
          <Text style={styles.btnText}>LOC</Text>
        </TouchableOpacity>
        {dir('E', 'este')}
        {alt('AR', 'arriba')}
        {alt('AB', 'abajo')}
      </View>
      {/* Directions row 3 */}
      <View style={styles.row}>
        {dir('SW', 'sudoeste')}
        {dir('S', 'sur')}
        {dir('SE', 'sudeste')}
        {extra(0)}
        {extra(1)}
      </View>
      {/* Actions row */}
      <View style={styles.row}>
        {action('score', 'score')}
        {action('mirar', 'mirar')}
        {action('buscar', 'buscar')}
        {action('who', 'who')}
        {action('estado', 'estado -b todo')}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111',
    paddingHorizontal: 3,
    paddingVertical: 3,
    gap: 3,
  },
  row: {
    flexDirection: 'row',
    gap: 3,
  },
  btn: {
    flex: 1,
    height: 32,
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
  locateBtn: {
    backgroundColor: '#2a3a2a',
    borderColor: '#4a6a4a',
  },
  emptyBtn: {
    backgroundColor: '#1a1a1a',
    borderColor: '#333',
    borderStyle: 'dashed',
  },
  fkeyEmpty: {
    backgroundColor: 'rgba(40, 50, 40, 0.6)',
    borderWidth: 1,
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
