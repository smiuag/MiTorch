import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  Switch,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AmbientMappings, RootStackParamList, RoomCategory } from '../types';
import {
  loadAmbientMappings,
  saveAmbientMappings,
  addSoundToCategory,
  removeSoundFromCategory,
  MAX_SOUNDS_PER_CATEGORY,
} from '../storage/ambientStorage';
import { CustomSound, loadCustomSounds } from '../storage/customSoundsStorage';
import { loadSettings, saveSettings, AppSettings } from '../storage/settingsStorage';
import { ambientPlayer } from '../services/ambientPlayer';
import { categorizeRoom, listCategories } from '../services/roomCategorizer';
import { useSounds } from '../contexts/SoundContext';

type Props = NativeStackScreenProps<RootStackParamList, 'MyAmbients'>;

const CUSTOM_PREFIX = 'custom:';

// Etiquetas user-facing por categoría. Mantén en sync con `RoomCategory`.
const CATEGORY_LABEL: Record<RoomCategory, string> = {
  desierto: 'Desierto',
  subterraneo: 'Subterráneo',
  bosque: 'Bosque',
  camino: 'Camino',
  mar_costa: 'Mar y costa',
  fortificacion: 'Fortificación',
  nieve_frio: 'Nieve y frío',
  volcanico: 'Volcánico',
  montana: 'Montaña',
  interior_civil: 'Interior civil',
  campo_cultivo: 'Campos de cultivo',
  paramo_llanura: 'Páramo y llanura',
  pantano: 'Pantano',
  ciudad: 'Ciudad',
  templo: 'Templo',
  ruinas: 'Ruinas',
  cementerio_no_muertos: 'Cementerio / no-muertos',
  default: 'Otros (sin clasificar)',
};

// Lazy-cached map sample size por categoría (cuántas salas caen ahí).
// Calcular requiere recorrer las 28k+ salas — lo hacemos UNA vez al
// montar la pantalla y cacheamos para rerenders sin coste.
let categoryCountsCache: Record<RoomCategory, number> | null = null;
async function getCategoryCounts(): Promise<Record<RoomCategory, number>> {
  if (categoryCountsCache) return categoryCountsCache;
  const data: { rooms: Record<string, { n: string; c?: string }> } = require('../assets/map-reinos.json');
  const counts: Record<string, number> = {};
  for (const cat of listCategories()) counts[cat] = 0;
  for (const room of Object.values(data.rooms)) {
    if (!room.n) continue;
    const cat = categorizeRoom(room.n, room.c);
    counts[cat] = (counts[cat] || 0) + 1;
  }
  categoryCountsCache = counts as Record<RoomCategory, number>;
  return categoryCountsCache;
}

