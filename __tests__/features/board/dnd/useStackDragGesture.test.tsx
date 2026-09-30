import { createRef, useRef } from 'react';
import { View } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { GestureDetector, State } from 'react-native-gesture-handler';
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

function FrameSeed() {
  const { frame } = useDrag();
  frame.value = {
    stackIds: ['s1', 's2', 's3'],
    geometry: { gap: 12, columnWidth: 350, columnCount: 3 },
    scrollX: 0,
    listTopY: 100,
    registry: {},
  };
  return null;
}

function Board() {
  const boardRef = useRef<View>(null);
  const gesture = useStackDragGesture({
    enabled: true,
    boardRef,
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
  const onStackHover = jest.fn();
  const onStackDrop = jest.fn();
  render(
    <DragProvider enabled onDrop={jest.fn()} onStackHover={onStackHover} onStackDrop={onStackDrop}>
      <FrameSeed />
      <Board />
      <DragOverlay />
    </DragProvider>,
    { wrapper: ThemeWrapper },
  );
  return { onStackHover, onStackDrop, gesture: getByGestureTestId('drag-stacks') };
}

it('lifts the list whose header was pressed and drops it on the column under the finger', () => {
  const { onStackHover, onStackDrop, gesture } = setup();
  act(() => {
    fireGestureHandler(gesture, [
      { state: State.BEGAN, absoluteX: 100, absoluteY: 50 },
      { state: State.ACTIVE, absoluteX: 100, absoluteY: 50 },
      { absoluteX: 400, absoluteY: 60 },
      { state: State.END, absoluteX: 400, absoluteY: 60 },
    ]);
  });
  expect(onStackHover).toHaveBeenCalledTimes(1);
  expect(onStackHover).toHaveBeenCalledWith('s1', 1);
  expect(onStackDrop).toHaveBeenCalledWith('s1', 1);
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
