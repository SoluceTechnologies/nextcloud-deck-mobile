import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeWrapper } from '../helpers/theme';
import { useAccountStore } from '../../src/stores/accountStore';
import CardDetailScreen from '../../app/card/[id]';

jest.mock('../../src/database/hooks/useCard', () => ({
  useCard: jest.fn(),
}));

jest.mock('../../src/database/hooks/useBoards', () => ({
  useBoards: jest.fn(() => [{ id: 'b1', title: 'Finance & Juridique' }]),
}));

jest.mock('../../src/database/hooks/useBoardContent', () => ({
  useBoardStacks: jest.fn(() => [{ id: 's1', title: 'En cours' }]),
}));

const mockCardActions = {
  create: jest.fn(() => Promise.resolve()),
  setDone: jest.fn(() => Promise.resolve()),
  patch: jest.fn(() => Promise.resolve()),
  setArchived: jest.fn(() => Promise.resolve()),
  remove: jest.fn(() => Promise.resolve()),
  move: jest.fn(() => Promise.resolve()),
  clone: jest.fn(() => Promise.resolve()),
};
jest.mock('../../src/features/board/hooks/useCardActions', () => ({
  useCardActions: () => mockCardActions,
}));

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string, o?: any) => (o?.count != null ? `${k}:${o.count}` : k) }),
}));

// SafeAreaView reads insets from context — same fix already used across the
// board feature's tests.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

// `router` and `useRouter()` must resolve to the SAME spy object (this file
// asserts via `require('expo-router').router.back`, the screen calls through
// `useRouter()`). Built entirely inside the factory, not from an outer
// `const` — see boardView.test.tsx for why that reference would be baked in
// too early.
jest.mock('expo-router', () => {
  const router = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };
  return {
    ...jest.requireActual('expo-router'),
    router,
    useRouter: () => router,
    useLocalSearchParams: () => ({ id: 'c1' }),
  };
});

function mockCard(over: any = {}) {
  const { useCard } = require('../../src/database/hooks/useCard');
  (useCard as jest.Mock).mockReturnValue({
    id: 'c1',
    boardId: 'b1',
    stackId: 's1',
    title: 'Payer le loyer',
    remoteId: '7',
    doneAt: null,
    duedate: null,
    startdate: null,
    color: null,
    description: '',
    archived: false,
    ...over,
  });
}

function requireCardActionsMock() {
  return mockCardActions;
}

// Calendar days back from right now, so this stays 7 days overdue in
// dueStateOf's local-day arithmetic regardless of DST (see CardTile.test.tsx).
function daysAgo(n: number): number {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.getTime();
}

const renderScreen = () => render(<CardDetailScreen />, { wrapper: ThemeWrapper });

beforeEach(() => {
  jest.clearAllMocks();
  mockCard();
  act(() => useAccountStore.getState().setActiveAccountId('a1'));
});

it('shows the card title in the header and in the identity block', () => {
  renderScreen();
  // getAllByText does not match a TextInput's value, so the header title and
  // the identity TextField's value are asserted separately instead of via a
  // single getAllByText(...).toHaveLength(2).
  expect(screen.getByText('Payer le loyer')).toBeTruthy();
  expect(screen.getByDisplayValue('Payer le loyer')).toBeTruthy();
});

it('shows the board and list as the identity subtitle', () => {
  renderScreen();
  expect(screen.getByText('Finance & Juridique · En cours')).toBeTruthy();
});

// useCard returns null when sync reconciles a server-side delete while the
// card is open. Showing a stale card would let the user edit a ghost.
it('says the card is gone rather than rendering a stale one', () => {
  const { useCard } = require('../../src/database/hooks/useCard');
  (useCard as jest.Mock).mockReturnValue(null);
  renderScreen();

  expect(screen.getByText('card.deleted')).toBeTruthy();
  expect(screen.queryByText('card.markDone')).toBeNull();
});

it('closes on the × control', () => {
  const { router } = require('expo-router');
  renderScreen();
  fireEvent.press(screen.getByTestId('card-close'));
  expect(router.back).toHaveBeenCalled();
});

it('commits a title edit through the card actions, trimmed', () => {
  const { patch } = requireCardActionsMock();
  renderScreen();

  fireEvent.changeText(screen.getByTestId('card-title-input'), '  Renamed  ');
  fireEvent(screen.getByTestId('card-title-input'), 'blur');

  expect(patch).toHaveBeenCalledWith(expect.anything(), { title: 'Renamed' });
});

// An accidental clear would wipe the title on blur.
it('does not commit an empty title', () => {
  const { patch } = requireCardActionsMock();
  renderScreen();

  fireEvent.changeText(screen.getByTestId('card-title-input'), '   ');
  fireEvent(screen.getByTestId('card-title-input'), 'blur');

  expect(patch).not.toHaveBeenCalled();
});

it('does not commit when the title is unchanged', () => {
  const { patch } = requireCardActionsMock();
  renderScreen();
  fireEvent(screen.getByTestId('card-title-input'), 'blur');
  expect(patch).not.toHaveBeenCalled();
});

// A remote rename landing while the field is focused must not be reverted by
// an untouched blur: the reseed effect skips while focused, so `value` still
// holds the pre-rename title, and only a real edit may commit.
it('does not revert a remote rename on an untouched blur after a focused pull', () => {
  const { patch } = requireCardActionsMock();
  mockCard({ title: 'Old' });
  const { rerender } = renderScreen();

  fireEvent(screen.getByTestId('card-title-input'), 'focus');

  mockCard({ title: 'New' });
  rerender(<CardDetailScreen />);

  fireEvent(screen.getByTestId('card-title-input'), 'blur');

  expect(patch).not.toHaveBeenCalled();
});

it('toggles done through the card actions', () => {
  const { setDone } = requireCardActionsMock();
  renderScreen();
  fireEvent.press(screen.getByText('card.markDone'));
  expect(setDone).toHaveBeenCalledWith(expect.anything(), true);
});

it('offers to un-mark a card that is already done', () => {
  mockCard({ doneAt: 1757000000000 });
  renderScreen();
  expect(screen.getByText('card.markNotDone')).toBeTruthy();
});

it('shows the overdue line for a late card', () => {
  mockCard({ duedate: daysAgo(7), doneAt: null });
  renderScreen();
  expect(screen.getByText(/card.overdue/)).toBeTruthy();
});

it('shows no overdue line once the card is done', () => {
  mockCard({ duedate: daysAgo(7), doneAt: Date.now() });
  renderScreen();
  expect(screen.queryByText(/card.overdue/)).toBeNull();
});