export function MyAmbientsScreen({ navigation }: Props) {
  const [mappings, setMappings] = useState<AmbientMappings | null>(null);
  const [sounds, setSounds] = useState<CustomSound[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [counts, setCounts] = useState<Record<RoomCategory, number> | null>(null);
  const [expanded, setExpanded] = useState<RoomCategory | null>(null);
  const [pickerCategory, setPickerCategory] = useState<RoomCategory | null>(null);
  const { playSound, setEffectsVolume } = useSounds();

  const refresh = useCallback(async () => {
    const [m, s, st, cs] = await Promise.all([
      loadAmbientMappings(),
      loadCustomSounds(),
      loadSettings(),
      getCategoryCounts(),
    ]);
    setMappings(m);
    setSounds(s);
    setSettings(st);
    setCounts(cs);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // Al desmontar (volver a Settings) el AmbientPlayer recarga sus mappings
  // para reflejar cualquier cambio. Los cambios YA están persistidos por
  // cada acción individual; el reload es para que la próxima sala use los
  // wavs nuevos sin esperar a un cambio de categoría.
  useEffect(() => {
    return () => {
      ambientPlayer.reloadMappings().catch(() => {});
    };
  }, []);

  const updateSetting = useCallback(
    async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      if (!settings) return;
      const next = { ...settings, [key]: value };
      setSettings(next);
      await saveSettings(next);
      // Aplica inmediato al AmbientPlayer cuando aplica.
      if (key === 'ambientVolume' && typeof value === 'number') {
        ambientPlayer.setAmbientVolume(value);
      } else if (key === 'ambientEnabled' && typeof value === 'boolean') {
        ambientPlayer.setEnabled(value);
      } else if (key === 'effectsVolume' && typeof value === 'number') {
        // Inmediato a la siguiente reproducción de trigger; sin esto el
        // usuario tendría que reabrir la app para que el cambio surtiera
        // efecto.
        setEffectsVolume(value);
      }
    },
    [settings, setEffectsVolume],
  );

  const handleAddSound = useCallback(
    async (category: RoomCategory, sound: CustomSound) => {
      if (!mappings) return;
      const ref = `${CUSTOM_PREFIX}${sound.filename}`;
      const next = addSoundToCategory(mappings, category, ref);
      setMappings(next);
      await saveAmbientMappings(next);
      setPickerCategory(null);
    },
    [mappings],
  );

  const handleRemoveSound = useCallback(
    async (category: RoomCategory, ref: string) => {
      if (!mappings) return;
      const next = removeSoundFromCategory(mappings, category, ref);
      setMappings(next);
      await saveAmbientMappings(next);
    },
    [mappings],
  );

  const soundLabel = useCallback(
    (ref: string): string => {
      if (!ref.startsWith(CUSTOM_PREFIX)) return ref;
      const filename = ref.slice(CUSTOM_PREFIX.length);
      const found = sounds.find((s) => s.filename === filename);
      return found ? found.name : `(falta) ${filename}`;
    },
    [sounds],
  );

  // Categorías ordenadas: las que TIENEN wavs primero, luego por uso decreciente.
  const orderedCategories = useMemo<RoomCategory[]>(() => {
    if (!mappings || !counts) return listCategories();
    const all = listCategories();
    return [...all].sort((a, b) => {
      const aHas = (mappings[a]?.sounds.length ?? 0) > 0 ? 1 : 0;
      const bHas = (mappings[b]?.sounds.length ?? 0) > 0 ? 1 : 0;
      if (aHas !== bHas) return bHas - aHas; // con sonidos primero
      return (counts[b] ?? 0) - (counts[a] ?? 0); // luego por nº de salas
    });
  }, [mappings, counts]);

  if (!mappings || !settings || !counts) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <Text style={styles.loading}>Cargando…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>{'< Volver'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Mis ambientes</Text>
        <Text style={styles.subtitle}>
          Música de fondo en bucle por tipo de sala. Asigna 1-{MAX_SOUNDS_PER_CATEGORY} sonidos por categoría — al
          entrar en una sala de ese tipo se elige uno al azar y se hace crossfade. Los wavs deben ser loops sin
          corte para que no se note el bucle.
        </Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.controlsBlock}>
          <View style={styles.controlRow}>
            <Text style={styles.controlLabel}>Música ambiente</Text>
            <Switch
              value={settings.ambientEnabled}
              onValueChange={(v) => updateSetting('ambientEnabled', v)}
              accessibilityLabel="Activar música ambiente"
            />
          </View>
          <VolumeAdjuster
            label="Volumen ambiente"
            value={settings.ambientVolume}
            onChange={(v) => updateSetting('ambientVolume', v)}
          />
          <VolumeAdjuster
            label="Volumen efectos (triggers)"
            value={settings.effectsVolume}
            onChange={(v) => updateSetting('effectsVolume', v)}
          />
        </View>

        <Text style={styles.sectionLabel}>Categorías</Text>

        {orderedCategories.map((cat) => {
          const refs = mappings[cat]?.sounds ?? [];
          const isExpanded = expanded === cat;
          const roomCount = counts[cat] ?? 0;
          const canAdd = refs.length < MAX_SOUNDS_PER_CATEGORY;
          return (
            <View key={cat} style={styles.catBlock}>
              <TouchableOpacity
                style={styles.catHeader}
                onPress={() => setExpanded(isExpanded ? null : cat)}
                accessibilityRole="button"
                accessibilityLabel={`${CATEGORY_LABEL[cat]}, ${refs.length} sonidos asignados, ${roomCount} salas`}
                accessibilityState={{ expanded: isExpanded }}
              >
                <View style={styles.catHeaderText}>
                  <Text style={styles.catName}>{CATEGORY_LABEL[cat]}</Text>
                  <Text style={styles.catMeta}>
                    {refs.length}/{MAX_SOUNDS_PER_CATEGORY} sonidos · {roomCount} salas
                  </Text>
                </View>
                <Text style={styles.catChevron}>{isExpanded ? '▼' : '▶'}</Text>
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.catBody}>
                  {refs.length === 0 && (
                    <Text style={styles.catEmpty}>Sin sonidos. Las salas de este tipo serán silenciosas.</Text>
                  )}
                  {refs.map((ref) => (
                    <View key={ref} style={styles.slotRow}>
                      <Text style={styles.slotName}>{soundLabel(ref)}</Text>
                      <TouchableOpacity
                        style={styles.slotIcon}
                        onPress={() => playSound(ref)}
                        accessibilityRole="button"
                        accessibilityLabel={`Probar ${soundLabel(ref)}`}
                      >
                        <Text style={styles.slotIconText}>▶</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.slotIcon, styles.slotIconDanger]}
                        onPress={() => handleRemoveSound(cat, ref)}
                        accessibilityRole="button"
                        accessibilityLabel={`Quitar ${soundLabel(ref)}`}
                      >
                        <Text style={styles.slotIconTextDanger}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                  {canAdd && (
                    <TouchableOpacity
                      style={styles.addSlotBtn}
                      onPress={() => setPickerCategory(cat)}
                      accessibilityRole="button"
                      accessibilityLabel={`Añadir sonido a ${CATEGORY_LABEL[cat]}`}
                    >
                      <Text style={styles.addSlotBtnText}>+ Añadir sonido</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      <Modal
        visible={pickerCategory !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerCategory(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>
              Elegir sonido para {pickerCategory ? CATEGORY_LABEL[pickerCategory] : ''}
            </Text>
            {sounds.length === 0 ? (
              <Text style={styles.modalEmpty}>
                No tienes sonidos custom todavía. Importa wavs desde Settings → Mis sonidos o desde un ZIP de
                configuración.
              </Text>
            ) : (
              <FlatList
                data={sounds}
                keyExtractor={(s) => s.uuid}
                style={styles.modalList}
                renderItem={({ item }) => {
                  const ref = `${CUSTOM_PREFIX}${item.filename}`;
                  const already =
                    pickerCategory != null && mappings[pickerCategory].sounds.includes(ref);
                  return (
                    <TouchableOpacity
                      disabled={already}
                      style={[styles.modalRow, already && styles.modalRowDisabled]}
                      onPress={() => pickerCategory && handleAddSound(pickerCategory, item)}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.name}${already ? ' (ya asignado)' : ''}`}
                    >
                      <Text style={styles.modalRowText}>{item.name}</Text>
                      <TouchableOpacity
                        style={styles.modalRowPreview}
                        onPress={() => playSound(ref)}
                        accessibilityRole="button"
                        accessibilityLabel={`Probar ${item.name}`}
                      >
                        <Text style={styles.modalRowPreviewText}>▶</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setPickerCategory(null)}
            >
              <Text style={styles.modalCloseText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Sub-componente de ajuste de volumen con botones +/- de paso 0.05.
// Preferido sobre Slider en este codebase por accesibilidad blind: cada
// botón tiene su propio accessibilityLabel y TalkBack puede anunciar el
// valor numérico claramente.
function VolumeAdjuster({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const pct = Math.round(value * 100);
  const dec = () => onChange(Math.max(0, Math.round((value - 0.05) * 100) / 100));
  const inc = () => onChange(Math.min(1, Math.round((value + 0.05) * 100) / 100));
  return (
    <View style={styles.volRow}>
      <Text style={styles.volLabel}>{label}</Text>
      <TouchableOpacity
        onPress={dec}
        disabled={value <= 0}
        style={[styles.volBtn, value <= 0 && styles.volBtnDisabled]}
        accessibilityRole="button"
        accessibilityLabel={`Bajar ${label.toLowerCase()}`}
      >
        <Text style={styles.volBtnText}>-</Text>
      </TouchableOpacity>
      <Text style={styles.volValue} accessibilityLabel={`${label}: ${pct} por ciento`}>
        {pct}%
      </Text>
      <TouchableOpacity
        onPress={inc}
        disabled={value >= 1}
        style={[styles.volBtn, value >= 1 && styles.volBtnDisabled]}
        accessibilityRole="button"
        accessibilityLabel={`Subir ${label.toLowerCase()}`}
      >
        <Text style={styles.volBtnText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  loading: { color: '#888', textAlign: 'center', marginTop: 40, fontFamily: 'monospace' },
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
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  controlsBlock: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  controlLabel: { color: '#ccc', fontSize: 13, fontFamily: 'monospace' },
  controlValue: { color: '#0c0', fontSize: 13, fontFamily: 'monospace' },
  volRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 2,
    gap: 8,
  },
  volLabel: { flex: 1, color: '#ccc', fontSize: 13, fontFamily: 'monospace' },
  volBtn: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#0a3a0a',
    borderWidth: 1,
    borderColor: '#0c0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  volBtnDisabled: { opacity: 0.3 },
  volBtnText: { color: '#0c0', fontSize: 18, fontFamily: 'monospace', fontWeight: 'bold' },
  volValue: {
    color: '#0c0',
    fontSize: 14,
    fontFamily: 'monospace',
    minWidth: 50,
    textAlign: 'center',
  },
  sectionLabel: {
    color: '#888',
    fontSize: 12,
    fontFamily: 'monospace',
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },
  catBlock: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 8,
    marginBottom: 8,
    overflow: 'hidden',
  },
  catHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  catHeaderText: { flex: 1 },
  catName: { color: '#fff', fontSize: 14, fontFamily: 'monospace', fontWeight: 'bold' },
  catMeta: { color: '#666', fontSize: 11, fontFamily: 'monospace', marginTop: 3 },
  catChevron: { color: '#888', fontSize: 14, fontFamily: 'monospace', paddingLeft: 8 },
  catBody: {
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
    padding: 12,
    gap: 6,
  },
  catEmpty: { color: '#666', fontSize: 12, fontFamily: 'monospace', fontStyle: 'italic' },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0e0e0e',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  slotName: { flex: 1, color: '#ccc', fontSize: 12, fontFamily: 'monospace' },
  slotIcon: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 4,
  },
  slotIconDanger: {},
  slotIconText: { color: '#0c0', fontSize: 14, fontFamily: 'monospace' },
  slotIconTextDanger: { color: '#dd5555', fontSize: 14, fontFamily: 'monospace' },
  addSlotBtn: {
    backgroundColor: '#0a2a0a',
    borderWidth: 1,
    borderColor: '#1a4a1a',
    borderRadius: 4,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  addSlotBtnText: { color: '#0c0', fontSize: 12, fontFamily: 'monospace' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modalBox: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    padding: 16,
    maxHeight: '80%',
  },
  modalTitle: { color: '#fff', fontSize: 15, fontFamily: 'monospace', fontWeight: 'bold', marginBottom: 12 },
  modalEmpty: { color: '#888', fontSize: 12, fontFamily: 'monospace', lineHeight: 18, marginBottom: 12 },
  modalList: { maxHeight: 360 },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  modalRowDisabled: { opacity: 0.4 },
  modalRowText: { flex: 1, color: '#ccc', fontSize: 13, fontFamily: 'monospace' },
  modalRowPreview: { paddingHorizontal: 8 },
  modalRowPreviewText: { color: '#0c0', fontSize: 14, fontFamily: 'monospace' },
  modalClose: {
    backgroundColor: '#333',
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 12,
  },
  modalCloseText: { color: '#fff', fontSize: 14, fontFamily: 'monospace', fontWeight: 'bold' },
});
