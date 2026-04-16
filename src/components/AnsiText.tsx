import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { AnsiSpan, MudLine } from '../types';

interface AnsiTextProps {
  line: MudLine;
  fontSize?: number;
}

export function AnsiText({ line, fontSize = 14 }: AnsiTextProps) {
  return (
    <Text style={[styles.line, { fontSize }]}>
      {line.spans.map((span, i) => (
        <Text
          key={i}
          style={[
            span.fg ? { color: span.fg } : null,
            span.bg ? { backgroundColor: span.bg } : null,
            span.bold ? styles.bold : null,
            span.italic ? styles.italic : null,
            span.underline ? styles.underline : null,
          ]}
        >
          {span.text}
        </Text>
      ))}
      {'\n'}
    </Text>
  );
}

const styles = StyleSheet.create({
  line: {
    color: '#cccccc',
    fontFamily: 'monospace',
    fontSize: 14,
    lineHeight: 20,
  },
  bold: {
    fontWeight: 'bold',
  },
  italic: {
    fontStyle: 'italic',
  },
  underline: {
    textDecorationLine: 'underline',
  },
});
