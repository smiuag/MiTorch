import React, { useEffect, useRef } from 'react';
import {
  Animated,
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FloatingMessage, useFloatingMessages } from '../contexts/FloatingMessagesContext';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function FloatingMessages() {
  const { messages } = useFloatingMessages();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [messages.length]);

  if (messages.length === 0) return null;

  return (
    <View
      style={[styles.container, { top: Math.max(insets.top, 8) + 4 }]}
      pointerEvents="box-none"
    >
      {messages.map((msg) => (
        <FloatingItem key={msg.id} message={msg} />
      ))}
    </View>
  );
}

function FloatingItem({ message }: { message: FloatingMessage }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [opacity, translateY]);

  const palette =
    message.level === 'success'
      ? { bg: '#0c0', text: '#000' }
      : message.level === 'error'
      ? { bg: '#c00', text: '#fff' }
      : { bg: '#223366', text: '#cce5ff' };

  return (
    <Animated.View
      style={[
        styles.item,
        { backgroundColor: palette.bg, opacity, transform: [{ translateY }] },
      ]}
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={message.text}
    >
      <Text style={[styles.text, { color: palette.text }]}>{message.text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 10,
    right: 10,
    zIndex: 1000,
  },
  item: {
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  text: {
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    textAlign: 'center',
  },
});
