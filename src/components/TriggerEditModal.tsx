import React, { useMemo, useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  FlatList,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { ActionTextBlock, AnchorMode, PatternBlock, Trigger, TriggerAction, TriggerType, VariableCondition } from '../types';
import { AVAILABLE_SOUNDS } from '../storage/settingsStorage';
import { CustomSound, addCustomSound, loadCustomSounds } from '../storage/customSoundsStorage';
import { TriggerPatternBuilder } from './TriggerPatternBuilder';
import { TriggerActionTextBuilder } from './TriggerActionTextBuilder';
import { captureColors, captureLabels, compileActionText, compilePattern, findOrphanCaptureRefs } from '../utils/triggerCompiler';
import { useSounds } from '../contexts/SoundContext';
import { VARIABLE_SPECS, getVariableSpec } from '../utils/variableMap';

const BUILTIN_PREFIX = 'builtin:';
const CUSTOM_PREFIX = 'custom:';

export function getSoundLabel(soundKey: string, customSounds: CustomSound[]): string {
  if (!soundKey) return '';
  if (soundKey.startsWith(CUSTOM_PREFIX)) {
    const filename = soundKey.slice(CUSTOM_PREFIX.length);
    const cs = customSounds.find((s) => s.filename === filename);
    return cs ? cs.name : `(falta) ${filename}`;
  }
  const path = soundKey.startsWith(BUILTIN_PREFIX) ? soundKey.slice(BUILTIN_PREFIX.length) : soundKey;
  return (AVAILABLE_SOUNDS as Record<string, string>)[path] || path;
}

const ACTION_TYPES: Array<{ key: TriggerAction['type']; label: string }> = [
  { key: 'gag', label: 'Silenciar línea (gag)' },
  { key: 'color', label: 'Recolorear línea' },
  { key: 'replace', label: 'Reemplazar texto' },
  { key: 'play_sound', label: 'Reproducir sonido' },
  { key: 'send', label: 'Enviar comando' },
  { key: 'notify', label: 'Notificación del sistema' },
  { key: 'floating', label: 'Mensaje flotante' },
];

// Variable triggers don't see a line (the prompt line is gagged), so actions
// that mutate the line (gag, replace, color) are excluded.
const VARIABLE_ACTION_TYPES: Array<{ key: TriggerAction['type']; label: string }> = [
  { key: 'play_sound', label: 'Reproducir sonido' },
  { key: 'send', label: 'Enviar comando' },
  { key: 'notify', label: 'Notificación del sistema' },
  { key: 'floating', label: 'Mensaje flotante' },
];

type VariableEvent = VariableCondition['event'];

const VARIABLE_EVENTS: Array<{ key: VariableEvent; label: string; needsValue: boolean; numericOnly: boolean; hint: string }> = [
  { key: 'appears', label: 'aparece', needsValue: false, numericOnly: false, hint: 'Pasa de 0/vacío a un valor real' },
  { key: 'changes', label: 'cambia', needsValue: false, numericOnly: false, hint: 'Cualquier cambio de valor' },
  { key: 'equals', label: 'igual a', needsValue: true, numericOnly: false, hint: 'Valor exactamente igual a X' },
  { key: 'crosses_below', label: 'baja de', needsValue: true, numericOnly: true, hint: 'Estaba ≥N, ahora <N (solo números)' },
  { key: 'crosses_above', label: 'sube de', needsValue: true, numericOnly: true, hint: 'Estaba ≤N, ahora >N (solo números)' },
];

const FLOATING_LEVELS: Array<{ key: 'info' | 'success' | 'error'; label: string; color: string }> = [
  { key: 'info', label: 'Info (azul)', color: '#223366' },
  { key: 'success', label: 'Éxito (verde)', color: '#0c0' },
  { key: 'error', label: 'Error (rojo)', color: '#c00' },
];

const COLOR_PRESETS = [
  '#ff5555', '#ff9955', '#ffff55', '#55ff55', '#55ffff', '#5599ff', '#dd55dd',
  '#ffffff', '#aaaaaa', '#666666',
];

interface Props {
  visible: boolean;
  initialTrigger: Trigger;
  onSave: (trigger: Trigger) => void;
  onCancel: () => void;
}

/**
 * Decides which mode to open the editor in for regex triggers.
 * - Respects an explicit `expertMode` flag if set (post-cajas-system saves).
 * - Legacy triggers (raw pattern with no blocks) stay in expert mode so the
 *   user can still see/edit their regex.
 * - Everything else (new triggers, post-migration triggers) defaults to cajas.
 */
function computeInitialExpertMode(trigger: Trigger): boolean {
  if (trigger.source.kind !== 'regex') return false;
  if (trigger.source.expertMode !== undefined) return trigger.source.expertMode;
  if (trigger.source.pattern && !trigger.source.blocks) return true;
  return false;
}

type TriggerKind = 'regex' | 'variable';

function getInitialKind(trigger: Trigger): TriggerKind {
  return trigger.source.kind === 'variable' ? 'variable' : 'regex';
}

function getInitialVarName(trigger: Trigger): string {
  return trigger.source.kind === 'variable' ? trigger.source.name : 'vida';
}

function getInitialVarEvent(trigger: Trigger): VariableEvent {
  return trigger.source.kind === 'variable' ? trigger.source.condition.event : 'changes';
}

function getInitialVarValue(trigger: Trigger): string {
  if (trigger.source.kind !== 'variable') return '';
  const cond = trigger.source.condition;
  if (cond.event === 'equals' || cond.event === 'crosses_below' || cond.event === 'crosses_above') {
    return String(cond.value);
  }
  return '';
}

export function TriggerEditModal({ visible, initialTrigger, onSave, onCancel }: Props) {
  const initialExpert = computeInitialExpertMode(initialTrigger);
  const initialKind = getInitialKind(initialTrigger);

  const [name, setName] = useState(initialTrigger.name);
  const [kind, setKind] = useState<TriggerKind>(initialKind);
  const [expertMode, setExpertMode] = useState<boolean>(initialExpert);
  const [blocks, setBlocks] = useState<PatternBlock[]>(
    initialTrigger.source.kind === 'regex' ? (initialTrigger.source.blocks ?? []) : [],
  );
  const [anchorStart, setAnchorStart] = useState<AnchorMode>(
    initialTrigger.source.kind === 'regex' ? (initialTrigger.source.anchorStart ?? 'open') : 'open',
  );
  const [anchorEnd, setAnchorEnd] = useState<AnchorMode>(
    initialTrigger.source.kind === 'regex' ? (initialTrigger.source.anchorEnd ?? 'open') : 'open',
  );
  const [rawPattern, setRawPattern] = useState<string>(
    initialTrigger.source.kind === 'regex' ? (initialTrigger.source.pattern || '') : '',
  );
  const [caseInsensitive, setCaseInsensitive] = useState(
    initialTrigger.source.kind === 'regex' ? (initialTrigger.source.flags || '').includes('i') : false,
  );
  const [varName, setVarName] = useState<string>(getInitialVarName(initialTrigger));
  const [varEvent, setVarEvent] = useState<VariableEvent>(getInitialVarEvent(initialTrigger));
  const [varValue, setVarValue] = useState<string>(getInitialVarValue(initialTrigger));
  const [varPickerVisible, setVarPickerVisible] = useState(false);
  const [actions, setActions] = useState<TriggerAction[]>(initialTrigger.actions);
  const [testInput, setTestInput] = useState('');
  const [actionPickerVisible, setActionPickerVisible] = useState(false);
  const [soundPickerIndex, setSoundPickerIndex] = useState<number | null>(null);
  const [soundPickerTab, setSoundPickerTab] = useState<'builtin' | 'custom'>('builtin');
  const [customSounds, setCustomSounds] = useState<CustomSound[]>([]);
  const { playSound } = useSounds();

  const refreshCustomSounds = useCallback(async () => {
    try {
      const list = await loadCustomSounds();
      setCustomSounds(list);
    } catch (e) {
      console.warn('[TriggerEditModal] loadCustomSounds error:', e);
    }
  }, []);

  React.useEffect(() => {
    if (visible) {
      const exp = computeInitialExpertMode(initialTrigger);
      const k = getInitialKind(initialTrigger);
      setName(initialTrigger.name);
      setKind(k);
      setExpertMode(exp);
      if (initialTrigger.source.kind === 'regex') {
        setBlocks(initialTrigger.source.blocks ?? []);
        setAnchorStart(initialTrigger.source.anchorStart ?? 'open');
        setAnchorEnd(initialTrigger.source.anchorEnd ?? 'open');
        setRawPattern(initialTrigger.source.pattern || '');
        setCaseInsensitive((initialTrigger.source.flags || '').includes('i'));
      } else {
        setBlocks([]);
        setAnchorStart('open');
        setAnchorEnd('open');
        setRawPattern('');
        setCaseInsensitive(false);
      }
      setVarName(getInitialVarName(initialTrigger));
      setVarEvent(getInitialVarEvent(initialTrigger));
      setVarValue(getInitialVarValue(initialTrigger));
      setActions(initialTrigger.actions);
      setTestInput('');
      refreshCustomSounds();
    }
  }, [visible, initialTrigger, refreshCustomSounds]);

  const handleUploadCustomSound = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const filename = asset.name || `sonido-${Date.now()}.mp3`;
      await addCustomSound(asset.uri, filename);
      await refreshCustomSounds();
    } catch (e: any) {
      Alert.alert('No se pudo añadir el sonido', e?.message ?? String(e));
    }
  }, [refreshCustomSounds]);

  const handlePickSoundForAction = (idx: number, soundKey: string) => {
    const a = actions[idx];
    if (a.type === 'play_sound') {
      handleUpdateAction(idx, { ...a, file: soundKey });
    }
    setSoundPickerIndex(null);
  };

  const compiled = useMemo(() => {
    if (kind === 'variable') {
      // Variable triggers don't compile a regex; this stays as a no-op so
      // downstream code that reads `compiled.error` / `compiled.captureMap`
      // doesn't have to special-case the kind.
      return { pattern: '', regex: null as RegExp | null, captureMap: new Map<string, number>(), error: null as string | null };
    }
    const flags = caseInsensitive ? 'i' : '';
    if (expertMode) {
      if (!rawPattern) return { pattern: '', regex: null as RegExp | null, captureMap: new Map<string, number>(), error: 'El patrón está vacío' };
      try {
        return { pattern: rawPattern, regex: new RegExp(rawPattern, flags), captureMap: new Map<string, number>(), error: null as string | null };
      } catch (e: any) {
        return { pattern: rawPattern, regex: null as RegExp | null, captureMap: new Map<string, number>(), error: e?.message || 'Regex inválida' };
      }
    }
    const { pattern, captureMap } = compilePattern(blocks, anchorStart, anchorEnd);
    if (!pattern) return { pattern, regex: null, captureMap, error: 'Añade al menos una caja al patrón' };
    try {
      return { pattern, regex: new RegExp(pattern, flags), captureMap, error: null };
    } catch (e: any) {
      return { pattern, regex: null, captureMap, error: e?.message || 'Patrón inválido' };
    }
  }, [kind, expertMode, rawPattern, blocks, anchorStart, anchorEnd, caseInsensitive]);

  const variableEventSpec = useMemo(() => VARIABLE_EVENTS.find((e) => e.key === varEvent), [varEvent]);
  const variableSpec = useMemo(() => getVariableSpec(varName), [varName]);

  const variableError = useMemo((): string | null => {
    if (kind !== 'variable') return null;
    if (!variableSpec) return 'Variable desconocida';
    if (!variableEventSpec) return 'Evento desconocido';
    if (variableEventSpec.needsValue) {
      if (varValue.trim() === '') return 'Falta el valor';
      if (variableEventSpec.numericOnly && Number.isNaN(Number(varValue))) {
        return 'El valor debe ser numérico';
      }
      if (variableSpec.kind === 'number' && Number.isNaN(Number(varValue))) {
        return 'El valor debe ser numérico para esta variable';
      }
    }
    return null;
  }, [kind, variableSpec, variableEventSpec, varValue]);

  const handleToggleExpert = () => {
    if (!expertMode) {
      // cajas → expert: seed raw input with current compiled pattern
      setRawPattern(compiled.pattern);
      setExpertMode(true);
    } else {
      // expert → cajas: confirm reset
      Alert.alert(
        'Cambiar a modo cajas',
        'El patrón actual se reiniciará a cajas vacías y los textos de las acciones se conservarán como texto literal sin capturas. ¿Continuar?',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Continuar',
            onPress: () => {
              setBlocks([]);
              setAnchorStart('open');
              setAnchorEnd('open');
              // For each action, reset blocks to a single text block holding the current string
              setActions((prev) => prev.map(actionToCajas));
              setExpertMode(false);
            },
          },
        ],
      );
    }
  };

  const testResult = useMemo(() => {
    if (!testInput || !compiled.regex) return null;
    compiled.regex.lastIndex = 0;
    const match = compiled.regex.exec(testInput);
    if (!match) return { matched: false, captures: [] as string[] };
    return { matched: true, captures: match.slice(1) };
  }, [testInput, compiled.regex]);

  const colorsByCapture = useMemo(() => captureColors(blocks), [blocks]);
  const labelsByCapture = useMemo(() => captureLabels(blocks), [blocks]);
  // For test result coloring: map regex group index → color/label.
  const captureMeta = useMemo(() => {
    const meta: Array<{ color: string; label: string }> = [];
    for (const b of blocks) {
      if (b.kind === 'capture') {
        meta.push({
          color: colorsByCapture.get(b.id) || '#999',
          label: labelsByCapture.get(b.id) || '?',
        });
      }
    }
    return meta;
  }, [blocks, colorsByCapture, labelsByCapture]);

  const handleAddAction = (type: TriggerAction['type']) => {
    setActionPickerVisible(false);
    let newAction: TriggerAction;
    switch (type) {
      case 'gag':
        newAction = { type: 'gag' };
        break;
      case 'color':
        newAction = { type: 'color', fg: '#ffff55', bold: true };
        break;
      case 'replace':
        newAction = { type: 'replace', with: '', withBlocks: [] };
        break;
      case 'play_sound':
        newAction = { type: 'play_sound', file: '' };
        break;
      case 'send':
        newAction = { type: 'send', command: '', commandBlocks: [] };
        break;
      case 'notify':
        newAction = { type: 'notify', message: '', messageBlocks: [], titleBlocks: [] };
        break;
      case 'floating':
        newAction = { type: 'floating', message: '', messageBlocks: [], level: 'info' };
        break;
    }
    setActions([...actions, newAction]);
  };

  const handleRemoveAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  const handleUpdateAction = (index: number, updated: TriggerAction) => {
    setActions(actions.map((a, i) => (i === index ? updated : a)));
  };

  const isDirty = (): boolean => {
    if (name !== initialTrigger.name) return true;
    if (kind !== getInitialKind(initialTrigger)) return true;
    if (kind === 'regex' && initialTrigger.source.kind === 'regex') {
      const initialExpertMode = initialTrigger.source.expertMode ?? !initialTrigger.source.blocks;
      if (expertMode !== initialExpertMode) return true;
      if (rawPattern !== (initialTrigger.source.pattern || '')) return true;
      if (caseInsensitive !== (initialTrigger.source.flags || '').includes('i')) return true;
      if (JSON.stringify(blocks) !== JSON.stringify(initialTrigger.source.blocks ?? [])) return true;
      if (anchorStart !== (initialTrigger.source.anchorStart ?? 'open')) return true;
      if (anchorEnd !== (initialTrigger.source.anchorEnd ?? 'open')) return true;
    }
    if (kind === 'variable' && initialTrigger.source.kind === 'variable') {
      if (varName !== initialTrigger.source.name) return true;
      if (varEvent !== initialTrigger.source.condition.event) return true;
      if (varValue !== getInitialVarValue(initialTrigger)) return true;
    }
    if (JSON.stringify(actions) !== JSON.stringify(initialTrigger.actions)) return true;
    return false;
  };

  const handleCancel = () => {
    if (!isDirty()) {
      onCancel();
      return;
    }
    Alert.alert(
      'Cambios sin guardar',
      'Tienes cambios en este trigger que se perderán si sales sin guardar.',
      [
        { text: 'Seguir editando', style: 'cancel' },
        { text: 'Descartar', style: 'destructive', onPress: onCancel },
      ],
    );
  };

  const collectOrphans = (): number => {
    if (kind !== 'regex') return 0;
    if (expertMode) return 0;
    let total = 0;
    for (const a of actions) {
      if (a.type === 'replace') total += findOrphanCaptureRefs(a.withBlocks, compiled.captureMap).length;
      else if (a.type === 'send') total += findOrphanCaptureRefs(a.commandBlocks, compiled.captureMap).length;
      else if (a.type === 'notify') {
        total += findOrphanCaptureRefs(a.titleBlocks, compiled.captureMap).length;
        total += findOrphanCaptureRefs(a.messageBlocks, compiled.captureMap).length;
      } else if (a.type === 'floating') {
        total += findOrphanCaptureRefs(a.messageBlocks, compiled.captureMap).length;
      }
    }
    return total;
  };

  const doSave = () => {
    if (kind === 'variable') {
      const condition = buildVariableCondition(varEvent, varValue, variableSpec?.kind === 'number');
      const finalSource = {
        kind: 'variable' as const,
        name: varName,
        condition,
      };
      onSave({
        ...initialTrigger,
        name: name.trim(),
        type: 'variable',
        source: finalSource,
        actions,
      });
      return;
    }

    const flags = caseInsensitive ? 'i' : undefined;
    const finalActions = expertMode
      ? actions
      : actions.map((a) => compileActionWithBlocks(a, compiled.captureMap));
    const finalSource = expertMode
      ? {
          kind: 'regex' as const,
          pattern: rawPattern,
          flags,
          expertMode: true,
        }
      : {
          kind: 'regex' as const,
          pattern: compiled.pattern,
          flags,
          blocks,
          anchorStart,
          anchorEnd,
          expertMode: false,
        };
    onSave({
      ...initialTrigger,
      name: name.trim(),
      type: inferType(finalActions),
      source: finalSource,
      actions: finalActions,
    });
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Falta el nombre', 'El trigger necesita un nombre.');
      return;
    }
    if (kind === 'variable') {
      if (variableError) {
        Alert.alert('Configuración incompleta', variableError);
        return;
      }
      if (actions.length === 0) {
        Alert.alert('Sin acciones', 'Añade al menos una acción al trigger.');
        return;
      }
      doSave();
      return;
    }
    if (compiled.error) {
      Alert.alert('Patrón inválido', compiled.error);
      return;
    }
    if (actions.length === 0) {
      Alert.alert('Sin acciones', 'Añade al menos una acción al trigger.');
      return;
    }
    const orphans = collectOrphans();
    if (orphans > 0) {
      Alert.alert(
        'Capturas sin referencia',
        `Hay ${orphans} chip(s) en las acciones que apuntan a capturas que ya no existen en el patrón (chips marcados con ⚠ borrada). En tiempo de ejecución se sustituirán por texto vacío. ¿Guardar igualmente?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Guardar igualmente', onPress: doSave },
        ],
      );
      return;
    }
    doSave();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleCancel}>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleCancel} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Cancelar</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Editar trigger
          </Text>
          <TouchableOpacity onPress={handleSave} style={styles.headerBtn}>
            <Text style={[styles.headerBtnText, styles.headerBtnSave]}>Guardar</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.label}>Nombre</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="ej. Alarma cuando me atacan"
            placeholderTextColor="#555"
            autoCapitalize="sentences"
          />

          <Text style={[styles.label, { marginTop: 12 }]}>Tipo de trigger</Text>
          <View style={styles.kindToggleRow}>
            <TouchableOpacity
              style={[styles.kindToggleBtn, kind === 'regex' && styles.kindToggleBtnActive]}
              onPress={() => setKind('regex')}
              accessibilityRole="button"
              accessibilityState={{ selected: kind === 'regex' }}
            >
              <Text style={[styles.kindToggleText, kind === 'regex' && styles.kindToggleTextActive]}>
                Línea de texto
              </Text>
              <Text style={styles.kindToggleHint}>Reacciona a una línea del MUD</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.kindToggleBtn, kind === 'variable' && styles.kindToggleBtnActive]}
              onPress={() => setKind('variable')}
              accessibilityRole="button"
              accessibilityState={{ selected: kind === 'variable' }}
            >
              <Text style={[styles.kindToggleText, kind === 'variable' && styles.kindToggleTextActive]}>
                Alarma de variable
              </Text>
              <Text style={styles.kindToggleHint}>Reacciona a vida, energía, salidas…</Text>
            </TouchableOpacity>
          </View>

          {kind === 'regex' ? (
            <>
              <View style={[styles.switchRow, { marginTop: 12 }]}>
                <Text style={styles.label}>Cuándo se activa</Text>
                <TouchableOpacity style={styles.expertToggle} onPress={handleToggleExpert}>
                  <Text style={styles.expertToggleText}>
                    {expertMode ? '◀ Modo cajas' : 'Modo experto ▶'}
                  </Text>
                </TouchableOpacity>
              </View>

              {expertMode ? (
                <>
                  <TextInput
                    style={[styles.input, styles.monoInput, compiled.error ? styles.inputError : null]}
                    value={rawPattern}
                    onChangeText={setRawPattern}
                    placeholder="ej. ^(\w+) te ataca"
                    placeholderTextColor="#555"
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    multiline
                  />
                  <Text style={styles.hintText}>
                    Sintaxis regex completa. Usa $1, $2… en las acciones para referenciar capturas.
                  </Text>
                </>
              ) : (
                <>
                  <TriggerPatternBuilder
                    blocks={blocks}
                    anchorStart={anchorStart}
                    anchorEnd={anchorEnd}
                    onChange={(b, s, e) => {
                      setBlocks(b);
                      setAnchorStart(s);
                      setAnchorEnd(e);
                    }}
                  />
                  <Text style={styles.hintText}>
                    Construye el patrón con cajas. Las capturas (palabra/frase/número) se podrán reusar como chips de color en las acciones.
                  </Text>
                </>
              )}

              {compiled.error ? (
                <Text style={styles.errorText}>{compiled.error}</Text>
              ) : (
                <Text style={styles.hintText}>
                  Regex resultante: <Text style={styles.regexPreview}>/{compiled.pattern}/{caseInsensitive ? 'i' : ''}</Text>
                </Text>
              )}

              <View style={styles.switchRow}>
                <Text style={styles.label}>Ignorar mayúsculas/minúsculas</Text>
                <Switch
                  value={caseInsensitive}
                  onValueChange={setCaseInsensitive}
                  trackColor={{ false: '#333', true: '#0c0' }}
                  thumbColor={caseInsensitive ? '#000' : '#666'}
                />
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.label, { marginTop: 12 }]}>Variable a vigilar</Text>
              <TouchableOpacity
                style={styles.varPickerBtn}
                onPress={() => setVarPickerVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={`Variable ${varName}`}
              >
                <Text style={styles.varPickerBtnText}>{varName}</Text>
                <Text style={styles.varPickerBtnHint}>
                  {variableSpec ? variableSpec.description : 'Variable desconocida'}
                </Text>
              </TouchableOpacity>

              <Text style={[styles.label, { marginTop: 12 }]}>Cuándo se dispara</Text>
              <View style={styles.varEventRow}>
                {VARIABLE_EVENTS.map((ev) => {
                  const disabled = ev.numericOnly && variableSpec?.kind !== 'number';
                  const selected = varEvent === ev.key;
                  return (
                    <TouchableOpacity
                      key={ev.key}
                      style={[
                        styles.varEventChip,
                        selected && styles.varEventChipSelected,
                        disabled && styles.varEventChipDisabled,
                      ]}
                      onPress={() => {
                        if (disabled) return;
                        setVarEvent(ev.key);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected, disabled }}
                    >
                      <Text style={[
                        styles.varEventChipText,
                        selected && styles.varEventChipTextSelected,
                        disabled && styles.varEventChipTextDisabled,
                      ]}>
                        {ev.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {variableEventSpec && (
                <Text style={styles.hintText}>{variableEventSpec.hint}</Text>
              )}

              {variableEventSpec?.needsValue && (
                <>
                  <Text style={[styles.smallLabel, { marginTop: 8 }]}>Valor</Text>
                  <TextInput
                    style={[styles.input, styles.monoInput, variableError ? styles.inputError : null]}
                    value={varValue}
                    onChangeText={setVarValue}
                    placeholder={variableEventSpec.numericOnly || variableSpec?.kind === 'number' ? 'ej. 30' : 'ej. ninguno'}
                    placeholderTextColor="#555"
                    keyboardType={variableEventSpec.numericOnly || variableSpec?.kind === 'number' ? 'number-pad' : 'default'}
                    autoCapitalize="none"
                  />
                </>
              )}

              {variableError ? (
                <Text style={styles.errorText}>{variableError}</Text>
              ) : (
                <Text style={styles.hintText}>
                  En las acciones puedes usar <Text style={styles.regexPreview}>$old</Text> y <Text style={styles.regexPreview}>$new</Text> para referirte al valor anterior y al nuevo.
                </Text>
              )}
            </>
          )}

          <View style={styles.sectionDivider} />

          <View style={styles.actionsHeader}>
            <Text style={styles.sectionTitle}>Acciones ({actions.length})</Text>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => setActionPickerVisible(true)}
            >
              <Text style={styles.addBtnText}>+ Añadir acción</Text>
            </TouchableOpacity>
          </View>

          {actions.length === 0 && (
            <Text style={styles.emptyText}>
              Sin acciones todavía. Pulsa "+ Añadir acción".
            </Text>
          )}

          {actions.map((action, idx) => (
            <ActionEditor
              key={idx}
              action={action}
              expertMode={kind === 'variable' ? true : expertMode}
              patternBlocks={blocks}
              customSounds={customSounds}
              onChange={(a) => handleUpdateAction(idx, a)}
              onRemove={() => handleRemoveAction(idx)}
              onPickSound={() => {
                setSoundPickerTab(action.type === 'play_sound' && action.file?.startsWith(CUSTOM_PREFIX) ? 'custom' : 'builtin');
                setSoundPickerIndex(idx);
              }}
            />
          ))}

          {kind === 'regex' && (
            <>
              <View style={styles.sectionDivider} />

              <Text style={styles.sectionTitle}>Probar contra una línea</Text>
              <TextInput
                style={[styles.input, styles.monoInput]}
                value={testInput}
                onChangeText={setTestInput}
                placeholder="Pega aquí una línea del MUD para probar"
                placeholderTextColor="#555"
                autoCapitalize="none"
                multiline
              />
              {testResult && (
                <View style={styles.testResultBox}>
                  <Text
                    style={[
                      styles.testResultText,
                      testResult.matched ? styles.testMatched : styles.testNotMatched,
                    ]}
                  >
                    {testResult.matched ? '✓ Matchea' : '✗ No matchea'}
                  </Text>
                  {testResult.captures.length > 0 && (
                    <View style={{ marginTop: 6 }}>
                      {testResult.captures.map((cap, i) => {
                        const meta = expertMode ? null : captureMeta[i];
                        if (meta) {
                          return (
                            <View key={i} style={styles.captureRow}>
                              <View style={[styles.captureSwatch, { backgroundColor: meta.color }]}>
                                <Text style={styles.captureSwatchText}>{meta.label}</Text>
                              </View>
                              <Text style={styles.captureValue}>= "{cap}"</Text>
                            </View>
                          );
                        }
                        return (
                          <Text key={i} style={styles.captureText}>
                            ${i + 1} = "{cap}"
                          </Text>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}
            </>
          )}
        </ScrollView>

        {/* Action type picker */}
        <Modal
          visible={actionPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setActionPickerVisible(false)}
        >
          <TouchableOpacity
            style={styles.pickerOverlay}
            activeOpacity={1}
            onPress={() => setActionPickerVisible(false)}
          >
            <View style={styles.pickerBox}>
              <Text style={styles.pickerTitle}>Tipo de acción</Text>
              {(kind === 'variable' ? VARIABLE_ACTION_TYPES : ACTION_TYPES).map((t) => (
                <TouchableOpacity
                  key={t.key}
                  style={styles.pickerItem}
                  onPress={() => handleAddAction(t.key)}
                >
                  <Text style={styles.pickerItemText}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Variable picker */}
        <Modal
          visible={varPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setVarPickerVisible(false)}
        >
          <TouchableOpacity
            style={styles.pickerOverlay}
            activeOpacity={1}
            onPress={() => setVarPickerVisible(false)}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => {}}
              style={[styles.pickerBox, { maxHeight: '85%' }]}
            >
              <Text style={styles.pickerTitle}>Elegir variable</Text>
              <FlatList
                data={VARIABLE_SPECS}
                keyExtractor={(s) => s.name}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.pickerItem, varName === item.name && styles.pickerItemSelected]}
                    onPress={() => {
                      setVarName(item.name);
                      // If current event is numericOnly but new var isn't number, fall back.
                      const evSpec = VARIABLE_EVENTS.find((e) => e.key === varEvent);
                      if (evSpec?.numericOnly && item.kind !== 'number') {
                        setVarEvent('changes');
                      }
                      setVarPickerVisible(false);
                    }}
                  >
                    <Text style={styles.pickerItemText}>{item.name}</Text>
                    <Text style={styles.pickerItemSubtext}>{item.description}</Text>
                  </TouchableOpacity>
                )}
              />
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* Sound picker */}
        <Modal
          visible={soundPickerIndex !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setSoundPickerIndex(null)}
        >
          <TouchableOpacity
            style={styles.pickerOverlay}
            activeOpacity={1}
            onPress={() => setSoundPickerIndex(null)}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => {}}
              style={[styles.pickerBox, { maxHeight: '85%' }]}
            >
              <Text style={styles.pickerTitle}>Elegir sonido</Text>
              <View style={styles.tabRow}>
                <TouchableOpacity
                  style={[styles.tabBtn, soundPickerTab === 'builtin' && styles.tabBtnActive]}
                  onPress={() => setSoundPickerTab('builtin')}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: soundPickerTab === 'builtin' }}
                >
                  <Text style={[styles.tabBtnText, soundPickerTab === 'builtin' && styles.tabBtnTextActive]}>
                    Built-in
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tabBtn, soundPickerTab === 'custom' && styles.tabBtnActive]}
                  onPress={() => setSoundPickerTab('custom')}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: soundPickerTab === 'custom' }}
                >
                  <Text style={[styles.tabBtnText, soundPickerTab === 'custom' && styles.tabBtnTextActive]}>
                    Mis sonidos ({customSounds.length})
                  </Text>
                </TouchableOpacity>
              </View>

              {soundPickerTab === 'builtin' ? (
                <FlatList
                  data={Object.entries(AVAILABLE_SOUNDS)}
                  keyExtractor={([path]) => path}
                  renderItem={({ item: [path, label] }) => {
                    const key = `${BUILTIN_PREFIX}${path}`;
                    return (
                      <View style={styles.soundPickerRow}>
                        <TouchableOpacity
                          style={styles.previewBtn}
                          onPress={() => playSound(key)}
                          accessibilityLabel={`Probar ${label}`}
                          accessibilityRole="button"
                        >
                          <Text style={styles.previewBtnText}>▶</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.soundPickerItem}
                          onPress={() => {
                            if (soundPickerIndex !== null) {
                              handlePickSoundForAction(soundPickerIndex, key);
                            }
                          }}
                          accessibilityLabel={`Usar ${label}`}
                          accessibilityRole="button"
                        >
                          <Text style={styles.pickerItemText}>{label}</Text>
                          <Text style={styles.pickerItemSubtext}>{path}</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  }}
                />
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.uploadBtn}
                    onPress={handleUploadCustomSound}
                    accessibilityRole="button"
                    accessibilityLabel="Subir sonido desde el móvil"
                  >
                    <Text style={styles.uploadBtnText}>+ Subir sonido del móvil</Text>
                  </TouchableOpacity>
                  {customSounds.length === 0 ? (
                    <Text style={styles.emptyText}>
                      Aún no has subido sonidos. Pulsa "+ Subir sonido del móvil" para añadir uno (wav, mp3, ogg, m4a, aac o flac).
                    </Text>
                  ) : (
                    <FlatList
                      data={customSounds}
                      keyExtractor={(s) => s.uuid}
                      renderItem={({ item }) => {
                        const key = `${CUSTOM_PREFIX}${item.filename}`;
                        return (
                          <View style={styles.soundPickerRow}>
                            <TouchableOpacity
                              style={styles.previewBtn}
                              onPress={() => playSound(key)}
                              accessibilityLabel={`Probar ${item.name}`}
                              accessibilityRole="button"
                            >
                              <Text style={styles.previewBtnText}>▶</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.soundPickerItem}
                              onPress={() => {
                                if (soundPickerIndex !== null) {
                                  handlePickSoundForAction(soundPickerIndex, key);
                                }
                              }}
                              accessibilityLabel={`Usar ${item.name}`}
                              accessibilityRole="button"
                            >
                              <Text style={styles.pickerItemText}>{item.name}</Text>
                              <Text style={styles.pickerItemSubtext}>.{item.ext}</Text>
                            </TouchableOpacity>
                          </View>
                        );
                      }}
                    />
                  )}
                </>
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      </SafeAreaView>
    </Modal>
  );
}

interface ActionEditorProps {
  action: TriggerAction;
  expertMode: boolean;
  patternBlocks: PatternBlock[];
  customSounds: CustomSound[];
  onChange: (a: TriggerAction) => void;
  onRemove: () => void;
  onPickSound: () => void;
}

function ActionEditor({ action, expertMode, patternBlocks, customSounds, onChange, onRemove, onPickSound }: ActionEditorProps) {
  const typeLabel = ACTION_TYPES.find((t) => t.key === action.type)?.label || action.type;
  return (
    <View style={styles.actionBox}>
      <View style={styles.actionHeader}>
        <Text style={styles.actionTitle}>{typeLabel}</Text>
        <TouchableOpacity onPress={onRemove} style={styles.removeBtn}>
          <Text style={styles.removeBtnText}>Quitar</Text>
        </TouchableOpacity>
      </View>

      {action.type === 'gag' && (
        <Text style={styles.actionHint}>La línea no se mostrará en el terminal.</Text>
      )}

      {action.type === 'replace' && (
        <>
          <Text style={styles.smallLabel}>Reemplazar por</Text>
          {expertMode ? (
            <TextInput
              style={[styles.input, styles.monoInput]}
              value={action.with}
              onChangeText={(t) => onChange({ ...action, with: t })}
              placeholder="ej. ¡$1 te ataca!"
              placeholderTextColor="#555"
              autoCapitalize="none"
            />
          ) : (
            <TriggerActionTextBuilder
              blocks={action.withBlocks || []}
              patternBlocks={patternBlocks}
              placeholder="Vacío. Añade texto y/o capturas."
              onChange={(b) => onChange({ ...action, withBlocks: b })}
            />
          )}
        </>
      )}

      {action.type === 'color' && (
        <>
          <Text style={styles.smallLabel}>Color de texto</Text>
          <View style={styles.colorRow}>
            {COLOR_PRESETS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[
                  styles.colorChip,
                  { backgroundColor: c },
                  action.fg === c && styles.colorChipSelected,
                ]}
                onPress={() => onChange({ ...action, fg: c })}
              />
            ))}
          </View>
          <TextInput
            style={[styles.input, styles.monoInput]}
            value={action.fg || ''}
            onChangeText={(t) => onChange({ ...action, fg: t || undefined })}
            placeholder="#rrggbb (vacío = no tocar)"
            placeholderTextColor="#555"
            autoCapitalize="none"
          />
          <View style={styles.switchRow}>
            <Text style={styles.smallLabel}>Negrita</Text>
            <Switch
              value={!!action.bold}
              onValueChange={(v) => onChange({ ...action, bold: v })}
              trackColor={{ false: '#333', true: '#0c0' }}
              thumbColor={action.bold ? '#000' : '#666'}
            />
          </View>
        </>
      )}

      {action.type === 'play_sound' && (
        <>
          <Text style={styles.smallLabel}>Sonido</Text>
          <TouchableOpacity style={styles.soundBtn} onPress={onPickSound}>
            <Text style={styles.soundBtnText}>
              {action.file ? getSoundLabel(action.file, customSounds) : 'Elegir sonido…'}
            </Text>
          </TouchableOpacity>
        </>
      )}

      {action.type === 'send' && (
        <>
          <Text style={styles.smallLabel}>Comando a enviar</Text>
          {expertMode ? (
            <TextInput
              style={[styles.input, styles.monoInput]}
              value={action.command}
              onChangeText={(t) => onChange({ ...action, command: t })}
              placeholder="ej. atacar $1"
              placeholderTextColor="#555"
              autoCapitalize="none"
            />
          ) : (
            <TriggerActionTextBuilder
              blocks={action.commandBlocks || []}
              patternBlocks={patternBlocks}
              placeholder="Vacío. Añade texto del comando."
              onChange={(b) => onChange({ ...action, commandBlocks: b })}
            />
          )}
        </>
      )}

      {action.type === 'notify' && (
        <>
          <Text style={styles.smallLabel}>Título (opcional)</Text>
          {expertMode ? (
            <TextInput
              style={styles.input}
              value={action.title || ''}
              onChangeText={(t) => onChange({ ...action, title: t || undefined })}
              placeholder="ej. Te atacan"
              placeholderTextColor="#555"
            />
          ) : (
            <TriggerActionTextBuilder
              blocks={action.titleBlocks || []}
              patternBlocks={patternBlocks}
              placeholder="Sin título."
              onChange={(b) => onChange({ ...action, titleBlocks: b })}
            />
          )}
          <Text style={styles.smallLabel}>Mensaje</Text>
          {expertMode ? (
            <TextInput
              style={styles.input}
              value={action.message}
              onChangeText={(t) => onChange({ ...action, message: t })}
              placeholder="ej. $1 te está atacando"
              placeholderTextColor="#555"
            />
          ) : (
            <TriggerActionTextBuilder
              blocks={action.messageBlocks || []}
              patternBlocks={patternBlocks}
              placeholder="Vacío."
              onChange={(b) => onChange({ ...action, messageBlocks: b })}
            />
          )}
        </>
      )}

      {action.type === 'floating' && (
        <>
          <Text style={styles.smallLabel}>Mensaje</Text>
          {expertMode ? (
            <TextInput
              style={styles.input}
              value={action.message}
              onChangeText={(t) => onChange({ ...action, message: t })}
              placeholder="ej. ✓ $1 derrotado"
              placeholderTextColor="#555"
            />
          ) : (
            <TriggerActionTextBuilder
              blocks={action.messageBlocks || []}
              patternBlocks={patternBlocks}
              placeholder="Vacío."
              onChange={(b) => onChange({ ...action, messageBlocks: b })}
            />
          )}
          <Text style={styles.smallLabel}>Estilo</Text>
          <View style={styles.floatingLevelRow}>
            {FLOATING_LEVELS.map((lvl) => {
              const selected = (action.level || 'info') === lvl.key;
              return (
                <TouchableOpacity
                  key={lvl.key}
                  style={[
                    styles.floatingLevelChip,
                    { backgroundColor: lvl.color },
                    selected && styles.floatingLevelChipSelected,
                  ]}
                  onPress={() => onChange({ ...action, level: lvl.key })}
                >
                  <Text style={styles.floatingLevelText}>{lvl.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.actionHint}>
            Se muestra arriba en pantalla unos segundos. Siempre se anuncia por TalkBack para usuarios con lector de pantalla.
          </Text>
        </>
      )}
    </View>
  );
}

function actionToCajas(a: TriggerAction): TriggerAction {
  // When toggling expert→cajas, seed each action's blocks with a single text
  // chunk holding the user's current literal string. Captures from old $N
  // syntax don't roundtrip; user has to re-add chips by hand.
  switch (a.type) {
    case 'replace':
      return { ...a, withBlocks: a.with ? [{ kind: 'text', text: a.with }] : [] };
    case 'send':
      return { ...a, commandBlocks: a.command ? [{ kind: 'text', text: a.command }] : [] };
    case 'notify':
      return {
        ...a,
        titleBlocks: a.title ? [{ kind: 'text', text: a.title }] : [],
        messageBlocks: a.message ? [{ kind: 'text', text: a.message }] : [],
      };
    case 'floating':
      return { ...a, messageBlocks: a.message ? [{ kind: 'text', text: a.message }] : [] };
    default:
      return a;
  }
}

function compileActionWithBlocks(
  a: TriggerAction,
  captureMap: Map<string, number>,
): TriggerAction {
  switch (a.type) {
    case 'replace':
      return a.withBlocks
        ? { ...a, with: compileActionText(a.withBlocks, captureMap) }
        : a;
    case 'send':
      return a.commandBlocks
        ? { ...a, command: compileActionText(a.commandBlocks, captureMap) }
        : a;
    case 'notify':
      return {
        ...a,
        title: a.titleBlocks ? compileActionText(a.titleBlocks, captureMap) || undefined : a.title,
        message: a.messageBlocks ? compileActionText(a.messageBlocks, captureMap) : a.message,
      };
    case 'floating':
      return a.messageBlocks
        ? { ...a, message: compileActionText(a.messageBlocks, captureMap) }
        : a;
    default:
      return a;
  }
}

function buildVariableCondition(
  event: VariableEvent,
  rawValue: string,
  isNumeric: boolean,
): VariableCondition {
  switch (event) {
    case 'appears':
      return { event: 'appears' };
    case 'changes':
      return { event: 'changes' };
    case 'equals':
      return isNumeric
        ? { event: 'equals', value: Number(rawValue) }
        : { event: 'equals', value: rawValue };
    case 'crosses_below':
      return { event: 'crosses_below', value: Number(rawValue) };
    case 'crosses_above':
      return { event: 'crosses_above', value: Number(rawValue) };
  }
}

function inferType(actions: TriggerAction[]): TriggerType {
  if (actions.length === 0) return 'combo';
  if (actions.length > 1) return 'combo';
  const t = actions[0].type;
  switch (t) {
    case 'gag': return 'gag';
    case 'color': return 'color';
    case 'replace': return 'replace';
    case 'play_sound': return 'sound';
    case 'send': return 'command';
    case 'notify': return 'notify';
    case 'floating': return 'combo';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerBtn: { paddingVertical: 6, paddingHorizontal: 8 },
  headerBtnText: { color: '#0c0', fontSize: 14, fontFamily: 'monospace' },
  headerBtnSave: { fontWeight: 'bold' },
  headerTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  body: { padding: 16, paddingBottom: 40 },
  label: {
    color: '#ccc',
    fontSize: 13,
    fontFamily: 'monospace',
    fontWeight: 'bold',
    marginBottom: 6,
    marginTop: 12,
  },
  smallLabel: {
    color: '#aaa',
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#fff',
    fontSize: 14,
    fontFamily: 'monospace',
    minHeight: 40,
  },
  monoInput: { fontFamily: 'monospace' },
  inputError: { borderColor: '#dd5555' },
  errorText: { color: '#dd5555', fontSize: 11, marginTop: 4, fontFamily: 'monospace' },
  hintText: { color: '#666', fontSize: 11, marginTop: 4, fontFamily: 'monospace' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  sectionDivider: { height: 1, backgroundColor: '#222', marginVertical: 20 },
  sectionTitle: {
    color: '#0c0',
    fontSize: 13,
    fontFamily: 'monospace',
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  actionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addBtn: {
    backgroundColor: '#0a3a0a',
    borderWidth: 1,
    borderColor: '#0c0',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addBtnText: { color: '#0c0', fontSize: 12, fontFamily: 'monospace', fontWeight: 'bold' },
  emptyText: {
    color: '#666',
    fontSize: 12,
    fontStyle: 'italic',
    fontFamily: 'monospace',
    marginVertical: 12,
  },
  actionBox: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  actionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  actionTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  actionHint: { color: '#888', fontSize: 11, fontFamily: 'monospace', marginTop: 4 },
  removeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#3a0a0a',
    borderWidth: 1,
    borderColor: '#dd5555',
    borderRadius: 4,
  },
  removeBtnText: { color: '#dd5555', fontSize: 11, fontFamily: 'monospace' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  colorChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#333',
  },
  colorChipSelected: { borderColor: '#fff' },
  soundBtn: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  soundBtnText: { color: '#fff', fontSize: 13, fontFamily: 'monospace' },
  testResultBox: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 6,
    padding: 10,
    marginTop: 8,
  },
  testResultText: { fontSize: 13, fontWeight: 'bold', fontFamily: 'monospace' },
  testMatched: { color: '#55dd55' },
  testNotMatched: { color: '#dd5555' },
  captureText: { color: '#aaa', fontSize: 12, fontFamily: 'monospace' },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 24,
  },
  pickerBox: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    padding: 16,
  },
  pickerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    marginBottom: 12,
  },
  pickerItem: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  pickerItemSelected: { backgroundColor: '#0a3a0a' },
  pickerItemText: { color: '#fff', fontSize: 14, fontFamily: 'monospace' },
  pickerItemSubtext: { color: '#666', fontSize: 11, fontFamily: 'monospace', marginTop: 2 },
  tabRow: {
    flexDirection: 'row',
    marginBottom: 10,
    borderRadius: 6,
    backgroundColor: '#0d0d0d',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    overflow: 'hidden',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabBtnActive: { backgroundColor: '#0a3a0a' },
  tabBtnText: { color: '#888', fontSize: 12, fontFamily: 'monospace', fontWeight: 'bold' },
  tabBtnTextActive: { color: '#0c0' },
  soundPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  previewBtn: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRightWidth: 1,
    borderRightColor: '#2a2a2a',
  },
  previewBtnText: { color: '#0c0', fontSize: 16, fontFamily: 'monospace' },
  soundPickerItem: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  uploadBtn: {
    backgroundColor: '#0a3a0a',
    borderWidth: 1,
    borderColor: '#0c0',
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  uploadBtnText: { color: '#0c0', fontSize: 13, fontFamily: 'monospace', fontWeight: 'bold' },
  expertToggle: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#666',
    borderRadius: 4,
  },
  expertToggleText: { color: '#bbb', fontSize: 11, fontFamily: 'monospace', fontWeight: 'bold' },
  kindToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  kindToggleBtn: {
    flex: 1,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  kindToggleBtnActive: {
    borderColor: '#0c0',
    backgroundColor: '#0a3a0a',
  },
  kindToggleText: {
    color: '#888',
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  kindToggleTextActive: {
    color: '#0c0',
  },
  kindToggleHint: {
    color: '#666',
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  varPickerBtn: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  varPickerBtnText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  varPickerBtnHint: {
    color: '#888',
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  varEventRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  varEventChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#141414',
  },
  varEventChipSelected: {
    borderColor: '#0c0',
    backgroundColor: '#0a3a0a',
  },
  varEventChipDisabled: {
    opacity: 0.35,
  },
  varEventChipText: {
    color: '#aaa',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  varEventChipTextSelected: {
    color: '#0c0',
    fontWeight: 'bold',
  },
  varEventChipTextDisabled: {
    color: '#666',
  },
  captureRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 },
  captureSwatch: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  captureSwatchText: { color: '#000', fontFamily: 'monospace', fontSize: 11, fontWeight: 'bold' },
  captureValue: { color: '#aaa', fontFamily: 'monospace', fontSize: 12 },
  regexPreview: {
    color: '#88aaff',
    fontFamily: 'monospace',
  },
  floatingLevelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  floatingLevelChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  floatingLevelChipSelected: {
    borderColor: '#fff',
  },
  floatingLevelText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
});
