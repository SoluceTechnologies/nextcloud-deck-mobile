import { createRef } from 'react';
import { View } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { ThemeWrapper } from '../../../helpers/theme';
import { DragProvider, useDrag } from '../../../../src/features/board/dnd/DragContext';
import { DraggableCard } from '../../../../src/features/board/dnd/DraggableCard';
import { DragOverlay } from '../../../../src/features/board/dnd/DragOverlay';
import { haptic } from '../../../../src/utils/haptics';
import type { DragFrame } from '../../../../src/features/board/dnd/dragController';

jest.mock('../../../../src/utils/haptics', () => ({ haptic: jest.fn() }));

jest.mock('../../../../src/stores/settingsStore', () => ({
  useSettingsStore: (selector: (s: { reduceMotion: boolean }) => unknown) => selector({ reduceMotion: false }),
}));

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string, o?: any) => (o?.count != null ? `${k}:${o.count}` : k) }),
}));

const tile = (id: string, title = 'Alpha') => ({
  card: { id, title, color: null, duedate: null, attachmentCount: 0, commentsCount: 0, doneAt: null },
  labels: [],
  assignees: [],
});

// Column s1 holds the dragged card 'c1' at the top; column s2 sits to the
// right (past its gap+width) with scroll already offset, so a drag towards
// (400, 260) lands past c's midpoint at index 1 in s2.
const testFrame: DragFrame = {
  stackIds: ['s1', 's2'],
  geometry: { gap: 12, columnWidth: 350, columnCount: 2 },
  scrollX: 0,
  listTopY: 200,
  registry: {
    s1: { scrollY: 0, tiles: [{ cardId: 'c1', y: 0, height: 80 }] },
    s2: { scrollY: 100, tiles: [{ cardId: 'c', y: 0, height: 80 }] },
  },
};

function FrameSeed() {
  const { frame } = useDrag();
  frame.value = testFrame;
  return null;
}

// begin() (DraggableCard.tsx) waits for measureInWindow's callback before
// mounting the overlay, so the overlay never appears at a stale origin (see
// R11). react-native's test host component never invokes that callback —
// there's no native layer to answer it — so it's stubbed here on the
// View's shared prototype, grabbed once from a throwaway instance; this
// applies to every later View (including Reanimated.View, which the mock
// makes literally the same View) in this file. Kept as a module variable so
// one test below can override it with a controllable, non-synchronous stub.
let viewProto: any;

function stubMeasureInWindow(x: number, y: number, width: number) {
  const probeRef = createRef<View>();
  render(<View ref={probeRef} />);
  viewProto = Object.getPrototypeOf(probeRef.current);
  jest.spyOn(viewProto, 'measureInWindow').mockImplementation((cb: any) => cb(x, y, width));
}

beforeAll(() => {
  stubMeasureInWindow(0, 0, 320);
});

beforeEach(() => {
  jest.clearAllMocks();
});

function setup({ enabled = true, onDrop = jest.fn(), onPress = jest.fn() } = {}) {
  render(
    <DragProvider enabled={enabled} onDrop={onDrop}>
      <FrameSeed />
      <DraggableCard data={tile('c1')} stackId="s1" onPress={onPress} />
      <DragOverlay />
    </DragProvider>,
    { wrapper: ThemeWrapper },
  );
  return { onDrop, onPress };
}

// fireGestureHandler always drives a handler through its full BEGAN..END
// lifecycle in one synchronous call (react-native-gesture-handler/jest-utils
// pads any partial event list up to that full lifecycle) — verified against
// this RNGH version with a throwaway spike before writing this file. That
// makes it the right tool for "what happens once a drag completes", and the
// wrong tool for "what does the screen look like mid-drag": the second needs
// calling the registered gesture's own onStart callback directly, obtained
// through the same getByGestureTestId used everywhere else in this file.

it('reports a drop with the target computed by the controller', () => {
  const { onDrop } = setup();
  act(() => {
    fireGestureHandler(getByGestureTestId('drag-c1'), [
      { state: State.BEGAN, absoluteX: 100, absoluteY: 210 },
      { state: State.ACTIVE, absoluteX: 100, absoluteY: 210 },
      { absoluteX: 400, absoluteY: 260 },
      { state: State.END, absoluteX: 400, absoluteY: 260 },
    ]);
  });
  expect(onDrop).toHaveBeenCalledWith({ cardId: 'c1', fromStackId: 's1', toStackId: 's2', index: 1 });
});

