// Hooks y estilos comunes a todas las sub-pantallas de Settings. Centraliza la
// infraestructura de self-voicing (scope, blindNav, auto-scroll) y la lógica
// de carga/persistencia de `AppSettings` para que cada sub-pantalla solo se
// preocupe de los rows que muestra.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { AppSettings, loadSettings, saveSettings, rebuildGestures } from '../../storage/settingsStorage';
import { DEFAULT_SETTINGS } from '../../storage/settingsStorage';
import { speechQueue } from '../../services/speechQueueService';
import { ambientPlayer } from '../../services/ambientPlayer';
import { buttonRegistry, blindNav, remeasureBus } from '../../utils/selfVoicingPress';

export type SourceLocation = 'terminal' | 'serverlist';

const SETTING_LABELS: Partial<Record<keyof AppSettings, string>> = {
  soundsEnabled: 'Sonidos',
  ambientEnabled: 'Música ambiente',
  useSelfVoicing: 'Self-voicing TTS',
  keepAwakeEnabled: 'Pantalla siempre encendida',
  notificationsEnabled: 'Notificaciones',
  logsEnabled: 'Logs',
  gesturesEnabled: 'Gestos',
  backgroundConnectionEnabled: 'Conexión en segundo plano',
  uiMode: 'Modo',
  encoding: 'Codificación',
  fontSize: 'Tamaño de letra',
  speechCharDurationMs: 'Velocidad de lectura',
  ttsRate: 'Velocidad TTS',
  ttsPitch: 'Tono TTS',
  ttsVolume: 'Volumen TTS',
  ttsEngine: 'Motor TTS',
  ttsVoice: 'Voz TTS',
  ambientVolume: 'Volumen ambiente',
  effectsVolume: 'Volumen efectos',
  logsMaxLines: 'Líneas máximas de log',
};

export interface UseSettingsBundle {
  settings: AppSettings;
  setSettings: (s: AppSettings) => void;
  // Persiste el cambio + aplica side effects (ambient player, speech queue,
  // anuncio en self-voicing) y devuelve el nuevo objeto. Llama a
  // `loadSettings()` SOLO al montar; el resto de operaciones leen de memoria.
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  settingsSelfVoicingActive: boolean;
  selfVoicingActive: boolean;
}

// Hook que carga settings al montar y devuelve `updateSetting` con los side
// effects que cada toggle del Settings antiguo hacía inline. La sub-pantalla
// añade su propio gating (rows visibles según uiMode/sourceLocation/etc.).
export function useSettings(sourceLocation: SourceLocation): UseSettingsBundle {
  const [settings, setSettings] = useState<AppSettings>(() => ({ ...DEFAULT_SETTINGS }));

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const settingsSelfVoicingActive =
    settings.useSelfVoicing && settings.uiMode === 'blind' && sourceLocation === 'terminal';
  const selfVoicingActive = settings.useSelfVoicing && settings.uiMode === 'blind';

  const updateSetting = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      setSettings((prev) => {
        let updated = { ...prev, [key]: value };
        if (key === 'uiMode') updated = rebuildGestures(updated);
        saveSettings(updated);

        // Push a speechQueue: cubre uiMode, useSelfVoicing, tts*,
        // speechCharDurationMs. Aplica inmediato sin esperar restart.
        speechQueue.applyConfig(updated);

        // Anuncia el cambio si self-voicing está activo.
        if (settingsSelfVoicingActive) {
          const label = SETTING_LABELS[key] || String(key);
          const stateText = typeof value === 'boolean'
            ? (value ? 'activado' : 'desactivado')
            : String(value);
          speechQueue.enqueue(`${label}: ${stateText}`, 'high');
        }

        // Audio: aplicar inmediato sin esperar a recargar la app.
        if (key === 'ambientEnabled' && typeof value === 'boolean') {
          ambientPlayer.setEnabled(value);
        } else if (key === 'ambientVolume' && typeof value === 'number') {
          ambientPlayer.setAmbientVolume(value);
        }
        return updated;
      });
    },
    [settingsSelfVoicingActive],
  );

  return { settings, setSettings, updateSetting, settingsSelfVoicingActive, selfVoicingActive };
}

// Hook que activa/desactiva el scope de drag-explore para esta sub-pantalla.
// Cada sub-pantalla tiene su propio scope (settings-appearance, settings-
// sound, etc.) para que los `register()` de sus controles no colisionen con
// los de otras pantallas que estén en la stack debajo.
export function useSettingsScope(scope: string, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    buttonRegistry.setActiveScope(scope);
    return () => buttonRegistry.setActiveScope('default');
  }, [scope, active]);
}

