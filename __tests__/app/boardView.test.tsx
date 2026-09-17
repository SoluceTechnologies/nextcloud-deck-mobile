import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeWrapper } from '../helpers/theme';
import { useAccountStore } from '../../src/stores/accountStore';
import BoardScreen from '../../app/(tabs)/boards/[id]';

jest.mock('../../src/database/hooks/useBoards', () => ({
  useBoards: jest.fn(() => [
    { id: 'b1', remoteId: 'B1', title: 'Team', color: null, archived: false, shared: false, canEdit: true, canManage: true, lastModified: 0 },
  ]),
  useBoardCards: jest.fn(() => [
    { id: 'c1', stackId: 's1', title: 'Alpha', order: 0, color: null, archived: false, doneAt: null, duedate: null, startdate: null, attachmentCount: 0, commentsCount: 0, pending: false },
    { id: 'c2', stackId: 's2', title: 'Beta', order: 0, color: null, archived: false, doneAt: null, duedate: null, startdate: null, attachmentCount: 0, commentsCount: 0, pending: false },
  ]),
}));

jest.mock('../../src/database/hooks/useBoardContent', () => ({
  useBoardStacks: jest.fn(() => [
    { id: 's1', title: 'À faire', order: 0 },
    { id: 's2', title: 'En cours', order: 1 },
  ]),
}));

jest.mock('../../src/database/hooks/useBoardRelations', () => ({
  useBoardCardRelations: jest.fn(() => ({ labelsByCard: new Map(), assigneesByCard: new Map() })),
}));

const mockStackCreate = jest.fn(() => Promise.resolve());
jest.mock('../../src/features/board/hooks/useStackActions', () => ({
  useStackActions: () => ({
    create: mockStackCreate,
    rename: jest.fn(() => Promise.resolve()),
    remove: jest.fn(() => Promise.resolve()),
  }),
}));

const mockCardCreate = jest.fn(() => Promise.resolve());
const mockCardMove = jest.fn(() => Promise.resolve());
jest.mock('../../src/features/board/hooks/useCardActions', () => ({
  useCardActions: () => ({
    create: mockCardCreate,
    setDone: jest.fn(() => Promise.resolve()),
    patch: jest.fn(() => Promise.resolve()),
    setArchived: jest.fn(() => Promise.resolve()),
    remove: jest.fn(() => Promise.resolve()),
    move: mockCardMove,
    clone: jest.fn(() => Promise.resolve()),
  }),
}));

// The captured-prop idiom (see QuickAddCardFlow.test.tsx): DragProvider is stubbed to
// capture the `enabled`/`onDrop` props the screen passes it, and DragOverlay is left
// unmocked — with `activeData` fixed at null here, its own real "mount only while a
// drag is active" check already renders it as null, so it doesn't need its own stub.
// StackColumn/DraggableCard resolve `useDrag`/`useOptionalDrag` through this same
// mock too, so both need a well-formed (if inert) context value to render against.
let capturedDragProps: { enabled: boolean; onDrop: (result: any) => void } | null = null;
const mockDragContextValue = {
  activeId: { value: null },
  x: { value: 0 },
  y: { value: 0 },
  originX: { value: 0 },
  originY: { value: 0 },
  width: { value: 0 },
  startX: { value: 0 },
  startY: { value: 0 },
  target: { value: null },
  frame: {
    value: { stackIds: [], geometry: { gap: 0, columnWidth: 0, columnCount: 0 }, scrollX: 0, listTopY: 0, registry: {} },
    modify: jest.fn(),
  },
  activeData: null,
  setActiveData: jest.fn(),
  reportColumn: jest.fn(),
  reportListTop: jest.fn(),
  registerScroller: jest.fn(() => jest.fn()),
  scrollColumnBy: jest.fn(),
  onDrop: jest.fn(),
  enabled: true,
};
jest.mock('../../src/features/board/dnd/DragContext', () => ({
  DragProvider: (props: any) => {
    capturedDragProps = { enabled: props.enabled, onDrop: props.onDrop };
    return props.children;
  },
  useDrag: () => mockDragContextValue,
  useOptionalDrag: () => mockDragContextValue,
}));

jest.mock('../../src/sync/scheduler', () => ({ requestBoardSnapshot: jest.fn() }));

jest.mock('../../src/features/today/recentBoards', () => ({ recordRecentBoard: jest.fn(async () => {}) }));

jest.mock('../../src/utils/haptics', () => ({ haptic: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string) => k }),
}));

// Sheet renders via useSafeAreaInsets(), which throws without a provider —
// same fix already used across the board feature's tests.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

// `router` and `useRouter()` must resolve to the SAME spy object (the brief
// asserts via `require('expo-router').router.push`, the screen calls through
// `useRouter()`). The router object is built entirely inside this factory,
// not from outer `const`s: BoardScreen's import above transitively requires
// 'expo-router' before any later top-level `const` in this file has run, and
// Babel's object-spread bakes an outer reference into a snapshot at that
// (too early) moment — self-contained state sidesteps the ordering issue.
jest.mock('expo-router', () => {
  const router = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };
  return {
    ...jest.requireActual('expo-router'),
    router,
    useRouter: () => router,
    useLocalSearchParams: () => ({ id: 'b1' }),
    useFocusEffect: () => {},
  };
});

