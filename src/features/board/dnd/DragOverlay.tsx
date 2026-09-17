import { StyleSheet } from 'react-native';
import Reanimated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { useSettingsStore } from '@/stores/settingsStore';
import { CardTile } from '../components/CardTile';
import { useDrag } from './DragContext';

const LIFTED_SCALE = 1.04;

function noop() {}

/** The floating copy of the card being dragged, following the finger. Mounted only while a drag is active — see `activeData` on DragContext. */
export function DragOverlay() {
  const { activeId, x, y, originX, originY, width, startX, startY, activeData } = useDrag();
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);

  // Reads `activeId` too, even though this component only exists while a
  // drag is active, so the style still resolves to a plain (non-worklet)
  // opacity in the one animated frame after a drop, while `activeData`'s
  // React-state update to null is still in flight.
  const style = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: originX.value + (x.value - startX.value),
    top: originY.value + (y.value - startY.value),
    width: width.value,
    opacity: activeId.value === null ? 0 : 1,
    transform: [{ scale: reduceMotion ? 1 : withTiming(LIFTED_SCALE) }],
  }));

  if (activeData === null) return null;

  return (
    <Reanimated.View pointerEvents="none" style={[styles.root, style]}>
      <CardTile data={activeData} onPress={noop} />
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
});
