import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
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
  const [counts, setCounts] = useState<Record<RoomCategory, number> | null>(null);
  const [expanded, setExpanded] = useState<RoomCategory | null>(null);
  const [pickerCategory, setPickerCategory] = useState<RoomCategory | null>(null);
  const { playSound } = useSounds();

  const refresh = useCallback(async () => {
    const [m, s, cs] = await Promise.all([
      loadAmbientMappings(),
      loadCustomSounds(),
      getCategoryCounts(),
    ]);
    setMappings(m);
    setSounds(s);
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

  if (!mappings || !counts) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <Text style={styles.loading}>Cargando…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Text style={styles.backText}>{'< Volver'}</Text>
        </TouchableOpacity>
        <Text style={styles.title} accessibilityRole="header">Mis ambientes</Text>
        <Text style={styles.subtitle}>
          Música de fondo en bucle por tipo de sala. Asigna 1-{MAX_SOUNDS_PER_CATEGORY} sonidos por categoría — al
          entrar en una sala de ese tipo se elige uno al azar y se hace crossfade. Los wavs deben ser loops sin
          corte para que no se note el bucle.
        </Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
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
        <View style={styles.modalOverlay} accessibilityViewIsModal>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle} accessibilityRole="header">
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
