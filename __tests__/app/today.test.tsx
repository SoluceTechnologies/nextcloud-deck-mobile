import { render, screen, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import { ThemeWrapper } from '../helpers/theme';
import TodayScreen from '../../app/(tabs)/today/index';
import { useAccountCards } from '../../src/database/hooks/useBoards';
import { useAccountCardRelations } from '../../src/database/hooks/useAccountRelations';
import { useActiveAccount } from '../../src/hooks/useAccounts';
import { haptic } from '../../src/utils/haptics';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const OVERDUE_DUE = NOW - 7 * DAY;
const TODAY_DUE = NOW;

const CARDS = [
  {
    id: 'c1', boardId: 'b1', stackId: 's1', title: 'Payer le loyer',
    duedate: OVERDUE_DUE, archived: false, doneAt: null,
  },
  {
    id: 'c2', boardId: 'b1', stackId: 's1', title: 'Relancer',
    duedate: TODAY_DUE, archived: false, doneAt: null,
  },
  {
    id: 'c3', boardId: 'b1', stackId: 's1', title: 'Old done card',
    duedate: OVERDUE_DUE, archived: false, doneAt: NOW,
  },
];

// The two fixture cards' due dates are time-based (Date.now()), which a
// jest.mock factory may not close over (babel-plugin-jest-hoist forbids
// referencing out-of-scope variables not prefixed `mock`) — so the real
// fixture is installed below via `mockReturnValue` in beforeEach instead.
jest.mock('../../src/database/hooks/useBoards', () => ({
  useBoards: jest.fn(() => [
    { id: 'b1', title: 'Finance & Juridique', remoteId: 'B1', color: null, archived: false, shared: false },
  ]),
  useAccountCards: jest.fn(() => []),
}));

jest.mock('../../src/database/hooks/useAccountRelations', () => ({
  useAccountStacks: jest.fn(() => [{ id: 's1', boardId: 'b1', title: 'En cours' }]),
  useAccountCardRelations: jest.fn(() => ({ labelsByCard: new Map(), assigneesByCard: new Map() })),
}));

jest.mock('../../src/database/hooks/useRecentBoards', () => ({
  useRecentBoards: jest.fn(() => [
    { id: 'b1', title: 'Finance & Juridique', remoteId: 'B1', color: null, archived: false, shared: false },
  ]),
}));

// username is what the user typed at login; davUserId is the server's stable
// identity (see nextcloud.ts) and can differ — deliberately mismatched here
// so a test that reads the wrong field fails instead of passing by accident.
jest.mock('../../src/hooks/useAccounts', () => ({
  useActiveAccount: jest.fn(() => ({ username: 'me-as-typed', davUserId: 'me' })),
}));

// "mock" prefix required so babel-plugin-jest-hoist allows referencing it
// inside the (hoisted) jest.mock factory below — see boards.test.tsx.
const mockSetDone = jest.fn(() => Promise.resolve());
jest.mock('../../src/features/board/hooks/useCardActions', () => ({
  useCardActions: () => ({ setDone: mockSetDone }),
}));

jest.mock('../../src/features/card/components/QuickAddCardFlow', () => ({
  QuickAddCardFlow: () => null,
}));

jest.mock('../../src/utils/haptics', () => ({ haptic: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));

// Count-echo t mock: an option with `count` renders as `key:count`, so the
// overdue banner's `t('today.overdueBanner', { count })` is checkable by text.
jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string, o?: any) => (o?.count != null ? `${k}:${o.count}` : k) }),
}));

jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

// `router` and `useRouter()` must resolve to the SAME spy object (see search.test.tsx).
jest.mock('expo-router', () => {
  const router = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };
  return {
    ...jest.requireActual('expo-router'),
    router,
    useRouter: () => router,
    useFocusEffect: () => {},
  };
});

const renderScreen = () => render(<TodayScreen />, { wrapper: ThemeWrapper });

