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

export const MiniMap = forwardRef<MiniMapHandle, MiniMapProps>(function MiniMap(
  { mapService, currentRoom, visible, onToggle },
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
  zoomRef.current = zoom;
  panRef.current = pan;

  const gesture = useRef({
    mode: 'none' as 'none' | 'pan' | 'pinch',
    startPan: { x: 0, y: 0 },
    pinchStartDist: 0,
    pinchStartZoom: 1,
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,

      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length >= 2) {
          const dx = touches[0].pageX - touches[1].pageX;
          const dy = touches[0].pageY - touches[1].pageY;
          gesture.current.pinchStartDist = Math.sqrt(dx * dx + dy * dy);
          gesture.current.pinchStartZoom = zoomRef.current;
          gesture.current.mode = 'pinch';
        } else {
          gesture.current.startPan = { ...panRef.current };
          gesture.current.mode = 'pan';
        }
      },

      onPanResponderMove: (evt, g) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length >= 2) {
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
          setZoom(newZoom);
        } else if (touches.length === 1 && gesture.current.mode === 'pan') {
          const visibleRadius = BASE_VIEW_RADIUS / zoomRef.current;
          const scale = (MAP_SIZE / 2) / visibleRadius;
          setPan({
            x: gesture.current.startPan.x - g.dx / scale,
            y: gesture.current.startPan.y + g.dy / scale,
          });
        }
      },

      onPanResponderRelease: () => {
        gesture.current.mode = 'none';
      },
      onPanResponderTerminate: () => {
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

    const rooms = mapService.getNearbyRooms(cx, cy, viewZ, visibleRadius * 1.3);

    const toScreen = (x: number, y: number) => ({
      sx: (x - cx) * scale + MAP_SIZE / 2,
      sy: -(y - cy) * scale + MAP_SIZE / 2,
    });

    const lines: { x1: number; y1: number; x2: number; y2: number; key: string }[] = [];
    const dots: { sx: number; sy: number; room: MapRoom; isCurrent: boolean }[] = [];
    const roomMap = new Map(rooms.map((r) => [r.id, r]));
    const seen = new Set<string>();

    for (const room of rooms) {
      const { sx, sy } = toScreen(room.x, room.y);
      dots.push({ sx, sy, room, isCurrent: zOffset === 0 && room.id === currentRoom.id });

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

    return { lines, dots };
  }, [currentRoom, zoom, pan, zOffset, mapService]);

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setZOffset(0);
  };

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
              {mapContent.dots.map(({ sx, sy, room, isCurrent }) => {
                const r = (isCurrent ? CURRENT_ROOM_SIZE : ROOM_SIZE) / 2;
                const fill = isCurrent
                  ? 'rgba(255,255,0,0.85)'
                  : room.c
                  ? `${room.c}cc`
                  : 'rgba(0,180,0,0.7)';
                return (
                  <Circle
                    key={room.id}
                    cx={sx}
                    cy={sy}
                    r={r}
                    fill={fill}
                    stroke={isCurrent ? 'rgba(255,255,255,0.7)' : undefined}
                    strokeWidth={isCurrent ? 1 : 0}
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
