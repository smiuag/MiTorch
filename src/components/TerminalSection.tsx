import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
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

export interface TerminalSectionHandle {
  scrollToBottom: () => void;
}

interface TerminalSectionProps {
  lines: MudLine[];
  fontSize: number;
  mapVisible: boolean;
  onToggleMap: () => void;
  currentRoom: MapRoom | null;
  nearbyRooms: MapRoom[];
  height: number;
  onScrollToBottom?: () => void;
}

export const TerminalSection = forwardRef<TerminalSectionHandle, TerminalSectionProps>(
  function TerminalSectionImpl(
    {
      lines,
      fontSize,
      mapVisible,
      onToggleMap,
      currentRoom,
      nearbyRooms,
      height,
    },
    ref
  ) {
    const flatListRef = useRef<FlatList>(null);
    const [scrollAtBottom, setScrollAtBottom] = useState(true);
    const [showScrollToBottom, setShowScrollToBottom] = useState(false);

    useImperativeHandle(ref, () => ({
      scrollToBottom: () => {
        flatListRef.current?.scrollToEnd({ animated: true });
        setScrollAtBottom(true);
        setShowScrollToBottom(false);
      },
    }));

  // Auto-scroll to bottom when new lines arrive (always show latest)
  useEffect(() => {
    if (lines.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
        setScrollAtBottom(true);
      }, 0);
    }
  }, [lines]);

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
      <MiniMap
        currentRoom={currentRoom}
        nearbyRooms={nearbyRooms}
        visible={mapVisible}
        onToggle={onToggleMap}
      />

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
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
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
