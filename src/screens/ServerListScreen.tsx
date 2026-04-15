import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, ServerProfile } from '../types';
import { loadServers, saveServers } from '../storage/serverStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'ServerList'>;

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function ServerListScreen({ navigation }: Props) {
  const [servers, setServers] = useState<ServerProfile[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingServer, setEditingServer] = useState<ServerProfile | null>(null);
  const [formName, setFormName] = useState('');
  const [formHost, setFormHost] = useState('');
  const [formPort, setFormPort] = useState('');

  useFocusEffect(
    useCallback(() => {
      loadServers().then(setServers);
    }, [])
  );

  const openAdd = () => {
    setEditingServer(null);
    setFormName('');
    setFormHost('');
    setFormPort('23');
    setModalVisible(true);
  };

  const openEdit = (server: ServerProfile) => {
    setEditingServer(server);
    setFormName(server.name);
    setFormHost(server.host);
    setFormPort(String(server.port));
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formHost.trim()) return;

    const port = parseInt(formPort) || 23;
    let updated: ServerProfile[];

    if (editingServer) {
      updated = servers.map(s =>
        s.id === editingServer.id
          ? { ...s, name: formName.trim(), host: formHost.trim(), port }
          : s
      );
    } else {
      const newServer: ServerProfile = {
        id: generateId(),
        name: formName.trim(),
        host: formHost.trim(),
        port,
      };
      updated = [...servers, newServer];
    }

    setServers(updated);
    await saveServers(updated);
    setModalVisible(false);
  };

  const handleDelete = (server: ServerProfile) => {
    Alert.alert(
      'Delete Server',
      `Remove "${server.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const updated = servers.filter(s => s.id !== server.id);
            setServers(updated);
            await saveServers(updated);
          },
        },
      ]
    );
  };

  const renderServer = ({ item }: { item: ServerProfile }) => (
    <TouchableOpacity
      style={styles.serverCard}
      onPress={() => navigation.navigate('Terminal', { server: item })}
      onLongPress={() => openEdit(item)}
    >
      <View style={styles.serverInfo}>
        <Text style={styles.serverName}>{item.name}</Text>
        <Text style={styles.serverHost}>{item.host}:{item.port}</Text>
      </View>
      <View style={styles.serverActions}>
        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => openEdit(item)}
        >
          <Text style={styles.editText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => handleDelete(item)}
        >
          <Text style={styles.deleteText}>X</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Al'jhtar Store</Text>
        <Text style={styles.subtitle}>MUD Client</Text>
      </View>

      <FlatList
        data={servers}
        renderItem={renderServer}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No servers configured. Tap + to add one.</Text>
        }
      />

      <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
        <Text style={styles.addText}>+</Text>
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingServer ? 'Edit Server' : 'Add Server'}
            </Text>

            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.modalInput}
              value={formName}
              onChangeText={setFormName}
              placeholder="My MUD"
              placeholderTextColor="#666"
            />

            <Text style={styles.label}>Host</Text>
            <TextInput
              style={styles.modalInput}
              value={formHost}
              onChangeText={setFormHost}
              placeholder="mud.example.com"
              placeholderTextColor="#666"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>Port</Text>
            <TextInput
              style={styles.modalInput}
              value={formPort}
              onChangeText={setFormPort}
              placeholder="23"
              placeholderTextColor="#666"
              keyboardType="number-pad"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#00cc00',
    fontFamily: 'monospace',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    fontFamily: 'monospace',
  },
  list: {
    padding: 16,
  },
  serverCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  serverInfo: {
    flex: 1,
  },
  serverName: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  serverHost: {
    color: '#888',
    fontSize: 13,
    marginTop: 4,
    fontFamily: 'monospace',
  },
  serverActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#2a2a2a',
    borderRadius: 4,
  },
  editText: {
    color: '#cccccc',
    fontSize: 12,
  },
  deleteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#331111',
    borderRadius: 4,
  },
  deleteText: {
    color: '#cc0000',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyText: {
    color: '#666',
    textAlign: 'center',
    marginTop: 40,
    fontFamily: 'monospace',
  },
  addBtn: {
    position: 'absolute',
    right: 20,
    bottom: 30,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#00cc00',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#00cc00',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  addText: {
    fontSize: 28,
    color: '#000000',
    fontWeight: 'bold',
    lineHeight: 30,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: '#333',
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    fontFamily: 'monospace',
  },
  label: {
    color: '#888',
    fontSize: 12,
    marginBottom: 4,
    marginTop: 12,
    fontFamily: 'monospace',
  },
  modalInput: {
    backgroundColor: '#0a0a0a',
    color: '#ffffff',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 6,
    padding: 12,
    fontSize: 16,
    fontFamily: 'monospace',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 24,
    gap: 12,
  },
  cancelBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: '#2a2a2a',
  },
  cancelText: {
    color: '#999',
    fontSize: 14,
  },
  saveBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: '#00cc00',
  },
  saveText: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
