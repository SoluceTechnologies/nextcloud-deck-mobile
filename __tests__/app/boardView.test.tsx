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
jest.mock('../../src/features/board/hooks/useCardActions', () => ({
  useCardActions: () => ({
    create: mockCardCreate,
    setDone: jest.fn(() => Promise.resolve()),
    patch: jest.fn(() => Promise.resolve()),
    setArchived: jest.fn(() => Promise.resolve()),
    remove: jest.fn(() => Promise.resolve()),
    move: jest.fn(() => Promise.resolve()),
    clone: jest.fn(() => Promise.resolve()),
  }),
}));

jest.mock('../../src/sync/scheduler', () => ({ requestBoardSnapshot: jest.fn() }));

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
