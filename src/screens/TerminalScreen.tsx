import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  TextInput,
  useWindowDimensions,
  Modal,
  Alert,
  PanResponder,
  Dimensions,
  AppState,
  Keyboard,
  BackHandler,
  Pressable,
  AccessibilityInfo,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { startBackgroundConnection, stopBackgroundConnection } from '../services/foregroundService';
import TorchZhylaForeground, { addWalkStepListener, addWalkDoneListener } from '../../modules/torchzhyla-foreground';
import { fireNotification, stripAnsi } from '../services/notificationService';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, MudLine, GestureConfig, GestureType, GestureAction } from '../types';
import { TelnetService, TelnetEventHandler } from '../services/telnetService';
import { parseAnsi } from '../utils/ansiParser';
import { AnsiText } from '../components/AnsiText';
import { MiniMap, MiniMapHandle } from '../components/MiniMap';
import { VitalBars } from '../components/VitalBars';
import { ButtonGrid, GRID_COLS, GRID_ROWS } from '../components/ButtonGrid';
import { ButtonEditModal } from '../components/ButtonEditModal';
import { BlindButtonEditModal } from '../components/BlindButtonEditModal';
import { PanelManagementModal } from '../components/PanelManagementModal';
import { RoomSearchResults } from '../components/RoomSearchResults';
import { loadSettings } from '../storage/settingsStorage';
import { MapService, MapRoom } from '../services/mapService';
import { loadMapContent } from '../storage/mapLibraryStorage';
import { ButtonLayout, LayoutButton, createDefaultLayout, createBlindModeLayout, createCustomLayout, createPanelButtons, loadLayout, saveLayout, loadServerLayout, saveServerLayout } from '../storage/layoutStorage';
import { loadServers, saveServers } from '../storage/serverStorage';
import { getTriggersForServer, loadPacks } from '../storage/triggerStorage';
import { collectVarsReferencedByPacks } from '../utils/userVariablesUsage';
import { triggerEngine } from '../services/triggerEngine';
import { blindModeService } from '../services/blindModeService';
import { logService } from '../services/logService';
import { playerStatsService } from '../services/playerStatsService';
import { promptParser } from '../services/promptParser';
import { userVariablesService } from '../services/userVariablesService';
import { speechQueue } from '../services/speechQueueService';
import { selfVoicingPress, buttonRegistry } from '../utils/selfVoicingPress';
import { SelfVoicingTouchable } from '../components/SelfVoicingControls';
import { announceTyping } from '../utils/typingAnnounce';
import { ambientPlayer } from '../services/ambientPlayer';
import { categorizeRoom } from '../services/roomCategorizer';
import { expandVars } from '../utils/expandVars';
import { activeConnection } from '../services/activeConnection';
import { useSounds } from '../contexts/SoundContext';
import { useFloatingMessages } from '../contexts/FloatingMessagesContext';
import { FloatingMessages } from '../components/FloatingMessages';
import { NORMAL_MODE, BLIND_MODE, getCustomDisplayDimensions } from '../config/gridConfig';
import { BlindChannelModal, ChannelMessage, nextMsgId } from '../components/BlindChannelModal';
import { loadChannelAliases, saveChannelAliases, loadChannelOrder, saveChannelOrder } from '../storage/channelStorage';
import { loadNicks, recordNickSeen, filterNicks } from '../storage/nickStorage';
import { NickAutocomplete } from '../components/NickAutocomplete';
import { GesturePickerModal } from '../components/GesturePickerModal';
import { resolvePickOptions, pickActionTitle, parseTellSender, pushRecentTell } from '../utils/gesturePickSources';
import { loadRecentTells, saveRecentTells } from '../storage/recentTellsStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'Terminal'>;

const MAX_LINES = 2000;
let lineIdCounter = 0;

// Lista de "primeros tokens" que se consideran movimiento del usuario.
// Si el jugador escribe uno de estos mientras está activo un auto-walk,
// el walk se cancela porque el usuario está tomando control manual de
// la dirección. Cualquier otro comando (chat, atacar, ojear, mirar...)
// se envía al MUD pero NO interrumpe el walk en curso.
//
// Mantén la lista en lowercase y sin tildes — la comparación se hace
// sobre `command.trim().toLowerCase().split()[0]`.
const MOVEMENT_FIRST_WORDS = new Set<string>([
  // Direcciones cortas
  'n', 's', 'e', 'w', 'o',
  'ne', 'nw', 'no', 'se', 'sw', 'so',
  'ar', 'ab', 'de', 'fu',
  // Direcciones largas
  'norte', 'sur', 'este', 'oeste',
  'noreste', 'noroeste', 'sudeste', 'sudoeste', 'sureste', 'suroeste',
  'arriba', 'abajo', 'dentro', 'fuera',
  // Direcciones de terreno especial (cuevas, grietas, huecos)
  'hueco', 'grieta', 'cubil',
  // Verbos de movimiento que toman una dirección como argumento
  'sigilar', 'escabullir', 'correr', 'huir', 'saltar',
]);

