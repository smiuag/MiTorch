// Clasificador de tipo ambiental por nombre de sala. Genera una de 18
// `RoomCategory` que el `AmbientPlayer` usa para elegir la pista que suena.
//
// Reglas operativas no derivables del código (resumen, detalle en CLAUDE.md
// "Sistema de Ambientación"):
//   - El orden de las categorías importa. La PRIMERA regla cuya keyword
//     aparezca en el nombre normalizado gana.
//   - El nombre se normaliza con NFD + strip diacríticos + lowercase + trim.
//     Los prefijos del MUD (`Y\d+:` y `] Y\d+:`) se eliminan antes de buscar.
//   - El parámetro `color` se ignora en el MVP (reservado para una segunda
//     pasada que distinga, p.ej. nieve por color blanco aunque el nombre no
//     lo diga).
//   - Salas sin `n` o con nombre que no matchea ninguna keyword caen a
//     'default'. Cobertura esperada del clasificador: ~98% directos.

import { RoomCategory } from '../types';

interface CategoryRule {
  category: RoomCategory;
  keywords: string[];
}

// Orden = prioridad. Categorías más específicas/restrictivas primero. Las
// keywords están en lowercase + sin diacríticos para hacer la comparación
// barata (no hay normalize por keyword en cada llamada).
const CATEGORIES: CategoryRule[] = [
  {
    category: 'subterraneo',
    keywords: [
      'cueva', 'caverna', 'mina', 'galeria', 'subterran', 'cloaca',
      'alcantarilla', 'tunel', 'pasaje', 'pasadizo', 'catacumba', 'sotano',
      'cripta', 'kheleb', 'mor groddur', 'golthur orod', 'adhul', 'grimoszk',
      'dum', 'excavacion', 'cantera', 'foso de crianza', 'madriguera', 'nido',
      'colonia de los', 'oscuridad profunda bajo', 'nivel de los gladiadores',
      'investigacion geologica',
    ],
  },
  {
    category: 'volcanico',
    keywords: ['volcan', 'lava', 'magma', 'ceniza', 'chimenea volcanica', 'fragua', 'ormeion', 'n.argh'],
  },
  {
    category: 'pantano',
    keywords: ['pantano', 'cienag', 'marisma', 'marism', 'marjal', 'lodazal', 'tierras humedas', 'margenes del'],
  },
  {
    category: 'nieve_frio',
    keywords: ['tundra', 'nieve', 'glacial', 'helad', 'boreal', 'escarcha', 'iglu', 'blanco', 'paso helado', 'viento helado', 'paramos del viento'],
  },
  {
    category: 'mar_costa',
    keywords: [
      'mar de', 'playa', 'muelle', 'puerto', 'bahia', 'cala', 'lago', 'laguna',
      'estanque', 'isla', 'islote', 'acantilado', 'rivera', 'estrecho',
      'oceano', 'olas', 'costa de',
    ],
  },
  {
    category: 'desierto',
    keywords: ['desierto', 'duna', 'salina', 'oasis', 'arena', 'sabana'],
  },
  {
    category: 'bosque',
    keywords: ['bosque', 'selva', 'arboled', 'arbolado', 'jungla', 'espesura', 'foresta'],
  },
  {
    category: 'cementerio_no_muertos',
    keywords: [
      'necropolis', 'nichos del tumulo', 'tauburz', 'taubrz', 'no-muert',
      'nomuert', 'tumba', 'sepultura', 'panteon', 'osario',
    ],
  },
  {
    category: 'ciudad',
    keywords: [
      'ciudad', 'urbe', 'aldea', 'villa', 'pueblo', 'metropoli', 'suburb',
      'calle', 'avenida', 'casco historico', 'barrio', 'barriada', 'arrabal', 'feudo',
    ],
  },
  {
    category: 'fortificacion',
    keywords: [
      'castillo', 'fortaleza', 'muralla', 'torre', 'almena', 'baluarte',
      'ciudadela', 'fuerte', 'base de', 'campamento', 'empalizada',
      'asentamiento', 'puertas de angaloth',
      // Puertas y arcos de ciudad — históricamente las "puertas norte/sur"
      // y los arcos amurallados son la zona fortificada de la ciudad
      // (caen en `fortificacion` y no en `ciudad` porque el sonido natural
      // ahí es de muralla / guardias, no de gentío urbano).
      'puerta norte', 'puerta sur', 'puerta este', 'puerta oeste',
      'arco norte', 'arco sur', 'arco este', 'arco oeste',
      'barracones', 'cuartel',
    ],
  },
  {
    category: 'campo_cultivo',
    keywords: [
      'cultivo', 'trigal', 'vined', 'huerto', 'jardin', 'frutal', 'olivar',
      'pasto', 'prado', 'dehesa', 'establo', 'poblado', 'granja',
    ],
  },
  {
    category: 'paramo_llanura',
    keywords: [
      'paramo', 'llanura', 'llano', 'erial', 'baldio', 'estepa', 'meseta',
      'tierras pardas', 'campos salvajes', 'campos de', 'alrededores de', 'planicie',
    ],
  },
  {
    category: 'montana',
    keywords: [
      'cordillera', 'montana', 'colin', 'cumbre', 'cerro', 'risco', 'ladera',
      'sierra', 'penasco', 'altiplano', 'monte', 'montes', 'escalera del cielo', 'valle de',
    ],
  },
  {
    category: 'camino',
    keywords: ['camino', 'sendero', 'senda', 'via', 'ruta', 'calzada', 'desfiladero', 'paso', 'carretera', 'puente', 'vado'],
  },
  {
    category: 'templo',
    keywords: ['templo', 'santuario', 'mausoleo', 'catedral', 'altar', 'monasterio', 'capilla', 'zigurat'],
  },
  {
    category: 'interior_civil',
    keywords: [
      'hostal', 'posada', 'taberna', 'tienda', 'salon', 'biblioteca',
      'herreria', 'panaderia', 'mercado', 'almacen',
      'oficina', 'banco de', 'sala de espera', 'sala de reuniones',
      'sala del tesoro', 'sala del consejo', 'estudio del', 'escalera',
    ],
  },
  {
    category: 'ruinas',
    keywords: ['ruinas', 'ruinoso', 'derruido', 'escombros', 'abandonad'],
  },
];

// Strip de prefijos del MUD: `Y502:`, `]Y502:`, `] Y502:`, todos opcionales.
const PREFIX_RE = /^\]?\s*Y\d+\s*:?\s*/i;

// NFD: descompone caracteres con diacríticos en base + combinador. Quitar
// los combinadores deja el ASCII desnudo. La regex `̀-ͯ` cubre
// el bloque "Combining Diacritical Marks" — toda la `ñ` se mantiene (`ñ`
// no se descompone con NFD aunque `é` sí). Para `ñ` la dejamos tal cual,
// las keywords se escriben en NFD-equivalente (`montana` no `montaña`).
function normalize(name: string): string {
  return name
    .replace(PREFIX_RE, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ñ/g, 'n')
    .toLowerCase()
    .trim();
}

export function categorizeRoom(name: string | undefined, _color?: string): RoomCategory {
  if (!name) return 'default';
  const norm = normalize(name);
  if (!norm) return 'default';
  for (const rule of CATEGORIES) {
    for (const keyword of rule.keywords) {
      if (norm.includes(keyword)) return rule.category;
    }
  }
  return 'default';
}

// Exportada para que la pantalla "Mis ambientes" liste las categorías en
// el mismo orden que las usa el clasificador (subterraneo primero, default
// al final).
export function listCategories(): RoomCategory[] {
  return [...CATEGORIES.map((c) => c.category), 'default'];
}
