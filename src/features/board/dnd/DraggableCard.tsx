import { useRef } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { runOnJS, useAnimatedStyle } from 'react-native-reanimated';

import { haptic } from '@/utils/haptics';
import { CardTile, type CardTileData } from '../components/CardTile';
import { useDrag } from './DragContext';
import { targetAt, type DragTarget } from './dragController';

const LONG_PRESS_MS = 350;
const ACTIVE_OPACITY = 0.4;

export type DraggableCardProps = {
  data: CardTileData;
  stackId: string;
  onPress: () => void;
};

export function DraggableCard({ data, stackId, onPress }: DraggableCardProps) {
  const cardId = data.card.id;
  const viewRef = useRef<View>(null);
  const { activeId, x, y, originX, originY, width, startX, startY, target, frame, setActiveData, onDrop, enabled } =
    useDrag();

  function begin() {
    // Haptic fires immediately on lift, independent of the measurement
    // below. setActiveData (which mounts DragOverlay) waits for
    // measureInWindow's callback so the overlay never mounts at a stale
    // origin (0 on the first drag of the session, the previous card's
    // origin afterwards) — see controller ruling R11: a few milliseconds'
    // delay before the floating copy appears beats appearing wrong and
    // snapping once the real measurement lands.
    haptic();
    viewRef.current?.measureInWindow?.((winX, winY, winWidth) => {
      originX.value = winX;
      originY.value = winY;
      width.value = winWidth;
      // measureInWindow is its own async round trip on top of the runOnJS
      // hop that got us here, so an ordinary short gesture (activate, then
      // release right away) can let onFinalize's runOnJS(finish) reach JS
      // and null activeId before this callback fires. Without this guard,
      // an already-finalized gesture would unconditionally remount a ghost
      // overlay that nothing afterwards clears.
      if (activeId.value === cardId) {
        setActiveData(data);
      }
    });
  }

  function finish(dropTarget: DragTarget | null) {
    if (dropTarget) {
      onDrop({ cardId, fromStackId: stackId, toStackId: dropTarget.stackId, index: dropTarget.index });
    }
    haptic();
    setActiveData(null);
  }

  const gesture = Gesture.Pan()
    .activateAfterLongPress(LONG_PRESS_MS)
    .enabled(enabled)
    .withTestId(`drag-${cardId}`)
    .onStart((e) => {
      'worklet';
      activeId.value = cardId;
      x.value = e.absoluteX;
      y.value = e.absoluteY;
      startX.value = e.absoluteX;
      startY.value = e.absoluteY;
      runOnJS(begin)();
    })
    .onUpdate((e) => {
      'worklet';
      x.value = e.absoluteX;
      y.value = e.absoluteY;
      target.value = targetAt(e.absoluteX, e.absoluteY, cardId, frame.value);
    })
    .onFinalize(() => {
      'worklet';
      // onFinalize always fires, even when onStart never did — e.g. a plain
      // tap released before activateAfterLongPress elapses. Without this
      // guard that would call finish() with whatever target.value was left
      // over from a previous, unrelated drag anywhere on the board.
      if (activeId.value !== cardId) return;
      const t = target.value;
      activeId.value = null;
      runOnJS(finish)(t);
    });

  const style = useAnimatedStyle(() => ({
    opacity: activeId.value === cardId ? ACTIVE_OPACITY : 1,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Reanimated.View ref={viewRef} style={style}>
        <CardTile data={data} onPress={onPress} />
      </Reanimated.View>
    </GestureDetector>
  );
}