export function TerminalScreen({ route, navigation }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { playSound } = useSounds();
  const { push: pushFloating } = useFloatingMessages();
  const { server: initialServer } = route.params;

  const [server, setServer] = useState(initialServer);
  const [lines, setLines] = useState<MudLine[]>([]);
  const [inputText, setInputText] = useState('');
  // Estado del GesturePickerModal. Se abre desde `triggerGesture` cuando un
  // gesto tiene action.kind==='pick'. `onPick` se construye al abrir
  // capturando prefix/suffix/autoSend del gesto en cierre.
  const [gesturePickerState, setGesturePickerState] = useState<{
    visible: boolean;
    title: string;
    options: string[];
    onPick: (option: string) => void;
  }>({ visible: false, title: '', options: [], onPick: () => {} });
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [keepAwakeEnabled, setKeepAwakeEnabled] = useState(true);
  const [backgroundConnectionEnabled, setBackgroundConnectionEnabled] = useState(true);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [mapVisible, setMapVisible] = useState(true);
  const [currentRoom, setCurrentRoom] = useState<MapRoom | null>(null);
  const [hp, setHp] = useState(0);
  const [hpMax, setHpMax] = useState(0);
  const [energy, setEnergy] = useState(0);
  const [energyMax, setEnergyMax] = useState(0);
  const [searchResults, setSearchResults] = useState<MapRoom[]>([]);
  const [searchVisible, setSearchVisible] = useState(false);
  const [previewRoomId, setPreviewRoomId] = useState<number | null>(null);
  const [walking, setWalking] = useState(false);
  const [selectionAnchorId, setSelectionAnchorId] = useState<number | null>(null);
  const [selectionTargetId, setSelectionTargetId] = useState<number | null>(null);
  const [fontSize, setFontSize] = useState(14);
  const [uiMode, setUiMode] = useState<'completo' | 'blind'>('completo');
  // Self-voicing en blind: TTS propio + esconder árbol de TalkBack +
  // habilitar gestos del PanResponder en el área del terminal. Solo tiene
  // efecto cuando `uiMode === 'blind'`. Usuario debe desactivar TalkBack a
  // mano (atajo OS); la app no puede hacerlo. Ver SELFVOICING.md.
  const [useSelfVoicing, setUseSelfVoicing] = useState(false);
  // Estado runtime: TalkBack/lector de pantalla activo en el OS. Se usa
  // SOLO para mostrar un banner de aviso cuando el usuario está en
  // self-voicing pero olvidó desactivar TalkBack — en ese estado los
  // gestos no llegan a la app y la voz se solapa. Se actualiza vía
  // AccessibilityInfo events en useEffect más abajo.
  const [screenReaderOn, setScreenReaderOn] = useState(false);
  const [encoding, setEncoding] = useState('utf8');
  // Active cuando estamos en blind y el usuario activó self-voicing. En este
  // estado: hide del árbol de TalkBack, doble-tap para activar, gestos
  // libres del PanResponder, long-press del terminal abre editor de gestos.
  const selfVoicingActive = uiMode === 'blind' && useSelfVoicing;
  // Los gestos del área del terminal disparan en modo completo SIEMPRE; en
  // blind solo si self-voicing está on (sin TalkBack interceptando).
  const gesturesAvailable = uiMode === 'completo' || selfVoicingActive;
  const [buttonLayout, setButtonLayout] = useState<ButtonLayout | null>(null);
  const [editButtonVisible, setEditButtonVisible] = useState(false);
  const [panelManagementVisible, setPanelManagementVisible] = useState(false);
  const [editButtonCol, setEditButtonCol] = useState(0);
  const [editButtonRow, setEditButtonRow] = useState(0);
  const [moveMode, setMoveMode] = useState(false);
  const [sourceCol, setSourceCol] = useState(0);
  const [sourceRow, setSourceRow] = useState(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1);
  // Toggles dual: el `global*` es el setting persistido (Settings → "Usar
  // sonidos" y Mis ambientes → "Música ambiente"); el `silentModeEnabled`/
  // `ambientEnabled` es override de SESIÓN solo dentro del Terminal —
  // arranca en su valor "ON" y se descarta al desmontar el componente.
  // El botón en TerminalScreen solo se renderiza cuando el global está ON;
  // si está OFF hay que ir a Settings para activarlo. Cuando el global pasa
  // OFF→ON (al volver de Settings), el override de sesión se resetea a ON.
  const [globalSoundsEnabled, setGlobalSoundsEnabled] = useState(true);
  const [globalAmbientEnabled, setGlobalAmbientEnabled] = useState(true);
  const [silentModeEnabled, setSilentModeEnabled] = useState(false);
  const [ambientEnabled, setAmbientEnabled] = useState(true);
  const [isAppActive, setIsAppActive] = useState(true);
  const [loginFailed, setLoginFailed] = useState(false);
  const [channels, setChannels] = useState<string[]>([]);
  const [channelMessages, setChannelMessages] = useState<ChannelMessage[]>([]);
  const [channelAliases, setChannelAliases] = useState<Record<string, string>>({});
  const [channelOrder, setChannelOrder] = useState<string[]>([]);
  const [blindChannelModalVisible, setBlindChannelModalVisible] = useState(false);
  const [currentBlindPanel, setCurrentBlindPanel] = useState(1);
  const [currentCompletoPanel, setCurrentCompletoPanel] = useState(1);
  const [inputSelection, setInputSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [inputFocused, setInputFocused] = useState(false);
  const [nickSuggestions, setNickSuggestions] = useState<string[]>([]);
  const [exitConfirmVisible, setExitConfirmVisible] = useState(false);
  const [exitToastVisible, setExitToastVisible] = useState(false);

  const fontSizeRef = useRef(14);
  const telnetRef = useRef<TelnetService | null>(null);
  const linesRef = useRef<MudLine[]>([]);
  // Coalesces setLines into a single render per animation frame. The TCP
  // socket fires `onData` per packet — typically once per MUD line — and
  // each setLines was triggering a ~80-130ms FlatList re-render synchronously
  // on a budget Android phone. During an action burst (espejismo: 30+ lines
  // in tight sequence) that meant 30+ serialized renders = several seconds
  // of UI lag. With RAF coalescing all linesRef pushes within ~16ms collapse
  // into one render.
  const linesFlushScheduledRef = useRef(false);
  const isCapturingAliasRef = useRef(false);
  const aliasBufferRef = useRef<string[]>([]);
  const aliasTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const walkPathRef = useRef<string[]>([]);
  const playSoundRef = useRef(playSound);
  const walkStepRef = useRef(0);
  const walkActiveRef = useRef(false);
  const pendingStealthSearchRef = useRef(false);
  const flatListRef = useRef<FlatList<MudLine>>(null);
  const lastLineBlankRef = useRef(false);
  const recentLinesRef = useRef<string[]>([]);
  const intentionalLocateRef = useRef(false);
  const waitingForIrsalaAfterLocateRef = useRef(false);
  // Auto-login state machine. Was a boolean+string union where `false` meant
  // BOTH "haven't started" and "already finished" — a bug that made the
  // username-prompt regex check re-fire on every line forever after a
  // successful login. Explicit 3-state union makes the meaning unambiguous.
  type AutoLoginState = 'pending' | 'waiting-for-password' | 'completed';
  const autoLoginRef = useRef<AutoLoginState>('pending');
  const textInputRef = useRef<TextInput>(null);
  const reconnectButtonRef = useRef<View>(null);
  const lastSentChannelTime = useRef(0);
  // Channel list capture (text-based fallback for when GMCP doesn't push
  // Comm.Canales — e.g. "consentir accesibilidad on"). Armed when the user
  // types `canales`; consumes lines until the list ends.
  type ChannelsCaptureState = 'idle' | 'waiting_for_header' | 'capturing';
  const channelsCaptureStateRef = useRef<ChannelsCaptureState>('idle');
  const channelsCaptureTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelsCaptureAccumRef = useRef<string[]>([]);
  const silentModeEnabledRef = useRef(false);
  const gesturesEnabledRef = useRef(false);
  const gesturesRef = useRef<GestureConfig[]>([]);
  // Ring buffer de remitentes recientes de telepatía. Lo escribimos en
  // `processingAndAddLine` cuando una línea matchea el patrón de tell, y lo
  // leemos cuando un gesto `pick` con source==='recentTells' se dispara.
  const recentTellsRef = useRef<string[]>([]);
  const notificationsEnabledRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const exitPendingRef = useRef(false);
  const exitToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set true right before a programmatic blur so the keyboardDidHide
  // listener does not also wipe the input.
  const suppressClearOnHideRef = useRef(false);
  const lastTapRef = useRef(0);
  const pinchStartDistanceRef = useRef(0);
  const pinchAngleRef = useRef(0);
  const pinchActiveRef = useRef(false);
  const twoFingersStartRef = useRef({ x: 0, y: 0 });
  const twoFingersActiveRef = useRef(false);
  const twoFingersMovedRef = useRef(false);
  // Detección del doble-tap con 2 dedos. `tapStart` se setea al apoyar 2
  // dedos y se invalida (=0) si llega a haber pinch o swipe. Al levantar el
  // último dedo, si el tap fue corto y sin movimiento se mira contra
  // `lastTap` para decidir doubletap (otro tap dentro de 300ms y < 80px).
  const twoFingersTapStartRef = useRef(0);
  const lastTwoFingersTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  // Sticky: se enciende cuando vemos ≥2 dedos en algún momento del gesto y
  // se mantiene encendido hasta que el PanResponder se libera. Sirve para
  // que el manejador de release del PanResponder NO dispare un swipe de
  // 1-dedo cuando en realidad fue un gesto multi-touch (de lo contrario
  // se solapan y se mandan DOS comandos: el twofingers_X correcto y el
  // swipe_X que sigue al dedo primario). `twoFingersActiveRef` no sirve
  // porque se resetea en cada onTouchEnd individual.
  const multiTouchGestureRef = useRef(false);
  // Sticky: se enciende cuando llega el 2º tap dentro de 300 ms del 1º. Si
  // ese 2º tap se mueve > 15 px antes de soltar, el PanResponder release
  // dispara `doubletap_hold_swipe_X`. Si se suelta sin moverse, no dispara
  // nada (eliminamos el doubletap-simple del sistema). Reset en release.
  const doubleTapHoldRef = useRef(false);
  // Hover-hold: longpress disparado por drag-explore. El usuario arrastra
  // hasta un botón y se queda quieto sobre él 800 ms — al cumplir el
  // umbral, ARMAMOS un callback en `pendingHoverLongPressRef` y damos un
  // aviso de audio. El editor se abre solo cuando el usuario LEVANTA el
  // dedo (en `onTouchEnd`), no mientras todavía mantiene. Si antes de
  // soltar el foco cambia o el dedo sale a zona vacía, se cancela el
  // pending — no se abre nada.
  const hoverHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingHoverLongPressRef = useRef<(() => void) | null>(null);
  const scrollStartRef = useRef({ y: 0, offset: 0 });
  const scrollVelocityRef = useRef(0);
  const scrollMomentumRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentScrollOffsetRef = useRef(0);
  const pendingTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const isMountedRef = useRef(true);
  const inWhoBlockRef = useRef(false);

  // Cleanup all pending timeouts on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      pendingTimeoutsRef.current.forEach(id => clearTimeout(id));
      pendingTimeoutsRef.current.clear();
    };
  }, []);

  // Track app foreground/background state so notifications only fire when
  // not active y el ambient se pause con pantalla bloqueada. La lógica de
  // pause/resume del ambient vive ahora en el useEffect centralizado más
  // abajo (depende de `isAppActive` + globales + sesión).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      appStateRef.current = state;
      setIsAppActive(state === 'active');
    });
    return () => sub.remove();
  }, []);

  // Native walk: each tick from the foreground module triggers a telnet send.
  // Living in native (Handler.postDelayed) keeps the cadence even when JS
  // setTimeout is paused while the app is backgrounded.
  useEffect(() => {
    const stepSub = addWalkStepListener((e) => {
      if (!walkActiveRef.current) return;
      walkStepRef.current = e.index + 1;
      // Cada paso del walk descarta la voz pendiente, igual que un comando
      // tecleado: si las descripciones de sala tardan más que el step delay
      // (1.1s) se acumularían y nunca oirías la sala actual.
      speechQueue.clear();
      telnetRef.current?.send(e.command);
    });
    const doneSub = addWalkDoneListener(() => {
      walkPathRef.current = [];
      walkStepRef.current = 0;
      walkActiveRef.current = false;
      if (isMountedRef.current) setWalking(false);
    });
    return () => {
      stepSub.remove();
      doneSub.remove();
    };
  }, []);

  // Track soft-keyboard height so we can dock the nick autocomplete bar to
  // its top edge. Hide the bar when the keyboard is dismissed.
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Clear the command input whenever the user dismisses the soft keyboard
  // (tap outside, back button, drag-down). Skipped for programmatic blurs
  // such as the blur+focus dance used to re-pop the keyboard.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      if (suppressClearOnHideRef.current) {
        suppressClearOnHideRef.current = false;
        return;
      }
      setInputText('');
    });
    return () => sub.remove();
  }, []);

  // Sincroniza el state/refs locales de Terminal con lo que hay en
  // AsyncStorage. Se llama desde dos sitios:
  //   1) useFocusEffect — cuando Terminal recupera el foco (tras volver
  //      desde otra pantalla del Stack como ServerList).
  //   2) Cuando se cierra el modal de Settings — el modal vive DENTRO de
  //      Terminal, así que useFocusEffect NO se dispara al cerrarlo. Sin
  //      esta sincronía explícita, los toggles tipo keepAwakeEnabled,
  //      notificationsEnabled, gesturesEnabled, silentMode, ambient, etc.
  //      se quedaban obsoletos en Terminal hasta que el usuario salía y
  //      volvía a entrar — UX confusa: los toggles se veían ON pero no
  //      tenían efecto.
  const syncSettingsToLocal = useCallback(async () => {
    const settings = await loadSettings();
    if (settings.fontSize) {
      setFontSize(settings.fontSize);
      fontSizeRef.current = settings.fontSize;
    }
    if (settings.uiMode) {
      setUiMode(settings.uiMode);
    }
    if (settings.useSelfVoicing !== undefined) {
      setUseSelfVoicing(settings.useSelfVoicing);
    }
    if (settings.encoding) {
      setEncoding(settings.encoding);
    }
    if (settings.gesturesEnabled !== undefined) {
      gesturesEnabledRef.current = settings.gesturesEnabled;
    }
    if (settings.keepAwakeEnabled !== undefined) {
      setKeepAwakeEnabled(settings.keepAwakeEnabled);
    }
    if (settings.backgroundConnectionEnabled !== undefined) {
      setBackgroundConnectionEnabled(settings.backgroundConnectionEnabled);
    }
    if (settings.gestures) {
      gesturesRef.current = settings.gestures;
    }
    if (settings.notificationsEnabled !== undefined) {
      notificationsEnabledRef.current = settings.notificationsEnabled;
    }
    if (settings.soundsEnabled !== undefined) {
      setGlobalSoundsEnabled(settings.soundsEnabled);
    }
    if (settings.ambientEnabled !== undefined) {
      setGlobalAmbientEnabled(settings.ambientEnabled);
    }
    logService.configure(
      settings.logsEnabled ?? false,
      settings.logsMaxLines ?? 20000
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      syncSettingsToLocal();

      // Reset blind mode service history periodically
      const historyResetInterval = setInterval(() => {
        blindModeService.resetHistory();
      }, 60000); // Every minute

      return () => clearInterval(historyResetInterval);
    }, [syncSettingsToLocal])
  );

  // Tracking de TalkBack/lector de pantalla. Si el usuario activó
  // self-voicing pero TalkBack sigue on, queremos avisarle (banner) porque
  // el doble-tap se duplica con el de TalkBack y los gestos no llegan al
  // PanResponder. La app no puede desactivar TalkBack — el atajo es del OS.
  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled().then(setScreenReaderOn);
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReaderOn);
    return () => sub.remove();
  }, []);

  // Registro del input de comandos en `buttonRegistry` para que el drag-
  // explore lo anuncie ("Input de comandos") al pasar el dedo por encima.
  // El input está en dos layouts (vertical + horizontal), pero solo uno
  // se renderiza a la vez — usan el mismo `textInputRef`. La key es la
  // misma en ambos; al re-medir en cada onLayout, el rect refleja el
  // layout actual.
  const registerInputRect = () => {
    if (!selfVoicingActive) return;
    textInputRef.current?.measure?.((_x, _y, w, h, pageX, pageY) => {
      buttonRegistry.register(
        'default:cmd-input',
        { x: pageX, y: pageY, w, h },
        'Input de comandos',
        undefined,
        'default',
      );
    });
  };
  const handleInputFocus = () => {
    setInputFocused(true);
    if (selfVoicingActive) {
      speechQueue.enqueue(
        `Input de comandos${inputText ? ': ' + inputText : ''}`,
        'high',
      );
    }
  };
  useEffect(() => {
    return () => buttonRegistry.unregister('default:cmd-input');
  }, []);

  // Botón Reconectar: solo se monta cuando `connected=false` y reemplaza
  // toda la fila de input. En self-voicing hay que registrarlo en
  // `buttonRegistry` para que el drag-explore lo encuentre — sin esto el
  // usuario tendría que tap directo sobre el rect, sin poder localizarlo
  // arrastrando el dedo. Hay dos copias (vertical+horizontal) que comparten
  // ref y key porque solo una está montada a la vez. Re-registramos en cada
  // onLayout (cambia label entre "Reconectar" y "Conectando").
  const registerReconnectRect = () => {
    if (!selfVoicingActive) return;
    reconnectButtonRef.current?.measure?.((_x, _y, w, h, pageX, pageY) => {
      buttonRegistry.register(
        'default:reconnect',
        { x: pageX, y: pageY, w, h },
        connecting ? 'Conectando' : 'Reconectar',
        undefined,
        'default',
      );
    });
  };
  useEffect(() => {
    if (!selfVoicingActive || connected) {
      buttonRegistry.unregister('default:reconnect');
    }
  }, [selfVoicingActive, connected]);
  useEffect(() => {
    return () => buttonRegistry.unregister('default:reconnect');
  }, []);

  // Settings vive ahora como ruta navegable (no modal). El sync se hace
  // automáticamente cuando Terminal recupera el foco vía `useFocusEffect`
  // arriba — al volver de Settings (o de cualquier sub-pantalla) los
  // toggles cambiados se reflejan inmediatamente.

  const confirmExit = useCallback(() => {
    if (exitToastTimeoutRef.current) {
      clearTimeout(exitToastTimeoutRef.current);
      exitToastTimeoutRef.current = null;
    }
    exitPendingRef.current = false;
    setExitConfirmVisible(false);
    setExitToastVisible(false);
    navigation.goBack();
  }, [navigation]);

  const cancelExit = useCallback(() => {
    if (exitToastTimeoutRef.current) {
      clearTimeout(exitToastTimeoutRef.current);
      exitToastTimeoutRef.current = null;
    }
    exitPendingRef.current = false;
    setExitConfirmVisible(false);
    setExitToastVisible(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (exitPendingRef.current) {
          confirmExit();
          return true;
        }
        if (
          editButtonVisible ||
          blindChannelModalVisible ||
          searchVisible
        ) {
          return false;
        }
        exitPendingRef.current = true;
        if (uiMode === 'blind') {
          setExitConfirmVisible(true);
          speechQueue.enqueue(
            '¿Salir y desconectar? Pulsa atrás de nuevo para confirmar.'
          );
        } else {
          setExitToastVisible(true);
          exitToastTimeoutRef.current = setTimeout(() => {
            exitPendingRef.current = false;
            setExitToastVisible(false);
            exitToastTimeoutRef.current = null;
          }, 2500);
        }
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => {
        sub.remove();
        if (exitToastTimeoutRef.current) {
          clearTimeout(exitToastTimeoutRef.current);
          exitToastTimeoutRef.current = null;
        }
        exitPendingRef.current = false;
      };
    }, [uiMode, confirmExit, editButtonVisible, blindChannelModalVisible, searchVisible])
  );


  // Update button "IR" label dynamically in blind mode
  useEffect(() => {
    if (uiMode !== 'blind' || !buttonLayout) return;

    const updatedButtons = buttonLayout.buttons.map((btn) => {
      // Find IR button at col=1, row=0
      if (btn.col === 1 && btn.row === 0 && btn.command === 'irsala') {
        return {
          ...btn,
          label: walking ? 'STOP' : 'IR',
          color: walking ? '#662222' : '#662266', // Red when stopping, purple when moving
        };
      }
      return btn;
    });

    setButtonLayout({ buttons: updatedButtons });
  }, [walking, uiMode]);

  useEffect(() => {
    // Reset auto-login state when server changes
    autoLoginRef.current = 'pending';
    setLoginFailed(false);

    (async () => {
      // Load server-specific button layout. Mismo modelo en blind y completo:
      // si el server tiene layout guardado → snapshot puro; si no → plantilla
      // por defecto (distinta según uiMode) que se usa solo como vista hasta
      // que el usuario haga el primer save (entonces queda como suya).
      // Migración 2026-05-01: el field legacy `ServerProfile.buttonLayout`
      // (storage `aljhtar_servers`) se rescata si el server tiene datos ahí
      // pero `buttonLayout_{serverId}` está vacío. Tras rescatar se persiste
      // a la clave nueva y queda muerto en el JSON viejo.
      let serverLayout = await loadServerLayout(server.id);
      const legacyLayout = (server as unknown as { buttonLayout?: ButtonLayout })
        .buttonLayout;
      if (
        serverLayout.buttons.length === 0 &&
        legacyLayout?.buttons?.length
      ) {
        serverLayout = legacyLayout;
        await saveServerLayout(server.id, serverLayout);
      }

      const layout: ButtonLayout =
        serverLayout.buttons.length > 0
          ? serverLayout
          : uiMode === 'blind'
            ? createBlindModeLayout()
            : (server.layoutKind === 'custom' ? createCustomLayout() : createDefaultLayout());

      // Replace LOGIN_NAME placeholder with actual server name
      const buttons = layout.buttons.map(btn =>
        btn.command === '__LOGIN_NAME__'
          ? { ...btn, command: server.name }
          : btn
      );
      setButtonLayout({ buttons });

      // Load channel aliases and order for this server
      const aliases = await loadChannelAliases(server.id);
      setChannelAliases(aliases);
      const order = await loadChannelOrder(server.id);
      setChannelOrder(order);

      // Load map asignado a este servidor (si lo tiene). Sin mapId el
      // MapService queda inactivo: ni minimap ni búsqueda de salas.
      const mapData = server.mapId ? await loadMapContent(server.mapId) : null;
      await mapServiceRef.current.load(mapData);
    })();
  }, [server, uiMode]);

  // Process a single line with blind mode filters and add to display.
  // Pass `deferSetState=true` when batching multiple lines to avoid N re-renders.
  // Schedules a single setLines render on the next animation frame.
  // Multiple calls within the same frame collapse into one render — the
  // primary fix for burst latency since each TCP packet (= 1 line) was
  // forcing a synchronous FlatList render of ~80-130ms.
  const scheduleLinesFlush = () => {
    if (linesFlushScheduledRef.current) return;
    linesFlushScheduledRef.current = true;
    requestAnimationFrame(() => {
      linesFlushScheduledRef.current = false;
      setLines(linesRef.current.slice());
    });
  };

  const resetChannelsCapture = () => {
    channelsCaptureStateRef.current = 'idle';
    if (channelsCaptureTimeoutRef.current) {
      clearTimeout(channelsCaptureTimeoutRef.current);
      channelsCaptureTimeoutRef.current = null;
    }
    channelsCaptureAccumRef.current = [];
  };

  const finalizeChannelsCapture = () => {
    const captured = [...channelsCaptureAccumRef.current];
    resetChannelsCapture();
    setChannels(captured);
  };

  // Matches lines like "  malo [bando] ...........On" or
  // "  malvados ...............On" or "  sombras_del_baltia [gremio] On".
  const CHANNEL_LINE_RE = /^\s+(\S+)(?:\s+\[[^\]]+\])?[\s\.]+(On|Off)\s*$/;
  const CHANNELS_HEADER_RE = /^Tus canales son:?\s*$/;

  const processingAndAddLine = (text: string, isChannelMessage: boolean = false, deferSetState: boolean = false) => {
    // Auto-login: Try to log in with saved credentials if available and not yet attempted.
    // Gating on the explicit 'pending' state stops the regex from running on every
    // line after login completes (the previous `!autoLoginRef.current` check matched
    // the post-completion `false` value and ran forever).
    if (autoLoginRef.current === 'pending' && server.username && server.password) {
      const withoutAnsi = text.replace(/\x1b\[[0-9;]*m/g, '');
      // Detect username prompt: "Introduce el nombre de tu personaje:"
      if (/introduce el nombre de tu personaje/i.test(withoutAnsi)) {
        autoLoginRef.current = 'waiting-for-password';
        const id = setTimeout(() => {
          telnetRef.current?.send(server.username!);
          pendingTimeoutsRef.current.delete(id);
        }, 200);
        pendingTimeoutsRef.current.add(id);
      }
    }

    // Auto-login: After username sent, detect password prompt
    if (autoLoginRef.current === 'waiting-for-password' && server.password && !loginFailed) {
      const withoutAnsi = text.replace(/\x1b\[[0-9;]*m/g, '');
      // Detect password prompt: "Introduce la clave de tu ficha o de tu cuenta:"
      if (/introduce la clave de tu ficha o de tu cuenta/i.test(withoutAnsi)) {
        autoLoginRef.current = 'completed';
        const id = setTimeout(() => {
          telnetRef.current?.send(server.password!);
          logService.markLoginComplete();
          pendingTimeoutsRef.current.delete(id);
        }, 200);
        pendingTimeoutsRef.current.add(id);
      }
    }

    // Skip lines that don't contain any letters or numbers
    const withoutAnsi = text.replace(/\x1b\[[0-9;]*m/g, '');
    if (!/[a-z0-9]/i.test(withoutAnsi)) return;

    // Skip empty lines if last line was also empty
    const isBlank = text.trim().length === 0;
    if (isBlank) {
      if (lastLineBlankRef.current) return;
      lastLineBlankRef.current = true;
    } else {
      lastLineBlankRef.current = false;
    }

    // Skip lines that are only ">" or whitespace + ">"
    const cleanText = text.trim();
    if (cleanText === '>' || cleanText.endsWith('>')) {
      if (/^\s*>\s*$/.test(text)) return;
    }

    // Skip lines that are only template variables like <VERSION>, <NAME>, etc
    if (/^\s*<[A-Z_]+>\s*$/.test(text)) return;

    const stripped = stripAnsi(text);

    // Channel list capture state machine. Runs before any gag so the
    // capture sees every relevant line, but never modifies the line itself —
    // the user still sees the response in the terminal as normal.
    if (channelsCaptureStateRef.current !== 'idle') {
      const trimmed = stripped.trim();
      console.log('[CH_CAP]', channelsCaptureStateRef.current, JSON.stringify(stripped));
      if (channelsCaptureStateRef.current === 'waiting_for_header') {
        if (CHANNELS_HEADER_RE.test(trimmed)) {
          console.log('[CH_CAP] header MATCHED');
          channelsCaptureStateRef.current = 'capturing';
          channelsCaptureAccumRef.current = [];
        }
      } else if (channelsCaptureStateRef.current === 'capturing') {
        if (trimmed.length > 0) {
          const m = stripped.match(CHANNEL_LINE_RE);
          if (m) {
            console.log('[CH_CAP] line MATCH:', m[1], m[2]);
            if (m[2] === 'On') channelsCaptureAccumRef.current.push(m[1]);
          } else {
            console.log('[CH_CAP] line NOMATCH → finalize, accum=', channelsCaptureAccumRef.current);
            finalizeChannelsCapture();
          }
        }
      }
    }

    // Prompt parser runs before regex triggers and before blind mode. If the
    // line looks like part of the MUD prompt (Pv:, Pe:, SL:, ...), gag it in
    // BOTH modes (blind & normal). Regex triggers are NOT evaluated on
    // prompt lines — the prompt is metadata, not game content; users react
    // via variable triggers instead.
    //
    // Two-phase split: cheap detection (regex.test) is always paid so the
    // gag works regardless of trigger config. The expensive field
    // extraction + setSnapshot + variable evaluator only runs when there's
    // at least one variable trigger that could consume the captured values.
    if (promptParser.isPromptLine(stripped)) {
      if (triggerEngine.hasVariableTriggers()) {
        const updates = promptParser.parsePromptUpdates(stripped);
        const changedKeys = playerStatsService.setSnapshot(updates);
        if (changedKeys.length > 0) {
          const prevSnapshot = playerStatsService.getPrevValues();
          const currentSnapshot = playerStatsService.getPlayerVariables();
          const variableEffects = triggerEngine.evaluateVariableTriggers(
            changedKeys,
            prevSnapshot,
            currentSnapshot,
          );
          for (const fx of variableEffects) {
            if (fx.type === 'play_sound') {
              if (fx.file && !silentModeEnabledRef.current) playSoundRef.current(fx.file, fx.pan);
            } else if (fx.type === 'send') {
              if (fx.command) telnetRef.current?.send(fx.command);
            } else if (fx.type === 'notify') {
              if (notificationsEnabledRef.current && appStateRef.current !== 'active') {
                fireNotification(fx.title || 'TorchZhyla', fx.message);
              }
            } else if (fx.type === 'floating') {
              pushFloating(fx.message, fx.level, undefined, { fg: fx.fg, bg: fx.bg });
            }
          }
        }
      }
      return; // gag prompt lines in all modes
    }

    // User-defined triggers run FIRST, on the raw line, so blind-filtered or
    // blind-modified lines still fire sounds/notifications/commands. Captures
    // and side effects are computed against the unmodified text the MUD sent.
    const rawSpans = parseAnsi(text);
    const triggerResult = triggerEngine.process(stripped, rawSpans);

    // Fire side effects FIRST — they must run even when the trigger gags the
    // line (e.g. [gag, floating] silences display while still showing the
    // floating message) and even when blind mode silences the line.
    for (const fx of triggerResult.sideEffects) {
      if (fx.type === 'play_sound') {
        if (fx.file && !silentModeEnabledRef.current) playSoundRef.current(fx.file, fx.pan);
      } else if (fx.type === 'send') {
        if (fx.command) telnetRef.current?.send(fx.command);
      } else if (fx.type === 'notify') {
        // Fire when the user wouldn't see the line otherwise: app in
        // background (terminal not visible) OR the trigger gagged the line
        // (silenced even though the app is foreground). For un-gagged
        // foreground lines the terminal output already serves as the alert.
        const lineHidden = appStateRef.current !== 'active' || triggerResult.gagged;
        if (notificationsEnabledRef.current && lineHidden) {
          fireNotification(fx.title || 'TorchZhyla', fx.message);
        }
      } else if (fx.type === 'floating') {
        pushFloating(fx.message, fx.level, undefined, { fg: fx.fg, bg: fx.bg });
      }
    }

    // gag suppresses display only — side effects already fired above.
    if (triggerResult.gagged) {
      return;
    }

    // Blind mode: Process with filters
    let displayText = text;
    let shouldAnnounce = false;
    let announcementText = '';

    // Process line with blind mode service to detect patterns and sounds
    // (both modes use this). Pass `stripped` so blindModeService doesn't
    // re-strip ANSI codes from a line we already stripped above.
    const result = blindModeService.processLine(text, stripped);

    if (uiMode === 'blind') {

      // Skip line if filter says to silence it (side effects already fired above)
      if (!result.shouldDisplay) {
        return;
      }

      displayText = result.modifiedText;

      // Handle announcements from filters
      if (result.announcement) {
        shouldAnnounce = true;
        announcementText = result.announcement;
      }

    }

    // Detect player class from common text patterns
    if (!uiMode || uiMode === 'blind') {
      const classPatterns: Record<string, string[]> = {
        guerreros: ['Soldado', 'Lancero', 'Campeón', 'Guerrero'],
        magos: ['Mago', 'Hechicero', 'Brujo'],
        hibridos: ['Paladín', 'Ranger', 'Druida'],
      };

      for (const [className, patterns] of Object.entries(classPatterns)) {
        for (const pattern of patterns) {
          if (text.includes(pattern)) {
            blindModeService.updatePlayerVariables({ playerClass: className });
            break;
          }
        }
      }
    }

    // Spans for display: prefer trigger-mutated spans (color action) when blind
    // didn't modify the text. If blind rewrote the line, re-parse from the
    // modified text (color mutations are dropped — acceptable since blind users
    // don't read the screen).
    const finalSpans = displayText === text ? triggerResult.spans : parseAnsi(displayText);

    const newLine: MudLine = { id: lineIdCounter++, spans: finalSpans };
    linesRef.current.push(newLine);
    if (linesRef.current.length > MAX_LINES) {
      linesRef.current = linesRef.current.slice(-MAX_LINES);
    }
    if (!deferSetState) {
      scheduleLinesFlush();
    }

    // Channel messages: always write to terminal, NEVER announce (even if silent mode is off).
    // Auto-scroll is handled by FlatList's onContentSizeChange/onLayout.
    if (isChannelMessage) {
      return;
    }

    // Non-channel messages: Announce filtered content in blind mode (only if silent mode is disabled)
    if (shouldAnnounce && uiMode === 'blind' && !silentModeEnabledRef.current) {
      blindModeService.announceMessage(announcementText, 'normal');
    }

    // Read all messages when silent mode is disabled (if not already announced by filters and not a channel)
    if (!silentModeEnabledRef.current && uiMode === 'blind' && !shouldAnnounce && !isChannelMessage) {
      // Only read if it's not already announced by blind mode filters
      const cleanText = displayText.replace(/\x1b\[[0-9;]*m/g, '').trim();
      if (cleanText.length > 0) {
        blindModeService.announceMessage(cleanText, 'low');
      }
    }
    // Auto-scroll is handled by FlatList's onContentSizeChange/onLayout.
  };

  const addLine = processingAndAddLine;

  const addMultipleLines = (texts: string[]) => {
    texts.forEach(text => {
      processingAndAddLine(text, false, true);
    });
    // Schedule a coalesced flush — multiple addMultipleLines calls (or
    // multiple onData callbacks within the same frame) collapse into a
    // single setLines render via requestAnimationFrame.
    scheduleLinesFlush();
  };

  const mapServiceRef = useRef(new MapService());
  const miniMapRef = useRef<MiniMapHandle | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    (async () => {
      // El map.load() lo hace el otro useEffect (depende de server.mapId).
      // Aquí solo iniciamos el ambient y nos suscribimos a cambios de sala.
      // Inicializa el ambient antes de suscribirse — `init` carga settings
      // y mappings persistidos. Si el toggle está OFF, el subscribe sigue
      // notificando cambios de sala pero `setCategory` se descarta dentro.
      await ambientPlayer.init();
      unsubscribe = mapServiceRef.current.subscribeRoomChange((room) => {
        if (silentModeEnabledRef.current) return; // kill-switch global
        if (!room) {
          ambientPlayer.setCategory(null);
          return;
        }
        ambientPlayer.setCategory(categorizeRoom(room.n, room.c));
      });
    })();
    return () => {
      if (unsubscribe) unsubscribe();
      ambientPlayer.stop();
    };
  }, []);

  // Warm the nick cache so the autocomplete bar is responsive on first keypress.
  useEffect(() => {
    loadNicks();
  }, []);

  // Estado efectivo: el global manda — si está OFF, da igual el override
  // de sesión, está silenciado/apagado. Si está ON, manda el override.
  const silentEffective = !globalSoundsEnabled || silentModeEnabled;
  const ambientEffective =
    globalAmbientEnabled && ambientEnabled && !silentEffective && isAppActive;

  // El ref que leen los handlers de audio (trigger sounds, screen reader
  // announces, gate del subscriber del map) refleja el silencio efectivo.
  useEffect(() => {
    silentModeEnabledRef.current = silentEffective;
  }, [silentEffective]);

  // Reset del override de sesión cuando el global pasa OFF→ON. Si el usuario
  // entra a Settings y enciende "Usar sonidos" (o "Música ambiente"), al
  // volver al Terminal el botón aparece arrancando en ON, no recuerda el
  // estado de la sesión anterior.
  const prevGlobalSoundsRef = useRef(globalSoundsEnabled);
  useEffect(() => {
    if (!prevGlobalSoundsRef.current && globalSoundsEnabled) {
      setSilentModeEnabled(false);
    }
    prevGlobalSoundsRef.current = globalSoundsEnabled;
  }, [globalSoundsEnabled]);

  const prevGlobalAmbientRef = useRef(globalAmbientEnabled);
  useEffect(() => {
    if (!prevGlobalAmbientRef.current && globalAmbientEnabled) {
      setAmbientEnabled(true);
    }
    prevGlobalAmbientRef.current = globalAmbientEnabled;
  }, [globalAmbientEnabled]);

  // Sync centralizado del ambient player con el estado efectivo. Cubre todas
  // las transiciones: toggle global, toggle de sesión, AppState background/
  // active, kill-switch de sonidos. Al pasar a ON resincroniza con la sala
  // actual (durante el OFF el subscriber no actualizó la categoría).
  useEffect(() => {
    if (ambientEffective) {
      ambientPlayer.setEnabled(true);
      const room = mapServiceRef.current?.getCurrentRoom();
      if (room) ambientPlayer.setCategory(categorizeRoom(room.n, room.c));
    } else {
      ambientPlayer.setEnabled(false);
    }
  }, [ambientEffective]);

  // Toggles de SESIÓN (no persisten). Solo se ven cuando el global está ON;
  // en ese caso la lectura UI usa silentModeEnabled / ambientEnabled (la
  // capa global ya está garantizada por el render). El sync con el player
  // y con el ref lo hace el useEffect de arriba.
  const toggleSilentMode = useCallback(() => {
    setSilentModeEnabled(prev => !prev);
  }, []);

  const toggleAmbient = useCallback(() => {
    setAmbientEnabled(prev => {
      const next = !prev;
      if (uiMode === 'blind') {
        speechQueue.enqueue(`Música ambiente ${next ? 'activada' : 'desactivada'}`);
      }
      return next;
    });
  }, [uiMode]);

  // Keep playSound ref in sync so processingAndAddLine always has the latest version
  useEffect(() => {
    playSoundRef.current = playSound;
  }, [playSound]);

  // Carga el ring buffer de tells recientes desde AsyncStorage al cambiar de
  // servidor. Es per-server: cada personaje tiene su lista. Se persiste cada
  // vez que llega un tell (ver processingAndAddLine).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await loadRecentTells(server.id);
      if (!cancelled) recentTellsRef.current = list;
    })();
    return () => { cancelled = true; };
  }, [server.id]);

  // Load triggers for the active server. Reloads when the server changes or
  // when the settings modal closes (user may have edited triggers from there).
  // Also wires userVariablesService: switches server (loads declared vars
  // from storage, resets values), then auto-declares any user-var names
  // referenced by the assigned packs that aren't already declared. This
  // bootstrap covers (a) packs imported / created before the explicit-
  // declare model and (b) packs imported with new var refs.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Static per-character variable: feeds ${personaje} expansion in
      // templates and in regex patterns (e.g. mention triggers). Empty
      // string when the user didn't fill the "Personaje" field — in that
      // case ${personaje} substitutions become inert.
      playerStatsService.setPlayerName(server.username ?? '');
      // Variables are GLOBAL (declarations persist app-wide), so no
      // per-server "active server" call is needed. ensureLoaded reads the
      // persisted declared list once; subsequent calls are no-ops.
      await userVariablesService.ensureLoaded();
      const packs = await loadPacks();
      const assignedPacks = packs.filter((p) => p.assignedServerIds.includes(server.id));
      const referenced = collectVarsReferencedByPacks(assignedPacks);
      if (referenced.length > 0) {
        await userVariablesService.declareMany(referenced);
      }
      const triggers = await getTriggersForServer(server.id);
      if (!cancelled) triggerEngine.setActiveTriggers(triggers);
    })();
    return () => {
      cancelled = true;
    };
  }, [server.id, server.username]);

  useEffect(() => {
    const handler: TelnetEventHandler = {
      onData: (text: string) => {
        logService.appendIncoming(text);
        if (isCapturingAliasRef.current) {
          aliasBufferRef.current.push(text);
          if (aliasTimerRef.current) clearTimeout(aliasTimerRef.current);
          isCapturingAliasRef.current = false;
          aliasBufferRef.current = [];
        } else {
          // Capture raw lines for locate command
          const lines = text.split('\n');
          for (const line of lines) {
            if (line.trim().length > 0) {
              const clean = line.replace(/\x1b\[[0-9;]*m/g, '').trim();
              recentLinesRef.current.push(clean);
              if (recentLinesRef.current.length > 30) {
                recentLinesRef.current.shift();
              }

              // Nick detection — two sources:
              //  1) WHO block: lines between "] Mortales [" and "[ Hay N mortales en …]"
              //  2) Direct communications: "Nick te dice/pregunta/exclama/susurra/grita/responde"
              if (/\]\s*Mortales\s*\[/i.test(clean)) {
                inWhoBlockRef.current = true;
              } else if (/\[\s*Hay\s+\S+\s+mortales/i.test(clean)) {
                inWhoBlockRef.current = false;
              } else if (inWhoBlockRef.current) {
                const firstToken = clean.split(/\s+/)[0];
                if (firstToken && /^[A-Za-zÀ-ÿ'][A-Za-zÀ-ÿ'0-9]{1,}$/.test(firstToken)) {
                  recordNickSeen(firstToken);
                }
              }
              const dmMatch = clean.match(/([A-Za-zÀ-ÿ'][A-Za-zÀ-ÿ'0-9]+)\s+te\s+(?:dice|pregunta|exclama|susurra|grita|responde)\b/i);
              if (dmMatch) {
                recordNickSeen(dmMatch[1]);
              }
              // Captura específica para tells (telepatía): alimenta el ring
              // buffer que usan los gestos `pick` con source==='recentTells'.
              // Se persiste tras cada tell para sobrevivir al cierre de la
              // app — el writeback es fire-and-forget; si falla, la versión
              // en memoria sigue funcionando hasta el siguiente save.
              const tellSender = parseTellSender(clean);
              if (tellSender) {
                recentTellsRef.current = pushRecentTell(recentTellsRef.current, tellSender);
                saveRecentTells(server.id, recentTellsRef.current);
              }

              // Check if we're locating and found the room
              if (intentionalLocateRef.current) {
                if (clean.match(/\[.*\]\s*$/)) {
                  let roomName = clean.replace(/^[>\]]\s*/, '');
                  const mapSvc = mapServiceRef.current;
                  if (mapSvc.isLoaded && roomName) {
                    const room = mapSvc.findRoom(roomName);
                    if (room) {
                      mapSvc.setCurrentRoom(room.id);
                      setCurrentRoom(room);
                      pushFloating('✓ Localizado', 'success', 2000);

                      // Blind mode: announce location
                      if (uiMode === 'blind') {
                        const exits = Object.keys(room.e || {}).sort().join(', ');
                        speechQueue.enqueue(
                          `${room.n}. Salidas: ${exits || 'ninguna'}`
                        );
                      }
                    } else {
                      pushFloating('✗ No localizado', 'error', 2000);

                      // Blind mode: announce failure
                      if (uiMode === 'blind') {
                        speechQueue.enqueue('No localizado');
                      }
                    }
                    // Deactivate locate after attempting (success or failure)
                    intentionalLocateRef.current = false;
                  }
                }
              }
            }
          }
          addMultipleLines(lines);
        }
      },
      onConnect: () => {
        setConnected(true);
        setConnecting(false);
        autoLoginRef.current = 'pending';
        setLoginFailed(false);
        logService.logConnect(server.host, server.port);
        if (!server.username || !server.password) {
          logService.markLoginComplete();
        }
        if (uiMode === 'blind') {
          speechQueue.enqueue('Conectado');
        }
      },
      onClose: () => {
        setConnected(false);
        setConnecting(false);
        autoLoginRef.current = 'pending';
        setLoginFailed(false);
        logService.logDisconnect();
        if (uiMode === 'blind') {
          speechQueue.enqueue('Desconectado');
        }
      },
      onError: (err: string) => {
        setConnecting(false);
        Alert.alert('Error de conexión', err);
        if (uiMode === 'blind') {
          speechQueue.enqueue(`Error: ${err}`);
        }
      },
      onGMCP: (module: string, data: any) => {
        if (module === 'Room.Actual') {
          // Don't auto-locate on Room.Actual. Only manual ojear (locate) can trigger localization.
          // Room.Actual is used to sync movement after successful locate via ojear.
          const roomName = typeof data === 'string' ? data : String(data);
          const currentRoom = mapServiceRef.current.getCurrentRoom();
          if (currentRoom) {
            // Already localized: try to verify we're still in a known location
            const room = mapServiceRef.current.findRoom(roomName);
            if (room) {
              mapServiceRef.current.setCurrentRoom(room.id);
              setCurrentRoom(room);
            }
          }
          // If not localized yet: ignore Room.Actual, wait for manual ojear
        } else if (module === 'Room.Movimiento') {
          const dir = typeof data === 'string' ? data : String(data);
          const room = mapServiceRef.current.moveByDirection(dir);
          if (room) {
            setCurrentRoom(room);

            // Blind mode: announce room change
            if (uiMode === 'blind') {
              const exits = Object.keys(room.e || {}).sort().join(', ');
              speechQueue.enqueue(
                `${room.n}. ${exits || 'ninguna'}`
              );
            }
          }
        } else if (module === 'Char.Status' && data && typeof data === 'object') {
          // HP from Char.Status.pvs (current/max)
          if (data.pvs) {
            if (data.pvs.min !== undefined) setHp(data.pvs.min);
            if (data.pvs.max !== undefined) setHpMax(data.pvs.max);
          }
          // Energy from Char.Status.pe (current/max)
          if (data.pe) {
            if (data.pe.min !== undefined) setEnergy(data.pe.min);
            if (data.pe.max !== undefined) setEnergyMax(data.pe.max);
          }
          // Update blind mode service with player stats
          if (data.pvs || data.pe) {
            blindModeService.updatePlayerVariables({
              playerHP: data.pvs?.min || 0,
              playerMaxHP: data.pvs?.max || 0,
              playerEnergy: data.pe?.min || 0,
              playerMaxEnergy: data.pe?.max || 0,
            });
          }
        } else if (module === 'Comm.Vitals') {
          if (data.hp !== undefined) setHp(data.hp);
          if (data.hpMax !== undefined) setHpMax(data.hpMax);
          if (data.hp_max !== undefined) setHpMax(data.hp_max);
          if (data.energy !== undefined) setEnergy(data.energy);
          if (data.energyMax !== undefined) setEnergyMax(data.energyMax);
          if (data.energy_max !== undefined) setEnergyMax(data.energy_max);
          // Update blind mode service with vitals
          blindModeService.updatePlayerVariables({
            playerHP: data.hp || 0,
            playerMaxHP: data.hpMax || data.hp_max || 0,
            playerEnergy: data.energy || 0,
            playerMaxEnergy: data.energyMax || data.energy_max || 0,
          });
        } else if (module === 'Char.Class' && data) {
          // Player class from GMCP
          const playerClass = typeof data === 'string' ? data : String(data);
          blindModeService.updatePlayerVariables({ playerClass });
        } else if (module === 'Comm.Canales' && data && typeof data === 'object') {
          setChannels(Object.keys(data));
        } else if (module === 'Comm.EnciendeCanal' && data?.canal) {
          setChannels(prev => prev.includes(data.canal) ? prev : [...prev, data.canal]);
        } else if (module === 'Comm.ApagaCanal' && data?.canal) {
          setChannels(prev => prev.filter(ch => ch !== data.canal));
        } else if ((module === 'Comm.MensajeCanal' || module === 'Comm.MensajeCanalHistorico') && data?.canal && data?.mensaje) {
          // Mostrar en terminal (todos los modos), pero marcar como canal para que nunca se anuncie
          addLine(data.mensaje, true);

          // Guardar en state para el modal
          setChannelMessages(prev => {
            const updated = [...prev, { id: nextMsgId(), channel: data.canal, spans: parseAnsi(data.mensaje) }];
            return updated.length > 500 ? updated.slice(-500) : updated;
          });

          // Timestamp para evitar eco propio
          lastSentChannelTime.current = Date.now();
        }
      },
    };

    logService.setCurrentServer(server.name, server.host, server.password);
    const telnet = new TelnetService(server, handler, encoding);
    telnetRef.current = telnet;
    activeConnection.set(server.id, (cmd) => telnet.send(cmd));
    setConnecting(true);
    telnet.connect();

    return () => {
      activeConnection.clear(server.id);
      telnet.disconnect();
      // Pierde localización al desconectar — el subscribe del ambient
      // recibe `null` y para el loop con fade-out.
      mapServiceRef.current.clearCurrentRoom();
    };
  }, [server, uiMode, encoding]);

  const handleReconnect = useCallback(() => {
    if (connecting) return;
    telnetRef.current?.disconnect();
    mapServiceRef.current.clearCurrentRoom();
    setConnecting(true);
    telnetRef.current?.connect();
  }, [connecting]);

  const selectionMode = selectionAnchorId !== null && selectionTargetId !== null;
  const selectionRange = useMemo(() => {
    if (selectionAnchorId == null || selectionTargetId == null) return null;
    const a = Math.min(selectionAnchorId, selectionTargetId);
    const b = Math.max(selectionAnchorId, selectionTargetId);
    return { from: a, to: b };
  }, [selectionAnchorId, selectionTargetId]);

  const handleLineLongPress = useCallback((id: number) => {
    if (uiMode !== 'completo') return;
    setSelectionAnchorId(id);
    setSelectionTargetId(id);
  }, [uiMode]);

  const handleLineTap = useCallback((id: number) => {
    setSelectionTargetId((prev) => (prev == null ? null : id));
  }, []);

  const cancelSelection = useCallback(() => {
    setSelectionAnchorId(null);
    setSelectionTargetId(null);
  }, []);

  const copySelectedAsText = useCallback(async () => {
    if (!selectionRange) {
      cancelSelection();
      return;
    }
    const { from, to } = selectionRange;
    const selected = lines.filter((l) => l.id >= from && l.id <= to);
    const text = selected.map((l) => l.spans.map((s) => s.text).join('')).join('\n');
    if (text) await Clipboard.setStringAsync(text);
    cancelSelection();
  }, [lines, selectionRange, cancelSelection]);

  useEffect(() => {
    if (connected && keepAwakeEnabled) {
      activateKeepAwakeAsync('mud-session');
      return () => {
        deactivateKeepAwake('mud-session');
      };
    }
  }, [connected, keepAwakeEnabled]);

  useEffect(() => {
    if (connected && backgroundConnectionEnabled) {
      startBackgroundConnection(server.name);
      return () => {
        stopBackgroundConnection();
      };
    }
  }, [connected, server.name, backgroundConnectionEnabled]);

  const stopWalk = useCallback(() => {
    if (walkActiveRef.current) {
      TorchZhylaForeground.cancelWalk().catch(() => {});
    }
    walkPathRef.current = [];
    walkStepRef.current = 0;
    walkActiveRef.current = false;
    setWalking(false);
  }, []);

  const walkTo = useCallback((targetRoom: MapRoom, options?: { stealth?: boolean }) => {
    if (walkActiveRef.current) return;

    const mapSvc = mapServiceRef.current;
    const current = mapSvc.getCurrentRoom();
    if (!current) {
      addLine('--- No se conoce tu posición actual. Usa LOC primero ---');
      return;
    }
    const path = mapSvc.findPath(current.id, targetRoom.id);
    if (!path || path.length === 0) {
      addLine('--- No existe un camino conocido hasta la sala indicada ---');
      return;
    }

    walkActiveRef.current = true;
    setWalking(true);
    setSearchVisible(false);
    walkPathRef.current = options?.stealth ? path.map((dir) => `sigilar ${dir}`) : path;
    walkStepRef.current = 0;

    const STEP_DELAY = 1100;
    TorchZhylaForeground.startWalk(walkPathRef.current, STEP_DELAY).catch(() => {
      walkActiveRef.current = false;
      walkPathRef.current = [];
      walkStepRef.current = 0;
      if (isMountedRef.current) setWalking(false);
    });
  }, []);

  const handleLocate = useCallback(() => {
    recentLinesRef.current = [];
    intentionalLocateRef.current = true;
    telnetRef.current?.send('ojear');
  }, []);

  // When locate completes and we're waiting for irsala setup, do it now
  useEffect(() => {
    if (waitingForIrsalaAfterLocateRef.current && currentRoom) {
      waitingForIrsalaAfterLocateRef.current = false;
      const nextText = 'irsala ';
      setInputText(nextText);
      setInputSelection({ start: nextText.length, end: nextText.length });
      const id = setTimeout(() => {
        textInputRef.current?.focus();
        pendingTimeoutsRef.current.delete(id);
      }, 100);
      pendingTimeoutsRef.current.add(id);
    }
  }, [currentRoom]);

  const handleAddTextButton = useCallback((command: string) => {
    const nextText = expandVars(command) + ' ';
    setInputText(nextText);
    setInputSelection({ start: nextText.length, end: nextText.length });
    // blur+focus reliably pops the soft keyboard on Android — calling
    // .focus() alone is a no-op when the input already had logical focus.
    suppressClearOnHideRef.current = true;
    textInputRef.current?.blur();
    const id = setTimeout(() => {
      textInputRef.current?.focus();
      pendingTimeoutsRef.current.delete(id);
    }, 100);
    pendingTimeoutsRef.current.add(id);
  }, []);

  const handleShowFloating = useCallback((text: string) => {
    pushFloating(expandVars(text), 'info', 2000);
  }, [pushFloating]);

  const sendCommand = useCallback((command: string, skipHistory?: boolean) => {
    // Cualquier comando del usuario hacia el MUD (o intercept interno tipo
    // locate/parar/panel switch) descarta TODO lo pendiente y corta la
    // utterance en curso, sin excepción. Lo viejo deja de importar — solo
    // los mensajes que lleguen después de este comando se anuncian. En
    // backend talkback el corte aplica solo a la cola interna (no hay API
    // para cortar TalkBack en curso).
    speechQueue.clear();

    // Expand ${var} (system + user vars) before any intercept logic so
    // intercepts can match against the resolved string. No-op when the
    // command has no ${ placeholders. expandVars never resolves $1/$old/$new.
    command = expandVars(command);

    // ";;" acts as a command separator: split and dispatch each piece in order.
    // Guarded by skipHistory so recursive calls don't re-split or duplicate history.
    if (!skipHistory && command.includes(';;')) {
      const parts = command.split(';;').map((s) => s.trim()).filter(Boolean);
      if (parts.length > 1) {
        if (!skipHistory) setCommandHistory([command, ...commandHistory]);
        for (const part of parts) sendCommand(part, true);
        return;
      }
    }

    // Intercept "parar" or "stop" to stop walking
    if ((command.toLowerCase() === 'parar' || command.toLowerCase() === 'stop') && walking) {
      stopWalk();
      return;
    }

    // Smart IR button in blind mode: locate → irsala flow
    if (uiMode === 'blind' && command.toLowerCase() === 'irsala') {
      if (walking) {
        // If walking, stop
        stopWalk();
        return;
      }

      // If not localized, try to locate first
      if (!currentRoom) {
        waitingForIrsalaAfterLocateRef.current = true;
        handleLocate();
        if (!skipHistory) setCommandHistory([command, ...commandHistory]);
        return;
      }

      // If localized, open input with "irsala " pre-filled (same as completo mode)
      const nextText = 'irsala ';
      setInputText(nextText);
      setInputSelection({ start: nextText.length, end: nextText.length });
      setTimeout(() => {
        textInputRef.current?.focus();
      }, 100);
      if (!skipHistory) setCommandHistory([command, ...commandHistory]);
      return;
    }

    // Intercept irsala / sigilarsala command
    const irsalaMatch = command.match(/^(sigilarsala|irsala)\s+(.+)$/i);
    if (irsalaMatch) {
      const stealth = irsalaMatch[1].toLowerCase() === 'sigilarsala';
      const query = irsalaMatch[2];
      const mapSvc = mapServiceRef.current;
      if (mapSvc.isLoaded) {
        const results = mapSvc.searchRooms(query);
        if (results.length === 0) {
          addLine(`--- No se encontró ninguna sala con "${query}" ---`);
        } else if (results.length === 1) {
          walkTo(results[0], { stealth });
        } else {
          pendingStealthSearchRef.current = stealth;
          setSearchResults(results);
          setSearchVisible(true);
        }
      }
      if (!skipHistory) setCommandHistory([command, ...commandHistory]);
      return;
    }

    // Intercept LOCATE command
    if (command.toLowerCase() === 'locate') {
      if (!skipHistory) setCommandHistory([command, ...commandHistory]);
      handleLocate();
      return;
    }

    // Handle panel switch (blind o completo). En completo el array de paneles
    // viene del server (ServerProfile.panels, default [1, 2]) y la rotación
    // es cíclica entre todos. Blind sigue con 1↔2 fijo (modo blind no
    // soporta paneles dinámicos por ahora).
    if (command === '__SWITCH_PANEL__') {
      if (uiMode === 'blind') {
        const nextPanel = currentBlindPanel === 1 ? 2 : 1;
        setCurrentBlindPanel(nextPanel);
        speechQueue.enqueue(`Panel ${nextPanel}`);
      } else {
        const panels = server.panels && server.panels.length > 0 ? server.panels : [1, 2];
        const idx = panels.indexOf(currentCompletoPanel);
        const nextPanel = panels[(idx >= 0 ? idx + 1 : 0) % panels.length];
        setCurrentCompletoPanel(nextPanel);
      }
      return;
    }

    // Arm the channel-list capture when the user runs `canales`. The command
    // itself flows through to the MUD as usual; the parser in
    // processingAndAddLine watches incoming lines for the header and the
    // entries, then commits to setChannels.
    if (command.trim().toLowerCase() === 'canales') {
      console.log('[CH_CAP] ARMED on canales command');
      resetChannelsCapture();
      channelsCaptureStateRef.current = 'waiting_for_header';
      channelsCaptureTimeoutRef.current = setTimeout(() => {
        // If the header never arrives, abort silently — likely the MUD
        // didn't echo `canales` (e.g. user is mid-roleplay command).
        if (channelsCaptureStateRef.current === 'waiting_for_header') {
          resetChannelsCapture();
        } else if (channelsCaptureStateRef.current === 'capturing') {
          // Header arrived but list never ended cleanly (no follow-up
          // line) — commit what we have.
          finalizeChannelsCapture();
        }
      }, 5000);
    }

    if (connected) {
      telnetRef.current?.send(command);
      if (!skipHistory) setCommandHistory([command, ...commandHistory]);
    }

    // Cancel walk SOLO si el usuario lanza un comando de movimiento manual.
    // Comandos no-movimiento (chat, atacar, ojear, mirar...) dejan que el
    // auto-walk siga su curso — el caso de uso típico es lanzar un ataque
    // o hablar mientras te lleva irsala. Si el usuario quiere cortar
    // explícitamente, hay `parar`/`stop` que ya están interceptados arriba.
    if (walking) {
      const firstWord = command.trim().toLowerCase().split(/\s+/)[0];
      if (MOVEMENT_FIRST_WORDS.has(firstWord)) {
        stopWalk();
        addLine('--- Movimiento cancelado ---');
      }
    }
  }, [connected, commandHistory, walking, stopWalk, walkTo, handleLocate, addLine, uiMode, currentBlindPanel, currentCompletoPanel]);

  const handleSendInput = () => {
    if (inputText.trim()) {
      const trimmed = inputText.trim();
      sendCommand(trimmed);
      // Close keyboard on irsala/sigilarsala so the user can see the results list.
      if (/^(irsala|sigilarsala)\s+\S/i.test(trimmed)) {
        Keyboard.dismiss();
      }
      // Preserve common conversation prefixes so the user can keep typing.
      const firstWord = trimmed.split(/\s+/)[0];
      if (firstWord && /^(responder|decir)$/i.test(firstWord)) {
        setInputText(firstWord + ' ');
      } else {
        setInputText('');
      }
    }
  };

  const handleEditButton = (col: number, row: number) => {
    // Don't allow editing fixed buttons (like SWITCH and IR)
    // Filter by current panel for the active mode
    const button = buttonLayout?.buttons.find(b => {
      if (b.col !== col || b.row !== row) return false;
      if (uiMode === 'blind') {
        return !b.blindPanel || b.blindPanel === currentBlindPanel;
      }
      return !b.completoPanel || b.completoPanel === currentCompletoPanel;
    });
    // Switch button del modo completo: long-press abre el modal de gestión
    // de paneles en lugar del editor (el switch es fixed/locked y no se
    // edita; queremos reaprovechar el gesto para una acción útil).
    if (button?.command === '__SWITCH_PANEL__' && uiMode === 'completo') {
      setPanelManagementVisible(true);
      return;
    }
    if (button?.fixed) {
      return;
    }
    setEditButtonCol(col);
    setEditButtonRow(row);
    setEditButtonVisible(true);
  };

  const handleSaveEditButton = async (btn: any) => {
    if (!buttonLayout) return;

    try {
      const storageCol = editButtonCol;
      const storageRow = editButtonRow;

      const updated = buttonLayout.buttons.filter(b => {
        // Also check panel to avoid removing buttons from other panels in the same slot
        if (uiMode === 'blind') {
          return !(b.col === storageCol && b.row === storageRow && b.blindPanel === currentBlindPanel);
        }
        return !(b.col === storageCol && b.row === storageRow && (b.completoPanel ?? currentCompletoPanel) === currentCompletoPanel);
      });
      if (btn.label && btn.label !== '—') {
        // Ensure the right panel is preserved when saving
        if (uiMode === 'blind') {
          btn.blindPanel = currentBlindPanel;
        } else {
          btn.completoPanel = currentCompletoPanel;
        }
        updated.push(btn);
      }

      const newLayout = { buttons: updated };
      setButtonLayout(newLayout);

      // Save to server-specific storage without updating server state (avoids reconnection)
      await saveServerLayout(server.id, newLayout);

      setEditButtonVisible(false);
    } catch (error) {
      console.error('Error al guardar botón:', error);
    }
  };

  const handleDeleteButton = async () => {
    if (!buttonLayout) return;

    const updated = buttonLayout.buttons.filter(b => {
      if (b.col !== editButtonCol || b.row !== editButtonRow) return true;
      if (uiMode === 'blind') {
        return b.blindPanel !== undefined && b.blindPanel !== currentBlindPanel;
      }
      return b.completoPanel !== undefined && b.completoPanel !== currentCompletoPanel;
    });

    const newLayout = { buttons: updated };
    setButtonLayout(newLayout);

    // Persiste al mismo storage que handleSaveButton (`buttonLayout_{serverId}`).
    // Antes escribíamos al field legacy `ServerProfile.buttonLayout` vía
    // saveServers — distinto storage del que lee loadServerLayout, así que
    // los borrados no sobrevivían a un reload salvo que después hicieras
    // otro save/move que persistiera el layout completo.
    await saveServerLayout(server.id, newLayout);

    setEditButtonVisible(false);
  };

  const handleMoveButton = () => {
    setSourceCol(editButtonCol);
    setSourceRow(editButtonRow);
    setMoveMode(true);
    setEditButtonVisible(false);
  };

  const handleSwapButtons = async (targetCol: number, targetRow: number) => {
    if (moveMode && buttonLayout) {
      const findButton = (col: number, row: number) => {
        return buttonLayout.buttons.find(b => {
          if (b.col !== col || b.row !== row) return false;
          if (uiMode === 'blind') {
            return !b.blindPanel || b.blindPanel === currentBlindPanel;
          }
          return !b.completoPanel || b.completoPanel === currentCompletoPanel;
        });
      };

      const sourceBtn = findButton(sourceCol, sourceRow);
      const targetBtn = findButton(targetCol, targetRow);

      const updated = buttonLayout.buttons.map(b => {
        // Only swap buttons from the same panel as the active one
        if (uiMode === 'blind' && b.blindPanel !== currentBlindPanel) {
          return b;
        }
        if (uiMode !== 'blind' && b.completoPanel !== undefined && b.completoPanel !== currentCompletoPanel) {
          return b;
        }
        if (b.col === sourceCol && b.row === sourceRow) {
          return { ...b, col: targetCol, row: targetRow };
        }
        if (b.col === targetCol && b.row === targetRow) {
          return { ...b, col: sourceCol, row: sourceRow };
        }
        return b;
      });

      const newLayout = { buttons: updated };
      setButtonLayout(newLayout);

      // Save to server-specific storage without updating server state (avoids reconnection)
      await saveServerLayout(server.id, newLayout);

      setMoveMode(false);
    }
  };

  // FlatList is rendered with `inverted` and the data reversed: newest line at
  // index 0, oldest at the end. The `scaleY(-1)` that `inverted` applies then
  // places newest at the visual bottom. Offset 0 = newest visible; offset grows
  // as the user scrolls up to see older history. New lines prepend to data[0]
  // automatically, so when the user is at offset 0 they stay pinned to the
  // latest message — no programmatic scroll needed.
  const reversedLines = useMemo(() => [...lines].reverse(), [lines]);

  const handleFlatListScroll = (event: any) => {
    const { contentOffset } = event.nativeEvent;
    currentScrollOffsetRef.current = contentOffset.y;
    const isAtEnd = contentOffset.y <= 50;
    setIsAtBottom(isAtEnd);
    setShowScrollToBottom(!isAtEnd && lines.length > 0);
  };

  const handleScrollToBottom = () => {
    setIsAtBottom(true);
    setShowScrollToBottom(false);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const handleScrollToTop = () => {
    flatListRef.current?.scrollToEnd({ animated: true });
  };

  // Word under cursor for the nick autocomplete.
  const getCurrentWordBounds = (text: string, cursor: number) => {
    let start = cursor;
    while (start > 0 && /\S/.test(text[start - 1])) start--;
    let end = cursor;
    while (end < text.length && /\S/.test(text[end])) end++;
    return { start, end, word: text.slice(start, end) };
  };

  // Recompute suggestions whenever the text, cursor, or mode changes.
  useEffect(() => {
    if (uiMode !== 'blind') {
      setNickSuggestions([]);
      return;
    }
    const { word } = getCurrentWordBounds(inputText, inputSelection.end);
    // Only suggest when at least one character is typed — otherwise the bar
    // would show the full recent list every time the keyboard appears.
    if (word.length < 1) {
      setNickSuggestions([]);
      return;
    }
    const matches = filterNicks(word, 8).map((e) => e.nick);
    // Don't suggest the word itself if it's already a complete match.
    setNickSuggestions(matches.filter((n) => n.toLowerCase() !== word.toLowerCase()));
  }, [inputText, inputSelection, uiMode]);

  const handleSelectNickSuggestion = (nick: string) => {
    const cursor = inputSelection.end;
    const { start, end } = getCurrentWordBounds(inputText, cursor);
    const before = inputText.slice(0, start);
    const after = inputText.slice(end);
    // Insert nick + trailing space so the user can continue typing.
    const insertion = nick + ' ';
    const newText = before + insertion + after;
    const newCursor = start + insertion.length;
    setInputText(newText);
    setInputSelection({ start: newCursor, end: newCursor });
    setHistoryIndex(-1);
    // Defensive: re-focus the input in case the chip tap dropped focus.
    textInputRef.current?.focus();
  };

  const handleUpArrow = () => {
    if (historyIndex < commandHistory.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setInputText(commandHistory[newIndex]);
    }
  };

  const handleDownArrow = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setInputText(commandHistory[newIndex]);
    } else if (historyIndex === 0) {
      setHistoryIndex(-1);
      setInputText('');
    }
  };

  const detectSwipeDirection = (dx: number, dy: number): string => {
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const a = (angle + 360) % 360;

    if (a >= 337.5 || a < 22.5) return 'swipe_right';
    if (a >= 22.5 && a < 67.5) return 'swipe_down_right';
    if (a >= 67.5 && a < 112.5) return 'swipe_down';
    if (a >= 112.5 && a < 157.5) return 'swipe_down_left';
    if (a >= 157.5 && a < 202.5) return 'swipe_left';
    if (a >= 202.5 && a < 247.5) return 'swipe_up_left';
    if (a >= 247.5 && a < 292.5) return 'swipe_up';
    return 'swipe_up_right';
  };

  // Cierre del flujo del 2-finger doubletap. Llamar al levantar el último
  // dedo (touches.length === 0). Decide tap simple vs doubletap mirando el
  // ref `lastTwoFingersTapRef`. Devuelve true si disparó el gesto (para que
  // el caller pueda silenciar otros efectos colaterales si quisiera).
  const TWOFINGER_TAP_MAX_DURATION = 250;       // ms
  const TWOFINGER_DOUBLETAP_WINDOW = 300;       // ms entre taps
  const TWOFINGER_DOUBLETAP_RADIUS = 80;        // px entre centroides
  const handleTwoFingersTouchEnd = (): void => {
    const tapStart = twoFingersTapStartRef.current;
    twoFingersTapStartRef.current = 0;
    if (!tapStart) return;
    if (twoFingersMovedRef.current) return;
    const duration = Date.now() - tapStart;
    if (duration > TWOFINGER_TAP_MAX_DURATION) return;
    const cx = twoFingersStartRef.current.x;
    const cy = twoFingersStartRef.current.y;
    const last = lastTwoFingersTapRef.current;
    const now = Date.now();
    if (last && now - last.time < TWOFINGER_DOUBLETAP_WINDOW
        && Math.hypot(cx - last.x, cy - last.y) < TWOFINGER_DOUBLETAP_RADIUS) {
      // Doubletap: dispara y limpia para no encadenar un tercer tap como
      // doubletap implícito.
      lastTwoFingersTapRef.current = null;
      triggerGesture('twofingers_doubletap');
    } else {
      lastTwoFingersTapRef.current = { time: now, x: cx, y: cy };
    }
  };

  const applyGestureText = (text: string, autoSend: boolean) => {
    if (!text) return;
    if (autoSend) {
      // Vía sendCommand para heredar clear de speechQueue, expansión de
      // ${vars}, intercepts (parar/irsala) y separador ;;. skipHistory:
      // true porque la pulsación del gesto no es texto tecleado.
      sendCommand(text, true);
      return;
    }
    // Cuando se prepara (sin enviar) añadimos siempre un espacio final para
    // que el usuario pueda continuar tecleando lo siguiente sin tener que
    // teclear el separador. Normalizamos por si el caller dejó trailing
    // spaces — queremos exactamente UNO al final. Cursor tras ese espacio.
    // Mismo patrón que handleAddTextButton: actualizamos el state controlado
    // de selección (no setNativeProps, pelearía con el prop `selection`) y
    // hacemos blur+focus para forzar el teclado en Android.
    const padded = `${text.replace(/\s+$/, '')} `;
    setInputText(padded);
    setInputSelection({ start: padded.length, end: padded.length });
    suppressClearOnHideRef.current = true;
    textInputRef.current?.blur();
    const id = setTimeout(() => {
      textInputRef.current?.focus();
      pendingTimeoutsRef.current.delete(id);
    }, 100);
    pendingTimeoutsRef.current.add(id);
  };

  const openGesturePicker = async (action: Extract<GestureAction, { kind: 'pick' }>) => {
    // OJO: leemos de mapServiceRef directamente, NO del state `currentRoom`.
    // El PanResponder que dispara triggerGesture se memoiza con deps que no
    // incluyen currentRoom — su closure captura el valor inicial (null) y
    // nunca se refresca al cambiar de sala. mapServiceRef.current.getCurrentRoom()
    // es siempre live.
    const liveRoom = mapServiceRef.current?.getCurrentRoom() ?? null;
    const options = await resolvePickOptions(action.source, {
      currentRoom: liveRoom,
      recentTells: recentTellsRef.current,
      customList: action.customList,
    });
    if (options.length === 0) {
      // Sin opciones: feedback en ambos modos. Voz para blind (que es el
      // target principal de pick) y floating para modo completo. Damos
      // floating también en blind porque a veces el TTS está silenciado o
      // el usuario está mirando — no cuesta nada y no molesta.
      const msg = 'Sin opciones disponibles para este gesto';
      if (uiMode === 'blind') speechQueue.enqueue(msg, 'high');
      pushFloating('Sin opciones', 'warning', 2000);
      return;
    }
    setGesturePickerState({
      visible: true,
      title: pickActionTitle(action),
      options,
      onPick: (option: string) => {
        // prefix + " " + option. Trim del trailing del prefix para evitar
        // doble espacio si el usuario lo metió con espacio. Si autoSend
        // está OFF, applyGestureText añade además el espacio final.
        const prefix = action.prefix.replace(/\s+$/, '');
        const finalText = prefix ? `${prefix} ${option}` : option;
        setGesturePickerState((s) => ({ ...s, visible: false }));
        applyGestureText(finalText, action.autoSend);
      },
    });
  };

  const closeGesturePicker = () => {
    setGesturePickerState((s) => ({ ...s, visible: false }));
  };

  const triggerGesture = (type: GestureType) => {
    if (!gesturesEnabledRef.current || !gesturesAvailable) return;
    const gesture = gesturesRef.current.find(g => g.type === type && g.enabled);
    if (!gesture) return;
    const action = gesture.action;
    if (action.kind === 'send') {
      if (!action.text) return;
      applyGestureText(action.text, true);
      return;
    }
    if (action.kind === 'prepare') {
      if (!action.text) return;
      applyGestureText(action.text, false);
      return;
    }
    if (action.kind === 'pick') {
      openGesturePicker(action);
    }
  };

  const handleDoubleTap = (touchCount: number) => {
    if (!gesturesEnabledRef.current || !gesturesAvailable || touchCount !== 1) {
      lastTapRef.current = 0;
      doubleTapHoldRef.current = false;
      return;
    }
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // 2º tap dentro de la ventana → armamos el flag de doubletap-hold.
      // No disparamos nada todavía: el PanResponder release decidirá si
      // hubo arrastre (→ doubletap_hold_swipe_X) o no (→ nada, ya no hay
      // doubletap-simple).
      doubleTapHoldRef.current = true;
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
      doubleTapHoldRef.current = false;
    }
  };

  const applyScrollMomentum = useCallback((velocity: number) => {
    if (scrollMomentumRef.current) clearInterval(scrollMomentumRef.current);
    let currentVelocity = velocity;
    const friction = 0.95;

    scrollMomentumRef.current = setInterval(() => {
      if (Math.abs(currentVelocity) < 0.5) {
        if (scrollMomentumRef.current) clearInterval(scrollMomentumRef.current);
        return;
      }

      flatListRef.current?.scrollToOffset({
        offset: scrollStartRef.current.offset + currentVelocity,
        animated: false,
      });
      scrollStartRef.current.offset += currentVelocity;
      currentVelocity *= friction;
    }, 16);
  }, []);

  const terminalPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      if (scrollMomentumRef.current) clearInterval(scrollMomentumRef.current);
      scrollStartRef.current = {
        y: evt.nativeEvent.pageY,
        offset: currentScrollOffsetRef.current,
      };
    },
    onMoveShouldSetPanResponder: (_, gs) => {
      if (!gesturesAvailable) return false;
      const isHorizontal = Math.abs(gs.dx) > Math.abs(gs.dy) && Math.abs(gs.dx) > 30;
      const isFastVertical = Math.abs(gs.dy) > Math.abs(gs.dx) && Math.abs(gs.vy) > 0.8 && Math.abs(gs.dy) > 50;
      const isSlowVertical = Math.abs(gs.dy) > Math.abs(gs.dx) && Math.abs(gs.dy) > 10;
      return isHorizontal || isFastVertical || isSlowVertical;
    },
    onPanResponderMove: (_, gs) => {
      if (!gesturesAvailable) return;
      const isSlowVertical = Math.abs(gs.dy) > Math.abs(gs.dx) && Math.abs(gs.dy) > 10;
      if (isSlowVertical && Math.abs(gs.vy) < 0.5) {
        // FlatList is inverted: dragging finger down (gs.dy > 0) reveals older
        // content, which in inverted coords means INCREASING the offset.
        flatListRef.current?.scrollToOffset({
          offset: scrollStartRef.current.offset + gs.dy,
          animated: false,
        });
        scrollVelocityRef.current = gs.vy * 50;
      }
    },
    onPanResponderRelease: (evt, gs) => {
      // Si el gesto pasó por 2 dedos en algún momento, el handler de
      // twofingers/pinch ya disparó (o decidió no disparar). Saltar la
      // detección de swipe-1-dedo para no mandar DOS comandos.
      if (multiTouchGestureRef.current) {
        multiTouchGestureRef.current = false;
        doubleTapHoldRef.current = false;
        return;
      }

      const absX = Math.abs(gs.dx), absY = Math.abs(gs.dy);

      // Doubletap-hold-swipe: si veníamos de un 2º tap rápido y el dedo se
      // movió > 15 px, disparamos el gesto direccional con prefijo
      // `doubletap_hold_swipe_`. Si se soltó sin moverse, no se dispara
      // nada (eliminamos el doubletap-simple). En cualquier caso, NO se
      // dispara también el swipe-1-dedo normal — ese es para tap-y-drag
      // sin el primer tap previo.
      if (doubleTapHoldRef.current) {
        doubleTapHoldRef.current = false;
        if (absX > 15 || absY > 15) {
          const dir = detectSwipeDirection(gs.dx, gs.dy);
          const gestureType = dir.replace('swipe_', 'doubletap_hold_swipe_') as GestureType;
          triggerGesture(gestureType);
        }
        return;
      }

      const { x0, y0 } = gs;
      const screenWidth = Dimensions.get('window').width;
      if (x0 > screenWidth - 200 && y0 < 200) {
        return;
      }

      const isSlowVertical = absY > absX && absY > 10 && Math.abs(gs.vy) < 0.5;

      if (gesturesEnabledRef.current && !isSlowVertical && (absX > 15 || absY > 15)) {
        const swipeDirection = detectSwipeDirection(gs.dx, gs.dy);
        triggerGesture(swipeDirection as GestureType);
      }
    },
  }), [uiMode, useSelfVoicing, gesturesAvailable, applyScrollMomentum]);

  const isHorizontal = width > height;
  const availableHeight = height - insets.top - insets.bottom;
  const vitalsHeight = 35;
  const inputHeight = uiMode === 'blind' ? 60 : 30;

  // Grid dimensions from config
  const isMinimalista = uiMode === 'blind';

  // Filter buttons by current panel (per mode)
  const filteredButtons = buttonLayout
    ? (uiMode === 'blind'
        ? buttonLayout.buttons.filter(btn => !btn.blindPanel || btn.blindPanel === currentBlindPanel)
        : buttonLayout.buttons.filter(btn => !btn.completoPanel || btn.completoPanel === currentCompletoPanel))
    : [];
  // Handlers de gestión de paneles del modo completo (modal abierto desde
  // long-press en el switch button).
  const serverPanels = server.panels && server.panels.length >= 2 ? server.panels : [1, 2];

  const handleAddPanel = useCallback(async () => {
    if (!buttonLayout) return;
    if (serverPanels.length >= 6) return;
    const newId = Math.max(...serverPanels) + 1;
    const kind = server.layoutKind === 'custom' ? 'custom' : 'standard';
    // En estándar: clonar zona direcciones del panel 1 (botones del layout
    // actual con completoPanel=1 en cols 3-6 / rows 2-5).
    const sourcePanel = kind === 'standard'
      ? buttonLayout.buttons.filter(b => b.completoPanel === 1)
      : undefined;
    const newButtons = createPanelButtons(newId, kind, sourcePanel);
    const updatedLayout: ButtonLayout = { buttons: [...buttonLayout.buttons, ...newButtons] };
    setButtonLayout(updatedLayout);
    await saveServerLayout(server.id, updatedLayout);
    // Persistir el nuevo array de paneles en el server.
    const allServers = await loadServers();
    const newPanels = [...serverPanels, newId];
    const updatedAllServers = allServers.map(s =>
      s.id === server.id ? { ...s, panels: newPanels } : s
    );
    await saveServers(updatedAllServers);
    // Mutamos el server local para que el render refleje los nuevos paneles
    // sin esperar al próximo focus. (El navigation.params se rehidratará al
    // volver a la lista; aquí trabajamos sobre la copia que tenemos.)
    (server as any).panels = newPanels;
    setCurrentCompletoPanel(newId);
  }, [buttonLayout, server, serverPanels]);

  const handleDeletePanel = useCallback(async (id: number) => {
    if (!buttonLayout) return;
    // Los 2 primeros paneles no se pueden borrar (regla del modal).
    const idx = serverPanels.indexOf(id);
    if (idx < 2) return;
    // Borrar los botones del panel + actualizar el array de paneles.
    const filteredButtons = buttonLayout.buttons.filter(b => b.completoPanel !== id);
    const updatedLayout: ButtonLayout = { buttons: filteredButtons };
    setButtonLayout(updatedLayout);
    await saveServerLayout(server.id, updatedLayout);
    const newPanels = serverPanels.filter(p => p !== id);
    const allServers = await loadServers();
    const updatedAllServers = allServers.map(s =>
      s.id === server.id ? { ...s, panels: newPanels } : s
    );
    await saveServers(updatedAllServers);
    (server as any).panels = newPanels;
    // Si estábamos en el panel borrado, saltar al primero.
    if (currentCompletoPanel === id) {
      setCurrentCompletoPanel(newPanels[0]);
    }
  }, [buttonLayout, server, serverPanels, currentCompletoPanel]);

  const handleSelectPanel = useCallback((id: number) => {
    setCurrentCompletoPanel(id);
    setPanelManagementVisible(false);
  }, []);

  // Server con layoutKind='custom': el grid es cuadrado lógico (5/7/9) y en
  // cada orientación se renderiza solo el sub-rectángulo que cabe (sin
  // transponer). Custom solo aplica en modo completo. En blind se ignora.
  const isCustomCompleto = uiMode === 'completo' && server.layoutKind === 'custom' && !!server.customGridSize;
  const customVertical = isCustomCompleto ? getCustomDisplayDimensions(server.customGridSize as 5|7|9, 'vertical') : null;
  const customHorizontal = isCustomCompleto ? getCustomDisplayDimensions(server.customGridSize as 5|7|9, 'horizontal') : null;

  const modeConfig = isMinimalista ? BLIND_MODE : NORMAL_MODE;
  const gridCols = customVertical ? customVertical.cols : modeConfig.vertical.cols;
  const gridRows = customVertical ? customVertical.rows : modeConfig.vertical.rows;
  const BUTTON_PADDING_VERTICAL = 3 * 2;
  const BUTTON_GAP = 3;
  const BUTTON_GAPS_TOTAL = (gridRows - 1) * BUTTON_GAP;

  // Calculate cell size for square buttons, fill available space.
  //
  // En custom queremos que los botones tengan el tamaño físico que tendrían
  // si el grid lógico (5/7/9) cupiera completo en pantalla, NO ampliados
  // para llenar el sub-rectángulo visible. Por eso el denominador del
  // cellSize en custom es `customGridSize`, no las dims visibles. Resultado:
  //   - 9×9 portrait: cellSize ≈ width/9 (mismo que estándar 9×6).
  //   - 7×7 portrait: cellSize ≈ width/7 (botones algo más grandes).
  //   - 5×5 portrait: cellSize ≈ width/5 (botones aún más grandes).
  // El sub-rectángulo visible ocupa solo el espacio que necesita; sobra el
  // resto del ancho a la derecha.
  const cellDenomCols = isCustomCompleto ? (server.customGridSize as number) : gridCols;
  const cellDenomRows = isCustomCompleto ? (server.customGridSize as number) : gridRows;
  const maxCellSizeByWidth = width / cellDenomCols;
  const maxCellSizeByHeight = (availableHeight - inputHeight) / cellDenomRows;
  const cellSize = Math.min(maxCellSizeByWidth, maxCellSizeByHeight);
  const buttonGridHeight = gridRows * cellSize + BUTTON_GAPS_TOTAL + BUTTON_PADDING_VERTICAL;

  // Horizontal layout dimensions
  const vitalsWidth = uiMode === 'blind' ? 0 : 30;
  const horizontalGridCols = customHorizontal ? customHorizontal.cols : modeConfig.horizontal.cols;
  const horizontalGridRows = customHorizontal ? customHorizontal.rows : modeConfig.horizontal.rows;
  const availableHorizontalWidthForButtons = width - vitalsWidth - insets.left - insets.right - 20;
  // Mismo criterio en horizontal: denominador = gridSize lógico para que el
  // tamaño del botón no dependa de cuántas cols visibles caben.
  const hCellDenomCols = isCustomCompleto ? (server.customGridSize as number) : horizontalGridCols;
  const hCellDenomRows = isCustomCompleto ? (server.customGridSize as number) : horizontalGridRows;
  const maxHorizontalCellSizeByWidth = availableHorizontalWidthForButtons / hCellDenomCols;

  // Height calculation differs by mode
  let maxHorizontalCellSizeByHeight: number;
  const horizontalButtonGapsTotal = (horizontalGridRows - 1) * BUTTON_GAP;

  // Account for internal gaps and padding in ButtonGrid container for both modes
  maxHorizontalCellSizeByHeight = (availableHeight - horizontalButtonGapsTotal - BUTTON_PADDING_VERTICAL) / hCellDenomRows;

  const horizontalCellSize = Math.min(maxHorizontalCellSizeByWidth, maxHorizontalCellSizeByHeight);
  const horizontalButtonGridWidth = horizontalGridCols * horizontalCellSize + (horizontalGridCols - 1) * BUTTON_GAP;
  const horizontalRightPanelWidth = horizontalButtonGridWidth + vitalsWidth + 20;
  const horizontalTerminalWidth = width - horizontalRightPanelWidth - insets.left - insets.right;

  return (
    // En self-voicing: ocultamos todo el árbol a TalkBack para que no
    // anuncie ni intercepte gestos. Si el usuario tuvo TalkBack on por
    // error, queda como zona muerta — que es exactamente lo que queremos
    // (el banner detector + el TTS propio toman el control). Sin self-
    // voicing, la prop está en su default ('auto') y los accessibilityLabel
    // se respetan normalmente.
    <SafeAreaView
      style={styles.safeArea}
      importantForAccessibility={selfVoicingActive ? 'no-hide-descendants' : 'auto'}
      // Drag-explore: en self-voicing detectamos qué botón hay bajo el dedo
      // y movemos el foco al cruzar. `pageX/Y` son coordenadas absolutas de
      // pantalla — los rects en `buttonRegistry` están en el mismo sistema
      // (registrados con `measureInWindow`). onTouchMove fluye aunque
      // children grabraran el responder, así que no chocamos con
      // PanResponders existentes. Además gestiona el hover-hold timer:
      // 800 ms quieto sobre un botón después de drag = longpress.
      onTouchMove={selfVoicingActive ? (evt) => {
        // Si hay un modal abierto que NO migró todavía a scopes, el
        // `buttonRegistry.activeScope` sigue siendo 'default' y los
        // botones del Terminal se anunciarían bajo el modal (no son
        // visibles). Lo bloqueamos. Modales que SÍ migraron (ButtonEdit,
        // Settings) cambian `activeScope` y este check pasa — el drag-
        // explore navega correctamente sus controles.
        const anyUnmigratedModal = (blindChannelModalVisible || searchVisible) && buttonRegistry.getActiveScope() === 'default';
        if (anyUnmigratedModal) {
          if (hoverHoldTimerRef.current) {
            clearTimeout(hoverHoldTimerRef.current);
            hoverHoldTimerRef.current = null;
          }
          pendingHoverLongPressRef.current = null;
          return;
        }
        const t = evt.nativeEvent.touches?.[0];
        if (!t) return;
        const hit = buttonRegistry.findAtPoint(t.pageX, t.pageY);
        if (hit) {
          const focusChanged = selfVoicingPress.getFocusedKey() !== hit.key;
          selfVoicingPress.setFocusFromHover(hit.key, hit.label);
          if (focusChanged) {
            // Cambio de botón: cancelar el timer y el pending del botón
            // anterior, arrancar uno nuevo para el actual (si tiene
            // onLongPress).
            if (hoverHoldTimerRef.current) clearTimeout(hoverHoldTimerRef.current);
            pendingHoverLongPressRef.current = null;
            const cb = hit.onLongPress;
            const hitLabel = hit.label;
            if (cb) {
              hoverHoldTimerRef.current = setTimeout(() => {
                // 800 ms en el mismo botón: ARMAMOS pending. Editor se
                // abre en touchEnd. Audio cue: el usuario sabe que ya
                // puede soltar.
                pendingHoverLongPressRef.current = cb;
                speechQueue.enqueue(`Suelta para editar ${hitLabel}`, 'high');
                hoverHoldTimerRef.current = null;
              }, 800);
            } else {
              hoverHoldTimerRef.current = null;
            }
          }
        } else {
          // Dedo sobre zona vacía: cancelar timer + pending. El usuario
          // se salió de los botones — no debería abrirse nada al soltar.
          if (hoverHoldTimerRef.current) {
            clearTimeout(hoverHoldTimerRef.current);
            hoverHoldTimerRef.current = null;
          }
          pendingHoverLongPressRef.current = null;
        }
      } : undefined}
      onTouchEnd={selfVoicingActive ? () => {
        if (hoverHoldTimerRef.current) {
          clearTimeout(hoverHoldTimerRef.current);
          hoverHoldTimerRef.current = null;
        }
        // Si el pending estaba armado (= 800 ms cumplidos sobre el botón
        // con foco), abrir el editor AHORA al soltar.
        if (pendingHoverLongPressRef.current) {
          const cb = pendingHoverLongPressRef.current;
          pendingHoverLongPressRef.current = null;
          cb();
        }
      } : undefined}
    >
      {!isHorizontal ? (
      // VERTICAL LAYOUT
      <View style={styles.container}>
        {/* Terminal (flex 1 - takes remaining space) */}
        <View
          style={[styles.terminalSection, { flex: 1 }]}
          accessible={true}
          accessibilityLabel="Salida del terminal"
          accessibilityRole="text"
          accessibilityLiveRegion={uiMode === 'blind' ? 'polite' : 'none'}
          accessibilityHint="Ventana de terminal de solo lectura. Usa las flechas o desliza para navegar."
          accessibilityActions={uiMode === 'blind' ? [{ name: 'scroll' }] : undefined}
          {...terminalPanResponder.panHandlers}
          onStartShouldSetResponder={() => false}
          onTouchStart={(evt) => {
            const touchCount = evt.nativeEvent.touches.length;
            if (touchCount === 1) {
              handleDoubleTap(1);
            } else {
              lastTapRef.current = 0;
              // Sticky: bloquea el swipe de 1-dedo del PanResponder al
              // soltar. Se resetea en onPanResponderRelease.
              multiTouchGestureRef.current = true;
            }
            if (!gesturesEnabledRef.current || !gesturesAvailable) return;
            if (touchCount === 2) {
              const [t1, t2] = evt.nativeEvent.touches;
              const dx = t2.pageX - t1.pageX;
              const dy = t2.pageY - t1.pageY;
              twoFingersStartRef.current = {
                x: (t1.pageX + t2.pageX) / 2,
                y: (t1.pageY + t2.pageY) / 2,
              };
              pinchStartDistanceRef.current = Math.hypot(dx, dy);
              pinchAngleRef.current = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
              pinchActiveRef.current = true;
              twoFingersActiveRef.current = true;
              twoFingersMovedRef.current = false;
              twoFingersTapStartRef.current = Date.now();
            }
          }}
          onTouchMove={(evt) => {
            if (!pinchActiveRef.current || evt.nativeEvent.touches.length !== 2) return;
            const [t1, t2] = evt.nativeEvent.touches;
            const centroidX = (t1.pageX + t2.pageX) / 2;
            const centroidY = (t1.pageY + t2.pageY) / 2;
            const centroidDx = centroidX - twoFingersStartRef.current.x;
            const centroidDy = centroidY - twoFingersStartRef.current.y;
            const centroidMove = Math.hypot(centroidDx, centroidDy);

            const newDist = Math.hypot(t2.pageX - t1.pageX, t2.pageY - t1.pageY);
            const pinchDelta = Math.abs(newDist - pinchStartDistanceRef.current);

            if (centroidMove > 30 && !twoFingersMovedRef.current) {
              const direction = detectSwipeDirection(centroidDx, centroidDy) as GestureType;
              const gestureType = direction.replace('swipe_', 'twofingers_') as GestureType;
              triggerGesture(gestureType);
              pinchActiveRef.current = false;
              twoFingersMovedRef.current = true;
              twoFingersTapStartRef.current = 0;
            } else if (pinchDelta > 40 && !twoFingersMovedRef.current) {
              const pinchType = newDist > pinchStartDistanceRef.current ? 'pinch_out' : 'pinch_in';
              triggerGesture(pinchType);
              pinchActiveRef.current = false;
              twoFingersMovedRef.current = true;
              twoFingersTapStartRef.current = 0;
            }
          }}
          onTouchEnd={(evt) => {
            // `onTouchEnd` se dispara por cada dedo que se levanta. Solo
            // contamos el tap cuando ya no hay dedos en pantalla — si vamos
            // de 2→1, el segundo dedo aún sigue presionado y la lógica de
            // doubletap se evalúa en la última liberación.
            if (evt.nativeEvent.touches.length === 0) {
              handleTwoFingersTouchEnd();
            }
            pinchActiveRef.current = false;
            twoFingersActiveRef.current = false;
            twoFingersMovedRef.current = false;
          }}
        >
          <FlatList
            ref={flatListRef}
            data={reversedLines}
            inverted
            keyExtractor={item => String(item.id)}
            renderItem={({ item }) => {
              const isSelected =
                selectionRange != null &&
                item.id >= selectionRange.from &&
                item.id <= selectionRange.to;
              return (
                <Pressable
                  key={item.id}
                  onLongPress={uiMode === 'completo' ? () => handleLineLongPress(item.id) : undefined}
                  onPress={
                    selectionMode
                      ? () => handleLineTap(item.id)
                      : selfVoicingActive
                        ? () => {
                            // Tap a línea = re-leer en voz alta. Prioridad
                            // alta para atropellar cualquier anuncio en
                            // curso. Los swipes siguen llegando al
                            // PanResponder antes que el onPress (movement
                            // gana sobre tap), así que no se solapan.
                            const text = item.spans.map(s => s.text).join('').trim();
                            if (text) speechQueue.enqueue(text, 'high');
                          }
                        : undefined
                  }
                  style={[styles.lineContainer, isSelected && styles.lineSelected]}
                >
                  <AnsiText spans={item.spans} fontSize={fontSize} lineId={item.id} />
                </Pressable>
              );
            }}
            scrollEnabled={uiMode === 'blind' && !selfVoicingActive}
            scrollEventThrottle={16}
            onScroll={handleFlatListScroll}
            onScrollEndDrag={handleFlatListScroll}
            style={styles.flatList}
            accessible={true}
            accessibilityLabel={`Terminal con ${lines.length} líneas`}
          />

          {/* Scroll to bottom button */}
          {showScrollToBottom && (
            <TouchableOpacity
              style={styles.scrollToBottomButton}
              onPress={() => selfVoicingPress.tap(selfVoicingActive, 'scroll-bottom', 'Ir al final', handleScrollToBottom)}
              accessible={true}
              accessibilityLabel="Ir al final"
              accessibilityRole="button"
              accessibilityHint="Desplázate al último mensaje del terminal"
            >
              <Text style={styles.scrollToBottomText}>↓</Text>
            </TouchableOpacity>
          )}

          {/* Auto-login Failed Feedback */}
          {loginFailed && (
            <View
              style={[styles.locateFeedback, styles.locateFeedbackFailed]}
              accessible={true}
              accessibilityLabel="Login automático falló"
              accessibilityRole="alert"
            >
              <TouchableOpacity
                style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
                onPress={() => selfVoicingPress.tap(selfVoicingActive, 'login-retry', 'Reintentar login', () => {
                  setLoginFailed(false);
                  autoLoginRef.current = 'pending';
                })}
                accessible={true}
                accessibilityLabel="Reintentar login"
                accessibilityHint="Intenta enviar nuevamente las credenciales"
              >
                <Text
                  style={[
                    styles.locateFeedbackText,
                    styles.locateFeedbackTextFailed,
                  ]}
                >
                  ✗ Login falló - Tap para reintentar
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* MiniMap overlay - Hidden in minimalist mode */}
          {uiMode === 'completo' && (
            <View style={styles.miniMapContainer} pointerEvents="box-none">
              <MiniMap
                ref={miniMapRef}
                mapService={mapServiceRef.current}
                currentRoom={currentRoom}
                visible={mapVisible}
                onToggle={() => setMapVisible(!mapVisible)}
                walking={walking}
                onStop={stopWalk}
                selectedRoomId={previewRoomId}
                onSelectRoom={(room) => {
                  if (previewRoomId === room.id) {
                    setPreviewRoomId(null);
                    walkTo(room);
                  } else {
                    setPreviewRoomId(room.id);
                  }
                }}
              />
            </View>
          )}
        </View>

        {/* VitalBars - Hidden in minimalist mode */}
        {uiMode === 'completo' && (
          <View style={[styles.vitalsSection, { height: vitalsHeight }]}>
            <VitalBars
              hp={hp}
              hpMax={hpMax}
              energy={energy}
              energyMax={energyMax}
            />
          </View>
        )}

        {/* Nick autocomplete bar (blind mode only) — sits right above the
            input row; adjustResize docks it above the soft keyboard. */}
        <NickAutocomplete
          visible={uiMode === 'blind' && inputFocused}
          suggestions={nickSuggestions}
          onSelect={handleSelectNickSuggestion}
          selfVoicingActive={selfVoicingActive}
        />

        {/* Banner: self-voicing on PERO un lector de pantalla sigue activo
            (TalkBack, Voice Assistant Samsung, Jieshuo, BrailleBack…). UX
            rota — la app está doblada (lector + nuestro TTS) y los gestos
            no llegan al PanResponder. El usuario debe usar el atajo OS
            (típicamente Volumen Arriba + Volumen Abajo 3 segundos) para
            desactivarlo. */}
        {selfVoicingActive && screenReaderOn && (
          <View style={styles.selfVoicingWarning}>
            <Text style={styles.selfVoicingWarningText}>
              ⚠ Hay un lector de pantalla activo. Desactívalo con el atajo de accesibilidad del sistema (Vol+ y Vol- 3 s) para que self-voicing funcione bien.
            </Text>
          </View>
        )}

        {/* Input Row */}
        <View style={[styles.inputSection, { height: inputHeight }, uiMode === 'completo' && { marginTop: 2 }]}>
          {connected ? (
            <>
              {uiMode === 'blind' && globalSoundsEnabled && (
                <SelfVoicingTouchable
                  svActive={selfVoicingActive}
                  svScope="default"
                  svKey="silent"
                  svLabel={`Modo Silencio ${silentModeEnabled ? 'activado' : 'desactivado'}`}
                  onPress={toggleSilentMode}
                  style={[styles.sendButton, { flex: 0.4, backgroundColor: silentModeEnabled ? '#ff6600' : '#666666' }]}
                  accessible={true}
                  accessibilityLabel={`Modo Silencio ${silentModeEnabled ? 'activado' : 'desactivado'}`}
                  accessibilityRole="button"
                  accessibilityHint={`Lee los mensajes en voz alta. Estado: ${silentModeEnabled ? 'ON' : 'OFF'}`}
                >
                  <Text style={[styles.sendButtonText, { fontSize: 14 }]}>{silentModeEnabled ? 'Silencio' : 'Sonido'}</Text>
                </SelfVoicingTouchable>
              )}

              {uiMode === 'blind' && globalAmbientEnabled && (
                <SelfVoicingTouchable
                  svActive={selfVoicingActive}
                  svScope="default"
                  svKey="ambient"
                  svLabel={`Música ambiente ${ambientEnabled ? 'activada' : 'desactivada'}`}
                  onPress={toggleAmbient}
                  style={[styles.sendButton, { flex: 0.4, backgroundColor: ambientEnabled ? '#3a5a3a' : '#666666' }]}
                  accessible={true}
                  accessibilityLabel={`Música ambiente ${ambientEnabled ? 'activada' : 'desactivada'}`}
                  accessibilityRole="button"
                  accessibilityHint="Activa o desactiva la música de fondo"
                >
                  <Text style={[styles.sendButtonText, { fontSize: 14 }]}>{ambientEnabled ? 'Música' : 'Sin música'}</Text>
                </SelfVoicingTouchable>
              )}

              {uiMode === 'blind' && (
                <SelfVoicingTouchable
                  svActive={selfVoicingActive}
                  svScope="default"
                  svKey="channels"
                  svLabel="Abrir canales"
                  onPress={() => setBlindChannelModalVisible(true)}
                  style={[styles.sendButton, { flex: 0.4, backgroundColor: '#336699' }]}
                  accessible={true}
                  accessibilityLabel="Abrir canales"
                  accessibilityRole="button"
                >
                  <Text style={[styles.sendButtonText, { fontSize: 14 }]}>Canales</Text>
                </SelfVoicingTouchable>
              )}

              {uiMode === 'completo' && (
                <View style={styles.historyArrowsContainer}>
                  <TouchableOpacity
                    style={styles.historyArrowButton}
                    onPress={handleUpArrow}
                    accessible={true}
                    accessibilityLabel="Comando anterior"
                    accessibilityRole="button"
                  >
                    <Text style={styles.historyArrowText}>↑</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.historyArrowButton}
                    onPress={handleDownArrow}
                    accessible={true}
                    accessibilityLabel="Comando siguiente"
                    accessibilityRole="button"
                  >
                    <Text style={styles.historyArrowText}>↓</Text>
                  </TouchableOpacity>
                </View>
              )}

              <TextInput
                ref={textInputRef}
                style={styles.input}
                placeholder="Comando..."
                placeholderTextColor="#888"
                value={inputText}
                selection={inputSelection}
                onChangeText={(text) => {
                  if (selfVoicingActive) announceTyping(inputText, text);
                  setInputText(text);
                  setHistoryIndex(-1);
                }}
                onSelectionChange={(e) => setInputSelection(e.nativeEvent.selection)}
                onLayout={registerInputRect}
                onFocus={handleInputFocus}
                onBlur={() => setInputFocused(false)}
                onSubmitEditing={handleSendInput}
                blurOnSubmit={false}
                returnKeyType="send"
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                accessible={true}
                accessibilityLabel="Entrada de comando"
                accessibilityHint="Escribe un comando y presiona enviar o enter"
              />

              <SelfVoicingTouchable
                svActive={selfVoicingActive}
                svScope="default"
                svKey="send"
                svLabel="Enviar comando"
                onPress={handleSendInput}
                style={[
                  styles.sendButton,
                  uiMode === 'blind' && { flex: 0.4 }
                ]}
                accessible={true}
                accessibilityLabel="Enviar comando"
                accessibilityRole="button"
                accessibilityHint="Envía el comando actual al servidor"
              >
                <Text style={[styles.sendButtonText, uiMode === 'blind' && { fontSize: 14 }]}>
                  {uiMode === 'blind' ? 'Enviar' : '›'}
                </Text>
              </SelfVoicingTouchable>

              {uiMode === 'completo' && (
                <>
                  <TouchableOpacity
                    style={[styles.compactButton, { backgroundColor: '#336699' }]}
                    onPress={() => setBlindChannelModalVisible(true)}
                    accessible={true}
                    accessibilityLabel="Abrir canales"
                    accessibilityRole="button"
                    accessibilityHint="Abre el panel de mensajes de canales"
                  >
                    <Text style={styles.compactButtonText}>💬</Text>
                  </TouchableOpacity>
                  {globalSoundsEnabled && (
                    <TouchableOpacity
                      style={[styles.compactButton, { backgroundColor: silentModeEnabled ? '#ff6600' : '#666666' }]}
                      onPress={toggleSilentMode}
                      accessible={true}
                      accessibilityLabel={`Silenciar sonidos ${silentModeEnabled ? 'desactivado' : 'activado'}`}
                      accessibilityRole="button"
                      accessibilityHint="Activa/desactiva los sonidos de eventos"
                    >
                      <Text style={styles.compactButtonText}>{silentModeEnabled ? '🔇' : '🔊'}</Text>
                    </TouchableOpacity>
                  )}
                  {globalAmbientEnabled && (
                    <TouchableOpacity
                      style={[styles.compactButton, { backgroundColor: ambientEnabled ? '#3a5a3a' : '#666666' }]}
                      onPress={toggleAmbient}
                      accessible={true}
                      accessibilityLabel={`Música ambiente ${ambientEnabled ? 'activada' : 'desactivada'}`}
                      accessibilityRole="button"
                      accessibilityHint="Activa/desactiva la música de fondo según tipo de sala"
                    >
                      <Text style={styles.compactButtonText}>🎵</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}

              <SelfVoicingTouchable
                svActive={selfVoicingActive}
                svScope="default"
                svKey="settings"
                svLabel="Configuración"
                onPress={() => navigation.navigate('Settings', { sourceLocation: 'terminal' })}
                style={[
                  styles.compactButton,
                  { backgroundColor: '#663366' },
                  uiMode === 'blind' && styles.blindTextButton,
                ]}
                accessible={true}
                accessibilityLabel="Configuración"
                accessibilityRole="button"
                accessibilityHint="Abre la configuración de la aplicación"
              >
                <Text style={[styles.compactButtonText, uiMode === 'blind' && { fontSize: 14 }]}>
                  {uiMode === 'blind' ? 'Ajustes' : '⚙️'}
                </Text>
              </SelfVoicingTouchable>
            </>
          ) : (
            <TouchableOpacity
              ref={reconnectButtonRef as any}
              onLayout={registerReconnectRect}
              style={[styles.input, styles.reconnectButton, connecting && { opacity: 0.5 }]}
              onPress={() => selfVoicingPress.tap(selfVoicingActive, 'reconnect', connecting ? 'Conectando' : 'Reconectar', handleReconnect)}
              disabled={connecting}
              accessible={true}
              accessibilityLabel={connecting ? 'Conectando' : 'Reconectar'}
              accessibilityRole="button"
              accessibilityState={{ disabled: connecting }}
              accessibilityHint={connecting ? 'Conectando al servidor' : 'Reconéctate al servidor'}
            >
              <Text style={styles.reconnectText}>{connecting ? 'Conectando…' : 'Reconectar'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ButtonGrid - Full size in completo mode, compact in blind mode */}
        {(uiMode === 'completo' || uiMode === 'blind') && (
          <View style={[styles.buttonGridSection, { height: buttonGridHeight }]}>
            <ButtonGrid
              buttons={filteredButtons}
              onSendCommand={sendCommand}
              onAddTextButton={handleAddTextButton}
              onShowFloating={handleShowFloating}
              onEditButton={handleEditButton}
              moveMode={moveMode}
              sourceCol={sourceCol}
              sourceRow={sourceRow}
              onSwapButtons={handleSwapButtons}
              uiMode={uiMode}
              selfVoicingActive={selfVoicingActive}
              minimalista={isMinimalista}
              minCols={gridCols}
              minRows={gridRows}
              disableTransforms={isCustomCompleto}
              verticalCellSize={isCustomCompleto ? cellSize : undefined}
            />
          </View>
        )}
      </View>
      ) : (
      // HORIZONTAL LAYOUT
      <View style={[styles.container, styles.containerHorizontal]}>
        {/* Terminal + Input Left Column */}
        <View style={{ width: horizontalTerminalWidth, flex: 0, flexDirection: 'column' }}>
          {/* Terminal */}
          <View
            style={[styles.terminalSection, { flex: 1 }]}
            accessible={true}
            accessibilityLabel="Salida del terminal"
            accessibilityRole="text"
            accessibilityLiveRegion={uiMode === 'blind' ? 'polite' : 'none'}
            accessibilityHint="Ventana de terminal de solo lectura. Usa las flechas o desliza para navegar."
            {...terminalPanResponder.panHandlers}
            onStartShouldSetResponder={() => false}
            onTouchStart={(evt) => {
              const touchCount = evt.nativeEvent.touches.length;
              if (touchCount === 1) {
                handleDoubleTap(1);
              } else {
                lastTapRef.current = 0;
                // Sticky para bloquear el swipe-1-dedo al release; ver
                // comentario en `multiTouchGestureRef`.
                multiTouchGestureRef.current = true;
              }
              if (!gesturesEnabledRef.current || !gesturesAvailable) return;
              if (touchCount === 2) {
                const [t1, t2] = evt.nativeEvent.touches;
                const dx = t2.pageX - t1.pageX;
                const dy = t2.pageY - t1.pageY;
                twoFingersStartRef.current = {
                  x: (t1.pageX + t2.pageX) / 2,
                  y: (t1.pageY + t2.pageY) / 2,
                };
                pinchStartDistanceRef.current = Math.hypot(dx, dy);
                pinchAngleRef.current = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
                pinchActiveRef.current = true;
                twoFingersActiveRef.current = true;
                twoFingersMovedRef.current = false;
                twoFingersTapStartRef.current = Date.now();
              }
            }}
            onTouchMove={(evt) => {
              if (!pinchActiveRef.current || evt.nativeEvent.touches.length !== 2) return;
              const [t1, t2] = evt.nativeEvent.touches;
              const centroidX = (t1.pageX + t2.pageX) / 2;
              const centroidY = (t1.pageY + t2.pageY) / 2;
              const centroidDx = centroidX - twoFingersStartRef.current.x;
              const centroidDy = centroidY - twoFingersStartRef.current.y;
              const centroidMove = Math.hypot(centroidDx, centroidDy);

              const newDist = Math.hypot(t2.pageX - t1.pageX, t2.pageY - t1.pageY);
              const pinchDelta = Math.abs(newDist - pinchStartDistanceRef.current);

              if (centroidMove > 30 && !twoFingersMovedRef.current) {
                const direction = detectSwipeDirection(centroidDx, centroidDy) as GestureType;
                const gestureType = direction.replace('swipe_', 'twofingers_') as GestureType;
                triggerGesture(gestureType);
                pinchActiveRef.current = false;
                twoFingersMovedRef.current = true;
                twoFingersTapStartRef.current = 0;
              } else if (pinchDelta > 40 && !twoFingersMovedRef.current) {
                const pinchType = newDist > pinchStartDistanceRef.current ? 'pinch_out' : 'pinch_in';
                triggerGesture(pinchType);
                pinchActiveRef.current = false;
                twoFingersMovedRef.current = true;
                twoFingersTapStartRef.current = 0;
              }
            }}
            onTouchEnd={(evt) => {
              if (evt.nativeEvent.touches.length === 0) {
                handleTwoFingersTouchEnd();
              }
              pinchActiveRef.current = false;
              twoFingersActiveRef.current = false;
              twoFingersMovedRef.current = false;
            }}
          >
            <FlatList
              ref={flatListRef}
              data={reversedLines}
              inverted
              keyExtractor={item => String(item.id)}
              renderItem={({ item }) => (
                <Pressable
                  key={item.id}
                  style={styles.lineContainer}
                  onPress={selfVoicingActive ? () => {
                    const text = item.spans.map(s => s.text).join('').trim();
                    if (text) speechQueue.enqueue(text, 'high');
                  } : undefined}
                >
                  <AnsiText spans={item.spans} fontSize={fontSize} lineId={item.id} />
                </Pressable>
              )}
              scrollEnabled={uiMode === 'blind' && !selfVoicingActive}
              scrollEventThrottle={16}
              onScroll={handleFlatListScroll}
              onScrollEndDrag={handleFlatListScroll}
              style={styles.flatList}
              accessible={true}
              accessibilityLabel={`Terminal con ${lines.length} líneas`}
            />

            {uiMode === 'completo' && !isAtBottom && (
              <TouchableOpacity style={styles.scrollToTopButton} onPress={handleScrollToTop}>
                <Text style={styles.scrollButtonText}>⬆</Text>
              </TouchableOpacity>
            )}

            {showScrollToBottom && (
              <TouchableOpacity style={styles.scrollToBottomButton} onPress={handleScrollToBottom}>
                <Text style={styles.scrollToBottomText}>⬇</Text>
              </TouchableOpacity>
            )}

            {uiMode === 'completo' && (
              <View style={styles.miniMapContainer} pointerEvents="box-none">
                <MiniMap
                  ref={miniMapRef}
                  mapService={mapServiceRef.current}
                  currentRoom={currentRoom}
                  visible={mapVisible}
                  onToggle={() => setMapVisible(!mapVisible)}
                  walking={walking}
                  onStop={stopWalk}
                  selectedRoomId={previewRoomId}
                  onSelectRoom={(room) => {
                    if (previewRoomId === room.id) {
                      setPreviewRoomId(null);
                      walkTo(room);
                    } else {
                      setPreviewRoomId(room.id);
                    }
                  }}
                />
              </View>
            )}
          </View>

          {/* Nick autocomplete bar (blind mode only). */}
          <NickAutocomplete
            visible={uiMode === 'blind' && inputFocused}
            suggestions={nickSuggestions}
            onSelect={handleSelectNickSuggestion}
            selfVoicingActive={selfVoicingActive}
          />

          {selfVoicingActive && screenReaderOn && (
            <View style={styles.selfVoicingWarning}>
              <Text style={styles.selfVoicingWarningText}>
                ⚠ Hay un lector de pantalla activo. Desactívalo con el atajo de accesibilidad del sistema (Vol+ y Vol- 3 s).
              </Text>
            </View>
          )}

          {/* Input Row - Horizontal */}
          <View style={[styles.inputSection, { height: inputHeight }]}>
            {connected ? (
              <>
                {uiMode === 'blind' && globalSoundsEnabled && (
                  <SelfVoicingTouchable
                    svActive={selfVoicingActive}
                    svScope="default"
                    svKey="silent"
                    svLabel={`Modo Silencio ${silentModeEnabled ? 'activado' : 'desactivado'}`}
                    onPress={toggleSilentMode}
                    style={[styles.sendButton, { flex: 0.4, backgroundColor: silentModeEnabled ? '#ff6600' : '#666666' }]}
                    accessible={true}
                    accessibilityLabel={`Modo Silencio ${silentModeEnabled ? 'activado' : 'desactivado'}`}
                    accessibilityRole="button"
                    accessibilityHint={`Lee los mensajes en voz alta. Estado: ${silentModeEnabled ? 'ON' : 'OFF'}`}
                  >
                    <Text style={[styles.sendButtonText, { fontSize: 14 }]}>{silentModeEnabled ? 'Silencio' : 'Sonido'}</Text>
                  </SelfVoicingTouchable>
                )}

                {uiMode === 'blind' && globalAmbientEnabled && (
                  <SelfVoicingTouchable
                    svActive={selfVoicingActive}
                    svScope="default"
                    svKey="ambient"
                    svLabel={`Música ambiente ${ambientEnabled ? 'activada' : 'desactivada'}`}
                    onPress={toggleAmbient}
                    style={[styles.sendButton, { flex: 0.4, backgroundColor: ambientEnabled ? '#3a5a3a' : '#666666' }]}
                    accessible={true}
                    accessibilityLabel={`Música ambiente ${ambientEnabled ? 'activada' : 'desactivada'}`}
                    accessibilityRole="button"
                    accessibilityHint="Activa o desactiva la música de fondo"
                  >
                    <Text style={[styles.sendButtonText, { fontSize: 14 }]}>{ambientEnabled ? 'Música' : 'Sin música'}</Text>
                  </SelfVoicingTouchable>
                )}

                {uiMode === 'blind' && (
                  <SelfVoicingTouchable
                    svActive={selfVoicingActive}
                    svScope="default"
                    svKey="channels"
                    svLabel="Abrir canales"
                    onPress={() => setBlindChannelModalVisible(true)}
                    style={[styles.sendButton, { flex: 0.4, backgroundColor: '#336699' }]}
                    accessible={true}
                    accessibilityLabel="Abrir canales"
                    accessibilityRole="button"
                  >
                    <Text style={[styles.sendButtonText, { fontSize: 14 }]}>Canales</Text>
                  </SelfVoicingTouchable>
                )}

                {uiMode === 'completo' && (
                  <View style={styles.historyArrowsContainer}>
                    <TouchableOpacity
                      style={styles.historyArrowButton}
                      onPress={handleUpArrow}
                      accessible={true}
                      accessibilityLabel="Comando anterior"
                      accessibilityRole="button"
                    >
                      <Text style={styles.historyArrowText}>↑</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.historyArrowButton}
                      onPress={handleDownArrow}
                      accessible={true}
                      accessibilityLabel="Comando siguiente"
                      accessibilityRole="button"
                    >
                      <Text style={styles.historyArrowText}>↓</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <TextInput
                  ref={textInputRef}
                  style={styles.input}
                  placeholder="Comando..."
                  placeholderTextColor="#888"
                  value={inputText}
                  selection={inputSelection}
                  onChangeText={(text) => {
                    if (selfVoicingActive) announceTyping(inputText, text);
                    setInputText(text);
                    setHistoryIndex(-1);
                  }}
                  onSelectionChange={(e) => setInputSelection(e.nativeEvent.selection)}
                  onLayout={registerInputRect}
                  onFocus={handleInputFocus}
                  onBlur={() => setInputFocused(false)}
                  onSubmitEditing={handleSendInput}
                  blurOnSubmit={false}
                  returnKeyType="send"
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  accessible={true}
                  accessibilityLabel="Entrada de comando"
                  accessibilityHint="Escribe un comando y presiona enviar o enter"
                />

                <SelfVoicingTouchable
                  svActive={selfVoicingActive}
                  svScope="default"
                  svKey="send"
                  svLabel="Enviar comando"
                  onPress={handleSendInput}
                  style={[
                    styles.sendButton,
                    uiMode === 'blind' && { flex: 0.4 }
                  ]}
                  accessible={true}
                  accessibilityLabel="Enviar comando"
                  accessibilityRole="button"
                  accessibilityHint="Envía el comando actual al servidor"
                >
                  <Text style={[styles.sendButtonText, uiMode === 'blind' && { fontSize: 14 }]}>
                    {uiMode === 'blind' ? 'Enviar' : '›'}
                  </Text>
                </SelfVoicingTouchable>

                {uiMode === 'completo' && (
                  <>
                    <TouchableOpacity
                      style={[styles.compactButton, { backgroundColor: '#336699' }]}
                      onPress={() => setBlindChannelModalVisible(true)}
                      accessible={true}
                      accessibilityLabel="Abrir canales"
                      accessibilityRole="button"
                      accessibilityHint="Abre el panel de mensajes de canales"
                    >
                      <Text style={styles.compactButtonText}>💬</Text>
                    </TouchableOpacity>
                    {globalSoundsEnabled && (
                      <TouchableOpacity
                        style={[styles.compactButton, { backgroundColor: silentModeEnabled ? '#ff6600' : '#666666' }]}
                        onPress={toggleSilentMode}
                        accessible={true}
                        accessibilityLabel={`Silenciar sonidos ${silentModeEnabled ? 'desactivado' : 'activado'}`}
                        accessibilityRole="button"
                        accessibilityHint="Activa/desactiva los sonidos de eventos"
                      >
                        <Text style={styles.compactButtonText}>{silentModeEnabled ? '🔇' : '🔊'}</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}

                <SelfVoicingTouchable
                  svActive={selfVoicingActive}
                  svScope="default"
                  svKey="settings"
                  svLabel="Configuración"
                  onPress={() => navigation.navigate('Settings', { sourceLocation: 'terminal' })}
                  style={[
                    styles.compactButton,
                    { backgroundColor: '#663366' },
                    uiMode === 'blind' && styles.blindTextButton,
                  ]}
                  accessible={true}
                  accessibilityLabel="Configuración"
                  accessibilityRole="button"
                  accessibilityHint="Abre la configuración de la aplicación"
                >
                  <Text style={[styles.compactButtonText, uiMode === 'blind' && { fontSize: 14 }]}>
                    {uiMode === 'blind' ? 'Ajustes' : '⚙️'}
                  </Text>
                </SelfVoicingTouchable>
              </>
            ) : (
              <TouchableOpacity
                ref={reconnectButtonRef as any}
                onLayout={registerReconnectRect}
                style={[styles.input, styles.reconnectButton, connecting && { opacity: 0.5 }]}
                onPress={() => selfVoicingPress.tap(selfVoicingActive, 'reconnect', connecting ? 'Conectando' : 'Reconectar', handleReconnect)}
                disabled={connecting}
                accessible={true}
                accessibilityLabel={connecting ? 'Conectando' : 'Reconectar'}
                accessibilityRole="button"
                accessibilityState={{ disabled: connecting }}
                accessibilityHint={connecting ? 'Conectando al servidor' : 'Reconéctate al servidor'}
              >
                <Text style={styles.reconnectText}>{connecting ? 'Conectando…' : 'Reconectar'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* VitalBars Vertical - Hidden in blind mode */}
        {uiMode === 'completo' && (
          <View style={{ width: vitalsWidth, height: availableHeight }}>
            <VitalBars
              hp={hp}
              hpMax={hpMax}
              energy={energy}
              energyMax={energyMax}
              orientation="vertical"
            />
          </View>
        )}

        {/* Right Panel - ButtonGrid - Shown in completo and blind modes */}
        {(uiMode === 'completo' || uiMode === 'blind') && (
          <View style={{ flex: 1, flexDirection: 'column' }}>
            {/* ButtonGrid Horizontal */}
            <View style={[styles.buttonGridSection, { flex: 1 }]}>
              <ButtonGrid
                buttons={filteredButtons}
                onSendCommand={sendCommand}
                onAddTextButton={handleAddTextButton}
                onShowFloating={handleShowFloating}
                onEditButton={handleEditButton}
                moveMode={moveMode}
                sourceCol={sourceCol}
                sourceRow={sourceRow}
                onSwapButtons={handleSwapButtons}
                horizontalMode={{cols: horizontalGridCols, cellSize: horizontalCellSize}}
                uiMode={uiMode}
                selfVoicingActive={selfVoicingActive}
                minimalista={isMinimalista}
                minCols={gridCols}
                minRows={horizontalGridRows}
                disableTransforms={isCustomCompleto}
              />
            </View>
          </View>
        )}
      </View>
      )}

      {/* Button Edit Modal — modal dedicado por modo:
          - blind+self-voicing → BlindButtonEditModal (lista plana navegable
            con swipe vertical, sin colores/preview/labels-título).
          - completo y blind+TalkBack → ButtonEditModal (UI visual completa
            con colores, preview, addText, etc.). */}
      {(() => {
        const targetButton = buttonLayout?.buttons.find(b => {
          if (b.col !== editButtonCol || b.row !== editButtonRow) return false;
          if (uiMode === 'blind') {
            return !b.blindPanel || b.blindPanel === currentBlindPanel;
          }
          return !b.completoPanel || b.completoPanel === currentCompletoPanel;
        }) || null;
        if (uiMode === 'blind' && selfVoicingActive) {
          return (
            <BlindButtonEditModal
              visible={editButtonVisible}
              col={editButtonCol}
              row={editButtonRow}
              button={targetButton}
              onSave={handleSaveEditButton}
              onDelete={handleDeleteButton}
              onClose={() => setEditButtonVisible(false)}
            />
          );
        }
        return (
          <ButtonEditModal
            visible={editButtonVisible}
            col={editButtonCol}
            row={editButtonRow}
            button={targetButton}
            onSave={handleSaveEditButton}
            onDelete={handleDeleteButton}
            onMove={handleMoveButton}
            onClose={() => setEditButtonVisible(false)}
            uiMode={uiMode}
            selfVoicingActive={selfVoicingActive}
          />
        );
      })()}

      {/* Panel management (long-press en switch button del modo completo) */}
      <PanelManagementModal
        visible={panelManagementVisible}
        panels={serverPanels}
        currentPanel={currentCompletoPanel}
        onClose={() => setPanelManagementVisible(false)}
        onAddPanel={handleAddPanel}
        onDeletePanel={handleDeletePanel}
        onSelectPanel={handleSelectPanel}
      />


      {/* Gesture pick modal */}
      <GesturePickerModal
        visible={gesturePickerState.visible}
        title={gesturePickerState.title}
        options={gesturePickerState.options}
        selfVoicingActive={selfVoicingActive}
        onPick={gesturePickerState.onPick}
        onCancel={closeGesturePicker}
      />

      {/* Channel Modal */}
      {(uiMode === 'blind' || uiMode === 'completo') && (
        <BlindChannelModal
          visible={blindChannelModalVisible}
          onClose={() => setBlindChannelModalVisible(false)}
          channels={channels}
          channelAliases={channelAliases}
          channelOrder={channelOrder}
          channelMessages={channelMessages}
          onSendMessage={(cmd) => {
            telnetRef.current?.send(cmd);
            lastSentChannelTime.current = Date.now();
          }}
          onAliasChange={(ch, alias) => {
            const updated = { ...channelAliases, [ch]: alias };
            setChannelAliases(updated);
            saveChannelAliases(server.id, updated);
          }}
          onOrderChange={(order) => {
            setChannelOrder(order);
            saveChannelOrder(server.id, order);
          }}
          fontSize={fontSize}
          selfVoicingActive={selfVoicingActive}
        />
      )}

      {/* Room Search Results */}
      <RoomSearchResults
        rooms={searchResults}
        visible={searchVisible}
        highlightedRoomId={previewRoomId}
        uiMode={uiMode}
        onSelect={(room) => {
          if (uiMode === 'completo') {
            if (previewRoomId === room.id) {
              const stealth = pendingStealthSearchRef.current;
              pendingStealthSearchRef.current = false;
              setPreviewRoomId(null);
              setSearchVisible(false);
              miniMapRef.current?.resetView();
              walkTo(room, { stealth });
            } else {
              setPreviewRoomId(room.id);
              miniMapRef.current?.previewRoom(room);
            }
          } else {
            const stealth = pendingStealthSearchRef.current;
            pendingStealthSearchRef.current = false;
            setPreviewRoomId(null);
            setSearchVisible(false);
            walkTo(room, { stealth });
          }
        }}
        onClose={() => {
          pendingStealthSearchRef.current = false;
          setSearchVisible(false);
          setPreviewRoomId(null);
          miniMapRef.current?.resetView();
        }}
      />

      {/* Exit confirmation modal (blind mode) */}
      <Modal
        visible={exitConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={cancelExit}
      >
        <View style={styles.exitModalOverlay} accessibilityViewIsModal>
          <View style={styles.exitModalBox}>
            <Text style={styles.exitModalTitle} accessibilityRole="header">
              ¿Salir y desconectar?
            </Text>
            <Text style={styles.exitModalDesc}>
              Se cerrará la conexión al servidor.
            </Text>
            <View style={styles.exitModalButtons}>
              <TouchableOpacity
                style={[styles.exitModalButton, styles.exitModalButtonCancel]}
                onPress={cancelExit}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Cancelar, volver al terminal"
              >
                <Text style={styles.exitModalButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.exitModalButton, styles.exitModalButtonConfirm]}
                onPress={confirmExit}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Sí, salir y desconectar"
              >
                <Text style={styles.exitModalButtonText}>Sí, salir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Exit toast (normal mode) */}
      {exitToastVisible && (
        <View
          style={[styles.exitToast, { bottom: insets.bottom + 40 }]}
          pointerEvents="none"
        >
          <Text style={styles.exitToastText}>
            Pulsa atrás de nuevo para salir
          </Text>
        </View>
      )}

      {selectionMode && uiMode === 'completo' && (
        <View style={styles.selectionBar} pointerEvents="box-none">
          <View style={styles.selectionBarInner}>
            <TouchableOpacity onPress={copySelectedAsText} style={styles.selectionBtn}>
              <Text style={styles.selectionBtnText}>Copiar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={cancelSelection} style={[styles.selectionBtn, styles.selectionBtnCancel]}>
              <Text style={styles.selectionBtnText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <FloatingMessages />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  selfVoicingWarning: {
    backgroundColor: '#5a3a00',
    borderTopWidth: 1,
    borderTopColor: '#ff8800',
    borderBottomWidth: 1,
    borderBottomColor: '#ff8800',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  selfVoicingWarningText: {
    color: '#ffcc66',
    fontSize: 12,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    flexDirection: 'column',
  },
  containerHorizontal: {
    flexDirection: 'row',
  },
  terminalSection: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    overflow: 'hidden',
  },
  flatList: {
    flex: 1,
  },
  lineContainer: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  lineSelected: {
    backgroundColor: 'rgba(85, 170, 221, 0.3)',
  },
  selectionBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: 8,
  },
  selectionBarInner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    borderRadius: 8,
    padding: 6,
    gap: 6,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  selectionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#2a5a7a',
    borderRadius: 6,
  },
  selectionBtnCancel: {
    backgroundColor: '#5a2a2a',
  },
  selectionBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  scrollToBottomButton: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: '#3399cc',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollToBottomText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  scrollToTopButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#3399cc',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  miniMapContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 200,
    height: 200,
    zIndex: 100,
  },
  vitalsSection: {
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 0,
    padding: 0,
  },
  inputSection: {
    flexDirection: 'row',
    paddingHorizontal: 2,
    paddingVertical: 0,
    gap: 2,
    backgroundColor: '#222',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  arrowButton: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#333',
    borderRadius: 2,
    paddingHorizontal: 6,
  },
  arrowText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  input: {
    flex: 1,
    backgroundColor: '#333',
    color: '#fff',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 0,
    fontSize: 14,
    textAlignVertical: 'center',
  },
  sendButton: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#3399cc',
    borderRadius: 4,
    paddingHorizontal: 12,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  reconnectButton: {
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
  },
  reconnectText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  buttonGridSection: {
    overflow: 'hidden',
  },
  locateFeedback: {
    position: 'absolute',
    bottom: 50,
    left: 10,
    right: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
  },
  locateFeedbackSuccess: {
    backgroundColor: '#0c0',
  },
  locateFeedbackFailed: {
    backgroundColor: '#c00',
  },
  locateFeedbackText: {
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  locateFeedbackTextSuccess: {
    color: '#000',
  },
  locateFeedbackTextFailed: {
    color: '#fff',
  },
  statFeedback: {
    backgroundColor: '#223366',
  },
  statFeedbackText: {
    color: '#88ccff',
  },
  historyArrowsContainer: {
    flexDirection: 'row',
    gap: 4,
  },
  historyArrowButton: {
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#333',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#555',
  },
  historyArrowText: {
    color: '#0c0',
    fontSize: 16,
    fontWeight: 'bold',
  },
  compactButton: {
    width: 40,
    alignSelf: 'stretch',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
  },
  compactButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  // Width override for blind-mode "compact" buttons that show text instead of an icon.
  blindTextButton: {
    width: undefined,
    paddingHorizontal: 12,
  },
  exitModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  exitModalBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    padding: 20,
    minWidth: 280,
    maxWidth: 400,
  },
  exitModalTitle: {
    color: '#00cc00',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  exitModalDesc: {
    color: '#ccc',
    fontSize: 14,
    marginBottom: 20,
  },
  exitModalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  exitModalButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 4,
    marginLeft: 8,
  },
  exitModalButtonCancel: {
    backgroundColor: '#333',
  },
  exitModalButtonConfirm: {
    backgroundColor: '#662222',
  },
  exitModalButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  exitToast: {
    position: 'absolute',
    left: 24,
    right: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  exitToastText: {
    color: '#fff',
    fontSize: 14,
  },
});
