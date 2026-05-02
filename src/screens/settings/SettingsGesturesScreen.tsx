import React from 'react';
import { View, Text, TouchableOpacity, FlatList, Switch, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, GestureConfig, GestureAction, GesturePickSource } from '../../types';
import { DEFAULT_SETTINGS } from '../../storage/settingsStorage';
import { useSettings, settingsStyles as s } from './settingsShared';
import { pickSourceLabel } from '../../utils/gesturePickSources';

type Props = NativeStackScreenProps<RootStackParamList, 'SettingsGestures'>;

const GESTURE_SYMBOLS: Record<string, string> = {
  swipe_up: '↑', swipe_down: '↓', swipe_left: '←', swipe_right: '→',
  swipe_up_right: '↗', swipe_up_left: '↖', swipe_down_right: '↘', swipe_down_left: '↙',
  twofingers_up: '↑', twofingers_down: '↓', twofingers_left: '←', twofingers_right: '→',
  twofingers_up_right: '↗', twofingers_up_left: '↖', twofingers_down_right: '↘', twofingers_down_left: '↙',
  pinch_in: '→ ←', pinch_out: '← →',
  twofingers_doubletap: '··²',
  doubletap_hold_swipe_up: '↑', doubletap_hold_swipe_down: '↓',
  doubletap_hold_swipe_left: '←', doubletap_hold_swipe_right: '→',
  doubletap_hold_swipe_up_right: '↗', doubletap_hold_swipe_up_left: '↖',
  doubletap_hold_swipe_down_right: '↘', doubletap_hold_swipe_down_left: '↙',
};

// Etiquetas en texto natural para que TalkBack/lectores lean algo útil en
// vez de los símbolos Unicode (↑ se lee como "up arrow", etc.). Se usa como
// `accessibilityLabel` del row entero y como prefijo en los Switch/Input.
const GESTURE_LABELS: Record<string, string> = {
  swipe_up: 'Deslizar arriba',
  swipe_down: 'Deslizar abajo',
  swipe_left: 'Deslizar izquierda',
  swipe_right: 'Deslizar derecha',
  swipe_up_right: 'Deslizar arriba-derecha',
  swipe_up_left: 'Deslizar arriba-izquierda',
  swipe_down_right: 'Deslizar abajo-derecha',
  swipe_down_left: 'Deslizar abajo-izquierda',
  twofingers_up: 'Dos dedos arriba',
  twofingers_down: 'Dos dedos abajo',
  twofingers_left: 'Dos dedos izquierda',
  twofingers_right: 'Dos dedos derecha',
  twofingers_up_right: 'Dos dedos arriba-derecha',
  twofingers_up_left: 'Dos dedos arriba-izquierda',
  twofingers_down_right: 'Dos dedos abajo-derecha',
  twofingers_down_left: 'Dos dedos abajo-izquierda',
  pinch_in: 'Pellizco hacia dentro',
  pinch_out: 'Pellizco hacia fuera',
  twofingers_doubletap: 'Doble toque con dos dedos',
  doubletap_hold_swipe_up: 'Doble toque mantenido y deslizar arriba',
  doubletap_hold_swipe_down: 'Doble toque mantenido y deslizar abajo',
  doubletap_hold_swipe_left: 'Doble toque mantenido y deslizar izquierda',
  doubletap_hold_swipe_right: 'Doble toque mantenido y deslizar derecha',
  doubletap_hold_swipe_up_right: 'Doble toque mantenido y deslizar arriba-derecha',
  doubletap_hold_swipe_up_left: 'Doble toque mantenido y deslizar arriba-izquierda',
  doubletap_hold_swipe_down_right: 'Doble toque mantenido y deslizar abajo-derecha',
  doubletap_hold_swipe_down_left: 'Doble toque mantenido y deslizar abajo-izquierda',
};

function getSection(type: string): string {
  if (type === 'twofingers_doubletap') return '2 dedos doble tap';
  if (type.startsWith('swipe_')) return '1 dedo';
  if (type.startsWith('twofingers_')) return '2 dedos';
  if (type.startsWith('pinch_')) return 'Pinch';
  if (type.startsWith('doubletap_hold_swipe_')) return 'Doble tap + arrastrar';
  return '';
}

const PICK_SOURCES: GesturePickSource[] = ['roomExits', 'recentTells', 'custom'];

