import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch, ScrollView, Alert, FlatList, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { loadSettings, saveSettings, AppSettings } from '../storage/settingsStorage';
import { listLayoutProfiles, deleteLayoutProfile, updateLayoutProfile, duplicateLayoutProfile, loadLayoutProfile, LayoutProfileMeta } from '../storage/layoutProfileStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const [settings, setSettings] = useState<AppSettings>({ fontSize: 14 });
  const [profiles, setProfiles] = useState<LayoutProfileMeta[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [renamingProfileId, setRenamingProfileId] = useState<string | null>(null);
  const [renamingProfileName, setRenamingProfileName] = useState('');
  const [duplicatingProfileId, setDuplicatingProfileId] = useState<string | null>(null);
  const [duplicatingProfileName, setDuplicatingProfileName] = useState('');

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadProfiles();
    }, [])
  );

  const loadProfiles = async () => {
    const loaded = await listLayoutProfiles();
    setProfiles(loaded);
  };

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    saveSettings(updated);
  };

  const handleDeleteProfile = (id: string, name: string) => {
    Alert.alert(
      'Eliminar perfil',
      `¿Eliminar "${name}"?`,
      [
        { text: 'Cancelar', onPress: () => {} },
        {
          text: 'Eliminar',
          onPress: async () => {
            await deleteLayoutProfile(id);
            await loadProfiles();
          },
          style: 'destructive',
        },
      ]
    );
  };

  const handleRenameProfile = async (id: string, currentName: string) => {
    setRenamingProfileId(id);
    setRenamingProfileName(currentName);
  };

  const handleSaveRename = async (id: string) => {
    if (!renamingProfileName.trim()) return;
    try {
      const layout = await loadLayoutProfile(id);
      if (layout) {
        await updateLayoutProfile(id, renamingProfileName.trim(), layout);
        await loadProfiles();
      }
    } catch (e) {
      Alert.alert('Error', 'No se pudo renombrar el perfil');
    }
    setRenamingProfileId(null);
    setRenamingProfileName('');
  };

  const handleDuplicateProfile = (id: string, name: string) => {
    setDuplicatingProfileId(id);
    setDuplicatingProfileName(`${name} (copia)`);
  };

  const handleSaveDuplicate = async (sourceId: string) => {
    if (!duplicatingProfileName.trim()) return;
    try {
      await duplicateLayoutProfile(sourceId, duplicatingProfileName.trim());
      await loadProfiles();
    } catch (e) {
      Alert.alert('Error', 'No se pudo duplicar el perfil');
    }
    setDuplicatingProfileId(null);
    setDuplicatingProfileName('');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>{'< Volver'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Configuración</Text>
      </View>

      <ScrollView style={styles.section} contentContainerStyle={styles.sectionContent}>
        {/* Font Size Section - FIRST */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Configuración general</Text>
        </View>

        <View style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.rowTitle}>Tamaño de fuente</Text>
            <Text style={styles.rowDesc}>
              Tamaño de fuente del terminal y canales.
            </Text>
          </View>
          <View style={styles.fontSizeControls}>
            <TouchableOpacity
              style={[styles.fontBtn, settings.fontSize <= 10 && styles.fontBtnDisabled]}
              onPress={() => settings.fontSize > 10 && updateSetting('fontSize', settings.fontSize - 1)}
            >
              <Text style={[styles.fontBtnText, settings.fontSize <= 10 && styles.fontBtnTextDisabled]}>−</Text>
            </TouchableOpacity>
            <Text style={styles.fontSizeValue}>{settings.fontSize}</Text>
            <TouchableOpacity
              style={[styles.fontBtn, settings.fontSize >= 20 && styles.fontBtnDisabled]}
              onPress={() => settings.fontSize < 20 && updateSetting('fontSize', settings.fontSize + 1)}
            >
              <Text style={[styles.fontBtnText, settings.fontSize >= 20 && styles.fontBtnTextDisabled]}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Profiles Section - SECOND */}
        <View style={[styles.sectionHeader, styles.marginTop]}>
          <Text style={styles.sectionTitle}>Perfiles de botones</Text>
        </View>

        {profiles.length > 0 ? (
          <View style={styles.profilesListContainer}>
            {profiles.map((item, index) => {
              const date = new Date(item.createdAt);
              const dateStr = date.toLocaleDateString();

              return (
                <View key={item.id} style={[styles.row, styles.profileRow, index === 0 ? styles.marginTop : styles.profileListMargin]}>
                  <TouchableOpacity
                    style={{ flex: 1 }}
                    onPress={() => navigation.navigate('LayoutEditor', { profileId: item.id })}
                  >
                    <Text style={styles.profileName}>{item.name}</Text>
                    <Text style={styles.profileDate}>{dateStr}</Text>
                  </TouchableOpacity>
                  <View style={styles.profileActions}>
                    <TouchableOpacity
                      onPress={() => handleRenameProfile(item.id, item.name)}
                      style={styles.actionBtn}
                    >
                      <Text style={styles.actionBtnText}>✎</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDuplicateProfile(item.id, item.name)}
                      style={styles.actionBtn}
                    >
                      <Text style={styles.actionBtnText}>⬚</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteProfile(item.id, item.name)}
                      style={styles.actionBtn}
                    >
                      <Text style={styles.deleteProfileBtn}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={[styles.row, styles.marginTop]}>
            <Text style={styles.noProfilesText}>
              No hay perfiles. Crea uno para comenzar.
            </Text>
          </View>
        )}

        {/* Add Profile Button - LAST */}
        <TouchableOpacity
          style={[styles.row, styles.newProfileBtn, styles.marginTop]}
          onPress={() => navigation.navigate('LayoutEditor')}
        >
          <Text style={styles.newProfileBtnText}>+ Nuevo perfil</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Rename Profile Modal */}
      <Modal
        visible={renamingProfileId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRenamingProfileId(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Renombrar perfil</Text>
            <TextInput
              style={styles.modalInput}
              value={renamingProfileName}
              onChangeText={setRenamingProfileName}
              autoCapitalize="none"
              autoCorrect={false}
              placeholderTextColor="#666"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setRenamingProfileId(null)}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={() => handleSaveRename(renamingProfileId!)}>
                <Text style={styles.saveText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Duplicate Profile Modal */}
      <Modal
        visible={duplicatingProfileId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDuplicatingProfileId(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Duplicar perfil</Text>
            <Text style={styles.modalHint}>Nombre del nuevo perfil</Text>
            <TextInput
              style={styles.modalInput}
              value={duplicatingProfileName}
              onChangeText={setDuplicatingProfileName}
              autoCapitalize="none"
              autoCorrect={false}
              placeholderTextColor="#666"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setDuplicatingProfileId(null)}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={() => handleSaveDuplicate(duplicatingProfileId!)}>
                <Text style={styles.saveText}>Duplicar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backBtn: {
    marginBottom: 8,
  },
  backText: {
    color: '#0c0',
    fontSize: 14,
    fontFamily: 'monospace',
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  section: {
    flex: 1,
  },
  sectionContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#0c0',
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  profileRow: {
    alignItems: 'flex-start',
  },
  rowInfo: {
    flex: 1,
    marginRight: 12,
  },
  rowTitle: {
    color: '#ccc',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  rowDesc: {
    color: '#666',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  marginTop: {
    marginTop: 12,
  },
  newProfileBtn: {
    justifyContent: 'center',
    backgroundColor: '#0a3a0a',
    borderColor: '#0c0',
  },
  newProfileBtnText: {
    color: '#0c0',
    fontSize: 14,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  profileName: {
    color: '#ccc',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  profileDate: {
    color: '#666',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  profileActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  actionBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnText: {
    color: '#0c0',
    fontSize: 16,
    fontWeight: 'bold',
  },
  deleteProfileBtn: {
    color: '#cc3333',
    fontSize: 16,
    fontWeight: 'bold',
  },
  noProfilesText: {
    color: '#666',
    fontSize: 12,
    fontFamily: 'monospace',
    fontStyle: 'italic',
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
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    fontFamily: 'monospace',
  },
  modalHint: {
    color: '#888',
    fontSize: 11,
    marginBottom: 12,
    fontFamily: 'monospace',
  },
  modalInput: {
    backgroundColor: '#0a0a0a',
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 6,
    padding: 12,
    fontSize: 14,
    fontFamily: 'monospace',
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
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
  fontSizeControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  fontBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0a3a0a',
    borderWidth: 1,
    borderColor: '#0c0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fontBtnDisabled: {
    backgroundColor: '#1a1a1a',
    borderColor: '#333',
  },
  fontBtnText: {
    color: '#0c0',
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  fontBtnTextDisabled: {
    color: '#333',
  },
  fontSizeValue: {
    color: '#0c0',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    minWidth: 30,
    textAlign: 'center',
  },
  profilesListContainer: {
    backgroundColor: '#0a0a0a',
  },
  profileListMargin: {
    marginTop: 8,
  },
});
