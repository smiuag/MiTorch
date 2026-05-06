// Genera Timers_Bardo.zip — pack de cuentas atrás para los hechizos de la
// clase Bardo. Duraciones derivadas del log bardo.txt con la metodología
// descrita en TRIGGERS.md ("Derivación empírica de duraciones de bloqueos").
//
// La mayoría de triggers anclan desde el LAND (texto de aterrizaje del
// hechizo) — más preciso. Excepción: Proyectil mágico menor y mayor
// comparten la misma línea de land ("# X misiles mágicos surgen de tus
// dedos..."), así que para diferenciarlos los anclamos desde el CAST
// (que sí lleva el nombre del hechizo) y usamos la duración Total
// (cast + bloqueo) en el timer.

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const ROOT = path.resolve(__dirname, '..');
const OUT_PATH = path.join(ROOT, 'Timers_Bardo.zip');

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

const SPELLS = [
  // anchored desde LAND (más preciso, duración = solo bloqueo)
  { id: 'bola_fuego',     label: 'Bola de Fuego',     seconds: 11, pattern: '¡Envuelves a .+? en tu Bola de Fuego!' },
  { id: 'cono_frio',      label: 'Cono de frío',      seconds: 13, pattern: 'un chorro en forma de cono helado surgiera de tus manos' },
  { id: 'defenestrar',    label: 'Defenestrar',       seconds: 13, pattern: 'sale disparado contra la ventana y la revienta' },
  { id: 'estallido',      label: 'Estallido de fuego', seconds: 11, pattern: '¡Envuelves a .+? en tu Estallido de fuego!' },
  { id: 'flecha_acida',   label: 'Flecha ácida',      seconds: 13, pattern: 'Conjuras un humeante arco ácido' },
  { id: 'golpe_rayo',     label: 'Golpe de rayo',     seconds: 11, pattern: 'Un rayo surge de tus manos impactando sobre' },
  { id: 'manos_ardientes', label: 'Manos ardientes',  seconds: 18, pattern: 'Unes tus pulgares y extiendes tus dedos' },
  { id: 'meteoros',       label: 'Meteoros de Ignis', seconds: 11, pattern: 'meteoros diminutos surgen de tu mano y estallan' },
  { id: 'granizo',        label: 'Granizo',           seconds: 10, pattern: '¡Envuelves a .+? en tu Granizo!' },
  // anchored desde CAST (porque el land es compartido entre menor y mayor).
  // Duración = Total (cast + bloqueo).
  // "hechizo 'X'" aparece en las 3 formas de cast bárdico (formular, soplar
  // instrumento, mover dedos por cuerdas) pero NO en la línea de termina
  // (que dice "bloqueo 'X'") — selectivo sin necesitar prefijo concreto.
  { id: 'proyectil_menor', label: 'Proyectil mágico menor', seconds: 11, pattern: "hechizo 'Proyectil magico menor'" },
  { id: 'proyectil_mayor', label: 'Proyectil mágico mayor', seconds: 15, pattern: "hechizo 'Proyectil magico mayor'" },
];

const triggers = SPELLS.map((s) =>
  timerTrigger({
    id: `trg_bardo_${s.id}`,
    name: `Timer ${s.label}`,
    pattern: s.pattern,
    label: s.label,
    seconds: s.seconds,
    level: 'info',
  }),
);

const backup = {
  format: 'torchzhyla-config-backup',
  version: 4,
  exportedAt: Date.now(),
  packs: [
    {
      name: 'Timers Bardo',
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
  console.log(`    ${triggers.length} timers en pack "${backup.packs[0].name}"`);
  console.log(`    ${bytes.length.toLocaleString()} bytes`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
