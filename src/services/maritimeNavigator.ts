// Motor de `navegarsala`. Computa la ruta puerto-a-puerto con A* sobre
// el grid marítimo y la ejecuta como state machine reactiva a los
// mensajes del MUD (no batch). Ver NAVEGACION.md para la doctrina de
// comandos y los acks que escuchamos.

import { maritimeMapService, MaritimePort, MaritimePosition } from './maritimeMapService';

type Dir = 'n' | 's' | 'e' | 'o' | 'ne' | 'no' | 'se' | 'so';

const DIR_DELTA: Record<Dir, [number, number]> = {
  n:  [ 0, -1],
  s:  [ 0,  1],
  e:  [ 1,  0],
  o:  [-1,  0],
  ne: [ 1, -1],
  no: [-1, -1],
  se: [ 1,  1],
  so: [-1,  1],
};

const DIR_COMMAND: Record<Dir, string> = {
  n: 'norte', s: 'sur', e: 'este', o: 'oeste',
  ne: 'noreste', no: 'noroeste', se: 'sudeste', so: 'sudoeste',
};

// El MUD acepta varios sinónimos (sureste/sudeste, suroeste/sudoeste).
// Aceptamos ambos en el regex de ack.
const ACK_DIR_TO_KEY: Record<string, Dir> = {
  norte: 'n', sur: 's', este: 'e', oeste: 'o',
  noreste: 'ne', noroeste: 'no',
  sudeste: 'se', sureste: 'se',
  sudoeste: 'so', suroeste: 'so',
};

// Delta entre dos celdas vecinas, respetando el wrap toroidal: si la
// diferencia bruta supera la mitad del mundo, la dirección real es la
// opuesta (cruzamos el borde).
function deltaToDir(from: MaritimePosition, to: MaritimePosition): Dir | null {
  const grid = maritimeMapService.getGrid();
  let dcRaw = to.col - from.col;
  let drRaw = to.row - from.row;
  if (grid) {
    if (Math.abs(dcRaw) > grid.width / 2)  dcRaw = dcRaw > 0 ? dcRaw - grid.width  : dcRaw + grid.width;
    if (Math.abs(drRaw) > grid.height / 2) drRaw = drRaw > 0 ? drRaw - grid.height : drRaw + grid.height;
  }
  const dc = Math.sign(dcRaw);
  const dr = Math.sign(drRaw);
  for (const [k, [vc, vr]] of Object.entries(DIR_DELTA)) {
    if (vc === dc && vr === dr) return k as Dir;
  }
  return null;
}

interface Run {
  dir: Dir;
  cells: MaritimePosition[];   // celdas que se atraviesan al ejecutar este run, en orden
}

export type NavStateKind =
  | 'idle'
  | 'planning'
  | 'stopping_initial'    // safety stop antes de orientar el primer run
  | 'orienting'
  | 'navigating'
  | 'stopping_between'    // stop al final de un run antes del siguiente orientar
  | 'arrived'
  | 'error';

export interface NavState {
  kind: NavStateKind;
  destination?: MaritimePort;
  path?: MaritimePosition[];
  runs?: Run[];
  runIdx?: number;
  expectedDir?: Dir;
  errorMessage?: string;
}

interface NavigatorOpts {
  sender: (cmd: string) => void;
  announcer?: (text: string) => void;  // blind/self-voicing TTS
}

// Acepta los dos formatos confirmados del MUD:
//   "La embarcación termina de orientarse hacia el este."
//      → giro normal completado.
//   "La embarcación ya está orientada en dirección este."
//      → se mandó orientar pero el barco ya iba ahí. Mismo efecto.
// El separador entre el verbo y la dirección puede ser "hacia el" o
// "en dirección" — capturamos ambos.
const TURN_ACK_RE = /embarcaci[oó]n (?:termina de orientarse|ya est[aá]\s+orientada)\s+(?:hacia el|en direcci[oó]n)\s+(\w+)/i;
// Rechazo del MUD cuando intentamos velocidad mayor a la del barco.
// El número captura la velocidad máxima del barco para que no volvamos
// a intentar pasarnos en futuros runs.
const VEL_REJECT_RE = /velocidad m[aá]xima del barco.*?[uú]nicamente\s+(\d+)\s+unidades/i;

