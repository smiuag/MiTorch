// Servicio de estado para el mapa marítimo de Reinos. Paralelo y
// totalmente independiente del MapService terrestre — usa coords
// (col, row) sobre una cuadrícula 2D, no (x, y, z) absolutos.
//
// Carga el grid bundleado vía require(). Doctrina, paleta y comandos:
// ver NAVEGACION.md en la raíz del repo.

export type CellType =
  | 0  // tierra
  | 1  // muelle
  | 2  // playa
  | 3  // costa1
  | 4  // costa2
  | 5  // oceano3
  | 6  // oceano4
  | 7  // oceano5
  | 8  // oceano6
  | 9  // oceano7
  | 10 // oceano8
  | 11; // oceano9

export interface MaritimePort {
  id: string;
  name: string;
  col: number;
  row: number;
}

export interface MaritimeGrid {
  width: number;
  height: number;
  palette: Array<{ id: number; rgb: [number, number, number]; name: string }>;
  cells: number[];
  ports: MaritimePort[];
}

export interface MaritimePosition {
  col: number;
  row: number;
}

const PALETTE_HEX: Record<number, string> = {
  0:  '#847110', // tierra
  1:  '#794120', // muelle
  2:  '#ffef85', // playa
  3:  '#00f2e9', // costa1
  4:  '#00b4ab', // costa2
  5:  '#00b7ed', // oceano3
  6:  '#008bc1', // oceano4
  7:  '#0070c2', // oceano5
  8:  '#004d89', // oceano6
  9:  '#003689', // oceano7
  10: '#001e58', // oceano8
  11: '#07013f', // oceano9
};

export class MaritimeMapService {
  private grid: MaritimeGrid | null = null;
  private currentCell: MaritimePosition | null = null;
  private subscribers: Array<(pos: MaritimePosition | null) => void> = [];

  // El loader es sync porque require() del JSON es sync en RN Metro.
  // Mantenemos la firma async-friendly por simetría con MapService.load().
  async load(): Promise<void> {
    if (this.grid) return;
    this.grid = require('../assets/maritime-grid.json') as MaritimeGrid;
  }

  isLoaded(): boolean {
    return this.grid !== null;
  }

  getGrid(): MaritimeGrid | null {
    return this.grid;
  }

  getCurrentCell(): MaritimePosition | null {
    return this.currentCell;
  }

  // Llamado por el parser de TerminalScreen cuando una línea entrante
  // matchea el header marítimo `[Nº Oeste, Mº Sur]`.
  setCurrentCell(col: number, row: number): void {
    const prev = this.currentCell;
    if (prev && prev.col === col && prev.row === row) return;
    this.currentCell = { col, row };
    this.notify();
  }

  // Llamado cuando el jugador entra a una sala terrestre o desembarca —
  // dispara el auto-swap MaritimeMiniMap → MiniMap en la UI.
  clearCurrent(): void {
    if (!this.currentCell) return;
    this.currentCell = null;
    this.notify();
  }

  // El grid es toroidal (cíclico): salir por el este reaparece por el
  // oeste, salir por el norte reaparece por el sur. Cualquier (col, row)
  // se normaliza con módulo.
  cellAt(col: number, row: number): CellType {
    if (!this.grid) return 11;
    const W = this.grid.width;
    const H = this.grid.height;
    const c = ((col % W) + W) % W;
    const r = ((row % H) + H) % H;
    return this.grid.cells[r * W + c] as CellType;
  }

  // Normaliza coords al espacio canónico [0, W) × [0, H).
  wrap(col: number, row: number): MaritimePosition {
    const grid = this.grid;
    if (!grid) return { col, row };
    const c = ((col % grid.width) + grid.width) % grid.width;
    const r = ((row % grid.height) + grid.height) % grid.height;
    return { col: c, row: r };
  }

  // Navegable = todo lo que no es tierra ni playa. Muelles son destino
  // pero no se atraviesan: ver isTraversable() para A*.
  isNavigable(col: number, row: number): boolean {
    const c = this.cellAt(col, row);
    return c !== 0 && c !== 2;
  }

  // Para A*: los muelles ajenos NO se atraviesan, solo se permiten como
  // celda final del path. Esta función pasa un flag para distinguir.
  isTraversable(col: number, row: number, isDest: boolean): boolean {
    const c = this.cellAt(col, row);
    if (c === 0 || c === 2) return false; // tierra, playa
    if (c === 1) return isDest;            // muelle: solo si es destino
    return true;
  }

  findPort(idOrName: string): MaritimePort | null {
    if (!this.grid) return null;
    const needle = idOrName.toLowerCase();
    return (
      this.grid.ports.find(p => p.id === needle) ||
      this.grid.ports.find(p => p.name.toLowerCase() === needle) ||
      this.grid.ports.find(p => p.name.toLowerCase().includes(needle)) ||
      null
    );
  }

  // Dado el nombre de una sala terrestre (e.g. "Muelle de Alandaen",
  // "Puerto de Keel: Muelles", "Isla del Bucanero: Muelle Pirata"),
  // devuelve el puerto marítimo correspondiente o null. Usado al
  // detectar `embarcarse` para auto-swap al mapa de mar antes de que
  // llegue el primer header marino.
  portFromRoomName(roomName: string): MaritimePort | null {
    if (!this.grid || !roomName) return null;
    const lower = roomName.toLowerCase();
    for (const p of this.grid.ports) {
      if (lower.includes(p.id)) return p;
      if (lower.includes(p.name.toLowerCase())) return p;
    }
    return null;
  }

  listPorts(): MaritimePort[] {
    return this.grid?.ports ?? [];
  }

  colorFor(type: CellType): string {
    return PALETTE_HEX[type] ?? '#000';
  }

  subscribe(cb: (pos: MaritimePosition | null) => void): () => void {
    this.subscribers.push(cb);
    return () => {
      const i = this.subscribers.indexOf(cb);
      if (i >= 0) this.subscribers.splice(i, 1);
    };
  }

  private notify(): void {
    for (const cb of this.subscribers) {
      try { cb(this.currentCell); } catch (e) { console.warn('mar subscriber threw', e); }
    }
  }
}

export const maritimeMapService = new MaritimeMapService();
