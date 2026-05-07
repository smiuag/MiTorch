import AsyncStorage from '@react-native-async-storage/async-storage';

export interface LayoutButton {
  id: string;
  col: number;
  row: number;
  label: string;
  command: string;
  color: string;
  textColor: string;
  addText?: boolean;
  secondaryCommand?: string;
  alternativeCommands?: string[];
  locked?: boolean;
  fixed?: boolean;
  blindPanel?: 1 | 2; // Panel 1 or 2 for blind mode buttons (fijo, no dinámico)
  // Panel del modo completo. Antes era `1 | 2` fijo; ahora puede ser cualquier
  // ID de panel definido en `ServerProfile.panels` (default [1, 2], hasta 6).
  // Migración: valores 1 y 2 existentes siguen funcionando idénticos.
  completoPanel?: number;
  // Orientación a la que pertenece este botón en modo completo (v3+). Cada
  // botón vive en una sola orientación; al pivotar el móvil se renderiza
  // únicamente el subset que corresponda. Sin transforms en runtime.
  // Botones con `blindPanel` (modo blind) NO usan este campo — blind sigue
  // con su layout único 5×4/4×5 y `blindModeTransforms` legacy.
  // Botones pre-migración (sin orientation) son tratados como 'vertical' por
  // compatibilidad — el migrador los normaliza al primer load.
  orientation?: 'vertical' | 'horizontal';
  // 'command' (default, unset) sends the payload to the MUD; 'floating'
  // shows the payload as an in-app floating message (also announced via
  // TalkBack). Both expand ${var} via expandVars().
  kind?: 'command' | 'floating';
}

export interface ButtonLayout {
  buttons: LayoutButton[];
}

let buttonIdCounter = 0;
function genId() {
  return `btn_${buttonIdCounter++}`;
}

// Tabla de transforms vertical→horizontal para layouts tipo 'normal'/'reducida'
// (cuadrícula 9×N). Reorganiza la zona de direcciones cardinales + AR/AB/DE/FU
// tras hacer el swap col↔row + inversión de eje. Las claves son (swCol, swRow)
// del swap; los valores son las coords visuales finales en horizontal.
const LEGACY_NORMAL_TRANSFORMS: { [key: string]: { col: number; row: number } } = {
  '2,2': { col: 5, row: 2 }, '3,2': { col: 5, row: 3 },
  '4,2': { col: 5, row: 4 }, '5,2': { col: 5, row: 5 },
  '5,3': { col: 4, row: 5 }, '5,4': { col: 3, row: 5 }, '5,5': { col: 2, row: 5 },
  '2,5': { col: 2, row: 2 }, '2,4': { col: 3, row: 2 }, '2,3': { col: 4, row: 2 },
  '3,3': { col: 4, row: 3 }, '4,3': { col: 4, row: 4 },
  '3,4': { col: 3, row: 3 }, '4,4': { col: 3, row: 4 },
  '4,5': { col: 2, row: 4 }, '3,5': { col: 2, row: 3 },
};

// Vertical (col, row) → horizontal (col, row). Para 'custom' es 1:1 (sin
// reorganización). Para 'normal' / 'reducida' / 'standard' aplica swap +
// LEGACY_NORMAL_TRANSFORMS. verticalCols=9 (NORMAL_MODE.vertical.cols).
function transformVerticalToHorizontal(col: number, row: number, kind: string): { col: number; row: number } {
  if (kind === 'custom') return { col, row };
  const swCol = row;
  const swRow = 8 - col;
  const t = LEGACY_NORMAL_TRANSFORMS[`${swCol},${swRow}`];
  return t ? { col: t.col, row: t.row } : { col: swCol, row: swRow };
}

