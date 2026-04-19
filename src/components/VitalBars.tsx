import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface VitalBarsProps {
  hp: number;
  hpMax: number;
  energy: number;
  energyMax: number;
  orientation?: 'horizontal' | 'vertical';
}

export function VitalBars({ hp, hpMax, energy, energyMax, orientation = 'horizontal' }: VitalBarsProps) {
  const hpPct = hpMax > 0 ? Math.max(0, Math.min(1, hp / hpMax)) : 0;
  const energyPct = energyMax > 0 ? Math.max(0, Math.min(1, energy / energyMax)) : 0;
  const isVertical = orientation === 'vertical';

  return (
    <View style={[styles.container, { flex: 1, flexDirection: isVertical ? 'column' : 'row' }]}>
      {/* HP bar */}
      <View style={[styles.barBg, styles.hpBg, { flex: 1 }]}>
        <View style={[
          styles.barFill,
          styles.hpFill,
          isVertical
            ? { height: `${hpPct * 100}%`, width: '100%' }
            : { width: `${hpPct * 100}%`, height: '100%' }
        ]} />
        <Text style={[styles.label, isVertical && styles.labelVertical]}>{hp}/{hpMax}</Text>
      </View>

      {/* Energy bar */}
      <View style={[styles.barBg, styles.energyBg, { flex: 1 }]}>
        <View style={[
          styles.barFill,
          styles.energyFill,
          isVertical
            ? { height: `${energyPct * 100}%`, width: '100%' }
            : { width: `${energyPct * 100}%`, height: '100%' }
        ]} />
        <Text style={[styles.label, isVertical && styles.labelVertical]}>{energy}/{energyMax}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0a0a0a',
    gap: 0,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  barBg: {
    justifyContent: 'center',
    position: 'relative',
  },
  hpBg: {
    backgroundColor: '#330000',
  },
  energyBg: {
    backgroundColor: '#000033',
  },
  barFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  hpFill: {
    backgroundColor: '#ff3333',
  },
  energyFill: {
    backgroundColor: '#3366ff',
  },
  label: {
    color: '#fff',
    fontSize: 10,
    fontFamily: 'monospace',
    textAlign: 'center',
    zIndex: 1,
    fontWeight: 'bold',
  },
  labelVertical: {
    fontSize: 8,
    transform: [{ rotate: '-90deg' }],
  },
});
