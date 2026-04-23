import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';

interface Props {
  visible: boolean;
  suggestions: string[];
  onSelect: (nick: string) => void;
}

export function NickAutocomplete({ visible, suggestions, onSelect }: Props) {
  if (!visible || suggestions.length === 0) return null;

  // Rendered inline (non-absolute) so it lives in the flex flow right above
  // the input row. With Android's adjustResize, the activity shrinks when
  // the keyboard opens and this bar ends up docked right above the soft
  // keyboard without any manual positioning.
  return (
    <View
      style={styles.bar}
      accessible={false}
      accessibilityLabel="Sugerencias de nicks"
    >
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {suggestions.map((nick) => (
          <Chip key={nick} nick={nick} onSelect={onSelect} />
        ))}
      </ScrollView>
    </View>
  );
}

function Chip({ nick, onSelect }: { nick: string; onSelect: (nick: string) => void }) {
  // Intentionally NOT using TouchableOpacity: on Android it steals focus
  // from the TextInput, which hides the soft keyboard. A plain View with
  // touch responder handlers dispatches the tap without blurring the input.
  return (
    <View
      style={styles.chip}
      onStartShouldSetResponder={() => true}
      onResponderRelease={() => onSelect(nick)}
      accessible
      accessibilityLabel={nick}
      accessibilityRole="button"
    >
      <Text style={styles.chipText} numberOfLines={1}>
        {nick}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingVertical: 6,
  },
  scrollContent: {
    paddingHorizontal: 8,
    gap: 6,
  },
  chip: {
    backgroundColor: '#336699',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    marginRight: 6,
  },
  chipText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
