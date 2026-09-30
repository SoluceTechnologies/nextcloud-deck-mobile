import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Reanimated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { useSettingsStore } from '@/stores/settingsStore';
import { useDrag } from './DragContext';

const SLIDE_MS = 200;

export type StackSlotProps = {
  stackId: string;
  index: number;
  anchor: number;
  step: number;
  children: ReactNode;
};

export function StackSlot({ stackId, index, anchor, step, children }: StackSlotProps) {
  const { stackOrder } = useDrag();
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);

  const slideStyle = useAnimatedStyle(() => {
    const slot = stackOrder.value.indexOf(stackId);
    const offset = ((slot === -1 ? index : slot) - anchor) * step;
    return { transform: [{ translateX: reduceMotion ? offset : withTiming(offset, { duration: SLIDE_MS }) }] };
  });

  const shift = (anchor - index) * step;
  return (
    <View
      testID="stack-slot"
      pointerEvents="box-none"
      style={{ transform: [{ translateX: shift }] }}
      hitSlop={{ left: Math.max(0, shift), right: Math.max(0, -shift) }}
    >
      <Reanimated.View style={[styles.fill, slideStyle]}>{children}</Reanimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
