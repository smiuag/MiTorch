import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import { RootStackParamList, TriggerPack } from '../types';
import {
  CustomSound,
  addCustomSound,
  loadCustomSounds,
  removeCustomSound,
  renameCustomSound,
} from '../storage/customSoundsStorage';
import { loadPacks } from '../storage/triggerStorage';
import { useSounds } from '../contexts/SoundContext';

type Props = NativeStackScreenProps<RootStackParamList, 'MySounds'>;

const CUSTOM_PREFIX = 'custom:';

interface UsageRef {
  packName: string;
  triggerName: string;
}

function findUsages(filename: string, packs: TriggerPack[]): UsageRef[] {
  const target = `${CUSTOM_PREFIX}${filename}`;
  const out: UsageRef[] = [];
  for (const pack of packs) {
    for (const trg of pack.triggers) {
      const used = trg.actions.some((a) => a.type === 'play_sound' && a.file === target);
      if (used) out.push({ packName: pack.name, triggerName: trg.name });
    }
  }
  return out;
}

export function MySoundsScreen({ navigation }: Props) {
  const [sounds, setSounds] = useState<CustomSound[]>([]);
  const [packs, setPacks] = useState<TriggerPack[]>([]);
  const [renameTarget, setRenameTarget] = useState<CustomSound | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const { playSound } = useSounds();

  const refresh = useCallback(async () => {
    const [list, packList] = await Promise.all([loadCustomSounds(), loadPacks()]);
    setSounds(list);
    setPacks(packList);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const handleUpload = async () => {
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
      await refresh();
    } catch (e: any) {
      Alert.alert('No se pudo añadir el sonido', e?.message ?? String(e));
    }
  };

  const handleDelete = (sound: CustomSound) => {
    const usages = findUsages(sound.filename, packs);
    const usageBlock = usages.length
      ? `\n\nEstá usado en:\n${usages.map((u) => `• ${u.packName} → ${u.triggerName}`).join('\n')}\n\nLos triggers afectados se quedarán sin sonido.`
      : '';
    Alert.alert(
      'Borrar sonido',
      `¿Borrar "${sound.name}"?${usageBlock}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            await removeCustomSound(sound.uuid);
            await refresh();
          },
        },
      ],
    );
  };

  const startRename = (sound: CustomSound) => {
    setRenameTarget(sound);
    setRenameValue(sound.name);
  };

  const confirmRename = async () => {
    if (!renameTarget) return;
    const name = renameValue.trim();
    if (!name) {
      Alert.alert('Falta el nombre', 'El sonido necesita un nombre.');
      return;
    }
    await renameCustomSound(renameTarget.uuid, name);
    setRenameTarget(null);
    setRenameValue('');
    await refresh();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>{'< Volver'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Mis sonidos</Text>
        <Text style={styles.subtitle}>
          Sonidos personalizados para usar en triggers de tipo "Reproducir sonido". Formatos soportados: wav, mp3, ogg, m4a, aac, flac.
        </Text>
      </View>

      <FlatList
        data={sounds}
        keyExtractor={(s) => s.uuid}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Aún no has subido sonidos</Text>
            <Text style={styles.emptyText}>
              Pulsa el botón "+" para añadir un archivo de audio desde el móvil.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const usages = findUsages(item.filename, packs);
          return (
            <View style={styles.soundItem}>
              <View style={styles.soundMain}>
                <Text style={styles.soundName}>{item.name}</Text>
                <Text style={styles.soundMeta}>
                  .{item.ext} · {usages.length === 0 ? 'sin uso' : `${usages.length} trigger${usages.length === 1 ? '' : 's'}`}
                </Text>
              </View>
              <View style={styles.soundActions}>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => playSound(`${CUSTOM_PREFIX}${item.filename}`)}
                  accessibilityLabel={`Probar ${item.name}`}
                  accessibilityRole="button"
                >
                  <Text style={styles.iconBtnText}>▶ Probar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => startRename(item)}
                  accessibilityLabel={`Renombrar ${item.name}`}
                  accessibilityRole="button"
                >
                  <Text style={styles.iconBtnText}>Renombrar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.iconBtn, styles.iconBtnDanger]}
                  onPress={() => handleDelete(item)}
                  accessibilityLabel={`Borrar ${item.name}`}
                  accessibilityRole="button"
                >
                  <Text style={[styles.iconBtnText, styles.iconBtnTextDanger]}>Borrar</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />

      <View style={styles.addButtonContainer}>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={handleUpload}
          accessibilityLabel="Subir nuevo sonido"
          accessibilityRole="button"
        >
          <Text style={styles.addText}>+</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={renameTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Renombrar sonido</Text>
            <TextInput
              style={styles.modalInput}
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="Nombre"
              placeholderTextColor="#555"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setRenameTarget(null)}
              >
                <Text style={styles.modalBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnConfirm]}
                onPress={confirmRename}
              >
                <Text style={styles.modalBtnText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  listContent: { padding: 16, paddingBottom: 16 },
  emptyBox: { padding: 24, alignItems: 'center' },
  emptyTitle: { color: '#888', fontSize: 15, fontFamily: 'monospace', marginBottom: 8 },
  emptyText: { color: '#555', fontSize: 12, fontFamily: 'monospace', textAlign: 'center', lineHeight: 18 },
  soundItem: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 8,
    marginBottom: 10,
    overflow: 'hidden',
  },
  soundMain: { padding: 14 },
  soundName: { color: '#fff', fontSize: 15, fontWeight: 'bold', fontFamily: 'monospace' },
  soundMeta: { color: '#666', fontSize: 11, fontFamily: 'monospace', marginTop: 4 },
  soundActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#2a2a2a' },
  iconBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#2a2a2a',
  },
  iconBtnDanger: { borderRightWidth: 0 },
  iconBtnText: { color: '#0c0', fontSize: 12, fontFamily: 'monospace', fontWeight: 'bold' },
  iconBtnTextDanger: { color: '#dd5555' },
  addButtonContainer: { alignItems: 'center', paddingVertical: 20, backgroundColor: '#0a0a0a' },
  addBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#00cc00',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#00cc00',
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  addText: { fontSize: 28, color: '#000000', fontWeight: 'bold', lineHeight: 30 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 },
  modalBox: { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#333', borderRadius: 10, padding: 20 },
  modalTitle: { color: '#fff', fontSize: 17, fontWeight: 'bold', fontFamily: 'monospace', marginBottom: 14 },
  modalInput: {
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
    fontFamily: 'monospace',
    marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 6, alignItems: 'center' },
  modalBtnCancel: { backgroundColor: '#333' },
  modalBtnConfirm: { backgroundColor: '#0a3a0a', borderWidth: 1, borderColor: '#0c0' },
  modalBtnText: { color: '#fff', fontSize: 14, fontFamily: 'monospace', fontWeight: 'bold' },
});
