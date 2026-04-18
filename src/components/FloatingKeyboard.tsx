import React, { useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, useWindowDimensions } from 'react-native';

interface FloatingKeyboardProps {
  onKeyPress: (char: string) => void;
  onBackspace: () => void;
  onEnter: () => void;
}

// Android-like keyboard layout
const KEYBOARD_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ñ'],
  ['?', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '.', ','],
];

const SHIFT_MAP: Record<string, string> = {
  '1': '!',
  '2': '@',
  '3': '#',
  '4': '$',
  '5': '%',
  '6': '^',
  '7': '&',
  '8': '*',
  '9': '(',
  '0': ')',
  '.': '.',
  ',': ',',
  'ñ': 'Ñ',
  '?': '¿',
};

export function FloatingKeyboard({ onKeyPress, onBackspace, onEnter }: FloatingKeyboardProps) {
  const [shiftActive, setShiftActive] = useState(false);
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const handleKeyPress = (char: string) => {
    if (shiftActive) {
      if (/[a-z]/.test(char)) {
        onKeyPress(char.toUpperCase());
      } else if (SHIFT_MAP[char]) {
        onKeyPress(SHIFT_MAP[char]);
      } else {
        onKeyPress(char);
      }
      setShiftActive(false);
    } else {
      onKeyPress(char);
    }
  };

  const renderRow = (row: string[], rowIndex: number, isCompact: boolean) => {
    // Calculate button width based on number of keys and screen width
    const buttonWidthPercent = 100 / row.length;

    return (
      <View key={rowIndex} style={[styles.row, isCompact && styles.rowCompact, compactGap && !isCompact && { gap: 1.5 }]}>
        {row.map((key) => (
          <TouchableOpacity
            key={key}
            style={[
              styles.key,
              isCompact && styles.keyCompact,
              { flex: 2 },
            ]}
            onPress={() => handleKeyPress(key)}
          >
            <Text style={[styles.keyText, isCompact && styles.keyTextCompact]}>
              {shiftActive && /[a-z]/.test(key)
                ? key.toUpperCase()
                : SHIFT_MAP[key] && shiftActive
                ? SHIFT_MAP[key]
                : key}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const isCompact = isLandscape;
  const compactGap = true; // Always use compact gap for width, regardless of orientation

  return (
    <View style={[styles.container, { width: '100%' }, compactGap && { gap: 1, paddingHorizontal: isLandscape ? 0 : 2 }, isCompact && styles.containerCompact]}>
      {/* Main keyboard rows */}
      {KEYBOARD_ROWS.map((row, idx) => renderRow(row, idx, isCompact))}

      {/* Control row */}
      <View style={[styles.bottomRow, isCompact && styles.bottomRowCompact, compactGap && !isCompact && { gap: 1.5 }]}>
        {/* Shift button */}
        <TouchableOpacity
          style={[
            styles.key,
            isCompact && styles.keyCompact,
            { flex: 1 },
            isCompact && { marginHorizontal: -2 },
            shiftActive && styles.shiftActive,
          ]}
          onPress={() => setShiftActive(!shiftActive)}
        >
          <Text style={[styles.keyText, isCompact && styles.keyTextCompact]}>
            ⇧
          </Text>
        </TouchableOpacity>

        {/* Space */}
        <TouchableOpacity
          style={[
            styles.key,
            isCompact && styles.keyCompact,
            { flex: 8 },
            isCompact && { marginHorizontal: -2 },
          ]}
          onPress={() => handleKeyPress(' ')}
        >
          <Text style={[styles.keyText, isCompact && styles.keyTextCompact]}>space</Text>
        </TouchableOpacity>

        {/* Backspace */}
        <TouchableOpacity
          style={[
            styles.key,
            isCompact && styles.keyCompact,
            { flex: 1, backgroundColor: '#3a2a2a', borderColor: '#cc3333' },
            isCompact && { marginHorizontal: -2 },
          ]}
          onPress={onBackspace}
        >
          <Text
            style={[
              styles.keyText,
              isCompact && styles.keyTextCompact,
              { color: '#cc3333' },
            ]}
          >
            ⌫
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingHorizontal: 3,
    paddingVertical: 3,
    gap: 2,
  },
  containerCompact: {
    paddingHorizontal: 2,
    paddingVertical: 2,
    gap: 1,
  },
  row: {
    flexDirection: 'row',
    gap: 2,
    height: 36,
  },
  rowCompact: {
    gap: 1,
    height: 22,
  },
  key: {
    backgroundColor: '#2a2a2a',
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: '#444',
    paddingVertical: 4,
    marginHorizontal: -0.5,
  },
  keyCompact: {
    borderRadius: 3,
  },
  keyText: {
    color: '#ccc',
    fontSize: 12,
    fontWeight: '500',
    fontFamily: 'monospace',
  },
  keyTextCompact: {
    fontSize: 10,
  },
  bottomRow: {
    flexDirection: 'row',
    gap: 2,
    height: 36,
  },
  bottomRowCompact: {
    gap: 1.5,
    height: 22,
  },
  specialBtn: {
    backgroundColor: '#2a2a3a',
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: '#444',
    paddingHorizontal: 5,
    paddingVertical: 4,
    minWidth: 38,
  },
  specialBtnCompact: {
    borderRadius: 2,
    paddingHorizontal: 2,
    paddingVertical: 2,
    minWidth: 24,
  },
  specialBtnText: {
    color: '#999',
    fontSize: 9,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  specialBtnTextCompact: {
    fontSize: 7,
  },
  shiftActive: {
    backgroundColor: '#3a5a3a',
    borderColor: '#0c0',
  },
  spaceBtn: {
    backgroundColor: '#2a2a2a',
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: '#444',
    flex: 1,
    paddingVertical: 4,
  },
  spaceBtnCompact: {
    borderRadius: 2,
    paddingVertical: 3,
  },
  backspaceBtn: {
    backgroundColor: '#3a2a2a',
    borderColor: '#cc3333',
  },
  backspaceText: {
    color: '#cc3333',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
