import type { RefObject } from 'react';
import type { View } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import type Stack from '@/database/models/Stack';
import { haptic } from '@/utils/haptics';
import type { CardTileData } from '../components/CardTile';
import { useDrag } from './DragContext';
import { headerIndexAt } from './dragController';
import { columnIndexAt } from './dropTarget';

const LONG_PRESS_MS = 350;

export type StackDragSource = { stack: Pick<Stack, 'id' | 'title'>; cards: CardTileData[] };

export type StackDragGestureOptions = {
  enabled: boolean;
  boardRef: RefObject<View | null>;
  bottomInset: number;
  sourceOf: (stackId: string) => StackDragSource | null;
};

export function useStackDragGesture({ enabled, boardRef, bottomInset, sourceOf }: StackDragGestureOptions) {
  const { activeId, x, y, originX, originY, width, startX, startY, target, frame, setActiveData, onStackHover, onStackDrop } =
    useDrag();
  const draggedId = useSharedValue<string | null>(null);
  const hoverIndex = useSharedValue(-1);

  function begin(stackId: string) {
    haptic();
    boardRef.current?.measureInWindow?.((_winX, winY, _winWidth, winHeight) => {
      originY.value = winY;
      const source = sourceOf(stackId);
      if (source && activeId.value === stackId) {
        setActiveData({ ...source, width: width.value, height: winHeight - bottomInset });
      }
    });
  }

  function hover(stackId: string, index: number) {
    haptic();
    onStackHover?.(stackId, index);
  }

  function finish(stackId: string, index: number | null) {
    if (index !== null) onStackDrop?.(stackId, index);
    haptic();
    setActiveData(null);
  }

  return Gesture.Pan()
    .activateAfterLongPress(LONG_PRESS_MS)
    .enabled(enabled)
    .withTestId('drag-stacks')
    .onTouchesDown((e, manager) => {
      'worklet';
      const touch = e.allTouches[0];
      if (!touch || headerIndexAt(touch.absoluteX, touch.absoluteY, frame.value) === null) manager.fail();
    })
    .onStart((e) => {
      'worklet';
      const index = headerIndexAt(e.absoluteX, e.absoluteY, frame.value);
      if (index === null) return;
      const stackId = frame.value.stackIds[index];
      const { gap, columnWidth } = frame.value.geometry;
      draggedId.value = stackId;
      hoverIndex.value = index;
      activeId.value = stackId;
      target.value = null;
      x.value = e.absoluteX;
      y.value = e.absoluteY;
      startX.value = e.absoluteX;
      startY.value = e.absoluteY;
      originX.value = gap + index * (columnWidth + gap) - frame.value.scrollX;
      width.value = columnWidth;
      runOnJS(begin)(stackId);
    })
    .onUpdate((e) => {
      'worklet';
      const stackId = draggedId.value;
      if (stackId === null) return;
      x.value = e.absoluteX;
      y.value = e.absoluteY;
      const index = columnIndexAt(e.absoluteX, frame.value.scrollX, frame.value.geometry);
      if (index !== null && index !== hoverIndex.value) {
        hoverIndex.value = index;
        runOnJS(hover)(stackId, index);
      }
    })
    .onFinalize(() => {
      'worklet';
      const stackId = draggedId.value;
      if (stackId === null) return;
      draggedId.value = null;
      const index = columnIndexAt(x.value, frame.value.scrollX, frame.value.geometry);
      activeId.value = null;
      runOnJS(finish)(stackId, index);
    });
}
