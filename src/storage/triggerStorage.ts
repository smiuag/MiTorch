import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActionTextBlock, FloatingMessageLevel, PatternBlock, Trigger, TriggerAction, TriggerPack, VariableCondition } from '../types';
import { compileActionText, compilePattern, newCaptureId } from '../utils/triggerCompiler';
import { loadServers } from './serverStorage';

const PACKS_KEY = 'aljhtar_trigger_packs';
const SOUNDS_SEEDED_KEY = 'aljhtar_trigger_packs_sounds_seeded';
const COMBATE_SEEDED_KEY = 'aljhtar_trigger_packs_combate_seeded';

export const SOUNDS_PACK_ID = 'pack_seeded_sounds';
export const COMBATE_PACK_ID = 'pack_seeded_combate';

let idCounter = Date.now();
function genId(prefix: string): string {
  return `${prefix}_${idCounter++}`;
}

export function newPackId(): string {
  return genId('pack');
}

export function newTriggerId(): string {
  return genId('trg');
}

let seedChecked = false;
async function ensureSeeded(): Promise<void> {
  if (seedChecked) return;
  seedChecked = true;

  const existingJson = await AsyncStorage.getItem(PACKS_KEY);
  let packs: TriggerPack[] = existingJson ? safeParse(existingJson) : [];
  let dirty = false;

  const soundsSeeded = await AsyncStorage.getItem(SOUNDS_SEEDED_KEY);
  // Only seed the sounds pack if its stable id is not already present.
  // Guards against a corrupt SOUNDS_SEEDED_KEY duplicating the pack.
  const soundsPresent = packs.some((p) => p.id === SOUNDS_PACK_ID);
  if (soundsSeeded !== '1' && !soundsPresent) {
    packs.push(createSoundsPack());
    dirty = true;
  }

  const combateSeeded = await AsyncStorage.getItem(COMBATE_SEEDED_KEY);
  const combatePresent = packs.some((p) => p.id === COMBATE_PACK_ID);
  if (combateSeeded !== '1' && !combatePresent) {
    packs.push(createCombatePack());
    dirty = true;
  }

  if (dirty) {
    await AsyncStorage.setItem(PACKS_KEY, JSON.stringify(packs));
    if (soundsSeeded !== '1') await AsyncStorage.setItem(SOUNDS_SEEDED_KEY, '1');
    if (combateSeeded !== '1') await AsyncStorage.setItem(COMBATE_SEEDED_KEY, '1');
  }
}

