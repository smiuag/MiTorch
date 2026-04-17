import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { AnsiSpan, MudLine } from '../types';

interface AnsiTextProps {
  line?: MudLine;
  spans?: AnsiSpan[];
  fontSize?: number;
  addNewline?: boolean;
}

export function AnsiText({ line, spans, fontSize = 14, addNewline = true }: AnsiTextProps) {
  const spansToRender = spans || line?.spans || [];

  return (
    <Text style={[styles.line, { fontSize, lineHeight: fontSize * 1.2 }]}>
      {spansToRender.map((span, i) => (
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
      {addNewline && '\n'}
    </Text>
  );
}

const styles = StyleSheet.create({
  line: {
    color: '#cccccc',
    fontFamily: 'monospace',
    fontSize: 14,
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
