import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, PanResponder } from 'react-native';
import Svg, { Circle, Line, G } from 'react-native-svg';
import { MapRoom, MapService } from '../services/mapService';

interface MiniMapProps {
  mapService: MapService;
  currentRoom: MapRoom | null;
  visible: boolean;
  onToggle: () => void;
  walking?: boolean;
  onStop?: () => void;
  selectedRoomId?: number | null;
  onSelectRoom?: (room: MapRoom) => void;
}

export interface MiniMapHandle {
  previewRoom: (room: MapRoom) => void;
  resetView: () => void;
}

const MAP_SIZE = 180;
const ROOM_SIZE = 7.2;
const CURRENT_ROOM_SIZE = 9;
const BASE_VIEW_RADIUS = 13.5;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const CLUSTER_ZOOM_THRESHOLD = 0.4;

type Cell = {
  sx: number;
  sy: number;
  centerX: number;
  centerY: number;
  rooms: MapRoom[];
  isCurrent: boolean;
  hasSelected: boolean;
  color?: string;
};

export const MiniMap = forwardRef<MiniMapHandle, MiniMapProps>(function MiniMap(
  { mapService, currentRoom, visible, onToggle, selectedRoomId, onSelectRoom },
  ref
) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zOffset, setZOffset] = useState(0);

  useImperativeHandle(
    ref,
    () => ({
      previewRoom: (room: MapRoom) => {
        if (!currentRoom) return;
        setZoom(1);
        setPan({ x: room.x - currentRoom.x, y: room.y - currentRoom.y });
        setZOffset(room.z - currentRoom.z);
      },
      resetView: () => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setZOffset(0);
      },
    }),
    [currentRoom]
  );

  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  const currentRoomRef = useRef(currentRoom);
  zoomRef.current = zoom;
  panRef.current = pan;
  currentRoomRef.current = currentRoom;

  const pendingUpdate = useRef<{ pan?: { x: number; y: number }; zoom?: number }>({});
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
    startPan: { x: 0, y: 0 },
    pinchStartDist: 0,
    pinchStartZoom: 1,
    tapStartX: 0,
    tapStartY: 0,
    tapStartTime: 0,
    hasMoved: false,
    wasPinch: false,
  });

  const cellsRef = useRef<Cell[]>([]);
  const onSelectRoomRef = useRef(onSelectRoom);
  onSelectRoomRef.current = onSelectRoom;

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
          const scale = (MAP_SIZE / 2) / visibleRadius;
          pendingUpdate.current.pan = {
            x: gesture.current.startPan.x - g.dx / scale,
            y: gesture.current.startPan.y + g.dy / scale,
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
        const tx = gesture.current.tapStartX;
        const ty = gesture.current.tapStartY;
        let nearest: { cell: Cell; dist: number } | null = null;
        for (const cell of cellsRef.current) {
          const dx = cell.sx - tx;
          const dy = cell.sy - ty;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d <= 18 && (nearest === null || d < nearest.dist)) {
            nearest = { cell, dist: d };
          }
        }
        if (!nearest) return;
        if (nearest.cell.rooms.length === 1) {
          onSelectRoomRef.current?.(nearest.cell.rooms[0]);
        } else {
          const cr = currentRoomRef.current;
          if (!cr) return;
          setZoom(1);
          setPan({ x: nearest.cell.centerX - cr.x, y: nearest.cell.centerY - cr.y });
        }
      },
      onPanResponderTerminate: () => {
        cancelPending();
        gesture.current.mode = 'none';
      },
    })
  ).current;

  const mapContent = useMemo(() => {
    if (!currentRoom) return null;

    const visibleRadius = BASE_VIEW_RADIUS / zoom;
    const scale = (MAP_SIZE / 2) / visibleRadius;
    const cx = currentRoom.x + pan.x;
    const cy = currentRoom.y + pan.y;
    const viewZ = currentRoom.z + zOffset;
    const clusterMode = zoom < CLUSTER_ZOOM_THRESHOLD;

    const rooms = mapService.getNearbyRooms(cx, cy, viewZ, visibleRadius * 1.3);

    const toScreen = (x: number, y: number) => ({
      sx: (x - cx) * scale + MAP_SIZE / 2,
      sy: -(y - cy) * scale + MAP_SIZE / 2,
    });

    const cells: Cell[] = [];
    const lines: { x1: number; y1: number; x2: number; y2: number; key: string }[] = [];

    if (!clusterMode) {
      const roomMap = new Map(rooms.map((r) => [r.id, r]));
      const seen = new Set<string>();
      for (const room of rooms) {
        const { sx, sy } = toScreen(room.x, room.y);
        cells.push({
          sx,
          sy,
          centerX: room.x,
          centerY: room.y,
          rooms: [room],
          isCurrent: zOffset === 0 && room.id === currentRoom.id,
          hasSelected: room.id === selectedRoomId,
          color: room.c,
        });
        for (const destId of Object.values(room.e)) {
          const dest = roomMap.get(destId);
          if (!dest) continue;
          const key = `${Math.min(room.id, destId)}-${Math.max(room.id, destId)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const { sx: dx, sy: dy } = toScreen(dest.x, dest.y);
          lines.push({ x1: sx, y1: sy, x2: dx, y2: dy, key });
        }
      }
    } else {
      const cellSize = Math.max(1, Math.ceil(3 / zoom));
      const cellKey = (x: number, y: number) =>
        `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;

      const buckets = new Map<string, MapRoom[]>();
      const roomToCell = new Map<number, string>();
      for (const room of rooms) {
        const key = cellKey(room.x, room.y);
        roomToCell.set(room.id, key);
        const arr = buckets.get(key);
        if (arr) arr.push(room);
        else buckets.set(key, [room]);
      }

      const cellsByKey = new Map<string, Cell>();
      for (const [key, group] of buckets.entries()) {
        let sumX = 0;
        let sumY = 0;
        let isCurrent = false;
        let hasSelected = false;
        const colorCounts = new Map<string | undefined, number>();
        for (const r of group) {
          sumX += r.x;
          sumY += r.y;
          if (zOffset === 0 && r.id === currentRoom.id) isCurrent = true;
          if (r.id === selectedRoomId) hasSelected = true;
          colorCounts.set(r.c, (colorCounts.get(r.c) ?? 0) + 1);
        }
        let predominantColor: string | undefined;
        let maxCount = -1;
        for (const [c, count] of colorCounts.entries()) {
          if (count > maxCount) {
            maxCount = count;
            predominantColor = c;
          }
        }
        const centerX = sumX / group.length;
        const centerY = sumY / group.length;
        const { sx, sy } = toScreen(centerX, centerY);
        const cell: Cell = {
          sx,
          sy,
          centerX,
          centerY,
          rooms: group,
          isCurrent,
          hasSelected,
          color: predominantColor,
        };
        cells.push(cell);
        cellsByKey.set(key, cell);
      }

      const edgeSeen = new Set<string>();
      for (const room of rooms) {
        const srcKey = roomToCell.get(room.id);
        if (!srcKey) continue;
        for (const destId of Object.values(room.e)) {
          const destKey = roomToCell.get(destId);
          if (!destKey || destKey === srcKey) continue;
          const edgeKey = srcKey < destKey ? `${srcKey}|${destKey}` : `${destKey}|${srcKey}`;
          if (edgeSeen.has(edgeKey)) continue;
          edgeSeen.add(edgeKey);
          const src = cellsByKey.get(srcKey);
          const dst = cellsByKey.get(destKey);
          if (!src || !dst) continue;
          lines.push({
            x1: src.sx,
            y1: src.sy,
            x2: dst.sx,
            y2: dst.sy,
            key: edgeKey,
          });
        }
      }
    }

    cellsRef.current = cells;
    return { lines, cells, clusterMode };
  }, [currentRoom, zoom, pan, zOffset, mapService, selectedRoomId]);

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setZOffset(0);
  };

  // Sin mapa cargado en absoluto (server sin mapId, o biblioteca vacía):
  // ocultamos el toggle entero — no hay nada que mostrar y la M flotando
  // sin función desconcierta.
  if (!mapService.isLoaded) {
    return null;
  }

  if (!visible || !currentRoom || !mapContent) {
    return (
      <View style={styles.wrapperClosed}>
        <TouchableOpacity
          style={styles.toggleBtn}
          onPress={onToggle}
          activeOpacity={0.7}
          accessibilityLabel="Toggle map"
          accessibilityRole="button"
          accessibilityHint="Show or hide the map view"
        >
          <Text style={styles.toggleText}>M</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isPanned = pan.x !== 0 || pan.y !== 0 || zoom !== 1 || zOffset !== 0;
  const zOffsetLabel = zOffset > 0 ? `+${zOffset}` : zOffset < 0 ? `${zOffset}` : '';

  return (
    <View style={styles.wrapperOpen} pointerEvents="box-none">
      <View style={styles.container}>
        <Text style={styles.roomName} numberOfLines={1}>
          {currentRoom.n}
          {zOffset !== 0 ? `  (z ${zOffsetLabel})` : ''}
        </Text>

        <View style={styles.mapArea} {...panResponder.panHandlers}>
          <Svg width={MAP_SIZE} height={MAP_SIZE} pointerEvents="none">
            <G>
              {mapContent.lines.map((l) => (
                <Line
                  key={l.key}
                  x1={l.x1}
                  y1={l.y1}
                  x2={l.x2}
                  y2={l.y2}
                  stroke="rgba(0,200,0,0.25)"
                  strokeWidth={1}
                />
              ))}

              {mapContent.cells
                .filter((c) => c.hasSelected)
                .map((c) => (
                  <Circle
                    key={`aura-${c.rooms[0].id}`}
                    cx={c.sx}
                    cy={c.sy}
                    r={CURRENT_ROOM_SIZE}
                    fill="none"
                    stroke="rgba(255,180,0,0.9)"
                    strokeWidth={2.5}
                  />
                ))}

              {mapContent.cells.map((cell) => {
                const isCluster = cell.rooms.length > 1;
                const size = cell.isCurrent
                  ? CURRENT_ROOM_SIZE
                  : isCluster && cell.rooms.length > 3
                  ? ROOM_SIZE * 1.2
                  : ROOM_SIZE;
                const fill = cell.isCurrent
                  ? 'rgba(255,255,0,0.85)'
                  : cell.color
                  ? `${cell.color}cc`
                  : 'rgba(0,180,0,0.7)';
                return (
                  <Circle
                    key={`cell-${cell.rooms[0].id}`}
                    cx={cell.sx}
                    cy={cell.sy}
                    r={size / 2}
                    fill={fill}
                    stroke={cell.isCurrent ? 'rgba(255,255,255,0.7)' : undefined}
                    strokeWidth={cell.isCurrent ? 1 : 0}
                  />
                );
              })}
            </G>
          </Svg>
        </View>

        {isPanned && (
          <TouchableOpacity
            style={styles.recenterBtn}
            onPress={resetView}
            activeOpacity={0.7}
            accessibilityLabel="Centrar mapa"
            accessibilityRole="button"
          >
            <Text style={styles.recenterText}>⊙</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.rightColumn}>
        <TouchableOpacity style={styles.toggleBtn} onPress={onToggle} activeOpacity={0.7}>
          <Text style={styles.toggleText}>M</Text>
        </TouchableOpacity>
        <View style={styles.zButtonsBottom}>
          <TouchableOpacity
            style={styles.toggleBtn}
            onPress={() => setZOffset(zOffset + 1)}
            activeOpacity={0.7}
            accessibilityLabel="Ver piso superior"
            accessibilityRole="button"
          >
            <Text style={styles.toggleText}>▲</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.toggleBtn}
            onPress={() => setZOffset(zOffset - 1)}
            activeOpacity={0.7}
            accessibilityLabel="Ver piso inferior"
            accessibilityRole="button"
          >
            <Text style={styles.toggleText}>▼</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

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
    marginLeft: 4,
  },
  toggleText: {
    color: '#0f0',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
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
  roomName: {
    color: 'rgba(0, 255, 0, 0.7)',
    fontSize: 10,
    fontFamily: 'monospace',
    textAlign: 'center',
    marginBottom: 4,
  },
  mapArea: {
    width: MAP_SIZE,
    height: MAP_SIZE,
    position: 'relative',
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
  rightColumn: {
    width: 32,
    height: 204,
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  zButtonsBottom: {
    flexDirection: 'column',
  },
});
