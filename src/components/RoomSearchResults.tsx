import React from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { MapRoom } from '../services/mapService';

interface RoomSearchResultsProps {
  rooms: MapRoom[];
  visible: boolean;
  onSelect: (room: MapRoom) => void;
  onClose: () => void;
}

export function RoomSearchResults({ rooms, visible, onSelect, onClose }: RoomSearchResultsProps) {
  if (!visible || rooms.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Salas encontradas ({rooms.length})</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeText}>X</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={rooms}
        keyExtractor={item => String(item.id)}
        style={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.roomItem}
            onPress={() => onSelect(item)}
          >
            <View style={[styles.colorDot, { backgroundColor: item.c ?? '#0b0' }]} />
            <View style={styles.roomInfo}>
              <Text style={styles.roomName}>{item.n}</Text>
            </View>
            <Text style={styles.goText}>Ir</Text>
          </TouchableOpacity>
        )}
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
  goText: {
    color: '#0c0',
    fontSize: 13,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    paddingHorizontal: 12,
  },
});