function safeParse(json: string): TriggerPack[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function buildFloatingTrigger(
  name: string,
  prefixCapture: PatternBlock[],
  literal: string,
  floatingSuffix: string,
): Trigger {
  // Pattern: [capture] + literal text (anchored both ends)
  const blocks: PatternBlock[] = [...prefixCapture, { kind: 'text', text: literal }];
  const compiled = compilePattern(blocks, 'anchored', 'anchored');

  // Floating message: capture_ref + suffix text
  const captureId = (prefixCapture[0] as { kind: 'capture'; id: string }).id;
  const messageBlocks: ActionTextBlock[] = [
    { kind: 'capture_ref', captureId },
    { kind: 'text', text: floatingSuffix },
  ];
  const message = compileActionText(messageBlocks, compiled.captureMap);

  return {
    id: newTriggerId(),
    name,
    type: 'combo',
    enabled: true,
    source: {
      kind: 'regex',
      pattern: compiled.pattern,
      flags: 'i',
      blocks,
      anchorStart: 'anchored',
      anchorEnd: 'anchored',
      expertMode: false,
    },
    actions: [
      { type: 'gag' },
      { type: 'floating', message, messageBlocks, level: 'info' },
    ],
  };
}

/**
 * Builds a single play_sound trigger from a list of pattern fragments.
 * Each fragment is either a string (literal text) or a capture descriptor.
 * Pattern is open-open (no anchors) — matches anywhere on the line.
 */
type Frag = string | { capture: 'word' | 'phrase' | 'number' };

function buildSoundTrigger(name: string, fragments: Frag[], soundFile: string, enabled = false): Trigger {
  const blocks: PatternBlock[] = fragments.map((f) => {
    if (typeof f === 'string') return { kind: 'text', text: f };
    return { kind: 'capture', captureType: f.capture, id: newCaptureId() };
  });
  const compiled = compilePattern(blocks, 'open', 'open');
  const actions: TriggerAction[] = [{ type: 'play_sound', file: `builtin:${soundFile}` }];
  return {
    id: newTriggerId(),
    name,
    type: 'sound',
    enabled,
    source: {
      kind: 'regex',
      pattern: compiled.pattern,
      flags: 'i',
      blocks,
      anchorStart: 'open',
      anchorEnd: 'open',
      expertMode: false,
    },
    actions,
  };
}

function createSoundsPack(): TriggerPack {
  const PHRASE: Frag = { capture: 'phrase' };
  const NUMBER: Frag = { capture: 'number' };

  return {
    id: SOUNDS_PACK_ID,
    name: 'Sonidos del MUD',
    assignedServerIds: [],
    triggers: [
      // Avisos generales (no son sonidos — son flotantes y variables sobre
      // estado del jugador). Se incluyen aquí porque el pack es la plantilla
      // "general" de uso diario; el usuario los desactiva por trigger si no
      // los quiere.
      buildFloatingTrigger(
        'Aviso seguir',
        [{ kind: 'capture', captureType: 'word', id: newCaptureId() }],
        ' comienza a seguirte.',
        ' te sigue',
      ),
      buildFloatingTrigger(
        'Aviso formular',
        [{ kind: 'capture', captureType: 'word', id: newCaptureId() }],
        ' comienza a formular un hechizo.',
        ' formula',
      ),
      buildVariableTrigger(
        'Espejos desaparecen',
        'imagenes',
        { event: 'equals', value: 0 },
        'Tus espejos desaparecen',
        'error',
      ),
      buildVariableTrigger(
        'Espejos cambian',
        'imagenes',
        { event: 'changes' },
        'Tienes $new espejos',
        'error',
      ),
      buildVariableTrigger(
        'Pieles desaparecen',
        'pieles',
        { event: 'equals', value: 0 },
        'Tus pieles desaparecen',
        'error',
      ),
      buildVariableTrigger(
        'Pieles cambian',
        'pieles',
        { event: 'changes' },
        'Tienes $new pieles',
        'error',
      ),
      // Bloqueos
      buildSoundTrigger('Bloqueo termina', ["[El bloqueo '", PHRASE, "' termina]"], 'bloqueos/bloqueo-termina.wav'),
      // Combate
      buildSoundTrigger('Pierdes concentración', ['Te estremeces y pierdes la concentración'], 'combate/pierdes-concentracion.wav'),
      buildSoundTrigger('Impacto', ['Alcanzas', PHRASE, ' a ', PHRASE, ' con tu maniobra de ', PHRASE, '!'], 'combate/impacto.wav'),
      buildSoundTrigger('Esquivado', ['logra esquivar', PHRASE, ' tu maniobra'], 'combate/esquivado.wav'),
      buildSoundTrigger('Bloqueado', ['logra parar', PHRASE, ' tu maniobra'], 'combate/bloqueado.wav'),
      buildSoundTrigger('Objetivo perdido', ['Tus objetivos ya no están al alcance'], 'combate/objetivo-perdido.wav'),
      buildSoundTrigger('Maniobra interrumpida', ['Tu maniobra', PHRASE, ' se ve interrumpida'], 'combate/interrumpido.wav'),
      buildSoundTrigger('Crítico', ['críticamente'], 'combate/critico.wav'),
      // Hechizos
      buildSoundTrigger('Preparas hechizo', ['Preparas los componentes del hechizo'], 'hechizos/preparas.wav'),
      buildSoundTrigger('Formulando', ['Comienzas a formular el hechizo'], 'hechizos/formulando.wav'),
      buildSoundTrigger('Resiste hechizo', ['resiste los efectos de tu hechizo'], 'hechizos/resiste.wav'),
      buildSoundTrigger('Fuera de rango', ['El destino de tu hechizo ha desaparecido'], 'hechizos/fuera-rango.wav'),
      buildSoundTrigger('Imágenes desactivadas', ['Tus imágenes se desvanecen'], 'hechizos/imagenes-off.wav'),
      buildSoundTrigger('Imágenes activadas', ['Tus clones ilusorios se dividen', PHRASE, 'imágenes suba a ', NUMBER], 'hechizos/imagenes-up.wav'),
      buildSoundTrigger('Piel de piedra', ['Tu piel queda cubierta', PHRASE, ' capas de piedra'], 'hechizos/piel-piedra-on.wav'),
      // Eventos: muerte (alternaciones partidas)
      buildSoundTrigger('Muerte (es)', ['[muerte]'], 'eventos/muerte.wav'),
      buildSoundTrigger('Muerte (has muerto)', ['has muerto'], 'eventos/muerte.wav'),
      buildSoundTrigger('Muerte (Your death)', ['Your death'], 'eventos/muerte.wav'),
      buildSoundTrigger('Muerte (You have been killed)', ['You have been killed'], 'eventos/muerte.wav'),
      // Eventos: victoria (alternaciones partidas)
      buildSoundTrigger('Victoria (es)', ['[victoria]'], 'eventos/victoria.wav'),
      buildSoundTrigger('Victoria (aniquilado)', ['enemigo ha sido aniquilado'], 'eventos/victoria.wav'),
      buildSoundTrigger('Victoria (Victory)', ['Victory'], 'eventos/victoria.wav'),
      // Eventos: XP, curación
      buildSoundTrigger('XP ganada', ['Ganas ', NUMBER, ' puntos de experiencia'], 'eventos/xp.wav'),
      buildSoundTrigger('Curación', ['Tu salud ha aumentado'], 'eventos/curacion.wav'),
    ],
  };
}

function buildVariableTrigger(
  name: string,
  variableName: string,
  condition: VariableCondition,
  message: string,
  level: FloatingMessageLevel,
): Trigger {
  return {
    id: newTriggerId(),
    name,
    type: 'variable',
    enabled: true,
    source: { kind: 'variable', name: variableName, condition },
    actions: [
      { type: 'gag' },
      { type: 'floating', message, level },
    ],
  };
}

// Builds a sound trigger from a raw regex string. Used by the seeded combat
// pack to express CMUD-style patterns (anchored kill markers, char classes,
// single-char wildcards) that are awkward to express with the block-based
// helpers. Triggers default to enabled — they ship as a complete combat pack
// the user assigns to a server.
function buildRawSoundTrigger(name: string, pattern: string, soundFile: string): Trigger {
  return {
    id: newTriggerId(),
    name,
    type: 'sound',
    enabled: true,
    source: {
      kind: 'regex',
      pattern,
      flags: 'i',
      blocks: [],
      anchorStart: 'open',
      anchorEnd: 'open',
      expertMode: true,
    },
    actions: [{ type: 'play_sound', file: `builtin:${soundFile}` }],
  };
}

// Built from blind/Combate.set (Rhomdur's CMUD addon). Every #GTrigger that
// played a sound is preserved as a regex trigger. The original ~50 distinct
// sounds (one per damage type, one per city, etc.) are collapsed into 9
// reusable categories per the user's "abreviar al máximo" directive: any
// hit you land, any hit you take, your death, others' deaths, bleeding,
// healing, incapacitating effects, generic alerts, and the pre-existing
// crítico sound for critical hits.
//
// Order matters: first-match-wins. Specific event triggers (muerte, heridas,
// armadura, proteger, ciudad, etc.) come BEFORE the kill catchalls so
// "Propinas el golpe mortal a X" plays muerte-otro instead of just being
// caught by the generic "your hit" rule.
function createCombatePack(): TriggerPack {
  const GOLPE_LANZAS = 'combate/golpe-lanzas.wav';
  const GOLPE_RECIBES = 'combate/golpe-recibes.wav';
  const MUERTE_PROPIA = 'combate/muerte-propia.wav';
  const MUERTE_OTRO = 'combate/muerte-otro.wav';
  const HEMORRAGIA = 'combate/hemorragia.wav';
  const CICATRIZAR = 'combate/cicatrizar.wav';
  const INCAPACITADO = 'combate/incapacitado.wav';
  const ALERTA = 'combate/alerta.wav';
  const CRITICO = 'combate/critico.wav';

  // [name, pattern, sound]. Pattern is plain regex; the engine compiles it
  // case-insensitively (flag 'i' in the helper). `\.` escapes a literal dot;
  // most patterns are open-open (substring match) — anchors are only used
  // where the line position matters (kill markers, line-start verbs).
  const T: [string, string, string][] = [
    // Muertes
    ['Grito desgarrador (muerte)',           'da un grito desgarrador antes de que su espíritu abandone Eirea\\.', MUERTE_OTRO],
    ['Propinas el golpe mortal',             '^Propinas el golpe mortal a ',                                       MUERTE_OTRO],
    ['Cae al suelo sin vida',                ' cae al suelo sin vida\\.',                                          MUERTE_OTRO],
    ['Otro propina el golpe mortal',         ' propina el golpe mortal a ',                                        MUERTE_OTRO],
    ['Tu cuerpo sin vida (mueres)',          '^Tu cuerpo sin vida cae al .* Parece que te han matado',             MUERTE_PROPIA],
    ['Recuperas tu forma sólida',            '^Recuperas tu forma sólida\\. Notas tu cuerpo algo más estropeado',  ALERTA],

    // Generales
    ['Puntos de gloria',                     '\\[Obtienes .+ puntos de gloria\\]',                                 ALERTA],
    ['Te encaras en combate',                'Te encaras contra .+ en posición de combate',                        GOLPE_LANZAS],
    ['Otro pierde la concentración',         ' pierde la concentración!',                                          ALERTA],
    ['Tu golpe causa hemorragia',            'Tu golpe causa una profunda hemorragia a ',                          GOLPE_LANZAS],
    ['Golpear imagen',                       'Lo que te pareció ser .+ desaparece al golpearl',                    GOLPE_LANZAS],

    // Iniciar/parar peleas
    ['Empiezas a calmarte',                  '^Empiezas a calmarte y reconsiderar a tus enemigos',                 ALERTA],
    ['Logras calmarte',                      '^Finalmente logras calmarte y olvidas tus peleas con',               ALERTA],
    ['No puedes calmarte (en lucha)',        '^Estás en mitad de una lucha, no es momento para calmarse',          ALERTA],
    ['Estás persiguiendo',                   'Estás persiguiendo a ',                                              ALERTA],
    ['Estás siendo atacado',                 'Estás siendo atacad. por ',                                          GOLPE_RECIBES],
    ['Paras de perseguir',                   'Paras de perseguir a ',                                              ALERTA],

    // Armadura
    ['Armadura machacada',                   ' machaca tu armadura con sus ataques!',                              GOLPE_RECIBES],
    ['Armadura recupera fortaleza',          'Tu armadura recupera su fortaleza tras la carga de ',                CICATRIZAR],
    ['Armadura ya no expuesta',              'Tu armadura deja de estar expuesta\\.',                              CICATRIZAR],

    // Proteger
    ['Otro escurre y protege',               ' consigue escurrirse entre ti y .+, protegiéndole\\.',               ALERTA],
    ['Te protege',                           ' te protege\\.',                                                     ALERTA],
    ['Os protege a ambos',                   ' os protege a .+ y a ti\\.',                                         ALERTA],
    ['Te protege valientemente',             ' te protege valientemente\\.',                                       ALERTA],
    ['Proteges a otro',                      'Proteges a ',                                                        ALERTA],
    ['Proteges valientemente',               'Proteges valientemente a ',                                          ALERTA],

    // Heridas / hemorragias
    ['Te desangras heridas múltiples',       'Te desangras por culpa de tus heridas múltiples en ',                HEMORRAGIA],
    ['Te desangras herida',                  'Te desangras a causa de tu herida en ',                              HEMORRAGIA],
    ['Comienzas a sangrar múltiples',        'Comienzas a sangrar abundantemente por heridas múltiples en ',       HEMORRAGIA],
    ['Te desangras hemorragia',              'Te desangras a causa de tu hemorragia en ',                          HEMORRAGIA],
    ['Herida cicatrizada',                   'Tu cuerpo responde y finalmente logra contener tu herida que queda cicatrizada', CICATRIZAR],
    ['Hemorragia se detiene',                'Tu hemorragia se detiene\\.',                                        CICATRIZAR],
    ['Múltiples se estabilizan',             'Algunas de tus heridas múltiples logran estabilizarse y dejan de sangrar', CICATRIZAR],
    ['Profunda herida (golpe enemigo)',      'El golpe de .+ te causa una profunda herida en ',                    HEMORRAGIA],
    ['Dejas de sangrar múltiples',           'Dejas de sangrar por todas tus heridas múltiples\\.',                CICATRIZAR],
    ['Boquete sangrando',                    'Un enorme boquete se te abre en .+ y comienza a sangrar',            HEMORRAGIA],
    ['Boquete cicatriza',                    'El enorme boquete que tenías se cicatriza',                          CICATRIZAR],
    ['Boquete chorro sangre',                'El boquete que tienes en .+ deja caer un chorro de sangre',          HEMORRAGIA],
    ['Proyectil clavado',                    'El ataque de .+ te clava un proyectil en .+, causándote una profunda herida', HEMORRAGIA],
    ['Proyectil movido',                     'Tu movimiento ha movido el proyectil causándote mucho dolor',        HEMORRAGIA],
    ['Gotear sangre',                        'Oyes el gotear de la sangre\\.',                                     HEMORRAGIA],
    ['Heridas múltiples se agravan',         'Las heridas m.ltiples de .+ en .+ se agravan',                       HEMORRAGIA],
    ['Otro sangra abundantemente',           ' comienza a sangrar abundantemente por sus heridas m.ltiples en ',   HEMORRAGIA],

    // Ataques a ciudades — todas alerta
    ['Vientos de guerra (ciudad)',           'Vientos nauseabundos y gritos de combate llegan a tu entorno; la guerra ha llegado a ', ALERTA],
    ['Ataque Kheleb Dum',                    'Suena el cuerno de piedra de la guardia de Kheleb Dum',              ALERTA],
    ['Ataque Bastión (Takome)',              'La campana de la Torre de la Santa Cruzada resuena por todo el reino, anunciando un ataque al Bastión', ALERTA],
    ['Ataque Anduar',                        'Escuchas repicar las campanas de la ciudad de Anduar',               ALERTA],
    ['Ataque Bosque de Thorin',              'Un gutural grito de Loredor, el Anciano Ent, advierte de un ataque al Bosque de Thorin', ALERTA],
    ['Ataque Veleiron (1)',                  'Una ráfaga de fuegos artificiales estremecen la ciudad',             ALERTA],
    ['Ataque Veleiron (2)',                  'Ráfagas de fuegos artificiales advierten de un ataque a Veleiron',   ALERTA],
    ['Ataque Castillo de Poldarn',           'El estruendo de una salva de cañones avisa del asedio al Castillo de Poldarn', ALERTA],
    ['Ataque Galador (1)',                   'Decenas de soldados cogen sus Aceros Dendritas y Tarjas Imperiales de las estanterías', ALERTA],
    ['Ataque Galador (2)',                   'Las tranquilas oraciones de la catedral se convierten en fanáticas loas a Seldar', ALERTA],
    ['Ataque Galador (3)',                   'El atronador sonido de los barracones del Ejército vomitando soldados', ALERTA],
    ['Ataque Galador (4)',                   'Decenas de soldados en negras armaduras desfilan hacia la catedral', ALERTA],
    ['Ataque Brenoic',                       'Una turba enfurecida de campesinos de Brenoic sale de sus casas',    ALERTA],
    ['Ataque Injhan D’hara',            'El suelo tiembla cuando decenas de jinetes de Injhan D.hara marchan en formación', ALERTA],
    ['Ataque Grimoszk (Ozomatli)',           'El Gong de Ozomatli resuena dolorosamente en tus oídos',             ALERTA],

    // Miedo
    ['Miedo resistido',                      'La horrenda apariencia de .+ no consigue remover tus firmes convicciones', ALERTA],
    ['Valor (Akrar) termina',                'Dejas de sentir esa sensación de valor que te dió el Akrar',         ALERTA],
    ['Miedo fallido (escalofrío)',           'La horrenda apariencia de .+ hace que un escalofrío recorra tu espalda', INCAPACITADO],
    ['Estás muerto de miedo (huir)',         'Estás muerto de miedo, sólo piensas en salir corriendo de aquí',     INCAPACITADO],

    // Abrojos
    ['Ves abrojos en suelo',                 '^Varios abrojos puntiagudos\\.',                                     GOLPE_RECIBES],
    ['Pisas un abrojo',                      ' pisas sin querer uno de los afilados abrojos que hay en el suelo y gritas ', GOLPE_RECIBES],
    ['Ruidos metálicos (abrojos cerca)',     'Oyes pequeños ru.dos metálicos cayendo por el suelo',                ALERTA],

    // Dormir / despertar
    ['Te emboba (dormir)',                   'El ataque de .+ te emboba hasta el punto de que caes dormido sin remedio', INCAPACITADO],
    ['Sueño profundo te invade',             'Sientes como un sueño profundo te invade y caes al suelo rendido',   INCAPACITADO],
    ['Canción adormece (recibido)',          'La canción de .+ hace que te adormezcas súbita e irremediablemente', INCAPACITADO],
    ['Sopor te invade',                      'Una inesperada sensación de sopor se apodera lentamente de tus sentidos', INCAPACITADO],
    ['Canción adormece a otro',              'La canción de .+ adormece a ',                                       ALERTA],
    ['Otro cae dormido',                     ' cae al suelo dormid.\\.',                                           ALERTA],
    ['Te despiertas',                        '^Te despiertas\\.',                                                  ALERTA],
    ['Otro se despierta',                    ' se despierta\\.',                                                   ALERTA],

    // Trampas
    ['Cepo (recibes)',                       'Sin darte cuenta introduces .+ en un cepo que había en la sala, produciéndote una grave herida', GOLPE_RECIBES],
    ['Encuentras trampa',                    '^Encuentras una trampa en el suelo',                                 ALERTA],
    ['Ves trampa semiescondida',             'Ves una trampa semiescondida en el suelo, has tenido suerte de no pisarla', ALERTA],
    ['Otro pisa cepo',                       ' se pilla con un cepo\\.',                                           ALERTA],

    // Stun / centrar
    ['Otro stuneado (sangre)',               ' se desploma a causa de la pérdida de sangre\\.',                    INCAPACITADO],
    ['Centrar golpes',                       ' empieza a centrar sus golpes sobre ',                               ALERTA],

    // Rastros
    ['Rastro de vísceras',                   'Rastro de Restos de v.sceras\\. en direcci.n ',                      ALERTA],
    ['Rastro de sangre',                     'Rastro de Charco de sangre en direcci.n ',                           ALERTA],

    // Crítico (anclado a línea de kill — gana sobre catchalls)
    ['Golpe crítico',                        '^(?:\\] |> )?[*#] .*críticamente',                                   CRITICO],

    // Kill catchalls (último — first-match-wins permite que los específicos
    // de arriba ganen para muertes/golpear-imagen/etc.)
    ['Kill propio (catchall)',               '^(?:\\] |> )?# ',                                                    GOLPE_LANZAS],
    ['Kill enemigo (catchall)',              '^(?:\\] |> )?\\* ',                                                  GOLPE_RECIBES],
  ];

  // Triggers de variable para alertas de vida — reemplazan el sistema
  // hardcoded `checkHpThresholds` del blindModeService. Edge-triggered en
  // `vida_pct`, sin loop (la engine no soporta sonidos persistentes).
  const ALERTA_VIDA_50 = 'combate/alerta-vida-50.wav';
  const ALERTA_VIDA_30 = 'combate/alerta-vida-30.wav';
  const ALERTA_VIDA_10 = 'combate/alerta-vida-10.wav';

  // Bajadas: sonido + aviso flotante (que TalkBack anuncia). Reemplazan a
  // las 6 acciones del antiguo checkHpThresholds (3 playSound mudos + 3
  // announceMessage). El aviso usa `level` por severidad: info→warning→error
  // según se va a peor.
  const downHpTriggers: Trigger[] = (
    [
      ['Vida baja (50%)',       50, ALERTA_VIDA_50, 'Vida baja',       'info'    as const],
      ['Vida peligrosa (30%)',  30, ALERTA_VIDA_30, 'Vida peligrosa',  'warning' as const],
      ['Vida crítica (10%)',    10, ALERTA_VIDA_10, 'VIDA CRÍTICA',    'error'   as const],
    ] as const
  ).map(([name, value, soundFile, message, level]) => ({
    id: newTriggerId(),
    name,
    type: 'variable' as const,
    enabled: true,
    source: {
      kind: 'variable' as const,
      name: 'vida_pct',
      condition: { event: 'crosses_below' as const, value },
    },
    actions: [
      { type: 'play_sound' as const, file: `builtin:${soundFile}` },
      { type: 'floating' as const, message, level },
    ],
  }));

  // Subidas: solo aviso flotante (TalkBack en blind), sin sonido. Reemplazan
  // los announceMessage('Recuperándose'/'Vida recuperada') del antiguo
  // checkHpThresholds.
  const upHpTriggers: Trigger[] = [
    buildVariableTrigger(
      'Recuperándose (>50%)',
      'vida_pct',
      { event: 'crosses_above', value: 50 },
      'Recuperándose',
      'success',
    ),
    buildVariableTrigger(
      'Vida recuperada (>10%)',
      'vida_pct',
      { event: 'crosses_above', value: 10 },
      'Vida recuperada',
      'success',
    ),
  ];

  const variableTriggers: Trigger[] = [...downHpTriggers, ...upHpTriggers];

  return {
    id: COMBATE_PACK_ID,
    name: 'Combate completo',
    assignedServerIds: [],
    triggers: [
      ...T.map(([name, pattern, sound]) => buildRawSoundTrigger(name, pattern, sound)),
      ...variableTriggers,
    ],
  };
}

export async function loadPacks(): Promise<TriggerPack[]> {
  await ensureSeeded();
  const json = await AsyncStorage.getItem(PACKS_KEY);
  if (!json) return [];
  return safeParse(json);
}

export async function savePacks(packs: TriggerPack[]): Promise<void> {
  await AsyncStorage.setItem(PACKS_KEY, JSON.stringify(packs));
}

export async function upsertPack(pack: TriggerPack): Promise<TriggerPack[]> {
  const packs = await loadPacks();
  const idx = packs.findIndex((p) => p.id === pack.id);
  if (idx >= 0) {
    packs[idx] = pack;
  } else {
    packs.push(pack);
  }
  await savePacks(packs);
  return packs;
}

export async function deletePack(packId: string): Promise<TriggerPack[]> {
  const packs = await loadPacks();
  const next = packs.filter((p) => p.id !== packId);
  await savePacks(next);
  return next;
}

export async function duplicatePack(packId: string): Promise<TriggerPack[]> {
  const packs = await loadPacks();
  const orig = packs.find((p) => p.id === packId);
  if (!orig) return packs;
  const copy: TriggerPack = {
    id: newPackId(),
    name: `${orig.name} (copia)`,
    triggers: orig.triggers.map((t) => ({ ...t, id: newTriggerId() })),
    assignedServerIds: [],
  };
  packs.push(copy);
  await savePacks(packs);
  return packs;
}

/**
 * Replicates legacy behavior: when the user switches to blind mode, every
 * built-in MUD sound becomes audible by default. Enables every trigger in the
 * seeded sounds pack and assigns it to every saved server.
 *
 * Idempotent — safe to call repeatedly. Silently no-ops if the sounds pack
 * was deleted by the user.
 */
export async function enableSoundsPackForBlindMode(): Promise<void> {
  await enablePackForBlindMode(SOUNDS_PACK_ID);
}

/**
 * Same as enableSoundsPackForBlindMode but for the seeded "Combate completo"
 * pack. Called when the user switches to blind mode so the combat sound pack
 * becomes audible without manual server-by-server assignment.
 */
export async function enableCombatePackForBlindMode(): Promise<void> {
  await enablePackForBlindMode(COMBATE_PACK_ID);
}

async function enablePackForBlindMode(packId: string): Promise<void> {
  const packs = await loadPacks();
  const idx = packs.findIndex((p) => p.id === packId);
  if (idx < 0) return;
  const pack = packs[idx];
  const servers = await loadServers();
  const allServerIds = servers.map((s) => s.id);

  const triggers = pack.triggers.map((t) => (t.enabled ? t : { ...t, enabled: true }));
  const assignedSet = new Set([...pack.assignedServerIds, ...allServerIds]);

  const triggersChanged = triggers.some((t, i) => t !== pack.triggers[i]);
  const assignmentsChanged = assignedSet.size !== pack.assignedServerIds.length;
  if (!triggersChanged && !assignmentsChanged) return;

  packs[idx] = { ...pack, triggers, assignedServerIds: Array.from(assignedSet) };
  await savePacks(packs);
}

/**
 * When a new character is created, append its id to every pack whose
 * `autoAssignToNew` flag is true (undefined treated as true). Existing
 * `assignedServerIds` of packs with the flag off are not touched. Returns
 * the (possibly mutated) pack list.
 */
export async function autoAssignNewCharacterToPacks(serverId: string): Promise<TriggerPack[]> {
  const packs = await loadPacks();
  let dirty = false;
  const next = packs.map((p) => {
    if (p.autoAssignToNew === false) return p;
    if (p.assignedServerIds.includes(serverId)) return p;
    dirty = true;
    return { ...p, assignedServerIds: [...p.assignedServerIds, serverId] };
  });
  if (dirty) await savePacks(next);
  return next;
}

/**
 * Adds the given serverId to the assignedServerIds of the packs whose ids
 * are in `packIds`, deduping. Returns the new pack list.
 */
export async function assignServerToPacks(
  serverId: string,
  packIds: string[],
): Promise<TriggerPack[]> {
  const packs = await loadPacks();
  const idSet = new Set(packIds);
  let dirty = false;
  const next = packs.map((p) => {
    if (!idSet.has(p.id)) return p;
    if (p.assignedServerIds.includes(serverId)) return p;
    dirty = true;
    return { ...p, assignedServerIds: [...p.assignedServerIds, serverId] };
  });
  if (dirty) await savePacks(next);
  return next;
}

/**
 * Sets assignedServerIds of the given packs to the union of all character
 * ids currently saved. Used by the "asignar a todos" prompt after import.
 * Packs not in `packIds` are untouched.
 */
export async function assignAllCharactersToPacks(packIds: string[]): Promise<TriggerPack[]> {
  const packs = await loadPacks();
  const servers = await loadServers();
  const allIds = servers.map((s) => s.id);
  const idSet = new Set(packIds);
  let dirty = false;
  const next = packs.map((p) => {
    if (!idSet.has(p.id)) return p;
    const merged = new Set([...p.assignedServerIds, ...allIds]);
    if (merged.size === p.assignedServerIds.length) return p;
    dirty = true;
    return { ...p, assignedServerIds: Array.from(merged) };
  });
  if (dirty) await savePacks(next);
  return next;
}

export async function getTriggersForServer(serverId: string): Promise<Trigger[]> {
  const packs = await loadPacks();
  const sorted = [...packs].sort((a, b) => a.name.localeCompare(b.name));
  const out: Trigger[] = [];
  for (const pack of sorted) {
    if (!pack.assignedServerIds.includes(serverId)) continue;
    for (const trg of pack.triggers) {
      if (trg.enabled) out.push(trg);
    }
  }
  return out;
}
