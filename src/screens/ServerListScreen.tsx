import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, ServerProfile } from '../types';
import { loadServers, saveServers } from '../storage/serverStorage';
import { listLayoutProfiles, LayoutProfileMeta } from '../storage/layoutProfileStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'ServerList'>;

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function ServerListScreen({ navigation }: Props) {
  const [servers, setServers] = useState<ServerProfile[]>([]);
  const [profiles, setProfiles] = useState<LayoutProfileMeta[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingServer, setEditingServer] = useState<ServerProfile | null>(null);
  const [formName, setFormName] = useState('');
  const [formHost, setFormHost] = useState('');
  const [formPort, setFormPort] = useState('');
  const [formProfileId, setFormProfileId] = useState<string | undefined>(undefined);
  const [helpModalVisible, setHelpModalVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadServers().then(setServers);
      loadProfiles().then(setProfiles);
    }, [])
  );

  const loadProfiles = async () => {
    return await listLayoutProfiles();
  };

  const openAdd = () => {
    setEditingServer(null);
    setFormName('');
    setFormHost('rlmud.org');
    setFormPort('5001');
    setFormProfileId(profiles.length > 0 ? profiles[0].id : undefined);
    setModalVisible(true);
  };

  const openEdit = (server: ServerProfile) => {
    setEditingServer(server);
    setFormName(server.name);
    setFormHost(server.host);
    setFormPort(String(server.port));
    setFormProfileId(server.layoutProfileId);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formHost.trim()) return;

    // For new servers, require a profile
    if (!editingServer && !formProfileId) return;

    const port = parseInt(formPort) || 5001;
    let updated: ServerProfile[];

    if (editingServer) {
      updated = servers.map(s =>
        s.id === editingServer.id
          ? {
              ...s,
              name: formName.trim(),
              host: formHost.trim(),
              port,
              // Keep existing layoutProfileId if updating, use formProfileId if it changed
              layoutProfileId: formProfileId || s.layoutProfileId
            }
          : s
      );
    } else {
      const newServer: ServerProfile = {
        id: generateId(),
        name: formName.trim(),
        host: formHost.trim(),
        port,
        layoutProfileId: formProfileId,
      };
      updated = [...servers, newServer];
    }

    setServers(updated);
    await saveServers(updated);
    setModalVisible(false);
  };

  const handleDelete = async (server: ServerProfile) => {
    const updated = servers.filter(s => s.id !== server.id);
    setServers(updated);
    await saveServers(updated);
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
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>TorchZhyla</Text>
            <Text style={styles.subtitle}>MUD Client</Text>
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={styles.helpBtn}
              onPress={() => setHelpModalVisible(true)}
            >
              <Text style={styles.helpIcon}>?</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.settingsBtn}
              onPress={() => navigation.navigate('Settings')}
            >
              <Text style={styles.settingsIcon}>⚙</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.contentContainer}>
        <FlatList
          data={servers}
          renderItem={renderServer}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No hay personajes. Pulsa + para crear uno.</Text>
          }
        />
      </View>

      <View style={styles.addButtonContainer}>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Text style={styles.addText}>+</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingServer ? 'Editar personaje' : 'Añadir personaje'}
            </Text>

            <Text style={styles.label}>Nombre</Text>
            <TextInput
              style={styles.modalInput}
              value={formName}
              onChangeText={setFormName}
              placeholder="Mi personaje"
              placeholderTextColor="#666"
            />

            <Text style={styles.label}>Host</Text>
            <TextInput
              style={styles.modalInput}
              value={formHost}
              onChangeText={setFormHost}
              placeholder="rlmud.org"
              placeholderTextColor="#666"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>Puerto</Text>
            <TextInput
              style={styles.modalInput}
              value={formPort}
              onChangeText={setFormPort}
              placeholder="5001"
              placeholderTextColor="#666"
              keyboardType="number-pad"
            />

            <Text style={styles.label}>Perfil de botones{editingServer ? ' (opcional)' : ' (requerido)'}</Text>
            {profiles.length === 0 ? (
              <View style={styles.noProfilesContainer}>
                <Text style={styles.noProfilesText}>
                  {editingServer
                    ? 'Sin perfiles disponibles. Crea uno en Ajustes para asignar.'
                    : 'Crea primero una configuración de botones en Ajustes'}
                </Text>
              </View>
            ) : (
              <ScrollView style={styles.profileSelector} scrollEnabled={profiles.length > 5}>
                {profiles.map(profile => (
                  <TouchableOpacity
                    key={profile.id}
                    style={[styles.profileOption, formProfileId === profile.id && styles.profileOptionSelected]}
                    onPress={() => setFormProfileId(profile.id)}
                  >
                    <Text style={[styles.profileOptionText, formProfileId === profile.id && styles.profileOptionTextSelected]}>
                      {profile.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, (!editingServer && profiles.length === 0) && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={!editingServer && profiles.length === 0}
              >
                <Text style={[styles.saveText, (!editingServer && profiles.length === 0) && styles.saveTextDisabled]}>
                  Guardar
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={helpModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setHelpModalVisible(false)}
      >
        <View style={styles.helpModalOverlay}>
          <TouchableOpacity
            style={styles.helpModalBackdrop}
            onPress={() => setHelpModalVisible(false)}
            activeOpacity={1}
          />
          <View style={styles.helpModalContent}>
            <Text style={styles.helpModalTitle}>Ayuda</Text>
            <ScrollView
              showsVerticalScrollIndicator={true}
              scrollEnabled={true}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
            >
              <Text style={styles.helpModalSectionTitle}>Conectar a un personaje</Text>
              <Text style={styles.helpModalText}>
                Pulsa el botón + para crear un nuevo personaje. Introduce el nombre del personaje, host y puerto. Selecciona un perfil de botones guardado. Luego pulsa en el personaje para conectar.
              </Text>

              <Text style={styles.helpModalSectionTitle}>Durante la partida</Text>
              <Text style={styles.helpModalText}>
                • Usa el input de comandos para enviar órdenes al MUD
                • Los canales (chat, grupo, bando) agrupan mensajes por tipo
                • La barra de vitalidad (HP y energía) se actualiza en tiempo real
                • Usa el mapa para visualizar el mundo
              </Text>

              <Text style={styles.helpModalSectionTitle}>Configuración</Text>
              <Text style={styles.helpModalText}>
                • Ajusta el tamaño de fuente del terminal
                • Activa los botones flotantes para una interfaz personalizable
                • En el editor de pantalla flotante, organiza botones, vitales y chat a tu gusto
                • Elige orientación vertical u horizontal para bloquear la rotación
              </Text>

              <Text style={styles.helpModalSectionTitle}>Macros y atajos</Text>
              <Text style={styles.helpModalText}>
                • Los botones F1-F10 permiten guardar comandos frecuentes
                • Pulsa largo en un botón para editar su comando
                • En modo flotante, crea botones personalizados con cualquier comando
              </Text>

              <Text style={styles.helpModalSectionTitle}>Canales</Text>
              <Text style={styles.helpModalText}>
                • Cada canal agrupa mensajes de un tipo específico
                • El canal "Todos" muestra mensajes de todos los canales
                • Activa "Gestionar canales" en configuración para usar pestañas
                • Pulsa largo en el nombre del canal para cambiar el alias que usas (ej: "ch" para "chat")
              </Text>

              <Text style={styles.helpModalSectionTitle}>Características ocultas y trucos</Text>
              <Text style={styles.helpModalText}>
                • Escribe "irsala" para ir a la sala de espera (útil para resetear)
                • En modo flotante, si pones "locate" en un botón, te localizará automáticamente en el mapa al pulsarlo
                • Pulsa en tu posición en el mapa para ver información de la sala
              </Text>

              <Text style={styles.helpModalSectionTitle}>Optimizaciones para el gameplay</Text>
              <Text style={styles.helpModalText}>
                • Usa botones F con comandos frecuentes para jugar más rápido
                • En modo flotante, crea botones para "ojear" y "irsala" para acceso rápido
                • Los alias de canales (ch, g, b) ahorran caracteres al escribir
                • Usa el input de comandos para cadenas largas, los botones para comandos cortos
              </Text>

              <Text style={styles.helpModalSectionTitle}>Solución de problemas</Text>
              <Text style={styles.helpModalText}>
                • Si el mapa no aparece, estás conectado a un servidor diferente (solo funciona en Reinos de Leyenda)
                • Si pierdes la conexión, reconecta desde la pantalla principal
                • El tamaño de fuente se aplica al terminal y los canales
                • Limpia la cache si hay problemas de visualización (desinstal y reinstala la app)
              </Text>
            <TouchableOpacity
              style={styles.helpModalCloseBtn}
              onPress={() => setHelpModalVisible(false)}
            >
              <Text style={styles.helpModalCloseBtnText}>Cerrar</Text>
            </TouchableOpacity>
            </ScrollView>
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
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingsBtn: {
    padding: 8,
  },
  settingsIcon: {
    fontSize: 24,
    color: '#666',
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
  contentContainer: {
    flex: 1,
  },
  addButtonContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: '#0a0a0a',
  },
  addBtn: {
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
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  helpBtn: {
    padding: 8,
  },
  helpIcon: {
    fontSize: 24,
    color: '#666',
    fontWeight: 'bold',
  },
  helpModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  helpModalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  helpModalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    maxHeight: '80%',
    width: '100%',
    maxWidth: 500,
    borderWidth: 1,
    borderColor: '#333',
    padding: 24,
  },
  helpModalScroll: {
    flex: 1,
  },
  helpModalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    fontFamily: 'monospace',
  },
  helpModalSectionTitle: {
    color: '#0c0',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 6,
    fontFamily: 'monospace',
  },
  helpModalText: {
    color: '#ccc',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
    fontFamily: 'monospace',
  },
  helpModalCloseBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: '#0c0',
    alignSelf: 'flex-end',
  },
  helpModalCloseBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  noProfilesContainer: {
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
  },
  noProfilesText: {
    color: '#cc3333',
    fontSize: 12,
    fontFamily: 'monospace',
    fontStyle: 'italic',
  },
  profileSelector: {
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 6,
    maxHeight: 150,
    marginBottom: 12,
  },
  profileOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  profileOptionSelected: {
    backgroundColor: '#0a3a0a',
    borderLeftWidth: 3,
    borderLeftColor: '#0c0',
  },
  profileOptionText: {
    color: '#999',
    fontSize: 14,
    fontFamily: 'monospace',
  },
  profileOptionTextSelected: {
    color: '#0c0',
    fontWeight: 'bold',
  },
  saveBtnDisabled: {
    backgroundColor: '#333',
    opacity: 0.5,
  },
  saveTextDisabled: {
    color: '#666',
  },
});
