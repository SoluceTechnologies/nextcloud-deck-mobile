import { createRef, useRef } from 'react';
import { View } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { GestureDetector, State } from 'react-native-gesture-handler';
import { useAnimatedRef } from 'react-native-reanimated';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { ThemeWrapper } from '../../../helpers/theme';
import { DragProvider, useDrag } from '../../../../src/features/board/dnd/DragContext';
import { DragOverlay } from '../../../../src/features/board/dnd/DragOverlay';
import { useStackDragGesture } from '../../../../src/features/board/dnd/useStackDragGesture';
import { haptic } from '../../../../src/utils/haptics';

jest.mock('../../../../src/utils/haptics', () => ({ haptic: jest.fn() }));
jest.mock('../../../../src/stores/settingsStore', () => ({
  useSettingsStore: (selector: (s: { reduceMotion: boolean }) => unknown) => selector({ reduceMotion: false }),
}));
jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string, o?: any) => (o?.count != null ? `${k}:${o.count}` : k) }),
}));

let ctx: ReturnType<typeof useDrag>;

function FrameSeed() {
  ctx = useDrag();
  const { frame } = ctx;
  frame.value = {
    stackIds: ['s1', 's2', 's3'],
    geometry: { gap: 12, columnWidth: 350, columnCount: 3 },
    scrollX: 0,
    listTopY: 100,
    registry: {},
  };
  ctx.stackOrder.value = ['s1', 's2', 's3'];
  return null;
}

function Board() {
  const boardRef = useRef<View>(null);
  const listRef = useAnimatedRef();
  const gesture = useStackDragGesture({
    enabled: true,
    boardRef,
    listRef,
    viewportWidth: 400,
    zoomOut: 0.5,
    bottomInset: 12,
    sourceOf: (id) => ({ stack: { id, title: `List ${id}` }, cards: [] }),
  });
  return (
    <GestureDetector gesture={gesture}>
      <View ref={boardRef} />
    </GestureDetector>
  );
}

beforeAll(() => {
  const probeRef = createRef<View>();
  render(<View ref={probeRef} />);
  jest
    .spyOn(Object.getPrototypeOf(probeRef.current), 'measureInWindow')
    .mockImplementation((cb: any) => cb(0, 40, 400, 600));
});

beforeEach(() => jest.clearAllMocks());

function setup() {
  const onStackDrop = jest.fn();
  render(
    <DragProvider enabled onDrop={jest.fn()} onStackDrop={onStackDrop}>
      <FrameSeed />
      <Board />
      <DragOverlay />
    </DragProvider>,
    { wrapper: ThemeWrapper },
  );
  return { onStackDrop, gesture: getByGestureTestId('drag-stacks') };
}

it('lifts the list whose header was pressed and drops it on the column under its centre', () => {
  const { onStackDrop, gesture } = setup();
  act(() => {
    fireGestureHandler(gesture, [
      { state: State.BEGAN, absoluteX: 100, absoluteY: 50 },
      { state: State.ACTIVE, absoluteX: 100, absoluteY: 50 },
      // Zoomed out to 0.5, 150pt on screen covers 300pt of board: past half a column.
      { absoluteX: 250, absoluteY: 60 },
      { state: State.END, absoluteX: 250, absoluteY: 60 },
    ]);
  });
  expect(ctx.stackOrder.value).toEqual(['s2', 's1', 's3']);
  expect(haptic).toHaveBeenCalledTimes(3); // lift, slot change, drop
  expect(onStackDrop).toHaveBeenCalledWith('s1', 1);
});

it('keeps the list in its slot when lifted by the far end of its header', () => {
  const { onStackDrop, gesture } = setup();
  act(() => {
    fireGestureHandler(gesture, [
      { state: State.BEGAN, absoluteX: 340, absoluteY: 50 },
      { state: State.ACTIVE, absoluteX: 340, absoluteY: 50 },
      { absoluteX: 342, absoluteY: 55 },
      { state: State.END, absoluteX: 342, absoluteY: 55 },
    ]);
  });
  expect(ctx.stackOrder.value).toEqual(['s1', 's2', 's3']);
  expect(onStackDrop).toHaveBeenCalledWith('s1', 0);
});

it('zooms the board out while a list is lifted and back in once it settles', () => {
  const { gesture } = setup();
  act(() => {
    gesture.handlers.onStart?.({ absoluteX: 100, absoluteY: 50 } as any);
  });
  expect(ctx.zoom.value).toBe(0.5);
  expect(ctx.lift.value).toBe(1);
  expect(screen.getByText('List s1')).toBeTruthy();

  act(() => {
    gesture.handlers.onFinalize?.({} as any, true);
  });
  expect(ctx.zoom.value).toBe(1);
  expect(ctx.lift.value).toBe(0);
  expect(ctx.activeId.value).toBeNull();
  expect(screen.queryByText('List s1')).toBeNull();
});

it.each([
  ['a card list', 100, 150],
  ['the add-list footer', 1100, 50],
  ['the gap between two lists', 368, 50],
])('lets a touch on %s through untouched', (_where, absoluteX, absoluteY) => {
  const { gesture } = setup();
  const manager = { fail: jest.fn() };
  gesture.handlers.onTouchesDown?.({ allTouches: [{ absoluteX, absoluteY }] } as any, manager as any);
  expect(manager.fail).toHaveBeenCalled();
});

it('keeps a touch on a header', () => {
  const { gesture } = setup();
  const manager = { fail: jest.fn() };
  gesture.handlers.onTouchesDown?.({ allTouches: [{ absoluteX: 400, absoluteY: 50 }] } as any, manager as any);
  expect(manager.fail).not.toHaveBeenCalled();
});

it('gives a haptic and floats the whole list when lifted', () => {
  const { gesture } = setup();
  act(() => {
    gesture.handlers.onStart?.({ absoluteX: 400, absoluteY: 50 } as any);
  });
  expect(haptic).toHaveBeenCalledTimes(1);
  expect(screen.getByText('List s2')).toBeTruthy();
  expect(screen.getByTestId('stack-column')).toBeTruthy();
});