// Coloca los botones canónicos (switch + direcciones + acciones opcionales)
// en una rejilla (cols × rows) cualquiera. Usado por `createAdaptiveLayout` y
// `createPanelButtons` para sembrar layouts iniciales adaptados al tamaño que
// el usuario eligió. Reglas:
//   - Switch siempre en (0,0).
//   - Bloque de direcciones 4×4 (NO/N/NE/AR / O/_/E/AB / SO/S/SE/DE / _/_/_/FU)
//     centrado, anclado al fondo si rows>=5. Para cols<=4 el bloque pega a la
//     izquierda (dCol=0) — única forma de meter las 4 cols del bloque.
//   - Acciones (LOC/IR/STOP/Res/Decir): primero intento row 0 derecha→izq;
//     si no caben, fallback a CUALQUIER hueco libre (escaneo top→bottom,
//     left→right). Mismo fallback para SIG (preferencia bajo IR).
//   - Solo se descartan los botones cuando ya no quedan huecos libres.
function placeCanonicalButtons(cols: number, rows: number, panelId: number, withActions: boolean): LayoutButton[] {
  const result: LayoutButton[] = [];
  const occupied = new Set<string>();
  const tryPlaceAt = (col: number, row: number, mk: (col: number, row: number) => LayoutButton): boolean => {
    if (col < 0 || col >= cols || row < 0 || row >= rows) return false;
    const k = `${col},${row}`;
    if (occupied.has(k)) return false;
    occupied.add(k);
    result.push(mk(col, row));
    return true;
  };
  const findFreeCell = (): { col: number; row: number } | null => {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!occupied.has(`${c},${r}`)) return { col: c, row: r };
      }
    }
    return null;
  };

  // 1. Switch en (0,0).
  tryPlaceAt(0, 0, (col, row) => ({
    id: genId(), col, row,
    label: 'Panel', command: '__SWITCH_PANEL__',
    color: '#336666', textColor: '#88ccff',
    completoPanel: panelId, fixed: true, locked: true,
  }));

  // 2. Direcciones — bloque 4×4 NO|N|NE|AR / O|_|E|AB / SO|S|SE|DE / _|_|_|FU.
  // Para cols=4 hay que pegar el bloque a col 0 (NO comparte columna con
  // switch, pero distinto row). Para cols>=5 lo centramos con un mínimo de
  // dCol=1 para reservar col 0.
  const dCol = cols <= 4 ? 0 : Math.max(1, Math.floor((cols - 4) / 2));
  const dRow = rows >= 5 ? rows - 4 : 0;
  const direcciones: { dx: number; dy: number; lbl: string; cmd: string; up: boolean }[] = [
    { dx: 0, dy: 0, lbl: 'NO', cmd: 'noroeste', up: false },
    { dx: 1, dy: 0, lbl: 'N',  cmd: 'norte',    up: false },
    { dx: 2, dy: 0, lbl: 'NE', cmd: 'noreste',  up: false },
    { dx: 3, dy: 0, lbl: 'AR', cmd: 'ar',       up: true  },
    { dx: 0, dy: 1, lbl: 'O',  cmd: 'oeste',    up: false },
    { dx: 2, dy: 1, lbl: 'E',  cmd: 'este',     up: false },
    { dx: 3, dy: 1, lbl: 'AB', cmd: 'ab',       up: true  },
    { dx: 0, dy: 2, lbl: 'SO', cmd: 'sudoeste', up: false },
    { dx: 1, dy: 2, lbl: 'S',  cmd: 'sur',      up: false },
    { dx: 2, dy: 2, lbl: 'SE', cmd: 'sudeste',  up: false },
    { dx: 3, dy: 2, lbl: 'DE', cmd: 'dentro',   up: true  },
    { dx: 3, dy: 3, lbl: 'FU', cmd: 'fuera',    up: true  },
  ];
  for (const d of direcciones) {
    tryPlaceAt(dCol + d.dx, dRow + d.dy, (col, row) => ({
      id: genId(), col, row,
      label: d.lbl, command: d.cmd,
      color: d.up ? '#663322' : '#662222', textColor: '#fff',
      completoPanel: panelId,
    }));
  }

  // 3. Acciones — primero row 0 derecha→izquierda, fallback a cualquier hueco.
  if (withActions) {
    const actions: { lbl: string; cmd: string; color: string; addText?: boolean }[] = [
      { lbl: 'LOC',   cmd: 'locate',    color: '#223366' },
      { lbl: 'IR',    cmd: 'irsala',    color: '#662266', addText: true },
      { lbl: 'STOP',  cmd: 'stop',      color: '#662222' },
      { lbl: 'Res',   cmd: 'responder', color: '#662266', addText: true },
      { lbl: 'Decir', cmd: 'decir',     color: '#662266', addText: true },
    ];
    let irPos: { col: number; row: number } | null = null;
    for (const a of actions) {
      const mk = (col: number, row: number): LayoutButton => ({
        id: genId(), col, row,
        label: a.lbl, command: a.cmd,
        color: a.color, textColor: '#fff',
        addText: a.addText,
        completoPanel: panelId,
      });
      // Intento 1: row 0, derecha→izquierda (saltando col 0 = switch).
      let placedHere: { col: number; row: number } | null = null;
      for (let c = cols - 1; c >= 1 && placedHere === null; c--) {
        if (tryPlaceAt(c, 0, mk)) placedHere = { col: c, row: 0 };
      }
      // Intento 2 (fallback): primer hueco libre del grid.
      if (placedHere === null) {
        const free = findFreeCell();
        if (free && tryPlaceAt(free.col, free.row, mk)) placedHere = free;
      }
      if (placedHere && a.lbl === 'IR') irPos = placedHere;
    }
    // SIG: preferentemente bajo IR; fallback a cualquier hueco.
    const mkSig = (col: number, row: number): LayoutButton => ({
      id: genId(), col, row,
      label: 'SIG', command: 'sigilarsala',
      color: '#443366', textColor: '#fff',
      addText: true,
      completoPanel: panelId,
    });
    let sigPlaced = false;
    if (irPos !== null) {
      sigPlaced = tryPlaceAt(irPos.col, irPos.row + 1, mkSig);
    }
    if (!sigPlaced) {
      const free = findFreeCell();
      if (free) tryPlaceAt(free.col, free.row, mkSig);
    }
  }

  return result;
}

