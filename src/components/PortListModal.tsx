// Modal lista de puertos para `navegarsala` sin argumentos. Patrón
// análogo a RoomSearchResults pero sobre el set fijo de puertos
// marítimos de NAVEGACION.md.

import React from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { MaritimePort } from '../services/maritimeMapService';

interface Props {
  ports: MaritimePort[];
  visible: boolean;
  onSelect: (port: MaritimePort) => void;
  onClose: () => void;
}

export function PortListModal({ ports, visible, onSelect, onClose }: Props) {
  if (!visible) return null;

  return (
    <View style={styles.container} accessible accessibilityLabel="Lista de puertos">
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">Puertos ({ports.length})</Text>
        <TouchableOpacity
          onPress={onClose}
          style={styles.closeBtn}
          accessibilityLabel="Cerrar lista"
          accessibilityRole="button"
        >
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={ports}
        keyExtractor={p => p.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => onSelect(item)}
            accessibilityLabel={`Navegar a ${item.name}`}
            accessibilityRole="button"
          >
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.coords}>{item.col}º O, {item.row}º S</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: 12,
    right: 12,
    maxHeight: 360,
    backgroundColor: 'rgba(0, 20, 40, 0.96)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0, 120, 200, 0.6)',
    zIndex: 50,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 120, 200, 0.4)',
  },
  title: {
    color: '#9cf',
    fontSize: 14,
    fontWeight: '700',
  },
  closeBtn: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#9cf',
    fontSize: 16,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 80, 140, 0.3)',
  },
  name: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  coords: {
    color: '#7bc',
    fontSize: 12,
  },
});