// Acepta tres respuestas del MUD a `navegar detener`:
//   - "La embarcación se detiene." (caso normal: estaba navegando)
//   - "La embarcación no está navegando. ¿Para qué querrías detenerla?"
//     (caso "ya parada" — sucede al arrancar navegarsala justo después
//     de embarcarse, cuando la nave aún no se ha movido)
//   - "La embarcación ya está detenida" (variante defensiva por si
//     existe; no confirmada en log pero barata de matchear).
const STOP_ACK_RE = /embarcaci[oó]n (?:se detiene|no est[aá] navegando|ya est[aá]\s+detenida)/i;

// Encallado: el barco golpea tierra. Reinos lo notifica con
// "¡la embarcación ha encallado al intentar navegar en dirección X!"
// y daña la nave. El motor debe abortar para no seguir golpeando.
const ENCALLADA_RE = /embarcaci[oó]n ha encallado/i;

// Costes A*. Ver NAVEGACION.md para la paleta.
function cellCost(type: number, isDest: boolean): number {
  if (type === 0 || type === 2) return Infinity;            // tierra, playa
  if (type === 1) return isDest ? 1.0 : Infinity;           // muelle ajeno = bloqueado
  if (type === 3 || type === 4) return 2.5;                 // costa1, costa2
  return 1.0;                                                // oceano3..9
}

function chebyshev(a: MaritimePosition, b: MaritimePosition): number {
  // Distancia toroidal: mínimo entre recorrido directo y wrap por el borde.
  const grid = maritimeMapService.getGrid();
  const dcDirect = Math.abs(a.col - b.col);
  const drDirect = Math.abs(a.row - b.row);
  if (!grid) return Math.max(dcDirect, drDirect);
  const dc = Math.min(dcDirect, grid.width - dcDirect);
  const dr = Math.min(drDirect, grid.height - drDirect);
  return Math.max(dc, dr);
}

function key(p: MaritimePosition): string {
  return `${p.col},${p.row}`;
}

// Penalty por cambio de dirección en A*. Cada "turn" cuesta como 3
// celdas: A* desviará hasta 3 celdas extra para ahorrar un giro.
const TURN_PENALTY = 3.0;

function planRoute(
  from: MaritimePosition,
  to: MaritimePosition,
): MaritimePosition[] | null {
  const grid = maritimeMapService.getGrid();
  if (!grid) return null;

  // Nodo de A* extendido con la dirección desde la que llegamos.
  // gScore se indexa por (pos, dir) porque llegar a la misma celda por
  // distintas direcciones puede tener distinto coste (turn penalty).
  // Sin esta separación A* cerraría un nodo con la primera dirección
  // explorada y nunca probaría versiones con menos giros desde otro
  // rumbo.
  interface Node {
    pos: MaritimePosition;
    g: number;
    f: number;
    dir: Dir | null;  // null = origen
  }
  const open: Node[] = [];
  const cameFrom = new Map<string, { pos: MaritimePosition; dir: Dir | null }>();
  const gScore = new Map<string, number>();

  const nodeKey = (p: MaritimePosition, d: Dir | null) =>
    `${p.col},${p.row},${d ?? '_'}`;

  const startK = nodeKey(from, null);
  gScore.set(startK, 0);
  open.push({ pos: from, g: 0, f: chebyshev(from, to), dir: null });

  const isStart = (p: MaritimePosition) => p.col === from.col && p.row === from.row;
  const isDest = (p: MaritimePosition) => p.col === to.col && p.row === to.row;

  while (open.length > 0) {
    // pop min-f (lineal — grid pequeño 92x36, suficiente)
    let bestI = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bestI].f) bestI = i;
    const cur = open.splice(bestI, 1)[0];
    const curK = nodeKey(cur.pos, cur.dir);
    if (cur.g > (gScore.get(curK) ?? Infinity)) continue;

    if (isDest(cur.pos)) {
      // reconstruir
      const path: MaritimePosition[] = [cur.pos];
      let k = curK;
      while (cameFrom.has(k)) {
        const prev = cameFrom.get(k)!;
        path.push(prev.pos);
        k = nodeKey(prev.pos, prev.dir);
      }
      path.reverse();
      return path;
    }

    for (const [dirKey, [dc, dr]] of Object.entries(DIR_DELTA)) {
      const newDir = dirKey as Dir;
      // Wrap toroidal: salir por un borde reaparece por el opuesto.
      const np: MaritimePosition = maritimeMapService.wrap(cur.pos.col + dc, cur.pos.row + dr);
      const type = grid.cells[np.row * grid.width + np.col];
      const stepCost = cellCost(type, isDest(np) || (isStart(np) && false));
      if (!isFinite(stepCost)) continue;
      // Penalty si cambiamos de rumbo respecto a cómo llegamos a `cur`.
      const turnCost = (cur.dir !== null && cur.dir !== newDir) ? TURN_PENALTY : 0;
      const tentativeG = cur.g + stepCost + turnCost;
      const nK = nodeKey(np, newDir);
      const prevG = gScore.get(nK);
      if (prevG !== undefined && tentativeG >= prevG) continue;
      gScore.set(nK, tentativeG);
      cameFrom.set(nK, { pos: cur.pos, dir: cur.dir });
      open.push({ pos: np, g: tentativeG, f: tentativeG + chebyshev(np, to), dir: newDir });
    }
  }

  return null;
}