// Devuelve un action default conservando el texto del action anterior cuando
// se cambia entre kinds (send↔prepare comparten `text`; pick arranca con
// prefix vacío). No tocamos otros campos para minimizar pérdida de input.
function changeActionKind(prev: GestureAction, kind: GestureAction['kind']): GestureAction {
  if (kind === 'send') {
    const text = prev.kind === 'send' || prev.kind === 'prepare' ? prev.text : '';
    return { kind: 'send', text };
  }
  if (kind === 'prepare') {
    const text = prev.kind === 'send' || prev.kind === 'prepare' ? prev.text : '';
    return { kind: 'prepare', text };
  }
  // pick
  if (prev.kind === 'pick') return prev;
  return { kind: 'pick', prefix: '', source: 'roomExits', customList: [], autoSend: true };
}

export function SettingsGesturesScreen({ navigation, route }: Props) {
  const sourceLocation = route.params?.sourceLocation ?? 'serverlist';
  const { settings, updateSetting } = useSettings(sourceLocation);

  const gestures: GestureConfig[] = (() => {
    let gs = settings.gestures || [];
    if (gs.length === 0) {
      gs = DEFAULT_SETTINGS.gestures;
    } else {
      const validTypes = new Set(DEFAULT_SETTINGS.gestures.map((g) => g.type));
      gs = gs.filter((g) => validTypes.has(g.type));
    }
    return gs;
  })();

  return (
    <SafeAreaView style={s.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={s.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Text style={s.backText}>{'< Volver'}</Text>
        </TouchableOpacity>
        <Text style={s.title} accessibilityRole="header">Configurar gestos</Text>
      </View>

      <FlatList
        data={gestures}
        keyExtractor={(item) => item.type}
        contentContainerStyle={localStyles.gestureListContent}
        renderItem={({ item, index }) => {
          const currentSection = getSection(item.type);
          const prevSection = index > 0 ? getSection(gestures[index - 1].type) : null;
          const showSectionHeader = currentSection !== prevSection;
          const symbol = GESTURE_SYMBOLS[item.type] || '';

          const updateOne = (patch: Partial<GestureConfig>) => {
            const updated = gestures.map((g) => (g.type === item.type ? { ...g, ...patch } : g));
            updateSetting('gestures', updated);
          };

          const updateAction = (patch: Partial<GestureAction>) => {
            // Cast intencional: el patch siempre encaja con el kind actual
            // porque cada bloque de UI solo edita campos del kind activo.
            updateOne({ action: { ...item.action, ...patch } as GestureAction });
          };

          const gestureName = GESTURE_LABELS[item.type] || item.type;

          return (
            <View>
              {showSectionHeader && (
                <View
                  style={localStyles.gestureSectionHeader}
                  accessible={true}
                  accessibilityRole="header"
                  accessibilityLabel={currentSection}
                >
                  <Text style={localStyles.gestureSectionTitle}>{currentSection}</Text>
                </View>
              )}
              <View style={item.enabled ? localStyles.gestureCardContainer : undefined}>
                <View style={[localStyles.gestureCompactRow, item.enabled && localStyles.gestureCompactRowTop]}>
                  {/* Símbolo Unicode visual oculto a screen readers (los lee
                      literal: "up arrow" etc.). El nombre del gesto va como
                      label del Switch. */}
                  <Text
                    style={localStyles.gestureSymbol}
                    accessibilityElementsHidden={true}
                    importantForAccessibility="no"
                  >
                    {symbol}
                  </Text>
                  {item.enabled ? (
                    <Text style={localStyles.gestureKindLabel} numberOfLines={1}>
                      {actionPreview(item.action)}
                    </Text>
                  ) : (
                    <View style={{ flex: 1, minHeight: 32 }} />
                  )}
                  <Switch
                    value={item.enabled}
                    onValueChange={(value) => updateOne({ enabled: value })}
                    trackColor={{ false: '#333', true: '#0c0' }}
                    thumbColor={item.enabled ? '#000' : '#666'}
                    accessibilityLabel={`${gestureName}. ${item.enabled ? `Habilitado. Acción: ${actionPreview(item.action)}` : 'Deshabilitado'}`}
                  />
                </View>

                {item.enabled && (
                  <>
                    {/* Selector de tipo de acción */}
                    <View style={localStyles.kindRow}>
                      {(['send', 'prepare', 'pick'] as const).map((k) => (
                        <TouchableOpacity
                          key={k}
                          style={[localStyles.kindBtn, item.action.kind === k && localStyles.kindBtnActive]}
                          onPress={() => updateOne({ action: changeActionKind(item.action, k) })}
                          accessibilityRole="button"
                          accessibilityState={{ selected: item.action.kind === k }}
                          accessibilityLabel={`Tipo de acción: ${kindLabel(k)}`}
                        >
                          <Text style={[localStyles.kindBtnText, item.action.kind === k && localStyles.kindBtnTextActive]}>
                            {kindLabel(k)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {/* Cuerpo según kind */}
                    {(item.action.kind === 'send' || item.action.kind === 'prepare') && (
                      <View style={localStyles.bodyBlock}>
                        <TextInput
                          style={localStyles.input}
                          value={item.action.text}
                          onChangeText={(text) => updateAction({ text })}
                          placeholder={item.action.kind === 'send' ? 'comando a enviar' : 'texto a preparar en input'}
                          placeholderTextColor="#444"
                          maxLength={60}
                          autoCapitalize="none"
                          autoCorrect={false}
                          spellCheck={false}
                          accessibilityLabel={
                            item.action.kind === 'send'
                              ? `${gestureName}, comando a enviar`
                              : `${gestureName}, texto a preparar en el input`
                          }
                        />
                      </View>
                    )}

                    {item.action.kind === 'pick' && (
                      <View style={localStyles.bodyBlock}>
                        <Text style={localStyles.fieldLabel}>Texto antes de la opción</Text>
                        <TextInput
                          style={localStyles.input}
                          value={item.action.prefix}
                          onChangeText={(prefix) => updateAction({ prefix })}
                          placeholder='ej. "tell "'
                          placeholderTextColor="#444"
                          maxLength={40}
                          autoCapitalize="none"
                          autoCorrect={false}
                          spellCheck={false}
                          accessibilityLabel={`${gestureName}, texto antes de la opción`}
                        />

                        <Text style={localStyles.fieldLabel}>Origen de las opciones</Text>
                        <View style={localStyles.sourceRow}>
                          {PICK_SOURCES.map((src) => (
                            <TouchableOpacity
                              key={src}
                              style={[localStyles.sourceBtn, item.action.kind === 'pick' && item.action.source === src && localStyles.sourceBtnActive]}
                              onPress={() => updateAction({ source: src })}
                              accessibilityRole="button"
                              accessibilityState={{ selected: item.action.kind === 'pick' && item.action.source === src }}
                              accessibilityLabel={`Origen: ${pickSourceLabel(src)}`}
                            >
                              <Text style={[localStyles.sourceBtnText, item.action.kind === 'pick' && item.action.source === src && localStyles.sourceBtnTextActive]}>
                                {pickSourceLabel(src)}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>

                        {item.action.source === 'custom' && (
                          <CustomListEditor
                            list={item.action.customList}
                            onChange={(customList) => updateAction({ customList })}
                          />
                        )}

                        <View style={localStyles.autoSendRow}>
                          <Text style={localStyles.fieldLabel}>Enviar automáticamente al elegir</Text>
                          <Switch
                            value={item.action.autoSend}
                            onValueChange={(autoSend) => updateAction({ autoSend })}
                            trackColor={{ false: '#333', true: '#0c0' }}
                            thumbColor={item.action.autoSend ? '#000' : '#666'}
                            accessibilityLabel={`${gestureName}, enviar automáticamente al elegir. ${item.action.autoSend ? 'Activado. Al elegir se envía el comando' : 'Desactivado. Al elegir se prepara en el input y abre el teclado'}`}
                          />
                        </View>
                        <Text style={localStyles.helpText}>
                          {item.action.autoSend
                            ? 'Al elegir una opción se envía el comando completo.'
                            : 'Al elegir una opción se prepara en el input y se abre el teclado.'}
                        </Text>
                      </View>
                    )}
                  </>
                )}
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

function kindLabel(kind: GestureAction['kind']): string {
  switch (kind) {
    case 'send': return 'Enviar';
    case 'prepare': return 'Preparar';
    case 'pick': return 'Seleccionar';
  }
}

// Texto que aparece al lado del icono del gesto en la fila colapsada.
// Visualmente refleja qué se ejecutará:
//   - send:    "tell"           (envía tal cual)
//   - prepare: "tell ..."       (deja "tell " en el input, cursor al final)
//   - pick:    "tell []"        (deja "tell <opción> " en el input al elegir)
function actionPreview(action: GestureAction): string {
  if (action.kind === 'send') return action.text || 'sin comando';
  if (action.kind === 'prepare') return action.text ? `${action.text} ...` : 'sin texto';
  // pick
  const prefix = action.prefix.replace(/\s+$/, '');
  return prefix ? `${prefix} []` : 'sin prefijo';
}

function CustomListEditor({ list, onChange }: { list: string[]; onChange: (next: string[]) => void }) {
  // Lista mini-editable: una fila por entrada con TextInput + botón borrar,
  // y un "+" al final para añadir. Sin reordenar (no merece complejidad).
  return (
    <View style={localStyles.customListBlock}>
      <Text style={localStyles.fieldLabel}>Lista de opciones</Text>
      {list.length === 0 && (
        <Text style={localStyles.helpText}>Aún no hay opciones. Pulsa "+ Añadir" para crear la primera.</Text>
      )}
      {list.map((entry, idx) => (
        <View key={idx} style={localStyles.customListRow}>
          <TextInput
            style={[localStyles.input, { flex: 1 }]}
            value={entry}
            onChangeText={(text) => {
              const next = list.slice();
              next[idx] = text;
              onChange(next);
            }}
            placeholder={`Opción ${idx + 1}`}
            placeholderTextColor="#444"
            maxLength={60}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            accessibilityLabel={`Opción ${idx + 1} de ${list.length} de la lista personalizada`}
          />
          <TouchableOpacity
            style={localStyles.removeBtn}
            onPress={() => {
              const next = list.slice();
              next.splice(idx, 1);
              onChange(next);
            }}
            accessibilityRole="button"
            accessibilityLabel={entry ? `Borrar opción ${idx + 1}: ${entry}` : `Borrar opción ${idx + 1}`}
          >
            <Text style={localStyles.removeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity
        style={localStyles.addBtn}
        onPress={() => onChange([...list, ''])}
        accessibilityRole="button"
        accessibilityLabel="Añadir opción"
      >
        <Text style={localStyles.addBtnText}>+ Añadir</Text>
      </TouchableOpacity>
    </View>
  );
}

const localStyles = StyleSheet.create({
  gestureListContent: { padding: 16, gap: 12 },
  gestureSectionHeader: {
    backgroundColor: '#0a0a0a',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    marginTop: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#0c0',
  },
  gestureSectionTitle: {
    color: '#0c0',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  gestureCardContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 6,
    overflow: 'hidden',
  },
  gestureCompactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    gap: 10,
  },
  gestureCompactRowTop: {
    marginBottom: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
  },
  gestureSymbol: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0c0',
    minWidth: 24,
    textAlign: 'center',
  },
  gestureKindLabel: {
    flex: 1,
    color: '#888',
    fontSize: 12,
    fontFamily: 'monospace',
    textTransform: 'uppercase',
  },
  kindRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  kindBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#333',
    alignItems: 'center',
  },
  kindBtnActive: { backgroundColor: '#0a3a0a', borderColor: '#0c0' },
  kindBtnText: { color: '#666', fontSize: 11, fontWeight: 'bold', fontFamily: 'monospace' },
  kindBtnTextActive: { color: '#0c0' },
  bodyBlock: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 6,
  },
  fieldLabel: {
    color: '#888',
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 6,
  },
  input: {
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    color: '#0c0',
    fontSize: 12,
    fontFamily: 'monospace',
    minHeight: 32,
  },
  sourceRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  sourceBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#333',
    alignItems: 'center',
  },
  sourceBtnActive: { backgroundColor: '#0a3a0a', borderColor: '#0c0' },
  sourceBtnText: { color: '#666', fontSize: 11, fontWeight: 'bold', fontFamily: 'monospace' },
  sourceBtnTextActive: { color: '#0c0' },
  autoSendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  helpText: {
    color: '#666',
    fontSize: 10,
    fontFamily: 'monospace',
    fontStyle: 'italic',
    marginTop: 2,
  },
  customListBlock: {
    marginTop: 6,
    gap: 4,
  },
  customListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  removeBtn: {
    width: 44,
    height: 44,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#553333',
    backgroundColor: '#2a1010',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: { color: '#ff6666', fontSize: 12, fontWeight: 'bold', fontFamily: 'monospace' },
  addBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#0c6c0c',
    backgroundColor: '#0e2a0e',
    alignItems: 'center',
    marginTop: 4,
  },
  addBtnText: { color: '#0c0', fontSize: 12, fontWeight: 'bold', fontFamily: 'monospace' },
});
