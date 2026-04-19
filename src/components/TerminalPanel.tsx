import React, { useCallback, useRef } from 'react';
import { View, FlatList, StyleSheet, Keyboard } from 'react-native';
import { MudLine } from '../types';
import { AnsiText } from './AnsiText';
import { MiniMap } from './MiniMap';
import { MapRoom } from '../services/mapService';

interface TerminalPanelProps {
  lines: MudLine[];
  fontSize: number;
  mapVisible: boolean;
  onToggleMap: () => void;
  currentRoom: MapRoom | null;
  nearbyRooms: MapRoom[];
  flatListRef?: React.RefObject<FlatList>;
  isAtBottomRef?: React.RefObject<boolean>;
}

export function TerminalPanel({
  lines,
  fontSize,
  mapVisible,
  onToggleMap,
  currentRoom,
  nearbyRooms,
  flatListRef,
  isAtBottomRef,
}: TerminalPanelProps) {
  const localFlatListRef = useRef<FlatList>(null);
  const localIsAtBottomRef = useRef(true);

  const actualFlatListRef = flatListRef || localFlatListRef;
  const actualIsAtBottomRef = isAtBottomRef || localIsAtBottomRef;

  const renderLine = useCallback(({ item }: { item: MudLine }) => (
    <AnsiText line={item} fontSize={fontSize} />
  ), [fontSize]);

  const keyExtractor = useCallback((item: MudLine) => String(item.id), []);

  return (
    <View style={styles.outputWrapper} onTouchStart={() => {
      Keyboard.dismiss();
    }}>
      <MiniMap
        currentRoom={currentRoom}
        nearbyRooms={nearbyRooms}
        visible={mapVisible}
        onToggle={onToggleMap}
      />
      <FlatList
        ref={actualFlatListRef}
        data={lines}
        renderItem={renderLine}
        keyExtractor={keyExtractor}
        style={styles.output}
        contentContainerStyle={styles.outputContent}
        onContentSizeChange={() => {
          if (actualIsAtBottomRef.current) {
            setTimeout(() => actualFlatListRef.current?.scrollToEnd({ animated: false }), 50);
          }
        }}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
          actualIsAtBottomRef.current = distanceFromBottom < 50;
        }}
        scrollEventThrottle={100}
        removeClippedSubviews={false}
        maxToRenderPerBatch={30}
        windowSize={21}
        keyboardShouldPersistTaps="always"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  outputWrapper: {
    flex: 1,
    backgroundColor: '#000',
  },
  output: {
    flex: 1,
    backgroundColor: '#000',
  },
  outputContent: {
    flexGrow: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});
