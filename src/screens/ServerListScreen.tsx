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
import { loadSettings, saveSettings } from '../storage/settingsStorage';

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
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [helpModalVisible, setHelpModalVisible] = useState(false);
  const [welcomeModalVisible, setWelcomeModalVisible] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(true);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const [loadedServers, settings] = await Promise.all([loadServers(), loadSettings()]);
        setServers(loadedServers);
        setOnboardingDone(settings.onboardingDone);
        if (!settings.onboardingDone) {
          setWelcomeModalVisible(true);
        }
      })();
    }, [])
  );

  const handleSelectMode = async (mode: 'completo' | 'blind') => {
    const current = await loadSettings();
    await saveSettings({ ...current, uiMode: mode, onboardingDone: true });
    setOnboardingDone(true);
    setWelcomeModalVisible(false);
  };

  const openAdd = () => {
    setEditingServer(null);
    setFormName('');
    setFormHost('rlmud.org');
    setFormPort('5001');
    setFormUsername('');
    setFormPassword('');
    setModalVisible(true);
  };

  const openEdit = (server: ServerProfile) => {
    setEditingServer(server);
    setFormName(server.name);
    setFormHost(server.host);
    setFormPort(String(server.port));
    setFormUsername(server.username || '');
    setFormPassword(server.password || '');
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formHost.trim()) return;

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
              username: formUsername.trim() || undefined,
              password: formPassword.trim() || undefined,
            }
          : s
      );
    } else {
      const newServer: ServerProfile = {
        id: generateId(),
        name: formName.trim(),
        host: formHost.trim(),
        port,
        username: formUsername.trim() || undefined,
        password: formPassword.trim() || undefined,
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

  const handleDuplicate = async (server: ServerProfile) => {
    const newServer: ServerProfile = {
      ...server,
      id: generateId(),
      name: `${server.name} (copia)`,
    };
    const updated = [...servers, newServer];
    setServers(updated);
    await saveServers(updated);
  };

  const renderServer = ({ item }: { item: ServerProfile }) => {
    const isConfigured = !!item.buttonLayout;
    return (
      <TouchableOpacity
        style={styles.serverCard}
        onPress={() => navigation.navigate('Terminal', { server: item })}
        onLongPress={() => openEdit(item)}
        accessible={true}
        accessibilityLabel={`${item.name} server`}
        accessibilityHint={`Connects to ${item.host}:${item.port}. Double tap to connect, long press to edit`}
      >
        <View style={styles.serverInfo}>
          <Text style={styles.serverName}>{item.name}</Text>
          <Text style={styles.serverHost}>{item.host}:{item.port}</Text>
        </View>
        <View style={styles.serverActions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.editBtn]}
            onPress={() => openEdit(item)}
            accessible={true}
            accessibilityLabel="Edit"
            accessibilityRole="button"
            accessibilityHint={`Edit ${item.name} server settings`}
          >
            <Text style={[styles.actionBtnText, styles.editBtnText]}>✎</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.duplicateBtn]}
            onPress={() => handleDuplicate(item)}
            accessible={true}
            accessibilityLabel="Duplicate"
            accessibilityRole="button"
            accessibilityHint={`Create a copy of ${item.name}`}
          >
            <Text style={[styles.actionBtnText, styles.duplicateBtnText]}>⬚</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.deleteBtn]}
            onPress={() => handleDelete(item)}
            accessible={true}
            accessibilityLabel="Delete"
            accessibilityRole="button"
            accessibilityHint={`Delete ${item.name} server`}
          >
            <Text style={[styles.actionBtnText, styles.deleteBtnText]}>✕</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

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
              accessible={true}
              accessibilityLabel="Help"
              accessibilityRole="button"
              accessibilityHint="Open help information"
            >
              <Text style={styles.helpIcon}>?</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.settingsBtn}
              onPress={() => navigation.navigate('Settings')}
              accessible={true}
              accessibilityLabel="Settings"
              accessibilityRole="button"
              accessibilityHint="Open application settings"
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
        <TouchableOpacity
          style={[styles.addBtn, !onboardingDone && { opacity: 0.4 }]}
          onPress={onboardingDone ? openAdd : () => setWelcomeModalVisible(true)}
          accessible={true}
          accessibilityLabel="Añadir servidor"
          accessibilityRole="button"
          accessibilityHint={onboardingDone ? "Crear un nuevo perfil de servidor" : "Primero debes elegir el modo de interfaz"}
        >
          <Text style={styles.addText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Welcome / Onboarding Modal */}
      <Modal
        visible={welcomeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>¡Bienvenido a TorchZhyla!</Text>
            <Text style={[styles.label, { marginBottom: 20, lineHeight: 20 }]}>
              ¿Cómo vas a usar la app? Elige el modo de interfaz:
            </Text>

            <TouchableOpacity
              style={styles.modeOptionBtn}
              onPress={() => handleSelectMode('completo')}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Modo Completo"
              accessibilityHint="Interfaz visual con mapa, barras de vida y botones"
            >
              <Text style={styles.modeOptionTitle}>🖥 Modo Completo</Text>
              <Text style={styles.modeOptionDesc}>Interfaz visual con mapa, barras de vida y botones</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeOptionBtn, { marginTop: 12 }]}
              onPress={() => handleSelectMode('blind')}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Blind Mode"
              accessibilityHint="Interfaz accesible optimizada para lector de pantalla"
            >
              <Text style={styles.modeOptionTitle}>👁 Blind Mode</Text>
              <Text style={styles.modeOptionDesc}>Interfaz accesible optimizada para lector de pantalla</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
              accessible={true}
              accessibilityLabel="Nombre del servidor"
              accessibilityHint="Ingresa un nombre para este servidor"
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
              accessible={true}
              accessibilityLabel="Host del servidor"
              accessibilityHint="Ingresa el nombre del servidor o dirección IP"
            />

            <Text style={styles.label}>Puerto</Text>
            <TextInput
              style={styles.modalInput}
              value={formPort}
              onChangeText={setFormPort}
              placeholder="5001"
              placeholderTextColor="#666"
              keyboardType="number-pad"
              accessible={true}
              accessibilityLabel="Puerto del servidor"
              accessibilityHint="Ingresa el número de puerto"
            />

            <Text style={[styles.label, { marginTop: 16 }]}>Personaje (opcional)</Text>
            <TextInput
              style={styles.modalInput}
              value={formUsername}
              onChangeText={setFormUsername}
              placeholder="Tu personaje"
              placeholderTextColor="#666"
              autoCapitalize="none"
              autoCorrect={false}
              accessible={true}
              accessibilityLabel="Personaje del servidor"
              accessibilityHint="Ingresa tu personaje para auto-login"
            />

            <Text style={styles.label}>Contraseña (opcional)</Text>
            <TextInput
              style={styles.modalInput}
              value={formPassword}
              onChangeText={setFormPassword}
              placeholder="Tu contraseña"
              placeholderTextColor="#666"
              secureTextEntry={true}
              autoCapitalize="none"
              autoCorrect={false}
              accessible={true}
              accessibilityLabel="Contraseña del servidor"
              accessibilityHint="Ingresa tu contraseña para auto-login"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
                accessible={true}
                accessibilityLabel="Cancelar"
                accessibilityRole="button"
                accessibilityHint="Cierra sin guardar"
              >
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSave}
                accessible={true}
                accessibilityLabel="Guardar"
                accessibilityRole="button"
                accessibilityHint="Guarda la configuración del servidor"
              >
                <Text style={styles.saveText}>Guardar</Text>
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
                Pulsa el botón + para crear un nuevo personaje. Introduce el nombre del personaje, host y puerto. Luego pulsa en el personaje para conectar.
              </Text>
              <Text style={styles.helpModalText}>
                En la lista de personajes:
                • ✎ (verde) - Editar los datos del personaje
                • ⬚ (azul) - Duplicar el personaje
                • ✕ (rojo) - Eliminar el personaje
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
                • Ajusta el tamaño de fuente del terminal (se aplica automáticamente cuando vuelves al juego)
                • El tamaño afecta tanto al terminal como a los canales de chat
                • Activa los botones flotantes para una interfaz personalizable
                • En el editor de pantalla flotante, organiza botones, vitales y chat a tu gusto
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
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editBtn: {
    backgroundColor: '#0a3a0a',
  },
  duplicateBtn: {
    backgroundColor: '#0a2a3a',
  },
  deleteBtn: {
    backgroundColor: '#3a0a0a',
  },
  actionBtnText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  editBtnText: {
    color: '#0c0',
  },
  duplicateBtnText: {
    color: '#0099ff',
  },
  deleteBtnText: {
    color: '#cc3333',
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
  modeOptionBtn: {
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 10,
    padding: 16,
  },
  modeOptionTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  modeOptionDesc: {
    color: '#888',
    fontSize: 12,
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
  profileOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  profileEditBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileEditBtnText: {
    color: '#0c0',
    fontSize: 16,
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