// Layout inicial para un server nuevo. Genera 2 paneles, cada uno con switch
// + direcciones + acciones (panel 1) o switch + direcciones (panel 2),
// adaptados a las dims elegidas. Genera independientemente para vertical
// (vertCols × vertRows) y horizontal (vertRows × vertCols) — sin transforms
// runtime, cada orientación es una botonera propia.
export function createAdaptiveLayout(vertCols: number, vertRows: number): ButtonLayout {
  const buttons: LayoutButton[] = [];
  const tag = (b: LayoutButton, o: 'vertical' | 'horizontal'): LayoutButton => ({ ...b, orientation: o });
  // Panel 1: con acciones.
  for (const b of placeCanonicalButtons(vertCols, vertRows, 1, true)) buttons.push(tag(b, 'vertical'));
  for (const b of placeCanonicalButtons(vertRows, vertCols, 1, true)) buttons.push(tag(b, 'horizontal'));
  // Panel 2: solo switch + direcciones.
  for (const b of placeCanonicalButtons(vertCols, vertRows, 2, false)) buttons.push(tag(b, 'vertical'));
  for (const b of placeCanonicalButtons(vertRows, vertCols, 2, false)) buttons.push(tag(b, 'horizontal'));
  return { buttons };
}

// Genera los botones para un panel adicional (al hacer "añadir panel" desde
// el modal de gestión). Mismo seeder que `createAdaptiveLayout` pero solo un
// panel, sin acciones — switch + direcciones para que el panel nuevo nazca
// usable.
export function createPanelButtons(panelId: number, vertCols: number, vertRows: number): LayoutButton[] {
  const out: LayoutButton[] = [];
  const tag = (b: LayoutButton, o: 'vertical' | 'horizontal'): LayoutButton => ({ ...b, orientation: o });
  for (const b of placeCanonicalButtons(vertCols, vertRows, panelId, false)) out.push(tag(b, 'vertical'));
  for (const b of placeCanonicalButtons(vertRows, vertCols, panelId, false)) out.push(tag(b, 'horizontal'));
  return out;
}