function segmentRuns(path: MaritimePosition[]): Run[] {
  if (path.length < 2) return [];
  const runs: Run[] = [];
  let dir = deltaToDir(path[0], path[1]);
  if (!dir) return [];
  let cells: MaritimePosition[] = [path[1]];

  for (let i = 2; i < path.length; i++) {
    const d = deltaToDir(path[i - 1], path[i]);
    if (d === dir) {
      cells.push(path[i]);
    } else {
      runs.push({ dir: dir!, cells });
      dir = d!;
      cells = [path[i]];
    }
  }
  runs.push({ dir: dir!, cells });
  return runs;
}

// Mínimo de ms entre dos comandos consecutivos que el motor envía al
// MUD. Necesario porque Reinos puede ignorar/encadenar comandos si
// llegan demasiado seguidos (orientar + navegar emitidos sin pausa).
const COMMAND_THROTTLE_MS = 3000;

// Toggle de instrumentación. Cuando true, escupe a console.log cada
// transición del motor con prefijo `[mar]` para verlo via logcat con
// `adb logcat ReactNativeJS:V *:S | grep mar`.
const LOG = true;
function log(...args: unknown[]): void {
  if (LOG) console.log('[mar]', ...args);
}

interface QueuedCmd {
  cmd: string;
  onSent?: () => void;
}

export class MaritimeNavigator {
  private sender: ((cmd: string) => void) | null = null;
  private announcer: ((text: string) => void) | null = null;
  private state: NavState = { kind: 'idle' };
  private subscribers: Array<(s: NavState) => void> = [];
  private posUnsub: (() => void) | null = null;
  private sendQueue: QueuedCmd[] = [];
  private lastSendTime = 0;
  private sendTimer: ReturnType<typeof setTimeout> | null = null;
  // Velocidad actual seteada en el barco — 0 = desconocida, fuerza
  // enviar `velocidad N` la primera vez. Persistente cross-start.
  private currentSpeed: 0 | 1 | 2 = 0;
  // Velocidad máxima que el MUD ha confirmado para ESTE barco.
  // null = no sabemos (asumimos que aguanta 2). Aprendido del mensaje
  // de rechazo. Persistente cross-start porque el barco no cambia.
  private shipMaxSpeed: number | null = null;

  configure(opts: NavigatorOpts): void {
    this.sender = opts.sender;
    this.announcer = opts.announcer ?? null;
    if (!this.posUnsub) {
      this.posUnsub = maritimeMapService.subscribe(pos => this.onPosition(pos));
    }
  }

  getState(): NavState {
    return this.state;
  }

  subscribe(cb: (s: NavState) => void): () => void {
    this.subscribers.push(cb);
    return () => {
      const i = this.subscribers.indexOf(cb);
      if (i >= 0) this.subscribers.splice(i, 1);
    };
  }

