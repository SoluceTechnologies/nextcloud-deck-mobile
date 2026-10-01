import type { RefObject } from 'react';
import type { View } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  runOnJS,
  scrollTo,
  useFrameCallback,
  useSharedValue,
  withTiming,
  type AnimatedRef,
} from 'react-native-reanimated';
import type Stack from '@/database/models/Stack';
import { useSettingsStore } from '@/stores/settingsStore';
import { haptic } from '@/utils/haptics';
import type { CardTileData } from '../components/CardTile';
import { useDrag } from './DragContext';
import { headerIndexAt } from './dragController';
import { columnIndexAt, edgeDirection } from './dropTarget';

const LONG_PRESS_MS = 350;
const ZOOM_MS = 220;
const SETTLE_MS = 180;
const EDGE = 56;
const EDGE_SPEED = 0.8;

export type StackDragSource = { stack: Pick<Stack, 'id' | 'title'>; cards: CardTileData[] };

export type StackDragGestureOptions = {
  enabled: boolean;
  boardRef: RefObject<View | null>;
  listRef: AnimatedRef<any>;
  viewportWidth: number;
  zoomOut: number;
  bottomInset: number;
  sourceOf: (stackId: string) => StackDragSource | null;
};

export function useStackDragGesture({
  enabled,
  boardRef,
  listRef,
  viewportWidth,
  zoomOut,
  bottomInset,
  sourceOf,
}: StackDragGestureOptions) {
  const { activeId, x, y, originX, originY, width, startX, startY, target, frame, zoom, lift, stackOrder, setActiveData, onStackDrop } =
    useDrag();
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);
  const draggedId = useSharedValue<string | null>(null);
  const hoverIndex = useSharedValue(-1);
  const liftedOrder = useSharedValue<string[]>([]);
  const autoScrollX = useSharedValue(-1);

  function begin(stackId: string) {
    haptic();
    edgeScroll.setActive(true);
    boardRef.current?.measureInWindow?.((_winX, winY, _winWidth, winHeight) => {
      originY.value = winY;
      const source = sourceOf(stackId);
      if (source && activeId.value === stackId) {
        setActiveData({ ...source, width: width.value, height: winHeight - bottomInset });
      }
    });
  }

  function drop(stackId: string, index: number) {
    edgeScroll.setActive(false);
    onStackDrop?.(stackId, index);
    haptic();
  }

  function settled() {
    setActiveData(null);
  }

  function updateHover() {
    'worklet';
    const stackId = draggedId.value;
    if (stackId === null) return;
    const centerX = originX.value + (x.value - startX.value) / zoom.value + width.value / 2;
    const index = columnIndexAt(centerX, frame.value.scrollX, frame.value.geometry);
    if (index !== null && index !== hoverIndex.value) {
      hoverIndex.value = index;
      const order = liftedOrder.value.filter((id) => id !== stackId);
      order.splice(index, 0, stackId);
      stackOrder.value = order;
      runOnJS(haptic)();
    }
  }

  const edgeScroll = useFrameCallback((info) => {
    'worklet';
    const dir = draggedId.value === null ? 0 : edgeDirection(x.value, viewportWidth, EDGE);
    if (dir === 0) {
      autoScrollX.value = -1;
      return;
    }
    const { gap, columnWidth, columnCount } = frame.value.geometry;
    const contentWidth = (columnCount + 1) * (columnWidth + gap) + gap;
    const current = autoScrollX.value < 0 ? frame.value.scrollX : autoScrollX.value;
    const pivot = startX.value;
    const maxScroll = Math.max(current, contentWidth - pivot - (viewportWidth - pivot) / zoom.value);
    const depth = Math.min(1, (dir < 0 ? EDGE - x.value : x.value - viewportWidth + EDGE) / EDGE);
    const step = (dir * depth * EDGE_SPEED * (info.timeSincePreviousFrame ?? 16)) / zoom.value;
    const next = Math.min(maxScroll, Math.max(0, current + step));
    autoScrollX.value = next;
    scrollTo(listRef, next, 0, false);
    frame.modify((f) => {
      'worklet';
      f.scrollX = next;
      return f;
    });
    updateHover();
  }, false);

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
      liftedOrder.value = frame.value.stackIds;
      activeId.value = stackId;
      target.value = null;
      x.value = e.absoluteX;
      y.value = e.absoluteY;
      startX.value = e.absoluteX;
      startY.value = e.absoluteY;
      originX.value = gap + index * (columnWidth + gap) - frame.value.scrollX;
      width.value = columnWidth;
      zoom.value = withTiming(zoomOut, { duration: reduceMotion ? 0 : ZOOM_MS });
      lift.value = withTiming(1, { duration: reduceMotion ? 0 : ZOOM_MS });
      runOnJS(begin)(stackId);
    })
    .onUpdate((e) => {
      'worklet';
      if (draggedId.value === null) return;
      x.value = e.absoluteX;
      y.value = e.absoluteY;
      updateHover();
    })
    .onFinalize(() => {
      'worklet';
      const stackId = draggedId.value;
      if (stackId === null) return;
      draggedId.value = null;
      autoScrollX.value = -1;
      const index = hoverIndex.value;
      runOnJS(drop)(stackId, index);

      const { gap, columnWidth } = frame.value.geometry;
      const slotX = gap + index * (columnWidth + gap) - frame.value.scrollX;
      const settle = { duration: reduceMotion ? 0 : SETTLE_MS };
      x.value = withTiming(startX.value + (slotX - originX.value) * zoom.value, settle);
      y.value = withTiming(startY.value, settle);
      lift.value = withTiming(0, settle, () => {
        if (draggedId.value !== null) return; // another list was picked up meanwhile
        activeId.value = null;
        zoom.value = withTiming(1, { duration: reduceMotion ? 0 : ZOOM_MS });
        scrollTo(listRef, index * (columnWidth + gap), 0, !reduceMotion);
        runOnJS(settled)();
      });
    });
}