export function createBlindModeLayout(): ButtonLayout {
  // Panel 1: Core controls + directions
  const panel1: LayoutButton[] = [
    // Row 0: IRSALA, Vida, Energía, XP, Salidas (las 4 últimas son avisos floating con variables)
    { id: genId(), col: 0, row: 0, label: 'IRSALA', command: 'irsala', color: '#662266', textColor: '#fff', blindPanel: 1, fixed: true },
    { id: genId(), col: 1, row: 0, label: 'Vida', command: 'Vida: ${vida}/${vida_max}', color: '#336633', textColor: '#fff', blindPanel: 1, kind: 'floating' },
    { id: genId(), col: 2, row: 0, label: 'Energía', command: 'Energía: ${energia}/${energia_max}', color: '#336633', textColor: '#fff', blindPanel: 1, kind: 'floating' },
    { id: genId(), col: 3, row: 0, label: 'XP', command: 'XP: ${xp}', color: '#336633', textColor: '#fff', blindPanel: 1, kind: 'floating' },
    { id: genId(), col: 4, row: 0, label: 'Salidas', command: 'Salidas: ${salidas}', color: '#336633', textColor: '#fff', blindPanel: 1, kind: 'floating' },
    // Row 1: Noroeste, Norte, Noreste, Arriba
    { id: genId(), col: 0, row: 1, label: 'Noroeste', command: 'noroeste', color: '#662222', textColor: '#fff', blindPanel: 1 },
    { id: genId(), col: 1, row: 1, label: 'Norte', command: 'norte', color: '#662222', textColor: '#fff', blindPanel: 1 },
    { id: genId(), col: 2, row: 1, label: 'Noreste', command: 'noreste', color: '#662222', textColor: '#fff', blindPanel: 1 },
    { id: genId(), col: 3, row: 1, label: 'Arriba', command: 'ar', color: '#663322', textColor: '#fff', blindPanel: 1 },
    // Row 2: Oeste, [CENTER SWITCH], Este, Abajo
    { id: genId(), col: 0, row: 2, label: 'Oeste', command: 'oeste', color: '#662222', textColor: '#fff', blindPanel: 1 },
    { id: genId(), col: 1, row: 2, label: 'Cambiar', command: '__SWITCH_PANEL__', color: '#336666', textColor: '#88ccff', blindPanel: 1, fixed: true },
    { id: genId(), col: 2, row: 2, label: 'Este', command: 'este', color: '#662222', textColor: '#fff', blindPanel: 1 },
    { id: genId(), col: 3, row: 2, label: 'Abajo', command: 'ab', color: '#663322', textColor: '#fff', blindPanel: 1 },
    // Row 3: Sudoeste, Sur, Sudeste, Dentro, Fuera
    { id: genId(), col: 0, row: 3, label: 'Sudoeste', command: 'sudoeste', color: '#662222', textColor: '#fff', blindPanel: 1 },
    { id: genId(), col: 1, row: 3, label: 'Sur', command: 'sur', color: '#662222', textColor: '#fff', blindPanel: 1 },
    { id: genId(), col: 2, row: 3, label: 'Sudeste', command: 'sudeste', color: '#662222', textColor: '#fff', blindPanel: 1 },
    { id: genId(), col: 3, row: 3, label: 'Dentro', command: 'dentro', color: '#663322', textColor: '#fff', blindPanel: 1 },
    { id: genId(), col: 4, row: 3, label: 'Fuera', command: 'fuera', color: '#663322', textColor: '#fff', blindPanel: 1 },
  ];

  // Panel 2: Stealth directions with empty customizable buttons
  const panel2: LayoutButton[] = [
    // Row 0: 5 empty buttons
    { id: genId(), col: 0, row: 0, label: '-', command: '', color: '#444444', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 1, row: 0, label: '-', command: '', color: '#444444', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 2, row: 0, label: '-', command: '', color: '#444444', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 3, row: 0, label: '-', command: '', color: '#444444', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 4, row: 0, label: '-', command: '', color: '#444444', textColor: '#fff', blindPanel: 2 },
    // Row 1: Stealth directions Noroeste, Norte, Noreste, Arriba + empty
    { id: genId(), col: 0, row: 1, label: 'Noroeste sigilar', command: 'sigilar noroeste', color: '#662222', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 1, row: 1, label: 'Norte sigilar', command: 'sigilar norte', color: '#662222', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 2, row: 1, label: 'Noreste sigilar', command: 'sigilar noreste', color: '#662222', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 3, row: 1, label: 'Arriba sigilar', command: 'sigilar ar', color: '#663322', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 4, row: 1, label: '-', command: '', color: '#444444', textColor: '#fff', blindPanel: 2 },
    // Row 2: Stealth directions Oeste, SWITCH, Este, Abajo + empty
    { id: genId(), col: 0, row: 2, label: 'Oeste sigilar', command: 'sigilar oeste', color: '#662222', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 1, row: 2, label: 'Cambiar', command: '__SWITCH_PANEL__', color: '#336666', textColor: '#88ccff', blindPanel: 2 },
    { id: genId(), col: 2, row: 2, label: 'Este sigilar', command: 'sigilar este', color: '#662222', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 3, row: 2, label: 'Abajo sigilar', command: 'sigilar ab', color: '#663322', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 4, row: 2, label: '-', command: '', color: '#444444', textColor: '#fff', blindPanel: 2 },
    // Row 3: Stealth directions Sudoeste, Sur, Sudeste, Dentro, Fuera
    { id: genId(), col: 0, row: 3, label: 'Sudoeste sigilar', command: 'sigilar sudoeste', color: '#662222', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 1, row: 3, label: 'Sur sigilar', command: 'sigilar sur', color: '#662222', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 2, row: 3, label: 'Sudeste sigilar', command: 'sigilar sudeste', color: '#662222', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 3, row: 3, label: 'Dentro sigilar', command: 'sigilar dentro', color: '#663322', textColor: '#fff', blindPanel: 2 },
    { id: genId(), col: 4, row: 3, label: 'Fuera sigilar', command: 'sigilar fuera', color: '#663322', textColor: '#fff', blindPanel: 2 },
  ];

  return { buttons: [...panel1, ...panel2] };
}