  async start(target: string | { col: number; row: number }): Promise<void> {
    if (!this.sender) throw new Error('navegarsala: motor no configurado');

    // Resolver destino: string → buscar puerto; objeto → coords libres.
    let dest: MaritimePort;
    if (typeof target === 'string') {
      const port = maritimeMapService.findPort(target);
      if (!port) {
        const list = maritimeMapService.listPorts().map(p => p.id).join(', ');
        throw new Error(`puerto desconocido. Disponibles: ${list}`);
      }
      dest = port;
    } else {
      // Destino por coords arbitrarias — buscamos si coincide con algún
      // puerto para mostrar nombre legible; si no, etiquetamos genérico.
      const port = maritimeMapService.listPorts().find(p => p.col === target.col && p.row === target.row);
      dest = port ?? { id: `${target.col}_${target.row}`, name: `(${target.col}, ${target.row})`, col: target.col, row: target.row };
    }

    const pos = maritimeMapService.getCurrentCell();
    if (!pos) throw new Error('no estás navegando (sin coords marítimas)');

    if (pos.col === dest.col && pos.row === dest.row) {
      throw new Error(`ya estás en ${dest.name}`);
    }

    // Reset de velocidad para forzar enviar `velocidad N` en el primer
    // run. shipMaxSpeed se mantiene porque el barco no cambia entre
    // navegarsalas consecutivos en la misma sesión.
    this.currentSpeed = 0;

    log(`start dest=${dest.id} (${dest.col},${dest.row}) from (${pos.col},${pos.row})`);
    this.setState({ kind: 'planning', destination: dest });
    const path = planRoute(pos, { col: dest.col, row: dest.row });
    if (!path || path.length < 2) {
      this.setState({ kind: 'error', errorMessage: 'no hay ruta navegable', destination: dest });
      throw new Error('no hay ruta navegable');
    }
    const runs = segmentRuns(path);
    log(`plan: ${path.length - 1} cells in ${runs.length} runs: ` +
      runs.map(r => `${r.dir}x${r.cells.length}`).join(','));
    this.announce(`Iniciando ruta a ${dest.name}. ${path.length - 1} saltos en ${runs.length} maniobras.`);

    // Safety stop antes de arrancar — por si quedó algún `navegar` activo.
    this.setState({
      kind: 'stopping_initial',
      destination: dest,
      path,
      runs,
      runIdx: 0,
    });
    // Defensivo: si en 1500ms tras EL ENVÍO real no llega ack (ni
    // "se detiene" ni "ya está detenida"), asumimos parada y avanzamos.
    // onStopAck es idempotente por gating de state.kind.
    this.send('navegar detener', () => {
      setTimeout(() => this.onStopAck(), 1500);
    });
  }

  cancel(reason?: string): void {
    if (this.state.kind === 'idle' || this.state.kind === 'arrived') return;
    // Saltamos el throttle al cancelar — la parada debe ser inmediata.
    this.clearQueue();
    if (this.sender) this.sender('navegar detener');
    this.lastSendTime = Date.now();
    this.setState({ kind: 'idle' });
    if (reason) this.announce(`Ruta cancelada: ${reason}.`);
  }

  // Llamado desde TerminalScreen tras parsear cada línea del MUD.
  // Devuelve true si consumió la línea (para que el caller pueda decidir
  // si suprimir display, aunque por ahora no suprimimos nada).
  ingestLine(line: string): boolean {
    if (this.state.kind === 'idle') return false;

    // Diagnóstico: loguea CUALQUIER línea relacionada con navegación
    // mientras el motor esté activo, para detectar respuestas del MUD
    // que no estemos matcheando con los regex de ack.
    if (/embarcaci|orient|maniobr|tim[oó]n|navegar|velocidad|molestes|detener|detenida/i.test(line)) {
      log(`<< ${line}`);
    }

    const turnM = line.match(TURN_ACK_RE);
    if (turnM) {
      const dir = ACK_DIR_TO_KEY[turnM[1].toLowerCase()];
      if (dir) this.onTurnAck(dir);
      return true;
    }

    if (STOP_ACK_RE.test(line)) {
      this.onStopAck();
      return true;
    }

    if (ENCALLADA_RE.test(line)) {
      log('ENCALLADA detected — aborting navigation');
      this.cancel('barco encallado');
      return true;
    }

    // El MUD rechazó nuestra petición de velocidad — el barco no llega.
    // Memorizamos el máximo, ajustamos currentSpeed al valor real (la
    // velocidad NO cambió porque el comando se rechazó, así que sigue
    // siendo la anterior o el máximo del barco), y dejamos que el flujo
    // continúe — el `orientar`/`navegar` que el motor ya tiene
    // encolados saldrán como estaba previsto, simplemente la nave se
    // moverá a velocidad menor.
    const velM = line.match(VEL_REJECT_RE);
    if (velM) {
      const maxSpeed = parseInt(velM[1], 10);
      this.shipMaxSpeed = maxSpeed;
      this.currentSpeed = Math.min(this.currentSpeed || maxSpeed, maxSpeed) as 1 | 2;
      return true;
    }

    return false;
  }

