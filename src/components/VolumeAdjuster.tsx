import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SelfVoicingRow } from './SelfVoicingControls';

// Ajuste de volumen 0..1 con botones +/- de paso 0.05.
// Preferido sobre Slider por accesibilidad blind: cada botón tiene su
// propio accessibilityLabel y TalkBack puede anunciar el valor numérico.
//
// Cuando se pasa `svActive=true` con `svScope` y `svKeyPrefix`, el bloque
// se envuelve con un SelfVoicingRow informativo. En modelo BlindNav, el
// usuario navega con swipe vertical, y al posicionarse aquí puede ajustar
// con swipe horizontal (onAdjust del row). Los botones visibles +/- se
// quedan en pantalla (vista normal) pero no responden a tap directo
// (pointerEvents bloqueados por el row).
interface Props {
  label: string;
  value: number;
  onChange: (v: number) => void;
  svActive?: boolean;
  svScope?: string;
  svKeyPrefix?: string;
}

export function VolumeAdjuster({ label, value, onChange, svActive = false, svScope = '', svKeyPrefix = '' }: Props) {
  const pct = Math.round(value * 100);
  const dec = () => onChange(Math.max(0, Math.round((value - 0.05) * 100) / 100));
  const inc = () => onChange(Math.min(1, Math.round((value + 0.05) * 100) / 100));

  if (svActive && svScope && svKeyPrefix) {
    return (
      <SelfVoicingRow
        svActive={svActive}
        svScope={svScope}
        svKey={`${svKeyPrefix}-row`}
        svLabel={`${label}: ${pct} por ciento. Desliza a los lados para subir o bajar.`}
        onAdjust={(dir) => { if (dir === 'inc') inc(); else dec(); }}
        style={styles.row}
      >
        <Text style={styles.label}>{label}</Text>
        <View style={[styles.btn, value <= 0 && styles.btnDisabled]}>
          <Text style={styles.btnText}>-</Text>
        </View>
        <Text style={styles.value}>{pct}%</Text>
        <View style={[styles.btn, value >= 1 && styles.btnDisabled]}>
          <Text style={styles.btnText}>+</Text>
        </View>
      </SelfVoicingRow>
    );
  }

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
    width: 44,
    height: 44,
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