function migrateLayout(layout: ButtonLayout): ButtonLayout {
  const migratedButtons = layout.buttons.map(btn => {
    let next = btn;
    // Migrate secondaryCommand to alternativeCommands
    if (next.secondaryCommand && !next.alternativeCommands) {
      next = {
        ...next,
        alternativeCommands: [next.secondaryCommand],
        secondaryCommand: undefined,
      };
    }
    // Blind-mode panel-switch button: icon "⇄" replaced with brief text
    if (next.command === '__SWITCH_PANEL__' && next.label === '⇄') {
      next = { ...next, label: 'Cambiar' };
    }
    return next;
  });

  // Add SIG (sigilarsala) button below IR in completo layout if missing
  // and the target slot (7,1) is free. Blind-mode layouts use different
  // coordinates so this only affects the completo default layout.
  const hasIrCompleto = migratedButtons.some(b => b.col === 7 && b.row === 0 && b.command === 'irsala' && !b.blindPanel);
  const hasSigilarsala = migratedButtons.some(b => b.command === 'sigilarsala' && !b.blindPanel);
  const slotFree = !migratedButtons.some(b => b.col === 7 && b.row === 1 && !b.blindPanel);
  if (hasIrCompleto && !hasSigilarsala && slotFree) {
    migratedButtons.push({
      id: genId(),
      col: 7,
      row: 1,
      label: 'SIG',
      command: 'sigilarsala',
      color: '#443366',
      textColor: '#fff',
      addText: true,
    });
  }

  // Add panel-switch buttons at (0,0) for completo layouts that don't yet
  // use the panel system. Only applies if no button already uses
  // completoPanel and slot (0,0) is free in the completo layout.
  const hasCompletoPanel = migratedButtons.some(b => b.completoPanel !== undefined);
  const hasCompletoSwitch = migratedButtons.some(b => b.command === '__SWITCH_PANEL__' && b.completoPanel !== undefined);
  const completoSlotFree = !migratedButtons.some(b => b.col === 0 && b.row === 0 && !b.blindPanel);
  if (!hasCompletoPanel && !hasCompletoSwitch && completoSlotFree && hasIrCompleto) {
    migratedButtons.push(
      { id: genId(), col: 0, row: 0, label: 'Panel', command: '__SWITCH_PANEL__', color: '#336666', textColor: '#88ccff', completoPanel: 1, fixed: true, locked: true },
      { id: genId(), col: 0, row: 0, label: 'Panel', command: '__SWITCH_PANEL__', color: '#336666', textColor: '#88ccff', completoPanel: 2, fixed: true, locked: true },
    );
  }

  return { buttons: migratedButtons };
}