beforeEach(() => {
  jest.clearAllMocks();
  (useAccountCards as jest.Mock).mockReturnValue(CARDS);
});

it('shows the overdue banner with the count and the buckets in order', () => {
  renderScreen();
  expect(screen.getByText('today.overdueBanner:1')).toBeTruthy();
  expect(screen.getByText('today.sections.overdue')).toBeTruthy();
  expect(screen.getByText('today.sections.today')).toBeTruthy();
  expect(screen.queryByText('today.sections.tomorrow')).toBeNull();
});

it('never lists a done card', () => {
  renderScreen();
  expect(screen.queryByText('Old done card')).toBeNull();
});

it('marks a card done from the row, after a haptic', () => {
  renderScreen();
  fireEvent.press(screen.getByTestId('today-done-c1'));
  expect(haptic).toHaveBeenCalled();
  expect(mockSetDone).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), true);
});

it('opens a card and a recent board', () => {
  renderScreen();
  fireEvent.press(screen.getByTestId('today-row-c2'));
  expect(router.push).toHaveBeenCalledWith('/card/c2');
  fireEvent.press(screen.getByText('Finance & Juridique'));
  expect(router.push).toHaveBeenCalledWith('/boards/b1', { withAnchor: true });
});

// This push crosses into the boards tab's own stack. Without the anchor that
// stack holds the board and nothing else, so neither the header's back control
// nor the tab bar can reach the board list again.
it('loads the board list under a board opened from Today', () => {
  renderScreen();
  fireEvent.press(screen.getByText('Finance & Juridique'));
  expect(router.push).toHaveBeenCalledWith(expect.any(String), { withAnchor: true });
});

it('says there is nothing due when every bucket is empty', () => {
  (useAccountCards as jest.Mock).mockReturnValue([]);
  renderScreen();
  expect(screen.getByTestId('today-empty')).toBeTruthy();
});

it('offers a quick-add button that opens the add-card flow', () => {
  renderScreen();
  expect(screen.getByTestId('today-add-card')).toBeTruthy();
});

// R9: tranche B never taught syncBoards to cascade a board deleted on the
// server, and useAccountCards reads account-wide — so without this filter a
// card whose board no longer resolves in useBoards would render on Today
// with a blank board name. Same shape as useLocalSearch's orphan-board guard.
it('drops a card whose board is not in useBoards, but keeps a card whose board resolves', () => {
  (useAccountCards as jest.Mock).mockReturnValue([
    ...CARDS.slice(0, 1), // c1, board b1 — resolvable
    {
      id: 'orphan', boardId: 'b-deleted', stackId: 's1', title: 'Orphan card',
      duedate: TODAY_DUE, archived: false, doneAt: null,
    },
  ]);
  renderScreen();
  expect(screen.queryByText('Orphan card')).toBeNull();
  expect(screen.getByTestId('today-row-c1')).toBeTruthy();
});

// Important-1 regression: concernsMe (upcoming.ts) compares against the
// Nextcloud uid stored on CardAssignee.participant, which is davUserId, not
// the free-typed username — they can differ (email alias, case). The fixture
// mock's username ('me-as-typed') deliberately differs from davUserId ('me')
// so reading the wrong field on the screen fails this instead of passing by
// coincidence, the way the previously-empty assigneesByCard mock let it.
it("shows a card assigned to the account's davUserId, and hides one assigned only to someone else", () => {
  (useAccountCardRelations as jest.Mock).mockReturnValue({
    labelsByCard: new Map(),
    assigneesByCard: new Map([
      ['c1', [{ participant: 'me', assigneeType: 0 }]], // c1: assigned to this account
      ['c2', [{ participant: 'someone-else', assigneeType: 0 }]], // c2: assigned to another user
    ]),
  });
  renderScreen();
  expect(screen.getByTestId('today-row-c1')).toBeTruthy();
  expect(screen.queryByTestId('today-row-c2')).toBeNull();
});
