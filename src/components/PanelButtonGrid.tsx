import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, useWindowDimensions } from 'react-native';

interface Button {
  id: string;
  col: number;
  row: number;
  label: string;
  command: string;
  color: string;
  opacity: number;
}

interface PanelButtonGridProps {
  buttons: Button[];
  gridSize: number;
  onSendCommand: (command: string) => void;
}

function getPanelDimensions(size: number): { cols: number; rows: number } {
  switch (size) {
    case 7: return { cols: 10, rows: 5 };
    case 9: return { cols: 8, rows: 4 };
    case 11: return { cols: 6, rows: 3 };
    default: return { cols: 8, rows: 4 };
  }
}

export function PanelButtonGrid({ buttons, gridSize, onSendCommand }: PanelButtonGridProps) {
  const { width } = useWindowDimensions();
  const panelDim = getPanelDimensions(gridSize);

  const panelWidth = width - 16;
  const cellSize = Math.floor((panelWidth - (panelDim.cols - 1)) / panelDim.cols);
  const cellHeight = cellSize;

  const buttonMap = new Map(buttons.map(btn => [`${btn.col},${btn.row}`, btn]));

  if (buttons.length === 0) {
    return (
      <View style={[styles.container, { height: 150 }]}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Sin botones configurados</Text>
          <Text style={styles.emptySubtext}>Usa el wizard para configurar botones</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { height: 150 }]}>
      <View style={[styles.grid, { paddingHorizontal: 8 }]}>
        {Array.from({ length: panelDim.rows }, (_, row) => (
          <View key={row} style={styles.row}>
            {Array.from({ length: panelDim.cols }, (_, col) => {
              const key = `${col},${row}`;
              const btn = buttonMap.get(key);

              if (btn) {
                return (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.button,
                      {
                        width: cellSize - 2,
                        height: cellHeight - 2,
                        backgroundColor: btn.color,
                        opacity: btn.opacity,
                      },
                    ]}
                    onPress={() => onSendCommand(btn.command)}
                  >
                    <Text style={styles.buttonText} numberOfLines={1}>
                      {btn.label}
                    </Text>
                  </TouchableOpacity>
                );
              }

              return (
                <View
                  key={key}
                  style={[
                    styles.emptyCell,
                    { width: cellSize - 2, height: cellHeight - 2 },
                  ]}
                />
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  grid: {
    flex: 1,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: 1,
    marginBottom: 1,
  },
  button: {
    backgroundColor: '#3399cc',
    borderRadius: 3,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  buttonText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  emptyCell: {
    backgroundColor: 'transparent',
  },
  emptyState: {
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  emptySubtext: {
    color: '#444',
    fontSize: 11,
    fontFamily: 'monospace',
  },
});
