import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

// Ajuste de volumen 0..1 con botones +/- de paso 0.05.
// Preferido sobre Slider por accesibilidad blind: cada botón tiene su
// propio accessibilityLabel y TalkBack puede anunciar el valor numérico.
interface Props {
  label: string;
  value: number;
  onChange: (v: number) => void;
}

export function VolumeAdjuster({ label, value, onChange }: Props) {
  const pct = Math.round(value * 100);
  const dec = () => onChange(Math.max(0, Math.round((value - 0.05) * 100) / 100));
  const inc = () => onChange(Math.min(1, Math.round((value + 0.05) * 100) / 100));
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        onPress={dec}
        disabled={value <= 0}
        style={[styles.btn, value <= 0 && styles.btnDisabled]}
        accessibilityRole="button"
        accessibilityLabel={`Bajar ${label.toLowerCase()}`}
      >
        <Text style={styles.btnText}>-</Text>
      </TouchableOpacity>
      <Text style={styles.value} accessibilityLabel={`${label}: ${pct} por ciento`}>
        {pct}%
      </Text>
      <TouchableOpacity
        onPress={inc}
        disabled={value >= 1}
        style={[styles.btn, value >= 1 && styles.btnDisabled]}
        accessibilityRole="button"
        accessibilityLabel={`Subir ${label.toLowerCase()}`}
      >
        <Text style={styles.btnText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 2,
    gap: 8,
  },
  label: { flex: 1, color: '#ccc', fontSize: 13, fontFamily: 'monospace' },
  btn: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#0a3a0a',
    borderWidth: 1,
    borderColor: '#0c0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.3 },
  btnText: { color: '#0c0', fontSize: 18, fontFamily: 'monospace', fontWeight: 'bold' },
  value: {
    color: '#0c0',
    fontSize: 14,
    fontFamily: 'monospace',
    minWidth: 50,
    textAlign: 'center',
  },
});
