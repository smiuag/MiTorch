// Modal lista de puertos para `navegarsala` sin argumentos. Comparte
// estilos y patrón de selección con RoomSearchResults: primer tap
// marca el puerto, segundo tap (en el mismo) confirma y lanza la
// ruta. Tap en otro puerto reemplaza la marca.

import React from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { MaritimePort } from '../services/maritimeMapService';

interface Props {
  ports: MaritimePort[];
  visible: boolean;
  highlightedPortId?: string | null;
  onSelect: (port: MaritimePort) => void;
  onClose: () => void;
  uiMode?: 'completo' | 'blind';
}

export function PortListModal({ ports, visible, highlightedPortId, onSelect, onClose, uiMode }: Props) {
  if (!visible || ports.length === 0) return null;
  const sorted = [...ports].sort((a, b) => a.name.localeCompare(b.name, 'es'));

  return (
    <View
      style={styles.container}
      accessible={true}
      accessibilityLabel="Lista de puertos"
      accessibilityRole="none"
    >
      <View style={styles.header}>
        <Text
          style={styles.title}
          accessible={true}
          accessibilityLabel={`${sorted.length} puertos disponibles`}
          accessibilityRole="header"
        >
          Puertos ({sorted.length})
        </Text>
        <TouchableOpacity
          onPress={onClose}
          style={styles.closeBtn}
          accessible={true}
          accessibilityLabel="Cerrar lista"
          accessibilityRole="button"
        >
          <Text style={styles.closeText}>X</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={sorted}
        keyExtractor={item => item.id}
        style={styles.list}
        accessible={true}
        accessibilityLabel="Lista de puertos"
        accessibilityRole="list"
        renderItem={({ item }) => {
          const coords = `${item.col}º O, ${item.row}º S`;
          const isHighlighted = highlightedPortId === item.id;
          const isBlind = uiMode === 'blind';
          const accessibilityLabel = isBlind
            ? `${item.name}- ${coords}`
            : item.name;
          const accessibilityHint = isBlind
            ? undefined
            : `Navegar a ${item.name}. Coordenadas: ${coords}`;
          return (
            <TouchableOpacity
              style={[styles.roomItem, isHighlighted && styles.roomItemHighlighted]}
              onPress={() => onSelect(item)}
              accessible={true}
              accessibilityLabel={accessibilityLabel}
              accessibilityRole="button"
              accessibilityHint={accessibilityHint}
            >
              <View style={[styles.colorDot, { backgroundColor: '#794120' }]} />
              <View style={styles.roomInfo}>
                <Text style={styles.roomName}>{item.name}</Text>
                <Text style={styles.roomExits}>{coords}</Text>
              </View>
              <Text style={[styles.goText, isHighlighted && styles.goTextHighlighted]}>
                {isHighlighted ? 'Ir →' : 'Ir'}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '50%',
    backgroundColor: 'rgba(10, 10, 10, 0.95)',
    borderTopWidth: 1,
    borderTopColor: '#333',
    zIndex: 30,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  title: {
    color: '#0c0',
    fontSize: 13,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  closeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  closeText: {
    color: '#c00',
    fontSize: 14,
    fontWeight: 'bold',
  },
  list: {
    maxHeight: 250,
  },
  roomItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  roomItemHighlighted: {
    backgroundColor: 'rgba(0, 150, 0, 0.18)',
    borderLeftWidth: 3,
    borderLeftColor: '#0f0',
  },
  goTextHighlighted: {
    color: '#ff0',
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  roomInfo: {
    flex: 1,
  },
  roomName: {
    color: '#ccc',
    fontSize: 13,
    fontFamily: 'monospace',
  },
  roomExits: {
    color: '#666',
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  goText: {
    color: '#0c0',
    fontSize: 13,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    paddingHorizontal: 12,
  },
});
