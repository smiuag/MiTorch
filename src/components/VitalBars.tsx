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

  if (isVertical) {
    return (
      <View
        style={[styles.container, styles.containerVertical]}
        accessible={true}
        accessibilityLabel="Vital Bars"
        accessibilityHint="Shows current health points and energy levels"
      >
        {/* HP bar - vertical, fills from bottom to top */}
        <View
          style={[styles.barBgVertical, styles.hpBg]}
          accessible={true}
          accessibilityLabel={`Health: ${hp} of ${hpMax}`}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: hpMax, now: hp }}
        >
          <View style={[styles.barFillVertical, styles.hpFill, { height: `${hpPct * 100}%` }]} />
          <Text style={styles.labelVertical}>H</Text>
        </View>

        {/* Energy bar - vertical, fills from bottom to top */}
        <View
          style={[styles.barBgVertical, styles.energyBg]}
          accessible={true}
          accessibilityLabel={`Energy: ${energy} of ${energyMax}`}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: energyMax, now: energy }}
        >
          <View style={[styles.barFillVertical, styles.energyFill, { height: `${energyPct * 100}%` }]} />
          <Text style={styles.labelVertical}>E</Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { flex: 1 }]}
      accessible={true}
      accessibilityLabel="Vital Bars"
      accessibilityHint="Shows current health points and energy levels"
    >
      {/* HP bar */}
      <View
        style={[styles.barBg, styles.hpBg, { flex: 1 }]}
        accessible={true}
        accessibilityLabel={`Health: ${hp} of ${hpMax}`}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: hpMax, now: hp }}
      >
        <View style={[styles.barFill, styles.hpFill, { width: `${hpPct * 100}%` }]} />
        <Text style={styles.label}>{hp}/{hpMax}</Text>
      </View>

      {/* Energy bar */}
      <View
        style={[styles.barBg, styles.energyBg, { flex: 1 }]}
        accessible={true}
        accessibilityLabel={`Energy: ${energy} of ${energyMax}`}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: energyMax, now: energy }}
      >
        <View style={[styles.barFill, styles.energyFill, { width: `${energyPct * 100}%` }]} />
        <Text style={styles.label}>{energy}/{energyMax}</Text>
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
  containerVertical: {
    flex: 1,
    flexDirection: 'row',
    width: 30,
    gap: 2,
    padding: 2,
  },
  barBg: {
    justifyContent: 'center',
    position: 'relative',
  },
  barBgVertical: {
    flex: 1,
    justifyContent: 'flex-end',
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
    minWidth: 0,
  },
  barFillVertical: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    minHeight: 2,
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
    color: '#fff',
    fontSize: 8,
    fontFamily: 'monospace',
    textAlign: 'center',
    zIndex: 1,
    fontWeight: 'bold',
  },
});