it('gives a haptic when the card lifts', () => {
  // Isolates the lift's own haptic from finish()'s unconditional one: a full
  // fireGestureHandler lifecycle fires haptic() twice (begin() on lift,
  // finish() on finalize — see DraggableCard.tsx), so a loose
  // toHaveBeenCalled() after a full BEGAN..END run can't tell them apart and
  // would still pass with the lift's own call deleted. Calling onStart
  // directly exercises only begin().
  setup();
  const gesture = getByGestureTestId('drag-c1');
  act(() => {
    gesture.handlers.onStart?.({ absoluteX: 100, absoluteY: 210 } as any);
  });
  expect(haptic).toHaveBeenCalledTimes(1);
});

it('does not start a drag when disabled', () => {
  const { onDrop } = setup({ enabled: false });
  act(() => {
    fireGestureHandler(getByGestureTestId('drag-c1'), [
      { state: State.BEGAN, absoluteX: 100, absoluteY: 210 },
      { state: State.ACTIVE, absoluteX: 100, absoluteY: 210 },
      { state: State.END, absoluteX: 100, absoluteY: 210 },
    ]);
  });
  expect(onDrop).not.toHaveBeenCalled();
  expect(haptic).not.toHaveBeenCalled();
});

it('still opens the card on a tap', () => {
  const { onPress } = setup();
  fireEvent.press(screen.getByText('Alpha'));
  expect(onPress).toHaveBeenCalled();
});

it('renders the floating copy while a drag is active', () => {
  setup();
  const gesture = getByGestureTestId('drag-c1');
  act(() => {
    gesture.handlers.onStart?.({ absoluteX: 100, absoluteY: 210 } as any);
  });
  expect(screen.getAllByText('Alpha')).toHaveLength(2);
});

it('does not mount the floating copy until its origin measurement resolves (R11)', () => {
  // Overrides the module-wide synchronous stub for just this one
  // measureInWindow call, so the callback is under this test's control
  // instead of firing immediately.
  let resolveMeasure = () => {};
  jest.spyOn(viewProto, 'measureInWindow').mockImplementationOnce((cb: any) => {
    resolveMeasure = () => cb(0, 0, 320);
  });
  setup();
  const gesture = getByGestureTestId('drag-c1');
  act(() => {
    gesture.handlers.onStart?.({ absoluteX: 100, absoluteY: 210 } as any);
  });
  // Haptic fires on lift regardless of the pending measurement.
  expect(haptic).toHaveBeenCalledTimes(1);
  expect(screen.getAllByText('Alpha')).toHaveLength(1);

  act(() => {
    resolveMeasure();
  });
  expect(screen.getAllByText('Alpha')).toHaveLength(2);
});

it('does not remount a ghost overlay when the measurement resolves after the gesture already finalized', () => {
  // measureInWindow is its own async round trip stacked on top of the
  // runOnJS hop that reaches begin(), while onFinalize's runOnJS(finish)
  // needs only one hop — so an ordinary short gesture (activate, then
  // release right away) can let finish() null activeData before this
  // callback fires. Without a guard, that stale callback would
  // unconditionally remount a floating copy that nothing afterwards clears.
  let resolveMeasure = () => {};
  jest.spyOn(viewProto, 'measureInWindow').mockImplementationOnce((cb: any) => {
    resolveMeasure = () => cb(0, 0, 320);
  });
  setup();
  const gesture = getByGestureTestId('drag-c1');
  act(() => {
    gesture.handlers.onStart?.({ absoluteX: 100, absoluteY: 210 } as any);
  });
  act(() => {
    gesture.handlers.onFinalize?.({} as any, true);
  });
  expect(screen.getAllByText('Alpha')).toHaveLength(1); // finalized before the measurement resolved

  act(() => {
    resolveMeasure();
  });
  expect(screen.getAllByText('Alpha')).toHaveLength(1); // still just the one card — no ghost remount
});

it('does not report a finish when the gesture never activated (e.g. a tap released before the long press)', () => {
  // onFinalize always fires, even when onStart never did (a Pan configured
  // with activateAfterLongPress fails to activate on a quick release) —
  // fireGestureHandler cannot express "never reached ACTIVE" (it always
  // synthesizes a full lifecycle), so this calls the finalize callback
  // directly without ever starting the drag.
  const { onDrop } = setup();
  const gesture = getByGestureTestId('drag-c1');
  act(() => {
    gesture.handlers.onFinalize?.({} as any, false);
  });
  expect(onDrop).not.toHaveBeenCalled();
  expect(haptic).not.toHaveBeenCalled();
  expect(screen.getAllByText('Alpha')).toHaveLength(1);
});
