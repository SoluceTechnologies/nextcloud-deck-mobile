import { StyleSheet, View } from 'react-native';
import Reanimated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { useSettingsStore } from '@/stores/settingsStore';
import { CardTile } from '../components/CardTile';
import { StackColumn } from '../components/StackColumn';
import { useDrag, useDragActiveData } from './DragContext';

const LIFTED_SCALE = 1.04;
const LIFTED_STACK_SCALE = 1.03;
const LIFTED_STACK_TILT_DEG = 2;

function noop() {}

export function DragOverlay() {
  const { activeId, x, y, originX, originY, width, startX, startY, zoom, lift } = useDrag();
  const activeData = useDragActiveData();
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);
  const isStack = activeData !== null && !('card' in activeData);

  const style = useAnimatedStyle(() => {
    if (isStack) {
      return {
        position: 'absolute' as const,
        left: x.value - (startX.value - originX.value) * zoom.value,
        top: originY.value + (y.value - startY.value),
        width: width.value,
        opacity: activeId.value === null ? 0 : 1,
        transform: [
          { scale: zoom.value * (1 + (LIFTED_STACK_SCALE - 1) * lift.value) },
          { rotate: `${reduceMotion ? 0 : LIFTED_STACK_TILT_DEG * lift.value}deg` },
        ],
      };
    }
    return {
      position: 'absolute' as const,
      left: originX.value + (x.value - startX.value),
      top: originY.value + (y.value - startY.value),
      width: width.value,
      opacity: activeId.value === null ? 0 : 1,
      transform: [{ scale: reduceMotion ? 1 : withTiming(LIFTED_SCALE) }],
    };
  });

  if (activeData === null) return null;

  return (
    <Reanimated.View pointerEvents="none" style={[styles.root, isStack && styles.topLeftOrigin, style]}>
      {'card' in activeData ? (
        <CardTile data={activeData} onPress={noop} />
      ) : (
        <View style={{ height: activeData.height }}>
          <StackColumn
            stack={activeData.stack}
            cards={activeData.cards}
            width={activeData.width}
            onCardPress={noop}
            onAddCard={noop}
            onOpenMenu={noop}
          />
        </View>
      )}
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  topLeftOrigin: { transformOrigin: [0, 0, 0] },
});
