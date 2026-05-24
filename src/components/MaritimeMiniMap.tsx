// Renderer del mini-mapa marítimo. Pan, pinch-zoom y tap-para-navegar,
// reusando el patrón del MiniMap terrestre. Cuadrícula de celdas
// coloreadas según paleta del PNG del wiki — ver NAVEGACION.md.

import React, { useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, PanResponder } from 'react-native';
import Svg, { Rect, Polyline, Circle, G } from 'react-native-svg';
import {
  MaritimeMapService,
  MaritimePosition,
} from '../services/maritimeMapService';
import { NavState } from '../services/maritimeNavigator';

interface Props {
  service: MaritimeMapService;
  currentCell: MaritimePosition | null;
  navState: NavState;
  visible: boolean;
  onToggle: () => void;
  onTapCell: (col: number, row: number) => void;
  onCancelNavigation: () => void;
}

const MAP_SIZE = 180;
const BASE_VIEW_RADIUS = 8;   // celdas alrededor del barco a zoom=1
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3.0;

export function MaritimeMiniMap({
  service,
  currentCell,
  navState,
  visible,
  onToggle,
  onTapCell,
  onCancelNavigation,
}: Props) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ col: 0, row: 0 });
  // Preview cell: igual que el MiniMap terrestre, el primer tap marca
  // la celda destino, el segundo (en la misma celda) confirma y lanza
  // navegarsala. Tap en otra celda reemplaza la marca.
  const [previewCell, setPreviewCell] = useState<MaritimePosition | null>(null);
  const previewCellRef = useRef<MaritimePosition | null>(null);
  previewCellRef.current = previewCell;

  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  const currentCellRef = useRef(currentCell);
  zoomRef.current = zoom;
  panRef.current = pan;
  currentCellRef.current = currentCell;

  const pendingUpdate = useRef<{ pan?: { col: number; row: number }; zoom?: number }>({});
  const rafId = useRef<number | null>(null);

  const flushPending = () => {
    const p = pendingUpdate.current;
    if (p.pan) setPan(p.pan);
    if (p.zoom !== undefined) setZoom(p.zoom);
    pendingUpdate.current = {};
    rafId.current = null;
  };
  const scheduleUpdate = () => {
    if (rafId.current == null) {
      rafId.current = requestAnimationFrame(flushPending);
    }
  };
  const cancelPending = () => {
    if (rafId.current != null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    flushPending();
  };

  const gesture = useRef({
    mode: 'none' as 'none' | 'pan' | 'pinch',
    startPan: { col: 0, row: 0 },
    pinchStartDist: 0,
    pinchStartZoom: 1,
    tapStartX: 0,
    tapStartY: 0,
    tapStartTime: 0,
    hasMoved: false,
    wasPinch: false,
  });

  const onTapCellRef = useRef(onTapCell);
  onTapCellRef.current = onTapCell;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,

      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        gesture.current.tapStartX = evt.nativeEvent.locationX;
        gesture.current.tapStartY = evt.nativeEvent.locationY;
        gesture.current.tapStartTime = Date.now();
        gesture.current.hasMoved = false;
        gesture.current.wasPinch = false;
        if (touches.length >= 2) {
          const dx = touches[0].pageX - touches[1].pageX;
          const dy = touches[0].pageY - touches[1].pageY;
          gesture.current.pinchStartDist = Math.sqrt(dx * dx + dy * dy);
          gesture.current.pinchStartZoom = zoomRef.current;
          gesture.current.mode = 'pinch';
          gesture.current.wasPinch = true;
        } else {
          gesture.current.startPan = { ...panRef.current };
          gesture.current.mode = 'pan';
        }
      },

      onPanResponderMove: (evt, g) => {
        const touches = evt.nativeEvent.touches;
        if (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4) {
          gesture.current.hasMoved = true;
        }
        if (touches.length >= 2) {
          gesture.current.wasPinch = true;
          const dx = touches[0].pageX - touches[1].pageX;
          const dy = touches[0].pageY - touches[1].pageY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (gesture.current.mode !== 'pinch' || gesture.current.pinchStartDist === 0) {
            gesture.current.pinchStartDist = dist;
            gesture.current.pinchStartZoom = zoomRef.current;
            gesture.current.mode = 'pinch';
            return;
          }
          const ratio = dist / gesture.current.pinchStartDist;
          const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, gesture.current.pinchStartZoom * ratio));
          pendingUpdate.current.zoom = newZoom;
          scheduleUpdate();
        } else if (touches.length === 1 && gesture.current.mode === 'pan') {
          const effectiveZoom = pendingUpdate.current.zoom ?? zoomRef.current;
          const visibleRadius = BASE_VIEW_RADIUS / effectiveZoom;
          const cellPx = (MAP_SIZE / 2) / visibleRadius;
          pendingUpdate.current.pan = {
            col: gesture.current.startPan.col - g.dx / cellPx,
            row: gesture.current.startPan.row - g.dy / cellPx,
          };
          scheduleUpdate();
        }
      },

      onPanResponderRelease: () => {
        cancelPending();
        const duration = Date.now() - gesture.current.tapStartTime;
        const wasTap = !gesture.current.hasMoved && !gesture.current.wasPinch && duration < 400;
        gesture.current.mode = 'none';
        if (!wasTap) return;
        const cur = currentCellRef.current;
        if (!cur) return;
        const z = zoomRef.current;
        const p = panRef.current;
        const visibleRadius = BASE_VIEW_RADIUS / z;
        const cellPx = (MAP_SIZE / 2) / visibleRadius;
        const dx = gesture.current.tapStartX - MAP_SIZE / 2;
        const dy = gesture.current.tapStartY - MAP_SIZE / 2;
        const col = Math.round(cur.col + p.col + dx / cellPx);
        const row = Math.round(cur.row + p.row + dy / cellPx);
        // Si ya hay una celda marcada y el tap es en la misma, confirma
        // y lanza navegarsala. Si no, solo marca (preview).
        const prev = previewCellRef.current;
        if (prev && prev.col === col && prev.row === row) {
          setPreviewCell(null);
          onTapCellRef.current?.(col, row);
        } else {
          setPreviewCell({ col, row });
        }
      },
      onPanResponderTerminate: () => {
        cancelPending();
        gesture.current.mode = 'none';
      },
    }),
  ).current;

  const content = useMemo(() => {
    const grid = service.getGrid();
    if (!grid || !currentCell) return null;

    const visibleRadius = BASE_VIEW_RADIUS / zoom;
    const cellPx = (MAP_SIZE / 2) / visibleRadius;
    const cx = currentCell.col + pan.col;
    const cy = currentCell.row + pan.row;

    const toScreen = (col: number, row: number) => ({
      sx: (col - cx) * cellPx + MAP_SIZE / 2,
      sy: (row - cy) * cellPx + MAP_SIZE / 2,
    });

    const cells: Array<{ x: number; y: number; w: number; color: string }> = [];
    const colStart = Math.floor(cx - visibleRadius);
    const colEnd = Math.ceil(cx + visibleRadius);
    const rowStart = Math.floor(cy - visibleRadius);
    const rowEnd = Math.ceil(cy + visibleRadius);

    // Grid toroidal: pintamos también celdas con c<0, c>=W, r<0, r>=H,
    // dejando que service.cellAt haga el wrap. El usuario ve continuidad
    // cuando navega cerca del borde.
    for (let r = rowStart; r <= rowEnd; r++) {
      for (let c = colStart; c <= colEnd; c++) {
        const t = service.cellAt(c, r);
        const { sx, sy } = toScreen(c, r);
        cells.push({
          x: sx - cellPx / 2,
          y: sy - cellPx / 2,
          w: cellPx + 0.5, // overlap mínimo para evitar gaps de antialiasing
          color: service.colorFor(t),
        });
      }
    }

    const ship = toScreen(currentCell.col, currentCell.row);
    let routePts: string | null = null;
    if (navState.path && navState.path.length >= 2) {
      // "Desenrollar" el path: cada punto consecutivo debe tener delta
      // pequeño (≤ medio mapa). Si la diferencia bruta excede medio
      // mapa, asumimos wrap y desplazamos el siguiente punto al lado
      // contrario, así la polyline va en la dirección real del barco
      // en vez de cruzar el mapa entero en línea recta diagonal.
      const W = grid.width;
      const H = grid.height;
      const unwrapped: { col: number; row: number }[] = [
        { col: navState.path[0].col, row: navState.path[0].row },
      ];
      for (let i = 1; i < navState.path.length; i++) {
        const prev = unwrapped[i - 1];
        let col = navState.path[i].col;
        let row = navState.path[i].row;
        if (Math.abs(col - prev.col) > W / 2) {
          col += col > prev.col ? -W : W;
        }
        if (Math.abs(row - prev.row) > H / 2) {
          row += row > prev.row ? -H : H;
        }
        unwrapped.push({ col, row });
      }
      // Reanclaje: busca el índice del path donde está el barco ahora y
      // desplaza TODO el path para que ese punto coincida con currentCell
      // en coordenadas absolutas. Sin esto, si el barco cruzó un wrap el
      // path desenrollado queda en un espacio shifteado y la polyline
      // sale fuera de la pantalla.
      let anchorIdx = -1;
      for (let i = 0; i < navState.path.length; i++) {
        if (navState.path[i].col === currentCell.col &&
            navState.path[i].row === currentCell.row) {
          anchorIdx = i;
          break;
        }
      }
      if (anchorIdx >= 0) {
        const offCol = unwrapped[anchorIdx].col - currentCell.col;
        const offRow = unwrapped[anchorIdx].row - currentCell.row;
        if (offCol !== 0 || offRow !== 0) {
          for (const p of unwrapped) {
            p.col -= offCol;
            p.row -= offRow;
          }
        }
      }
      routePts = unwrapped
        .map(p => {
          const { sx, sy } = toScreen(p.col, p.row);
          return `${sx},${sy}`;
        })
        .join(' ');
    }

    // Coords de pantalla del preview (si hay).
    let previewScreen: { sx: number; sy: number } | null = null;
    if (previewCell) {
      const p = toScreen(previewCell.col, previewCell.row);
      previewScreen = { sx: p.sx, sy: p.sy };
    }

    return { cells, shipX: ship.sx, shipY: ship.sy, routePts, cellPx, previewScreen };
  }, [service, currentCell, zoom, pan, navState.path, previewCell]);

  const resetView = () => {
    setZoom(1);
    setPan({ col: 0, row: 0 });
  };

  if (!service.isLoaded()) return null;

  if (!visible || !currentCell || !content) {
    return (
      <View style={styles.wrapperClosed}>
        <TouchableOpacity
          style={styles.toggleBtn}
          onPress={onToggle}
          activeOpacity={0.7}
          accessibilityLabel="Toggle maritime map"
          accessibilityRole="button"
        >
          <Text style={styles.toggleText}>⚓</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const navigating = navState.kind !== 'idle' && navState.kind !== 'arrived' && navState.kind !== 'error';
  const headerText = navigating && navState.destination
    ? `→ ${navState.destination.name}`
    : `${currentCell.col}º O, ${currentCell.row}º S`;
  const isPanned = pan.col !== 0 || pan.row !== 0 || zoom !== 1;

  return (
    <View style={styles.wrapperOpen} pointerEvents="box-none">
      <View style={styles.container}>
        <Text style={styles.header} numberOfLines={1}>{headerText}</Text>

        <View style={styles.mapAreaWrapper}>
          <View style={styles.mapArea} {...panResponder.panHandlers}>
            <Svg width={MAP_SIZE} height={MAP_SIZE} pointerEvents="none">
              <G>
                {content.cells.map((c, i) => (
                  <Rect
                    key={i}
                    x={c.x}
                    y={c.y}
                    width={c.w}
                    height={c.w}
                    fill={c.color}
                  />
                ))}

                {content.routePts && (
                  <Polyline
                    points={content.routePts}
                    fill="none"
                    stroke="rgba(255,200,0,0.85)"
                    strokeWidth={1.8}
                  />
                )}

                {content.previewScreen && (
                  <Circle
                    cx={content.previewScreen.sx}
                    cy={content.previewScreen.sy}
                    r={Math.max(5, content.cellPx * 0.6)}
                    fill="none"
                    stroke="rgba(255,180,0,0.9)"
                    strokeWidth={2.5}
                  />
                )}

                <Circle
                  cx={content.shipX}
                  cy={content.shipY}
                  r={Math.max(3, content.cellPx * 0.4)}
                  fill="rgba(255,255,255,0.95)"
                  stroke="rgba(0,0,0,0.6)"
                  strokeWidth={1}
                />
              </G>
            </Svg>
          </View>

          {/* OJO: el botón centrar debe estar FUERA del View del
              PanResponder. Si está dentro, el PanResponder se queda con
              el touch (claimed via onStartShouldSetPanResponder=true) y
              el onPress nunca dispara. */}
          {isPanned && (
            <TouchableOpacity
              style={styles.recenterBtn}
              onPress={resetView}
              activeOpacity={0.7}
              accessibilityLabel="Centrar en barco"
              accessibilityRole="button"
            >
              <Text style={styles.recenterText}>⊙</Text>
            </TouchableOpacity>
          )}
        </View>

        {navigating && (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onCancelNavigation}
            activeOpacity={0.7}
            accessibilityLabel="Cancelar navegación"
          >
            <Text style={styles.cancelText}>✕ parar</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.rightColumn}>
        <TouchableOpacity style={styles.toggleBtn} onPress={onToggle} activeOpacity={0.7}>
          <Text style={styles.toggleText}>⚓</Text>
        </TouchableOpacity>
        <View style={styles.zoomCol}>
          <TouchableOpacity
            style={styles.toggleBtn}
            onPress={() => setZoom(z => Math.min(MAX_ZOOM, z * 1.4))}
            activeOpacity={0.7}
            accessibilityLabel="Zoom in"
          >
            <Text style={styles.toggleText}>＋</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.toggleBtn}
            onPress={() => setZoom(z => Math.max(MIN_ZOOM, z / 1.4))}
            activeOpacity={0.7}
            accessibilityLabel="Zoom out"
          >
            <Text style={styles.toggleText}>−</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapperClosed: {
    position: 'absolute',
    top: 4,
    right: 4,
    zIndex: 5,
  },
  wrapperOpen: {
    position: 'absolute',
    top: 4,
    right: 4,
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  container: {
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderBottomLeftRadius: 8,
    borderWidth: 1,
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderColor: 'rgba(0, 200, 0, 0.2)',
    padding: 6,
    width: MAP_SIZE + 12,
  },
  header: {
    color: 'rgba(0, 255, 0, 0.7)',
    fontSize: 10,
    fontFamily: 'monospace',
    textAlign: 'center',
    marginBottom: 4,
  },
  mapAreaWrapper: {
    width: MAP_SIZE,
    height: MAP_SIZE,
    position: 'relative',
  },
  mapArea: {
    width: MAP_SIZE,
    height: MAP_SIZE,
    overflow: 'hidden',
  },
  recenterBtn: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0, 100, 0, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(0, 200, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  recenterText: {
    color: '#0f0',
    fontSize: 14,
    fontFamily: 'monospace',
    fontWeight: 'bold',
    lineHeight: 16,
  },
  cancelBtn: {
    marginTop: 6,
    backgroundColor: 'rgba(140, 30, 30, 0.85)',
    paddingVertical: 4,
    borderRadius: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 80, 80, 0.5)',
  },
  cancelText: {
    color: '#fcc',
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  rightColumn: {
    marginLeft: 4,
  },
  zoomCol: {
    marginTop: 4,
  },
  toggleBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 100, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 200, 0, 0.5)',
    marginTop: 4,
  },
  toggleText: {
    color: '#0f0',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
});
