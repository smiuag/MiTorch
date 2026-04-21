import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MapRoom } from '../services/mapService';

interface MiniMapProps {
  currentRoom: MapRoom | null;
  nearbyRooms: MapRoom[];
  visible: boolean;
  onToggle: () => void;
  inlineMode?: boolean;
  walking?: boolean;
  onStop?: () => void;
}

const MAP_SIZE = 180;
const ROOM_SIZE = 7.2;
const CURRENT_ROOM_SIZE = 9;
const VIEW_RADIUS = 13.5;

export function MiniMap({ currentRoom, nearbyRooms, visible, onToggle, inlineMode, walking, onStop }: MiniMapProps) {
  const mapContent = useMemo(() => {
    if (!currentRoom || nearbyRooms.length === 0) return null;

    const cx = currentRoom.x;
    const cy = currentRoom.y;
    const scale = MAP_SIZE / (VIEW_RADIUS * 2);

    const toScreen = (x: number, y: number) => ({
      sx: (x - cx) * scale + MAP_SIZE / 2,
      sy: -(y - cy) * scale + MAP_SIZE / 2,
    });

    const lines: { x1: number; y1: number; x2: number; y2: number; key: string }[] = [];
    const roomDots: { sx: number; sy: number; room: MapRoom; isCurrent: boolean }[] = [];
    const roomSet = new Set(nearbyRooms.map(r => r.id));

    for (const room of nearbyRooms) {
      const { sx, sy } = toScreen(room.x, room.y);
      roomDots.push({ sx, sy, room, isCurrent: room.id === currentRoom.id });

      for (const [, destId] of Object.entries(room.e)) {
        if (roomSet.has(destId)) {
          const dest = nearbyRooms.find(r => r.id === destId);
          if (dest) {
            const { sx: dx, sy: dy } = toScreen(dest.x, dest.y);
            const key = `${Math.min(room.id, destId)}-${Math.max(room.id, destId)}`;
            if (!lines.find(l => l.key === key)) {
              lines.push({ x1: sx, y1: sy, x2: dx, y2: dy, key });
            }
          }
        }
      }
    }

    return { lines, roomDots };
  }, [currentRoom, nearbyRooms]);

  if (inlineMode) {
    if (!currentRoom || !mapContent) {
      return <View style={styles.inlineEmpty} />;
    }

    return (
      <View style={styles.inlineContainer}>
        <Text style={styles.roomName} numberOfLines={1}>
          {currentRoom.n}
        </Text>

        <View style={styles.mapArea}>
          {mapContent.lines.map(line => {
            const dx = line.x2 - line.x1;
            const dy = line.y2 - line.y1;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);

            return (
              <View
                key={line.key}
                style={[
                  styles.exitLine,
                  {
                    left: line.x1,
                    top: line.y1,
                    width: length,
                    transform: [{ rotate: `${angle}deg` }],
                  },
                ]}
              />
            );
          })}

          {mapContent.roomDots.map(({ sx, sy, room, isCurrent }) => {
            const size = isCurrent ? CURRENT_ROOM_SIZE : ROOM_SIZE;
            const roomColor = room.c ?? 'rgba(0, 180, 0, 0.4)';
            return (
              <View
                key={room.id}
                style={[
                  styles.roomDot,
                  isCurrent ? styles.currentRoomDot : { backgroundColor: roomColor + '99' },
                  {
                    left: sx - size / 2,
                    top: sy - size / 2,
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                  },
                ]}
              />
            );
          })}

        </View>

      </View>
    );
  }

  if (!visible || !currentRoom || !mapContent) {
    return (
      <View style={styles.wrapperClosed}>
        <TouchableOpacity
          style={styles.toggleBtn}
          onPress={onToggle}
          activeOpacity={0.7}
          accessible={true}
          accessibilityLabel="Toggle map"
          accessibilityRole="button"
          accessibilityHint="Show or hide the map view"
        >
          <Text style={styles.toggleText}>M</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View
      style={styles.wrapperOpen}
      pointerEvents="box-none"
      accessible={true}
      accessibilityLabel="Mini map"
      accessibilityRole="none"
    >
      <View style={styles.container}>
        <Text
          style={styles.roomName}
          numberOfLines={1}
          accessible={true}
          accessibilityLabel={`Current room: ${currentRoom.n}`}
          accessibilityRole="header"
        >
          {currentRoom.n}
        </Text>

        <View style={styles.mapArea} pointerEvents="none">
          {mapContent.lines.map(line => {
            const dx = line.x2 - line.x1;
            const dy = line.y2 - line.y1;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);

            return (
              <View
                key={line.key}
                style={[
                  styles.exitLine,
                  {
                    left: line.x1,
                    top: line.y1,
                    width: length,
                    transform: [{ rotate: `${angle}deg` }],
                  },
                ]}
              />
            );
          })}

          {mapContent.roomDots.map(({ sx, sy, room, isCurrent }) => {
            const size = isCurrent ? CURRENT_ROOM_SIZE : ROOM_SIZE;
            const roomColor = room.c ?? 'rgba(0, 180, 0, 0.4)';
            return (
              <View
                key={room.id}
                style={[
                  styles.roomDot,
                  isCurrent ? styles.currentRoomDot : { backgroundColor: roomColor + '99' },
                  {
                    left: sx - size / 2,
                    top: sy - size / 2,
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                  },
                ]}
              />
            );
          })}

        </View>

      </View>

      <TouchableOpacity style={styles.toggleBtn} onPress={onToggle} activeOpacity={0.7}>
        <Text style={styles.toggleText}>M</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  inlineContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderColor: 'rgba(0, 200, 0, 0.2)',
    borderWidth: 1,
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inlineEmpty: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
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
  exitLine: {
    position: 'absolute',
    height: 1,
    backgroundColor: 'rgba(0, 200, 0, 0.2)',
    transformOrigin: 'left center',
  },
  roomDot: {
    position: 'absolute',
  },
  currentRoomDot: {
    backgroundColor: 'rgba(255, 255, 0, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
  },
});