  // Llamado cuando el usuario teclea un comando manualmente (cualquiera
  // que no provenga del navigator). Cancela la ruta defensivamente,
  // excepto los propios `orientar`/`navegar` que emitimos nosotros.
  notifyManualCommand(cmd: string): void {
    if (this.state.kind === 'idle' || this.state.kind === 'arrived') return;
    const lower = cmd.toLowerCase().trim();
    if (lower.startsWith('orientar ') || lower === 'navegar' || lower === 'navegar detener') return;
    this.cancel('comando manual');
  }

  // ---- transiciones internas ----

  private onPosition(pos: MaritimePosition | null): void {
    if (!pos) {
      if (this.state.kind !== 'idle') this.cancel('posición perdida');
      return;
    }
    if (this.state.kind !== 'navigating') {
      log(`pos (${pos.col},${pos.row}) ignored — state=${this.state.kind}`);
      return;
    }

    const runs = this.state.runs!;
    const runIdx = this.state.runIdx!;
    const run = runs[runIdx];
    const lastCellOfRun = run.cells[run.cells.length - 1];
    const isLastRun = runIdx === runs.length - 1;
    log(`pos (${pos.col},${pos.row}) navigating run ${runIdx} dir=${run.dir} target=(${lastCellOfRun.col},${lastCellOfRun.row})`);

    // ¿Llegamos al final del run?
    if (pos.col === lastCellOfRun.col && pos.row === lastCellOfRun.row) {
      log(`reached end of run ${runIdx} at (${pos.col},${pos.row}), isLastRun=${isLastRun}`);
      if (isLastRun) {
        // Llegamos al destino — el MUD ya nos para en el muelle, no hace
        // falta enviar navegar detener (el muelle no es navegable).
        this.setState({ ...this.state, kind: 'arrived' });
        this.announce(`Ruta completada en ${this.state.destination!.name}.`);
        // Vuelta a idle tras un beat — UI puede leer 'arrived' antes.
        setTimeout(() => {
          if (this.state.kind === 'arrived') this.setState({ kind: 'idle' });
        }, 1500);
        return;
      }
      this.setState({ ...this.state, kind: 'stopping_between' });
      // Phase A revertido: el pre-send velocidad ANTES del detener
      // hace que el barco acelere/desacelere durante los 3s que tarda
      // el detener en salir de la cola, generando overshoot grave
      // (visto en log: 4 celdas de exceso). Mandamos sólo detener; la
      // velocidad la ajusta `startNextRun` después del stop ack.
      this.send('navegar detener', () => {
        setTimeout(() => this.onStopAck(), 1500);
      });
      return;
    }

    // ¿La posición está dentro del run actual? (avance normal)
    const cellIdx = run.cells.findIndex(c => c.col === pos.col && c.row === pos.row);
    const onPath = cellIdx >= 0;
    if (onPath) {
      // Slowdown anticipado (Opción C): cuando navegamos a vel 2 y
      // sólo queda 1 celda para el final del run, mandamos `velocidad 1`
      // para que el siguiente tick mueva sólo 1 celda y aterrice
      // exacto. Aplica únicamente cuando estamos en un tick boundary
      // (cellIdx impar) porque a vel 2 cada tick avanza 2 celdas y los
      // boundaries caen en 1, 3, 5, ... — disparar fuera de boundary
      // sería desperdicio (la celda actual no es donde el barco "para"
      // su tick).
      const remaining = run.cells.length - 1 - cellIdx;
      if (this.currentSpeed === 2 && remaining === 1 && cellIdx % 2 === 1) {
        log(`slowdown: remaining=1 at cellIdx=${cellIdx}, dropping to vel 1`);
        this.send('velocidad 1');
        this.currentSpeed = 1;
      }
      return;
    }

    // Divergencia: corriente nos empujó fuera. Re-planeamos desde aquí.
    const dest = this.state.destination!;
    log(`DIVERGENCE at (${pos.col},${pos.row}). Run cells: ${run.cells.map(c=>`(${c.col},${c.row})`).join(' ')}. Replanning to (${dest.col},${dest.row})`);
    this.announce('Desvío detectado. Recalculando ruta.');
    const newPath = planRoute(pos, { col: dest.col, row: dest.row });
    if (!newPath || newPath.length < 2) {
      this.setState({ kind: 'error', errorMessage: 'no hay ruta tras desvío', destination: dest });
      this.send('navegar detener');
      return;
    }
    const newRuns = segmentRuns(newPath);
    // runIdx = -1 a propósito: en `startNextRun`, cuando ve estado
    // `stopping_between`, hace `runIdx += 1`. Con -1 esto pone runIdx
    // = 0 y ejecuta el primer run del nuevo plan. Sin este truco la
    // re-planificación saltaba siempre el run 0.
    this.setState({
      kind: 'stopping_between',
      destination: dest,
      path: newPath,
      runs: newRuns,
      runIdx: -1,
    });
    this.send('navegar detener', () => {
      setTimeout(() => this.onStopAck(), 1500);
    });
  }

