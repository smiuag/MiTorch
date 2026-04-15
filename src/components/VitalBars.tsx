import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface VitalBarsProps {
  hp: number;
  hpMax: number;
  energy: number;
  energyMax: number;
}

export function VitalBars({ hp, hpMax, energy, energyMax }: VitalBarsProps) {
  if (hpMax <= 0 && energyMax <= 0) return null;

  const hpPct = hpMax > 0 ? Math.max(0, Math.min(1, hp / hpMax)) : 0;
  const energyPct = energyMax > 0 ? Math.max(0, Math.min(1, energy / energyMax)) : 0;

  return (
    <View style={styles.container}>
      {/* HP bar */}
      <View style={styles.barBg}>
        <View style={[styles.barFill, styles.hpFill, { width: `${hpPct * 100}%` }]} />
        <Text style={styles.label}>{hp}/{hpMax}</Text>
      </View>

      {/* Energy bar */}
      <View style={styles.barBg}>
        <View style={[styles.barFill, styles.energyFill, { width: `${energyPct * 100}%` }]} />
        <Text style={styles.label}>{energy}/{energyMax}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111',
    gap: 1,
    paddingVertical: 1,
  },
  barBg: {
    height: 14,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    position: 'relative',
  },
  barFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  hpFill: {
    backgroundColor: 'rgba(180, 0, 0, 0.8)',
  },
  energyFill: {
    backgroundColor: 'rgba(0, 60, 180, 0.8)',
  },
  label: {
    color: 'rgba(220, 220, 220, 0.9)',
    fontSize: 9,
    fontFamily: 'monospace',
    textAlign: 'center',
    zIndex: 1,
  },
});
