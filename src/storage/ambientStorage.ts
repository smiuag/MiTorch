import AsyncStorage from '@react-native-async-storage/async-storage';
import { AmbientMappings, RoomCategory } from '../types';

// Asignaciones de wavs por categoría de sala. La pantalla "Mis ambientes"
// es el único editor; el `AmbientPlayer` solo lee, nunca escribe. Refs
// con formato `custom:{uuid}.{ext}` (no se soportan builtins porque la
// distribución es vía ZIP de defaults, no APK — no se quiere ese
// acoplamiento).

const KEY = 'aljhtar_ambient_mappings';

// Cap por categoría. Más de 4 wavs por tipo es ruido (la rotación random
// pierde variedad perceptible) y la UI se vuelve incómoda.
export const MAX_SOUNDS_PER_CATEGORY = 4;

const ALL_CATEGORIES: RoomCategory[] = [
  'desierto', 'subterraneo', 'bosque', 'camino', 'mar_costa',
  'fortificacion', 'nieve_frio', 'volcanico', 'montana',
  'interior_civil', 'campo_cultivo', 'paramo_llanura', 'pantano',
  'ciudad', 'templo', 'ruinas', 'cementerio_no_muertos',
  'default',
];

function emptyMappings(): AmbientMappings {
  const out = {} as AmbientMappings;
  for (const c of ALL_CATEGORIES) out[c] = { sounds: [] };
  return out;
}

export async function loadAmbientMappings(): Promise<AmbientMappings> {
  const json = await AsyncStorage.getItem(KEY);
  if (!json) return emptyMappings();
  try {
    const parsed = JSON.parse(json) as Partial<AmbientMappings>;
    // Normaliza: rellenamos cualquier categoría faltante (futuras categorías
    // añadidas tras una update) y filtramos refs malformadas.
    const out = emptyMappings();
    for (const c of ALL_CATEGORIES) {
      const entry = parsed[c];
      if (entry && Array.isArray(entry.sounds)) {
        out[c] = { sounds: entry.sounds.filter((s) => typeof s === 'string') };
      }
    }
    return out;
  } catch {
    return emptyMappings();
  }
}

export async function saveAmbientMappings(mappings: AmbientMappings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(mappings));
}

// Helpers de mutación. Devuelven el nuevo objeto sin mutar el de entrada
// para encajar con setState — el caller persiste con saveAmbientMappings.
export function addSoundToCategory(
  mappings: AmbientMappings,
  category: RoomCategory,
  soundRef: string,
): AmbientMappings {
  const current = mappings[category].sounds;
  if (current.includes(soundRef)) return mappings;
  if (current.length >= MAX_SOUNDS_PER_CATEGORY) return mappings;
  return {
    ...mappings,
    [category]: { sounds: [...current, soundRef] },
  };
}

export function removeSoundFromCategory(
  mappings: AmbientMappings,
  category: RoomCategory,
  soundRef: string,
): AmbientMappings {
  return {
    ...mappings,
    [category]: { sounds: mappings[category].sounds.filter((s) => s !== soundRef) },
  };
}