  private onTurnAck(dir: Dir): void {
    if (this.state.kind !== 'orienting') {
      log(`turnAck ${dir} ignored — state=${this.state.kind}`);
      return;
    }
    if (this.state.expectedDir && this.state.expectedDir !== dir) {
      log(`turnAck UNEXPECTED dir=${dir}, expected=${this.state.expectedDir} — cancelling`);
      this.cancel('giro inesperado');
      return;
    }
    log(`turnAck ${dir} ok, sending navegar`);
    this.setState({ ...this.state, kind: 'navigating' });
    this.send('navegar');
  }

  private onStopAck(): void {
    log(`stopAck state=${this.state.kind}`);
    if (this.state.kind === 'stopping_initial' || this.state.kind === 'stopping_between') {
      this.startNextRun();
    }
  }

  private startNextRun(): void {
    const runs = this.state.runs!;
    let runIdx = this.state.runIdx ?? 0;
    if (this.state.kind === 'stopping_between') runIdx += 1;

    if (runIdx >= runs.length) {
      // No debería pasar — el último run termina en 'arrived' vía onPosition.
      this.setState({ kind: 'arrived' });
      return;
    }

    const run = runs[runIdx];

    // Verificación de drift: compara la posición real del barco (puede
    // haber overshoot por throttle + inercia del navegar antes del
    // detener) con la celda donde la ruta espera que estemos (la
    // anterior a la primera del próximo run = origen del run en el
    // path). Si difieren, replan desde la real.
    const actualPos = maritimeMapService.getCurrentCell();
    const path = this.state.path!;
    // path[0] es origen del navegarsala; el run runIdx empieza tras
    // path[runIdx*length-sum] cells. Más simple: el origen del run
    // runIdx es la última celda del run anterior, o el origen si idx=0.
    let expectedPos: MaritimePosition;
    if (runIdx === 0) {
      expectedPos = path[0];
    } else {
      const prevRun = runs[runIdx - 1];
      expectedPos = prevRun.cells[prevRun.cells.length - 1];
    }
    if (actualPos && (actualPos.col !== expectedPos.col || actualPos.row !== expectedPos.row)) {
      log(`DRIFT at startNextRun runIdx=${runIdx}: actual=(${actualPos.col},${actualPos.row}) expected=(${expectedPos.col},${expectedPos.row}). Replanning.`);
      const dest = this.state.destination!;
      const newPath = planRoute(actualPos, { col: dest.col, row: dest.row });
      if (!newPath || newPath.length < 2) {
        this.setState({ kind: 'error', errorMessage: 'no hay ruta tras drift', destination: dest });
        return;
      }
      const newRuns = segmentRuns(newPath);
      log(`replan: ${newPath.length - 1} cells in ${newRuns.length} runs: ` +
        newRuns.map(r => `${r.dir}x${r.cells.length}`).join(','));
      this.setState({
        kind: 'stopping_between',
        destination: dest,
        path: newPath,
        runs: newRuns,
        runIdx: -1,  // +1 al re-entrar = 0
      });
      // Stop seguro y rearranque
      this.send('navegar detener', () => {
        setTimeout(() => this.onStopAck(), 1500);
      });
      return;
    }

    log(`startNextRun runIdx=${runIdx}/${runs.length - 1} dir=${run.dir} cells=${run.cells.length} ` +
      `target=(${run.cells[run.cells.length - 1].col},${run.cells[run.cells.length - 1].row})`);
    this.setState({
      ...this.state,
      kind: 'orienting',
      runIdx,
      expectedDir: run.dir,
    });
    // Velocidad 2 para cualquier run ≥ 2 si el barco lo soporta. Para
    // runs de longitud impar (3, 5, 7...) el slowdown anticipado en
    // onPosition baja a vel 1 justo antes de la última celda para
    // evitar overshoot — no aquí.
    const desiredSpeed: 1 | 2 = (
      run.cells.length >= 2 &&
      (this.shipMaxSpeed === null || this.shipMaxSpeed >= 2)
    ) ? 2 : 1;
    if (desiredSpeed !== this.currentSpeed) {
      log(`speed ${this.currentSpeed} -> ${desiredSpeed} (run len ${run.cells.length}, max=${this.shipMaxSpeed})`);
      this.send(`velocidad ${desiredSpeed}`);
      this.currentSpeed = desiredSpeed;
    }

    this.announce(`Maniobra ${runIdx + 1}/${runs.length}: orientar al ${DIR_COMMAND[run.dir]}.`);
    const expected = run.dir;
    this.send(`orientar ${DIR_COMMAND[run.dir]}`, () => {
      // El giro tarda varios segundos. El motor DEBE esperar al ack
      // real `La embarcación termina de orientarse hacia el X` antes de
      // mandar `navegar` — si lo lanza durante el "Estás maniobrando..."
      // se ignora y el barco se queda parado. Timeout de 60s solo como
      // red de seguridad para conexión muerta, no para acelerar.
      setTimeout(() => {
        if (this.state.kind === 'orienting' && this.state.expectedDir === expected) {
          this.onTurnAck(expected);
        }
      }, 60000);
    });
  }