const renderScreen = () => render(<BoardScreen />, { wrapper: ThemeWrapper });

beforeEach(() => {
  jest.clearAllMocks();
  capturedDragProps = null;
  // clearAllMocks() does not undo a mockReturnValue set by a previous test
  // (mirrors cardDetail.test.tsx's beforeEach reseed) — reseed this one
  // explicitly so a test that overrides it (e.g. an offline board with no
  // remote id yet) can't leak into the next.
  const { useBoards } = require('../../src/database/hooks/useBoards');
  (useBoards as jest.Mock).mockReturnValue([
    { id: 'b1', remoteId: 'B1', title: 'Team', color: null, archived: false, shared: false, canEdit: true, canManage: true, lastModified: 0 },
  ]);
  act(() => useAccountStore.getState().setActiveAccountId('a1'));
});

it('shows one column per stack, in order', () => {
  renderScreen();
  const columns = screen.getAllByTestId('stack-column');
  expect(columns).toHaveLength(2);
  expect(screen.getByText('À faire')).toBeTruthy();
  expect(screen.getByText('En cours')).toBeTruthy();
});

it('puts each card in its own stack', () => {
  renderScreen();
  expect(screen.getByText('Alpha')).toBeTruthy();
  expect(screen.getByText('Beta')).toBeTruthy();
});

// Opening a board must never blank the screen while the network answers.
it('renders cached content immediately, with no loading state', () => {
  renderScreen();
  expect(screen.queryByTestId('board-spinner')).toBeNull();
  expect(screen.getByText('Alpha')).toBeTruthy();
});

it('requests a full snapshot for this board on open', () => {
  const { requestBoardSnapshot } = require('../../src/sync/scheduler');
  renderScreen();
  // The route id ('b1') is the board's LOCAL id; the scheduler is asked with
  // the board's REMOTE id ('B1') since that's what the server-side fetch key
  // is keyed on (see requestBoardSnapshot in src/sync/scheduler.ts).
  expect(requestBoardSnapshot).toHaveBeenCalledWith('a1', 'B1');
});

// Recent boards are sourced from in-app consultations (spec §7.6): opening
// the screen is what counts, regardless of remote-id/sync state.
it('records the board as recently opened on mount', () => {
  const { recordRecentBoard } = require('../../src/features/today/recentBoards');
  renderScreen();
  expect(recordRecentBoard).toHaveBeenCalledWith(expect.anything(), 'a1', 'b1');
});

// R7: recordRecentBoard is gated on accountId + the LOCAL board id only —
// never on remoteId. A board created offline has no remote id yet, so this
// is the one case that actually distinguishes the correct guard from a
// regression that folds recordRecentBoard under the same `!boardRemoteId`
// check the snapshot fetch uses below it.
it('still records an offline-created board (no remote id yet), but does not request its snapshot', () => {
  const { useBoards } = require('../../src/database/hooks/useBoards');
  (useBoards as jest.Mock).mockReturnValue([
    { id: 'b1', remoteId: '', title: 'Team', color: null, archived: false, shared: false, canEdit: true, canManage: true, lastModified: 0 },
  ]);
  const { recordRecentBoard } = require('../../src/features/today/recentBoards');
  const { requestBoardSnapshot } = require('../../src/sync/scheduler');

  renderScreen();

  expect(recordRecentBoard).toHaveBeenCalledWith(expect.anything(), 'a1', 'b1');
  expect(requestBoardSnapshot).not.toHaveBeenCalled();
});

it('opens a card when its tile is tapped', () => {
  const { router } = require('expo-router');
  renderScreen();
  fireEvent.press(screen.getByText('Alpha'));
  expect(router.push).toHaveBeenCalledWith('/card/c1');
});

it('offers an add-list affordance after the last column', () => {
  renderScreen();
  expect(screen.getByText('board.addList')).toBeTruthy();
});

// board.canEdit is true in the fixture — spec §7.4 wants the gesture disabled, not
// hidden, when it's false, but that's DragProvider's/DraggableCard's own concern
// (Task 13); this only checks the screen passes the right value through.
it('enables dragging only when the board can be edited', () => {
  renderScreen();
  expect(capturedDragProps?.enabled).toBe(true);
});

it('commits a drop as one move with the computed orders', () => {
  renderScreen();
  act(() => capturedDragProps?.onDrop({ cardId: 'c1', fromStackId: 's1', toStackId: 's2', index: 0 }));
  expect(mockCardMove).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), 's2', 0, expect.any(Number));
});

// s1 holds only c1 (fixture) — dropped back into s1 at index 0, its own (only) current
// position among the OTHER cards in s1 (none), so nothing actually moved.
it('ignores a drop that leaves the card where it was', () => {
  renderScreen();
  act(() => capturedDragProps?.onDrop({ cardId: 'c1', fromStackId: 's1', toStackId: 's1', index: 0 }));
  expect(mockCardMove).not.toHaveBeenCalled();
});
