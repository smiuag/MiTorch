// Genera RL_Default_Config.zip — pack de triggers para usuarios videntes.
//
// Fuente de verdad de los triggers que se distribuyen como "default" para
// videntes. Edita el array `triggers` para añadir/modificar y vuelve a
// ejecutar `node scripts/build-rl-default-config.js` para regenerar el zip.
//
// Formato `torchzhyla-config-backup` v4 (el mismo que produce el export de la
// app). El importador acepta `backup.json` con N packs, así que crecer hacia
// varios packs en el futuro es trivial — basta con añadir entradas a `packs`.
//
// Por qué Node + jszip y no PowerShell Compress-Archive: PowerShell escribe
// paths con `\` que rompen el importador (jszip valida `/`). jszip genera
// paths POSIX correctos.

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const ROOT = path.resolve(__dirname, '..');
const OUT_PATH = path.join(ROOT, 'RL_Default_Config.zip');

// Helper para triggers de cuenta atrás visual (`start_timer`).
//
// Cuando una línea matchea el `pattern`, se gaguea (la línea original NO sale
// al terminal) y aparece una barra arriba con `label` durante `seconds`. La
// barra siempre arranca al 100% de ancho y se acorta cuando quedan ≤ 5s. El
// label puede usar `$1`/`$2`/etc para meter capturas del regex.
//
// Argumentos:
//   id        — id estable del trigger (prefijo recomendado: trg_rlvid_timer_)
//   name      — nombre del trigger (visible en el editor de la app)
//   pattern   — regex que matchea la línea del MUD
//   blocks    — opcional, representación visual del pattern para el editor.
//               Si lo omites se queda en modo experto (regex en bruto).
//   label     — texto que sale en la barra (ej: "Meteoros"). Soporta $1.
//   seconds   — duración total del timer
//   level     — paleta: 'info' (default, azul) | 'success' | 'warning' | 'error'
function timerTrigger({ id, name, pattern, blocks, label, seconds, level = 'info' }) {
  return {
    id,
    name,
    type: 'combo',
    enabled: true,
    source: {
      kind: 'regex',
      pattern,
      flags: 'i',
      ...(blocks ? { blocks } : {}),
      anchorStart: 'open',
      anchorEnd: 'open',
      expertMode: !blocks,
    },
    actions: [
      { type: 'gag' },
      { type: 'start_timer', label, seconds, level },
    ],
  };
}

// IDs estables (no timestamps) para que re-imports no duplen — el importador
// dedupa por id si el usuario ya tiene un trigger con el mismo. Prefijo
// `trg_rlvid_` para no chocar con triggers timestamp del usuario.
const triggers = [
  {
    id: 'trg_rlvid_espejos_off',
    name: 'Espejos desaparecen',
    type: 'variable',
    enabled: true,
    source: {
      kind: 'variable',
      name: 'imagenes',
      condition: { event: 'equals', value: 0 },
    },
    actions: [
      { type: 'gag' },
      { type: 'floating', message: 'Tus espejos desaparecen', level: 'error' },
    ],
  },
  {
    id: 'trg_rlvid_espejos_change',
    name: 'Espejos cambian',
    type: 'variable',
    enabled: true,
    source: {
      kind: 'variable',
      name: 'imagenes',
      condition: { event: 'changes' },
    },
    actions: [
      { type: 'gag' },
      { type: 'floating', message: 'Tienes $new espejos', level: 'info' },
    ],
  },
  {
    id: 'trg_rlvid_pieles_off',
    name: 'Pieles desaparecen',
    type: 'variable',
    enabled: true,
    source: {
      kind: 'variable',
      name: 'pieles',
      condition: { event: 'equals', value: 0 },
    },
    actions: [
      { type: 'gag' },
      { type: 'floating', message: 'Tus pieles desaparecen', level: 'error' },
    ],
  },
  {
    id: 'trg_rlvid_pieles_change',
    name: 'Pieles cambian',
    type: 'variable',
    enabled: true,
    source: {
      kind: 'variable',
      name: 'pieles',
      condition: { event: 'changes' },
    },
    actions: [
      { type: 'gag' },
      { type: 'floating', message: 'Tienes $new pieles', level: 'info' },
    ],
  },
  {
    id: 'trg_rlvid_bloqueo_termina',
    name: 'Bloqueo termina',
    type: 'combo',
    enabled: true,
    source: {
      kind: 'regex',
      pattern: "\\[El bloqueo '(.+?)' termina\\]",
      flags: 'i',
      blocks: [
        { kind: 'text', text: "[El bloqueo '" },
        { kind: 'capture', captureType: 'phrase', id: 'cap_rlvid_bloqueo_1' },
        { kind: 'text', text: "' termina]" },
      ],
      anchorStart: 'open',
      anchorEnd: 'open',
      expertMode: false,
    },
    actions: [
      { type: 'gag' },
      {
        type: 'floating',
        message: '$1',
        messageBlocks: [
          { kind: 'capture_ref', captureId: 'cap_rlvid_bloqueo_1' },
        ],
        level: 'info',
      },
    ],
  },
];

const backup = {
  format: 'torchzhyla-config-backup',
  version: 4,
  exportedAt: Date.now(),
  packs: [
    {
      name: 'RL Videntes',
      triggers,
    },
  ],
};

(async () => {
  const zip = new JSZip();
  zip.file('backup.json', JSON.stringify(backup, null, 2));
  const bytes = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  fs.writeFileSync(OUT_PATH, bytes);
  console.log(`OK → ${OUT_PATH}`);
  console.log(`    ${triggers.length} triggers en pack "${backup.packs[0].name}"`);
  console.log(`    ${bytes.length.toLocaleString()} bytes`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
