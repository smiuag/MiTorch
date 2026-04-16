import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  StyleSheet,
} from 'react-native';
import {
  ConfigProfile,
  listConfigProfiles,
  saveConfigProfile,
  loadConfigProfile,
  deleteConfigProfile,
} from '../storage/configProfileStorage';

interface ConfigProfileModalProps {
  visible: boolean;
  serverId: string;
  currentProfile: string;
  onClose: () => void;
  onLoaded: (name: string) => void;
}

export function ConfigProfileModal({ visible, serverId, currentProfile, onClose, onLoaded }: ConfigProfileModalProps) {
  const [profiles, setProfiles] = useState<ConfigProfile[]>([]);
  const [saveName, setSaveName] = useState('');

  useEffect(() => {
    if (visible) {
      listConfigProfiles().then(setProfiles);
      setSaveName(currentProfile);
    }
  }, [visible, currentProfile]);

  const handleSave = async () => {
    const name = saveName.trim();
    if (!name) return;
    await saveConfigProfile(name, serverId);
    onLoaded(name);
    onClose();
  };

  const handleLoad = async (name: string) => {
    const ok = await loadConfigProfile(name, serverId);
    if (ok) {
      onLoaded(name);
      onClose();
    }
  };

  const handleDelete = async (name: string) => {
    await deleteConfigProfile(name);
    setProfiles(await listConfigProfiles());
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Perfiles</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeText}>X</Text>
            </TouchableOpacity>
          </View>

          {/* Save current */}
          <Text style={styles.sectionLabel}>Guardar configuración actual como:</Text>
          <View style={styles.saveRow}>
            <TextInput
              style={styles.saveInput}
              value={saveName}
              onChangeText={setSaveName}
              placeholder="Nombre..."
              placeholderTextColor="#666"
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Guardar</Text>
            </TouchableOpacity>
          </View>

          {/* Profile list */}
          {profiles.length > 0 && (
            <Text style={styles.sectionLabel}>Perfiles guardados:</Text>
          )}
          <FlatList
            data={profiles}
            keyExtractor={item => item.name}
            style={styles.list}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No hay perfiles guardados</Text>
            }
            renderItem={({ item }) => (
              <View style={[styles.profileRow, item.name === currentProfile && styles.profileRowActive]}>
                <TouchableOpacity
                  style={styles.profileInfo}
                  onPress={() => handleLoad(item.name)}
                >
                  <Text style={[styles.profileName, item.name === currentProfile && styles.profileNameActive]}>
                    {item.name}
                    {item.name === currentProfile ? '  (actual)' : ''}
                  </Text>
                  <Text style={styles.profileDate}>
                    {new Date(item.savedAt).toLocaleDateString()}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDelete(item.name)}
                >
                  <Text style={styles.deleteBtnText}>X</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  content: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
    maxHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  closeText: {
    color: '#c00',
    fontSize: 16,
    fontWeight: 'bold',
    paddingHorizontal: 8,
  },
  sectionLabel: {
    color: '#888',
    fontSize: 11,
    fontFamily: 'monospace',
    marginBottom: 6,
    marginTop: 4,
  },
  saveRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  saveInput: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    color: '#fff',
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: 'monospace',
  },
  saveBtn: {
    backgroundColor: '#00cc00',
    borderRadius: 6,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#000',
    fontSize: 13,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  list: {
    maxHeight: 250,
  },
  emptyText: {
    color: '#555',
    fontSize: 12,
    fontFamily: 'monospace',
    textAlign: 'center',
    marginTop: 20,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    borderRadius: 4,
  },
  profileRowActive: {
    backgroundColor: '#1a1a2a',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    color: '#ccc',
    fontSize: 14,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  profileNameActive: {
    color: '#aaf',
  },
  profileDate: {
    color: '#555',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  deleteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deleteBtnText: {
    color: '#c00',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
