import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';

interface CustomKeyboardProps {
  onKeyPress: (char: string) => void;
  onBackspace: () => void;
  onEnter: () => void;
  compact?: boolean;
  onLayout?: (height: number) => void;
}

const ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', '?'],
];

const SPECIAL_CHARS = [null, null, null, 'Shift'];
const SPECIAL_CHARS_RIGHT = [null, null, 'ñ', '⌫'];

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
};

export function CustomKeyboard({ onKeyPress, onBackspace, onEnter, compact = false, onLayout }: CustomKeyboardProps) {
  const [shiftActive, setShiftActive] = React.useState(false);

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

  const handleSpecialChar = (char: string) => {
    if (char === 'Shift') {
      setShiftActive(!shiftActive);
    } else if (char === '⌫') {
      onBackspace();
    } else {
      onKeyPress(char);
    }
  };

  const handleRightChar = (char: string) => {
    if (char === '⌫') {
      onBackspace();
    } else {
      onKeyPress(char);
    }
  };

  const getDisplayChar = (char: string) => {
    if (char === 'Shift') {
      return '⇧';
    }
    if (shiftActive && SHIFT_MAP[char]) {
      return SHIFT_MAP[char];
    }
    if (shiftActive && /[a-z]/.test(char)) {
      return char.toUpperCase();
    }
    return char;
  };

  // Full QWERTY keyboard with special chars on sides
  return (
    <View
      style={[styles.mainContainer, compact && styles.containerCompact]}
      onLayout={(e) => onLayout?.(e.nativeEvent.layout.height)}
    >
      <View style={styles.keyboardContent}>
        <View
          style={[styles.container, compact && styles.containerCompact]}
        >
          {ROWS.map((row, rowIndex) => (
            <View key={rowIndex} style={[styles.row, compact && styles.rowCompact]}>
              {/* Left special chars column */}
              {SPECIAL_CHARS[rowIndex] && (
                <TouchableOpacity
                  style={[
                    SPECIAL_CHARS[rowIndex] === 'Shift' ? styles.specialKey : styles.key,
                    compact && (SPECIAL_CHARS[rowIndex] === 'Shift' ? styles.specialKeyCompact : styles.keyCompact),
                    SPECIAL_CHARS[rowIndex] === 'Shift' && shiftActive && styles.shiftActive
                  ]}
                  onPress={() => handleSpecialChar(SPECIAL_CHARS[rowIndex]!)}
                >
                  <Text style={[styles.keyText, compact && styles.keyTextCompact]}>
                    {SPECIAL_CHARS[rowIndex] === 'Shift' ? '⇧' : SPECIAL_CHARS[rowIndex]}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Main keys */}
              {row.map((key) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.key, compact && styles.keyCompact]}
                  onPress={() => handleKeyPress(key)}
                >
                  <Text style={[styles.keyText, compact && styles.keyTextCompact]}>
                    {getDisplayChar(key)}
                  </Text>
                </TouchableOpacity>
              ))}

              {/* Right special chars column */}
              {SPECIAL_CHARS_RIGHT[rowIndex] && (
                rowIndex === 3 ? (
                  <TouchableOpacity
                    style={[styles.backspaceKey, compact && styles.backspaceKeyCompact]}
                    onPress={() => handleRightChar(SPECIAL_CHARS_RIGHT[rowIndex]!)}
                  >
                    <Text style={[styles.keyText, compact && styles.keyTextCompact, styles.backspaceText]}>
                      {SPECIAL_CHARS_RIGHT[rowIndex]}
                    </Text>
                  </TouchableOpacity>
                ) : rowIndex === 2 ? (
                  <TouchableOpacity
                    style={[styles.key, compact && styles.keyCompact]}
                    onPress={() => handleRightChar(SPECIAL_CHARS_RIGHT[rowIndex]!)}
                  >
                    <Text style={[styles.keyText, compact && styles.keyTextCompact]}>
                      {SPECIAL_CHARS_RIGHT[rowIndex]}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.specialKey, compact && styles.specialKeyCompact]}
                    onPress={() => handleRightChar(SPECIAL_CHARS_RIGHT[rowIndex]!)}
                  >
                    <Text style={[styles.keyText, compact && styles.keyTextCompact]}>
                      {SPECIAL_CHARS_RIGHT[rowIndex]}
                    </Text>
                  </TouchableOpacity>
                )
              )}
            </View>
          ))}

          <View style={[styles.bottomRow, compact && styles.bottomRowCompact]}>
            {/* Punto */}
            <TouchableOpacity style={[styles.key, compact && styles.keyCompact]} onPress={() => handleKeyPress('.')}>
              <Text style={[styles.keyText, compact && styles.keyTextCompact]}>.</Text>
            </TouchableOpacity>

            {/* Coma */}
            <TouchableOpacity style={[styles.key, compact && styles.keyCompact]} onPress={() => handleKeyPress(',')}>
              <Text style={[styles.keyText, compact && styles.keyTextCompact]}>,</Text>
            </TouchableOpacity>

            {/* Space grande */}
            <TouchableOpacity style={[styles.key, styles.spaceKey, compact && styles.keyCompact]} onPress={() => handleKeyPress(' ')}>
              <Text style={[styles.keyText, compact && styles.keyTextCompact]}>space</Text>
            </TouchableOpacity>

            {/* Enter verde */}
            <TouchableOpacity style={[styles.key, styles.enterKey, styles.largeKey, compact && styles.enterKeyCompact]} onPress={onEnter}>
              <Text style={[styles.enterText, styles.largeKeyTextEnter, compact && styles.enterTextCompact]}>↵</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flexDirection: 'column',
    backgroundColor: '#1a1a1a',
    borderTopWidth: 2,
    borderTopColor: '#333',
  },
  keyboardContent: {
    flexDirection: 'row',
    paddingHorizontal: 1,
    paddingTop: 6,
    paddingBottom: 0,
  },
  container: {
    flex: 1,
    flexDirection: 'column',
  },
  containerCompact: {
    paddingHorizontal: 1,
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 2,
  },
  rowCompact: {
    marginBottom: 1,
  },
  key: {
    backgroundColor: '#2a2a2a',
    borderRadius: 6,
    padding: 16,
    marginHorizontal: 0,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  keyCompact: {
    padding: 10,
    marginHorizontal: 0,
    minWidth: 40,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: {
    color: '#ccc',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  keyTextCompact: {
    fontSize: 10,
  },
  specialKey: {
    backgroundColor: '#2a2a3a',
    borderRadius: 6,
    padding: 16,
    marginHorizontal: 0,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  specialKeyCompact: {
    padding: 10,
    marginHorizontal: 0,
    minWidth: 40,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shiftActive: {
    backgroundColor: '#3a5a3a',
    borderColor: '#0c0',
  },
  largeKey: {
    flex: 0.8,
    minWidth: 70,
    paddingHorizontal: 8,
  },
  largeKeyText: {
    fontSize: 11,
  },
  largeKeyTextEnter: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  spaceKey: {
    flex: 2,
    minWidth: 150,
  },
  backspaceKey: {
    backgroundColor: '#3a2a2a',
    borderColor: '#cc3333',
    borderRadius: 6,
    padding: 16,
    marginHorizontal: 0,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  backspaceText: {
    color: '#cc3333',
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  backspaceKeyCompact: {
    padding: 10,
    marginHorizontal: 0,
    minWidth: 40,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backspaceTextCompact: {
    fontSize: 9,
  },
  enterKey: {
    backgroundColor: '#2a3a2a',
    borderColor: '#33cc33',
  },
  enterText: {
    color: '#33cc33',
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  enterKeyCompact: {
    padding: 10,
    minWidth: 60,
  },
  enterTextCompact: {
    fontSize: 9,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 0,
    marginTop: 2,
    flexWrap: 'wrap',
  },
  bottomRowCompact: {
    gap: 0,
  },
});