export async function loadServerLayout(serverId: string): Promise<ButtonLayout> {
  const key = `buttonLayout_${serverId}`;
  const json = await AsyncStorage.getItem(key);
  if (!json) return { buttons: [] };
  const layout = JSON.parse(json);
  return migrateLayout(layout);
}

export async function saveServerLayout(serverId: string, layout: ButtonLayout): Promise<void> {
  const key = `buttonLayout_${serverId}`;
  await AsyncStorage.setItem(key, JSON.stringify(layout));
}

// === Migración v3 del button-layout (one-shot) ===
//
// Pre-v3: cada botón completo tenía (col, row) en coords vertical; la pantalla
// horizontal se calculaba en runtime aplicando `normalModeTransforms` (para
// standard) o copia 1:1 (para custom).
//
// v3: cada botón pertenece a UNA orientación. Sin transforms en runtime. La
// migración duplica cada botón completo: una copia vertical (coords tal cual)
// y una copia horizontal (coords transformadas). Botones blind no se tocan.
//
// Idempotente: si los botones ya tienen `orientation`, no hace nada.

// La tabla LEGACY_NORMAL_TRANSFORMS y `transformVerticalToHorizontal` viven
// arriba (las usan tanto el migrador como `duplicateForBothOrientations` para
// los layouts default).

export async function migrateLayoutToV3(serverId: string, legacyLayoutKind: string): Promise<void> {
  const key = `buttonLayout_${serverId}`;
  const json = await AsyncStorage.getItem(key);
  if (!json) return; // Sin layout guardado → nada que hacer (los nuevos se crearán como v3).

  const layout = JSON.parse(json) as ButtonLayout;
  if (!layout || !Array.isArray(layout.buttons)) return;

  // Idempotente: si ya tiene orientation en algún botón completo, asumimos
  // que ya se migró (una migración parcial sería un bug, pero el flag global
  // del migrador en serverStorage previene re-runs).
  const alreadyMigrated = layout.buttons.some(b => b.orientation !== undefined);
  if (alreadyMigrated) return;

  const newButtons: LayoutButton[] = [];
  for (const btn of layout.buttons) {
    if (btn.blindPanel !== undefined) {
      // Blind sin orientation — pasa tal cual.
      newButtons.push(btn);
      continue;
    }
    // Botón de modo completo: duplicar.
    newButtons.push({ ...btn, orientation: 'vertical' });
    const { col: hCol, row: hRow } = transformVerticalToHorizontal(btn.col, btn.row, legacyLayoutKind);
    newButtons.push({
      ...btn,
      id: `${btn.id}_h`,
      orientation: 'horizontal',
      col: hCol,
      row: hRow,
    });
  }

  await AsyncStorage.setItem(key, JSON.stringify({ buttons: newButtons }));
}
