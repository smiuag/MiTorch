import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, ServerProfile } from '../types';
import { loadServers, saveServers } from '../storage/serverStorage';
import { loadSettings, saveSettings } from '../storage/settingsStorage';
import { loadServerLayout, saveServerLayout } from '../storage/layoutStorage';
import { autoAssignNewCharacterToPacks } from '../storage/triggerStorage';
import { activeConnection } from '../services/activeConnection';
import { CANONICAL_PROMPT } from '../services/promptParser';

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

  const nameInputRef = useRef<TextInput>(null);
  const usernameInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);

  const insets = useSafeAreaInsets();
  const overlayInsetStyle = {
    paddingTop: 20 + insets.top,
    paddingBottom: 20 + insets.bottom,
    paddingLeft: 20 + insets.left,
    paddingRight: 20 + insets.right,
  };

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
    let createdServerId: string | null = null;

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
      createdServerId = newServer.id;
    }

    setServers(updated);
    await saveServers(updated);
    if (createdServerId) {
      try {
        await autoAssignNewCharacterToPacks(createdServerId);
      } catch (e) {
        console.warn('[ServerList] autoAssignNewCharacterToPacks failed:', e);
      }
    }
    setModalVisible(false);
  };

  const handleDelete = async (server: ServerProfile) => {
    const updated = servers.filter(s => s.id !== server.id);
    setServers(updated);
    await saveServers(updated);
  };

  const handleApplyPrompt = (server: ServerProfile) => {
    if (!activeConnection.isConnectedTo(server.id)) {
      Alert.alert(
        'No estás conectado',
        'Conéctate primero a este personaje desde la lista, vuelve a abrir la edición y entonces podrás aplicar el prompt.',
      );
      return;
    }
    Alert.alert(
      'Aplicar prompt TorchZhyla',
      'Esto sobrescribirá tu prompt actual en el MUD para este personaje. Es necesario para que las variables (vida, energía, salidas, ...) se capturen correctamente y puedan usarse en triggers. ¿Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aplicar',
          onPress: () => {
            const ok =
              activeConnection.send(server.id, `prompt ${CANONICAL_PROMPT}`) &&
              activeConnection.send(server.id, `promptcombate ${CANONICAL_PROMPT}`);
            if (ok) {
              Alert.alert('Prompt aplicado', 'El MUD recibió el nuevo prompt. A partir de ahora capturaremos las variables.');
            } else {
              Alert.alert('No se pudo enviar', 'La conexión se ha perdido. Reconéctate y vuelve a intentarlo.');
            }
          },
        },
      ],
    );
  };

  const handleDuplicate = async (server: ServerProfile) => {
    const newServer: ServerProfile = {
      ...server,
      id: generateId(),
      name: `${server.name} (copia)`,
    };
    const originalLayout = await loadServerLayout(server.id);
    await saveServerLayout(newServer.id, originalLayout);
    const updated = [...servers, newServer];
    setServers(updated);
    await saveServers(updated);
    try {
      await autoAssignNewCharacterToPacks(newServer.id);
    } catch (e) {
      console.warn('[ServerList] autoAssignNewCharacterToPacks failed:', e);
    }
  };

  const renderServer = ({ item }: { item: ServerProfile }) => {
    return (
      <TouchableOpacity
        style={styles.serverCard}
        onPress={() => navigation.navigate('Terminal', { server: item })}
        onLongPress={() => openEdit(item)}
        accessible={true}
        accessibilityLabel={`${item.name} personaje`}
        accessibilityHint={`Conecta a ${item.host}:${item.port}. Doble tap para conectar, pulsa largo para editar`}
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
            accessibilityLabel="Editar"
            accessibilityRole="button"
            accessibilityHint={`Editar configuración del personaje ${item.name}`}
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
            accessibilityLabel="Eliminar"
            accessibilityRole="button"
            accessibilityHint={`Eliminar personaje ${item.name}`}
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
          accessibilityLabel="Añadir personaje"
          accessibilityRole="button"
          accessibilityHint={onboardingDone ? "Crear un nuevo personaje" : "Primero debes elegir el modo de interfaz"}
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
        <View style={[styles.modalOverlay, overlayInsetStyle]}>
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
              accessibilityLabel="Modo Normal"
              accessibilityHint="Interfaz visual con mapa, barras de vida y botones"
            >
              <Text style={styles.modeOptionTitle}>🖥 Modo Normal</Text>
              <Text style={styles.modeOptionDesc}>Interfaz visual con mapa, barras de vida y botones</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeOptionBtn, { marginTop: 12 }]}
              onPress={() => handleSelectMode('blind')}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Modo Accesible"
              accessibilityHint="Interfaz accesible optimizada para lector de pantalla"
            >
              <Text style={styles.modeOptionTitle}>👁 Modo Accesible</Text>
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
        <View style={[styles.modalOverlay, overlayInsetStyle]}>
          <View style={styles.modalContent}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
            <Text style={styles.modalTitle}>
              {editingServer ? 'Editar personaje' : 'Añadir personaje'}
            </Text>

            <Text style={styles.label}>Nombre del perfil</Text>
            <TextInput
              style={styles.modalInput}
              value={formName}
              onChangeText={setFormName}
              placeholder="Mi personaje"
              placeholderTextColor="#666"
              returnKeyType="next"
              onSubmitEditing={() => usernameInputRef.current?.focus()}
              autoFocus={true}
              accessible={true}
              accessibilityLabel="Nombre del perfil"
              accessibilityHint="Ingresa un nombre para este perfil"
              ref={nameInputRef}
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
              returnKeyType="next"
              onSubmitEditing={() => passwordInputRef.current?.focus()}
              ref={usernameInputRef}
              accessible={true}
              accessibilityLabel="Nombre del personaje"
              accessibilityHint="Ingresa tu nombre de personaje para auto-login"
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
              returnKeyType="done"
              ref={passwordInputRef}
              accessible={true}
              accessibilityLabel="Contraseña"
              accessibilityHint="Ingresa tu contraseña para auto-login"
            />

            {editingServer && (
              <>
                <Text style={[styles.label, { marginTop: 20 }]}>Triggers</Text>
                <TouchableOpacity
                  style={styles.applyPromptBtn}
                  onPress={() => handleApplyPrompt(editingServer)}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel="Aplicar prompt TorchZhyla"
                  accessibilityHint="Configura el prompt del MUD para que las variables se capturen y puedan usarse en triggers. Solo funciona si estás conectado a este personaje."
                >
                  <Text style={styles.applyPromptBtnText}>Aplicar prompt TorchZhyla</Text>
                  <Text style={styles.applyPromptBtnHint}>
                    Configura el prompt del MUD para capturar variables (vida, energía, salidas…). Necesario si vas a usar triggers de variable.
                  </Text>
                </TouchableOpacity>
              </>
            )}

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
                accessibilityHint="Guarda la configuración del personaje"
              >
                <Text style={styles.saveText}>Guardar</Text>
              </TouchableOpacity>
            </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={helpModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setHelpModalVisible(false)}
      >
        <View style={[styles.helpModalOverlay, overlayInsetStyle]}>
          <TouchableOpacity
            style={styles.helpModalBackdrop}
            onPress={() => setHelpModalVisible(false)}
            activeOpacity={1}
          />
          <View style={styles.helpModalContent}>
            <Text style={styles.helpModalTitle}>Ayuda</Text>
            <ScrollView
              style={styles.helpModalScroll}
              contentContainerStyle={styles.helpModalScrollContent}
              showsVerticalScrollIndicator={true}
              scrollEnabled={true}
            >
              <Text style={styles.helpModalSectionTitle}>Conectar a un personaje</Text>
              <Text style={styles.helpModalText}>
                Pulsa el botón + para crear un nuevo personaje. Introduce nombre, host y puerto. Luego pulsa en el personaje para conectar.
              </Text>
              <Text style={styles.helpModalText}>
                En la lista de personajes:{'\n'}
                • ✎ (verde) — Editar datos{'\n'}
                • ⬚ (azul) — Duplicar{'\n'}
                • ✕ (rojo) — Eliminar
              </Text>

              <Text style={styles.helpModalSectionTitle}>Durante la partida</Text>
              <Text style={styles.helpModalText}>
                • Input inferior para enviar órdenes al MUD.{'\n'}
                • Botones del grid para comandos rápidos (edita con pulsación larga o con el botón ✎).{'\n'}
                • Barra de vitales (HP / energía / acciones) se actualiza desde el prompt del MUD.{'\n'}
                • Mini-mapa muestra tu sala y vecinas. Tap en una sala dispara auto-walk.{'\n'}
                • Botón 🔊 / 🔇 silencia todos los sonidos de triggers (kill-switch global).{'\n'}
                • Botón 🎵 activa/desactiva la música ambiente.
              </Text>

              <Text style={styles.helpModalSectionTitle}>Auto-walk</Text>
              <Text style={styles.helpModalText}>
                • `irsala &lt;nombre&gt;` busca una sala y te lleva andando paso a paso.{'\n'}
                • `sigilarsala &lt;nombre&gt;` igual pero sigilando cada paso.{'\n'}
                • `locate` te localiza tras una desincronización del mapa.{'\n'}
                • Tap en una sala del mapa también dispara auto-walk.{'\n'}
                • `parar` o `stop` cancelan en cualquier momento.{'\n'}
                • Si tecleas un comando de movimiento manual (norte, sur, sigilar...) mientras camina, el auto-walk se cancela. Otros comandos (chat, atacar, ojear...) NO interrumpen.
              </Text>

              <Text style={styles.helpModalSectionTitle}>Plantillas de triggers</Text>
              <Text style={styles.helpModalText}>
                Settings → Triggers. Una plantilla agrupa N triggers que se asignan a uno o varios personajes.
              </Text>
              <Text style={styles.helpModalText}>
                Cada trigger tiene un patrón (regex o cajas visuales) que dispara una o varias acciones cuando una línea del MUD lo matchea:{'\n'}
                • gag — silencia la línea.{'\n'}
                • color — pinta la línea.{'\n'}
                • replace — sustituye texto.{'\n'}
                • play_sound — reproduce un wav (con pan estéreo opcional).{'\n'}
                • send — manda un comando al MUD.{'\n'}
                • notify — notificación de Android.{'\n'}
                • floating — mensaje flotante en pantalla.{'\n'}
                • set_var — guarda en una variable de usuario.
              </Text>
              <Text style={styles.helpModalText}>
                Orden importa: dentro de una plantilla, primero matchea el de arriba. Triggers "no bloqueantes" pueden encadenar varios efectos sobre la misma línea.
              </Text>

              <Text style={styles.helpModalSectionTitle}>Mis variables</Text>
              <Text style={styles.helpModalText}>
                Settings → Mis variables. Variables personalizadas que rellenas desde acciones `set_var` y consumes con `${'${nombre}'}` en otros triggers, en botones del grid, o en patrones (con `${'${nombre:raw}'}` para inyectar como regex). Útil para guardar último objetivo, última dirección, lista pipe-separated de enemigos (`nick_x`), etc.
              </Text>

              <Text style={styles.helpModalSectionTitle}>Mis sonidos</Text>
              <Text style={styles.helpModalText}>
                Settings → Mis sonidos. Sube wavs / mp3 / ogg desde el móvil. Disponibles en cualquier `play_sound` de trigger y en cualquier slot de Mis ambientes.
              </Text>

              <Text style={styles.helpModalSectionTitle}>Mis ambientes</Text>
              <Text style={styles.helpModalText}>
                Settings → Mis ambientes. Música de fondo en bucle que cambia con el tipo de sala (bosque, ciudad, subterráneo, mar, etc.). 18 categorías; asignas 1-4 sonidos a cada una. Al entrar en una sala se elige uno al azar y se hace crossfade desde el anterior. También controla volúmenes de música ambiente y de efectos (triggers).
              </Text>

              <Text style={styles.helpModalSectionTitle}>Importar / exportar configuración</Text>
              <Text style={styles.helpModalText}>
                Settings → Importar / exportar configuración. Genera un único ZIP que contiene plantillas de triggers, mappings de ambiente y los sonidos personalizados que usen. Útil para mover el setup a otro móvil o compartirlo. NO incluye servidores, layouts de botones ni settings de la app.
              </Text>
              <Text style={styles.helpModalText}>
                El ZIP se importa por la misma pantalla. Las plantillas se añaden, los mappings de ambiente que vengan en el ZIP sustituyen los actuales (los demás se conservan).
              </Text>

              <Text style={styles.helpModalSectionTitle}>Pack Movimiento (con pan estéreo)</Text>
              <Text style={styles.helpModalText}>
                Si has importado el pack "Movimiento", para que distinga aliados de enemigos teclea en el MUD: `nick x nombre1 nombre2 ...` con los nombres a marcar como enemigos. La lista persiste server-side y los triggers la leen automáticamente. Sin nick x, todos suenan como aliados. Cada dirección suena con pan estéreo distinto (este → derecha, oeste → izquierda, etc.).
              </Text>

              <Text style={styles.helpModalSectionTitle}>Modo blind (accesibilidad)</Text>
              <Text style={styles.helpModalText}>
                Settings → "Modo de interfaz" → "Blind". Pensado para usar con TalkBack. La interfaz se simplifica a paneles de botones con acción primaria (doble tap) y secundaria (swipe up/down via TalkBack). Sin gestos visuales — TalkBack los consume.
              </Text>
              <Text style={styles.helpModalText}>
                Cola de lectura propia que evita que TalkBack pise mensajes (ajustable en "Velocidad de lectura"). Canales se anuncian a una y se loguean al terminal para revisión posterior. Los modales y toggles tienen `accessibilityLabel` específicos.
              </Text>

              <Text style={styles.helpModalSectionTitle}>Logs para soporte</Text>
              <Text style={styles.helpModalText}>
                Settings → Logs. Captura toda la actividad del terminal a un archivo HTML que puedes compartir con soporte o subir a deathlogs.com (si juegas en Reinos de Leyenda). Off por defecto. Se borra inmediatamente al desactivar (privacidad). La contraseña del auto-login NUNCA se loguea; el resto sí (host, username, nicks de otros).
              </Text>

              <Text style={styles.helpModalSectionTitle}>Macros y atajos</Text>
              <Text style={styles.helpModalText}>
                • Botones del grid (Settings → Layout) ejecutan comandos al pulsar.{'\n'}
                • Pulsación larga edita el botón.{'\n'}
                • Cada botón puede ser tipo "Comando" (manda al MUD) o "Aviso" (muestra un mensaje flotante).{'\n'}
                • Comandos y avisos admiten variables: `Vida: ${'${vida}'}/${'${vida_max}'}`.{'\n'}
                • Separa varios comandos con `;;` para mandarlos en secuencia: `desenvainar espada ;; atacar goblin`.{'\n'}
                • Modo blind: dos paneles separados con switch (acción primaria del botón switch).
              </Text>

              <Text style={styles.helpModalSectionTitle}>Canales</Text>
              <Text style={styles.helpModalText}>
                • Cada canal agrupa los mensajes de un tipo (chat, bando, grupo, etc.).{'\n'}
                • El canal "Todos" los mezcla.{'\n'}
                • Pulsación larga en el nombre del canal cambia el alias que usas para hablar (ej. "ch" para "chat").{'\n'}
                • En blind mode los canales se loguean al terminal pero NO se anuncian (decisión de doctrina, anula ruido).
              </Text>

              <Text style={styles.helpModalSectionTitle}>Trucos</Text>
              <Text style={styles.helpModalText}>
                • Botones "Aviso" con `${'${vida}'}/${'${vida_max}'}` reemplazan al viejo "consultar vida".{'\n'}
                • `nick x` para fijar enemigos del pack Movimiento.{'\n'}
                • Pulsa en una sala del mapa para auto-caminar.{'\n'}
                • Triple tap o swipe (modo completo) — gestos configurables en Settings.{'\n'}
                • Pulsa el botón ? de esta lista en cualquier momento para volver a esta ayuda.
              </Text>

              <Text style={styles.helpModalSectionTitle}>Solución de problemas</Text>
              <Text style={styles.helpModalText}>
                • Mapa no aparece: estás conectado a un MUD distinto de Reinos de Leyenda.{'\n'}
                • Música ambiente no suena: comprueba que el botón 🎵 está ON, que tienes wavs asignados en Mis ambientes, y que el mini-mapa te localiza (sin sala, no hay categoría que reproducir).{'\n'}
                • Triggers no disparan: asigna la plantilla a tu personaje en Settings → Triggers → entrar a la plantilla → "Personajes asignados".{'\n'}
                • Toggle de Settings se ve ON pero no funciona: cierra y abre el modal — los settings se sincronizan al cerrarlo.{'\n'}
                • Si pierdes conexión, reconecta desde la pantalla principal.
              </Text>
            </ScrollView>
            <TouchableOpacity
              style={styles.helpModalCloseBtn}
              onPress={() => setHelpModalVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Cerrar ayuda"
            >
              <Text style={styles.helpModalCloseBtnText}>Cerrar</Text>
            </TouchableOpacity>
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
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: '#333',
    maxHeight: '90%',
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
    maxHeight: '90%',
    width: '100%',
    maxWidth: 500,
    borderWidth: 1,
    borderColor: '#333',
    padding: 24,
    // flexShrink permite que el modal respete el maxHeight cuando el
    // contenido del ScrollView es muy largo. Sin esto el contenedor
    // crece más allá del 90% y la última sección se pierde por debajo
    // de la pantalla.
    flexShrink: 1,
  },
  helpModalScroll: {
    // flexShrink/flexGrow:1 = ocupa todo el espacio disponible entre el
    // título arriba y el botón Cerrar abajo, pero NO crece más que el
    // contenedor. Es lo que activa el scroll real.
    flexGrow: 1,
    flexShrink: 1,
  },
  helpModalScrollContent: {
    paddingBottom: 12,
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
    // marginTop:12 lo separa visualmente del último ítem del ScrollView.
    // Vive FUERA del ScrollView para que siempre esté visible al final
    // del modal, no se vaya con el scroll.
    marginTop: 12,
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
  applyPromptBtn: {
    backgroundColor: '#0a2a3a',
    borderWidth: 1,
    borderColor: '#0099ff',
    borderRadius: 6,
    padding: 12,
    marginTop: 4,
  },
  applyPromptBtnText: {
    color: '#0099ff',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  applyPromptBtnHint: {
    color: '#888',
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 4,
    lineHeight: 14,
  },
});
