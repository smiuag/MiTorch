// Genera Timers_Eralie.zip — pack de cuentas atrás (start_timer) para los
// bloqueos de hechizos de curación de Eralie.
//
// Cada trigger captura tanto la versión sobre uno mismo ("Curas algunas de
// tus heridas más X") como la versión sobre otro ("Curas algunas de las
// heridas más X de Y"), con un solo regex. El bloqueo es el mismo en ambos
// casos — el target no afecta al cooldown.

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const ROOT = path.resolve(__dirname, '..');
const OUT_PATH = path.join(ROOT, 'Timers_Eralie.zip');

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

// Severidades de las heridas + duración del bloqueo. Texto del MUD: "más X"
// donde X es el adjetivo en plural femenino.
//
// Duraciones derivadas empíricamente con tandas limpias (ver TRIGGERS.md /
// archivo de logs analizados): mediana redondeada al alza desde "Curas
// algunas..." hasta "[El bloqueo ... termina]". Stdev ~0.3-0.7s; outliers
// asimétricos hacia abajo porque a veces el mensaje 'termina' llega tarde
// pero el bloqueo real server-side ya había pasado (el cliente puede
// recastear sin "todavía no" aunque la barra no haya llegado a 0).
const HEALING = [
  { sev: 'ligeras', seconds: 10 },
  { sev: 'moderadas', seconds: 11 },
  { sev: 'serias', seconds: 13 },
  { sev: 'críticas', seconds: 14 },
];

const triggers = HEALING.map((h) =>
  timerTrigger({
    id: `trg_eralie_curar_${h.sev.replace('í', 'i')}`,
    name: `Bloqueo curar ${h.sev}`,
    // (?:tus|las) cubre ambos casos en un solo regex:
    //   - "Curas algunas de tus heridas más X."        (sobre uno mismo)
    //   - "Curas algunas de las heridas más X de NN."  (sobre otro)
    // El target NN se captura con (.+?)\.?$ pero NO se usa en el label —
    // el bloqueo es el mismo independientemente de a quién cures.
    pattern: `^Curas algunas de (?:tus|las) heridas más ${h.sev}(?: de (.+?))?\\.?$`,
    label: `Curar ${h.sev}`,
    seconds: h.seconds,
    level: 'info',
  }),
);

const backup = {
  format: 'torchzhyla-config-backup',
  version: 4,
  exportedAt: Date.now(),
  packs: [
    {
      name: 'Timers Eralie',
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
