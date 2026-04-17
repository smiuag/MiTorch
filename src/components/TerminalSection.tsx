import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Text,
} from 'react-native';
import { MudLine } from '../types';
import { AnsiText } from './AnsiText';
import { MiniMap } from './MiniMap';
import { MapRoom } from '../services/mapService';

interface TerminalSectionProps {
  lines: MudLine[];
  fontSize: number;
  mapVisible: boolean;
  onToggleMap: () => void;
  currentRoom: MapRoom | null;
  nearbyRooms: MapRoom[];
  height: number;
}

export function TerminalSection({
  lines,
  fontSize,
  mapVisible,
  onToggleMap,
  currentRoom,
  nearbyRooms,
  height,
}: TerminalSectionProps) {
  const flatListRef = useRef<FlatList>(null);
  const [scrollAtBottom, setScrollAtBottom] = useState(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  // Auto-scroll to bottom when new lines arrive
  useEffect(() => {
    if (scrollAtBottom && lines.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 0);
    }
  }, [lines, scrollAtBottom]);

  const handleScroll = (e: any) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const isAtBottom = contentOffset.y >= contentSize.height - layoutMeasurement.height - 50;
    setScrollAtBottom(isAtBottom);
    setShowScrollToBottom(!isAtBottom);
  };

  const handleScrollToBottom = () => {
    setScrollAtBottom(true);
    flatListRef.current?.scrollToEnd({ animated: true });
  };

  return (
    <View style={[styles.container, { height }]}>
      {mapVisible && (
        <View style={styles.mapContainer}>
          <MiniMap
            currentRoom={currentRoom}
            nearbyRooms={nearbyRooms}
            onToggle={onToggleMap}
          />
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={lines}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.lineContainer}>
            <AnsiText spans={item.spans} fontSize={fontSize} />
          </View>
        )}
        onScroll={handleScroll}
        scrollEventThrottle={250}
        removeClippedSubviews={true}
        maxToRenderPerBatch={50}
        updateCellsBatchingPeriod={50}
      />

      {showScrollToBottom && (
        <TouchableOpacity
          style={styles.scrollToBottomButton}
          onPress={handleScrollToBottom}
        >
          <Text style={styles.scrollToBottomText}>↓ Bottom</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    position: 'relative',
  },
  mapContainer: {
    width: '100%',
    height: 120,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  lineContainer: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  scrollToBottomButton: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(51, 153, 204, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    zIndex: 10,
  },
  scrollToBottomText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