// Hook para el ScrollView con auto-scroll cuando blindNav cambia el item
// enfocado. Replica el comportamiento del SettingsScreen original.
export function useBlindNavAutoScroll(blindNavActive: boolean) {
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const scrollViewLayoutRef = useRef<{ pageY: number; height: number }>({ pageY: 0, height: 0 });

  useEffect(() => {
    if (!blindNavActive) return;
    let lastKey: string | null = null;
    const interval = setInterval(() => {
      const key = blindNav.getCurrentKey();
      if (!key || key === lastKey) return;
      lastKey = key;
      const entry = buttonRegistry.getEntry(key);
      if (!entry) return;
      const { pageY: svPageY, height: svHeight } = scrollViewLayoutRef.current;
      if (svHeight <= 0) return;
      const rectTop = entry.y;
      const rectBottom = entry.y + entry.h;
      const margin = 40;
      let delta = 0;
      if (rectTop < svPageY + margin) {
        delta = rectTop - svPageY - margin;
      } else if (rectBottom > svPageY + svHeight - margin) {
        delta = rectBottom - svPageY - svHeight + margin;
      }
      if (delta !== 0) {
        const target = Math.max(0, scrollOffsetRef.current + delta);
        scrollViewRef.current?.scrollTo({ y: target, animated: true });
        setTimeout(() => remeasureBus.emit(), 150);
        setTimeout(() => remeasureBus.emit(), 400);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [blindNavActive]);

  return {
    scrollViewRef,
    scrollOffsetRef,
    scrollViewLayoutRef,
    onScroll: (e: any) => {
      scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
    },
    onLayout: (e: any) => {
      (e.target as any)?.measure?.((_x: number, _y: number, _w: number, h: number, _pageX: number, pageY: number) => {
        scrollViewLayoutRef.current = { pageY, height: h };
      });
    },
  };
}

// Welcome message para el BlindGestureContainer — mismo texto en todas las
// sub-pantallas porque las gestures son universales (tap/swipe/long-press).
// Incluye recordatorio del back del sistema porque el botón "Volver" del
// header está fuera del BlindGestureContainer y no es navegable por gestos.
export function useSettingsWelcomeMessage(title: string) {
  return useMemo(
    () =>
      `${title}. Desliza arriba o abajo para cambiar de opción. Toca en cualquier sitio para activar la opción actual. Mantén pulsado para repetir el anuncio. Desliza a los lados para subir o bajar valores cuando se pueda. Pulsa atrás del sistema para volver.`,
    [title],
  );
}

// Estilos compartidos por todas las sub-pantallas. Replica los del Settings
// original 1:1 para que el aspecto no cambie. Cada sub-pantalla puede añadir
// los suyos vía StyleSheet.flatten o spread.
export const settingsStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: {
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backBtn: { marginBottom: 8 },
  backText: { color: '#0c0', fontSize: 14, fontFamily: 'monospace' },
  title: { color: '#fff', fontSize: 20, fontWeight: 'bold', fontFamily: 'monospace' },
  subtitle: { color: '#888', fontSize: 11, fontFamily: 'monospace', marginTop: 6, lineHeight: 16 },
  section: { flex: 1 },
  sectionContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16 },
  sectionHeader: { marginBottom: 12 },
  sectionTitle: {
    color: '#0c0',
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  marginTop: { marginTop: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 10,
  },
  rowInfo: { flex: 1, marginRight: 12 },
  rowTitle: { color: '#ccc', fontSize: 14, fontWeight: 'bold', fontFamily: 'monospace', marginBottom: 4 },
  rowDesc: { color: '#666', fontSize: 11, fontFamily: 'monospace' },
  audioVolumesBlock: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 10,
  },
  fontSizeControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  fontBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0a3a0a',
    borderWidth: 1,
    borderColor: '#0c0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fontBtnDisabled: { backgroundColor: '#1a1a1a', borderColor: '#333' },
  fontBtnText: { color: '#0c0', fontSize: 18, fontWeight: 'bold', fontFamily: 'monospace' },
  fontBtnTextDisabled: { color: '#333' },
  fontSizeValue: {
    color: '#0c0',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    minWidth: 30,
    textAlign: 'center',
  },
  encodingBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: '#0a3a0a',
    borderWidth: 1,
    borderColor: '#0c0',
  },
  encodingBtnText: { color: '#0c0', fontSize: 13, fontWeight: 'bold', fontFamily: 'monospace' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  encodingModalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: '#333',
    overflow: 'hidden',
  },
  encodingModalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', padding: 16, fontFamily: 'monospace' },
  encodingOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  encodingOptionSelected: { backgroundColor: '#0a3a0a' },
  encodingOptionText: { color: '#888', fontSize: 14, fontFamily: 'monospace' },
  encodingOptionTextSelected: { color: '#0c0', fontWeight: 'bold' },
  encodingModalCloseBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0c0',
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  encodingModalCloseBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    fontFamily: 'monospace',
  },
});
