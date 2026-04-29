import { PlayerVariables } from './playerStatsService';

// Leader regex used for BOTH detection (isPromptLine via .test) and dispatch
// (parsePromptUpdates via .exec). Anchored at the start (after optional ASCII
// whitespace) and case-SENSITIVE — the canonical sends exact case ("Pv:",
// "SL:", "Imagenes:"), which lets us drop `/i` for a small per-line speedup.
// Users with a custom non-canonical prompt that uses different casing won't
// be detected as prompt lines (and so won't be gagged either).
const PROMPT_LEADER_RE =
  /^[ \t]*(Pv|Pe|Xp|Carga|SL|PL|NM|LD|Jgd|Imagenes|Pieles|Inercia|Astucia|Acc):/;

// Per-field regex set. All anchored at start, no `/i` flag, no lookahead
// (text fields just stop at `>` or EOL since the canonical puts one field
// per line). Compiled once at module load.
//
// STAT_LINE_RE captures the 4 fields of the FIRST prompt line in one shot:
// "Pv:X/Y Pe:X/Y Xp:N Carga:N". Going from 4 regex.exec to 1 on the line
// the MUD repeats most often.
const STAT_LINE_RE = /^Pv:(\d+)[/\\](\d+)\s+Pe:(\d+)[/\\](\d+)\s+Xp:(\d+)\s+Carga:(\d+)/;
const SL_RE = /^SL:\s*([^>]*)/;
const PL_RE = /^PL:\s*([^>]*)/;
const NM_RE = /^NM:\s*([^>]*)/;
const LD_RE = /^LD:\s*([^>]*)/;
const JGD_RE = /^Jgd:\s*(\d+)/;
const IMAGENES_RE = /^Imagenes:\s*(\d+)/;
const PIELES_RE = /^Pieles:\s*(\d+)/;
const INERCIA_RE = /^Inercia:\s*(\d+)/;
const ASTUCIA_RE = /^Astucia:\s*(\d+)/;
const ACC_RE = /^Acc:\s*(\d+)[/\\](\d+)[/\\](\d+)[/\\](\d+)/;

type Updates = Partial<PlayerVariables>;
type FieldParser = (line: string, updates: Updates) => void;

function parseStatLine(line: string, u: Updates): void {
  const m = STAT_LINE_RE.exec(line);
  if (!m) return;
  u.playerHP = Number(m[1]);
  u.playerMaxHP = Number(m[2]);
  u.playerEnergy = Number(m[3]);
  u.playerMaxEnergy = Number(m[4]);
  u.playerXP = Number(m[5]);
  u.carry = Number(m[6]);
}

function parseExits(line: string, u: Updates): void {
  const m = SL_RE.exec(line);
  if (m) u.roomExits = m[1].trim();
}

function parseCombatants(line: string, u: Updates): void {
  const m = PL_RE.exec(line);
  if (m) u.roomCombatants = m[1].trim();
}

function parseEnemies(line: string, u: Updates): void {
  const m = NM_RE.exec(line);
  if (m) u.roomEnemies = m[1].trim();
}

function parseAllies(line: string, u: Updates): void {
  const m = LD_RE.exec(line);
  if (m) u.roomAllies = m[1].trim();
}

function parsePlayers(line: string, u: Updates): void {
  const m = JGD_RE.exec(line);
  if (m) u.roomPlayers = Number(m[1]);
}

function parseImages(line: string, u: Updates): void {
  const m = IMAGENES_RE.exec(line);
  if (m) u.playerImages = Number(m[1]);
}

function parseSkins(line: string, u: Updates): void {
  const m = PIELES_RE.exec(line);
  if (m) u.playerSkins = Number(m[1]);
}

function parseInertia(line: string, u: Updates): void {
  const m = INERCIA_RE.exec(line);
  if (m) u.playerInertia = Number(m[1]);
}

function parseAstuteness(line: string, u: Updates): void {
  const m = ASTUCIA_RE.exec(line);
  if (m) u.playerAstuteness = Number(m[1]);
}

function parseActions(line: string, u: Updates): void {
  const m = ACC_RE.exec(line);
  if (!m) return;
  u.actionsMovement = Number(m[1]);
  u.actionsPrimary = Number(m[2]);
  u.actionsSecondary = Number(m[3]);
  u.actionsMinor = Number(m[4]);
}

// Dispatch table keyed by the exact-case leader the canonical uses. Pe, Xp
// and Carga are intentionally NOT mapped — they never appear as the leader
// of a line in the canonical (Pv: leads them all on the first stat line).
const PARSERS: Record<string, FieldParser> = {
  Pv: parseStatLine,
  SL: parseExits,
  PL: parseCombatants,
  NM: parseEnemies,
  LD: parseAllies,
  Jgd: parsePlayers,
  Imagenes: parseImages,
  Pieles: parseSkins,
  Inercia: parseInertia,
  Astucia: parseAstuteness,
  Acc: parseActions,
};

class PromptParser {
  // Cheap detection: does this line look like part of the MUD prompt?
  // Doesn't extract anything — callers that don't need the captured values
  // (e.g. when no variable triggers are active) can use this alone to gag
  // prompt lines without paying for the dispatch + per-field regex.
  isPromptLine(line: string): boolean {
    return PROMPT_LEADER_RE.test(line);
  }

  // Extracts field values from a prompt line. Caller must have checked with
  // isPromptLine first. Uses a dispatch table keyed by the leading token to
  // run exactly ONE targeted regex per line — no loop over 14 patterns, no
  // discriminator filter, no `toLowerCase` of the haystack. The first stat
  // line ("Pv:X/Y Pe:X/Y Xp:N Carga:N") gets a single combined regex that
  // captures all 4 fields at once.
  parsePromptUpdates(line: string): Updates {
    const m = PROMPT_LEADER_RE.exec(line);
    if (!m) return {};
    const parser = PARSERS[m[1]];
    if (!parser) return {};
    const updates: Updates = {};
    // Field regexes anchor with `^` and don't tolerate leading whitespace,
    // so trim once before dispatch (no-op when the line already starts at
    // column 0, which is the canonical case).
    parser(line.trimStart(), updates);
    return updates;
  }
}

export const promptParser = new PromptParser();

// Canonical prompt format applied by the "Aplicar prompt TorchZhyla" button.
// Both `prompt` and `promptcombate` are set to the same string — combat state
// is derived from the `combatientes` (PL:) field, not from a separate format.
//
// All field labels are unaccented (e.g. "Imagenes" not "Imágenes") and use
// the exact case the parser expects (case-sensitive matching). Users on a
// previous version of this canonical (with the accented "Imágenes:" or
// different casing) need to press "Aplicar prompt TorchZhyla" once for their
// character's server-side prompt to refresh.
export const CANONICAL_PROMPT =
  '$lPv:$v\\$V Pe:$g\\$G Xp:$x Carga:$c$lSL:$s$lPL:$a$lNM:$k$lLD:$K$lJgd:$j$lImagenes:$e$lPieles:$p$lInercia:$n$lAstucia:$t$lAcc:$AM\\$AP\\$AS\\$AZ$l';