  // Encola el comando y lo manda respetando el throttle. `onSent` se
  // llama cuando el comando sale de verdad (no al encolar) — ahí es
  // donde los timeouts defensivos deben empezar a contar.
  private send(cmd: string, onSent?: () => void): void {
    this.sendQueue.push({ cmd, onSent });
    this.pumpQueue();
  }

  private pumpQueue(): void {
    if (this.sendTimer) return;
    if (this.sendQueue.length === 0) return;
    const since = Date.now() - this.lastSendTime;
    const delay = Math.max(0, COMMAND_THROTTLE_MS - since);
    this.sendTimer = setTimeout(() => {
      this.sendTimer = null;
      const item = this.sendQueue.shift();
      if (!item) return;
      log(`> ${item.cmd}`);
      if (this.sender) this.sender(item.cmd);
      this.lastSendTime = Date.now();
      if (item.onSent) item.onSent();
      this.pumpQueue();
    }, delay);
  }

  private clearQueue(): void {
    this.sendQueue = [];
    if (this.sendTimer) {
      clearTimeout(this.sendTimer);
      this.sendTimer = null;
    }
  }

  private announce(text: string): void {
    if (this.announcer) {
      try { this.announcer(text); } catch (e) { console.warn('announcer threw', e); }
    }
  }

  private setState(s: NavState): void {
    this.state = s;
    for (const cb of this.subscribers) {
      try { cb(s); } catch (e) { console.warn('nav subscriber threw', e); }
    }
  }
}

export const maritimeNavigator = new MaritimeNavigator();
