import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeWrapper } from '../helpers/theme';
import { useAccountStore } from '../../src/stores/accountStore';
import { useRecentSearchStore } from '../../src/stores/recentSearchStore';
import SearchScreen from '../../app/(tabs)/search/index';
import { useRemoteSearch } from '../../src/features/search/useRemoteSearch';
import { useIsOnline } from '../../src/services/shared/network';
import { EMPTY_MODEL, reduceSearch } from '../../src/features/search/searchModel';

jest.mock('../../src/database/hooks/useBoards', () => ({
  useBoards: jest.fn(() => [
    { id: 'b1', title: 'Finance & Juridique', remoteId: 'B1', color: '#0082c9', archived: false },
    { id: 'b2', title: 'Commercial', remoteId: 'B2', color: '#e9322d', archived: false },
  ]),
  useAccountCards: jest.fn(() => [
    {
      id: 'c1', boardId: 'b1', stackId: 's1', remoteId: '7',
      title: 'Payer le loyer', description: '', duedate: null, archived: false,
    },
    {
      id: 'c2', boardId: 'b2', stackId: 's2', remoteId: '8',
      title: 'Relancer le client', description: '', duedate: null, archived: false,
    },
  ]),
}));
jest.mock('../../src/database/hooks/useAccountRelations', () => ({
  useAccountStacks: jest.fn(() => [
    { id: 's1', boardId: 'b1', title: 'En cours' },
    { id: 's2', boardId: 'b2', title: 'À faire' },
  ]),
  useAccountLabels: jest.fn(() => [{ id: 'l1', boardId: 'b1', title: 'Urgent', color: '#E24B4A' }]),
  useAccountCardRelations: jest.fn(() => ({
    labelsByCard: new Map([['c1', [{ id: 'l1', title: 'Urgent', color: '#E24B4A' }]]]),
    assigneesByCard: new Map(),
  })),
}));

jest.mock('../../src/features/search/useRemoteSearch', () => ({
  useRemoteSearch: jest.fn(() => ({ hits: [], loading: false, failed: false })),
}));

jest.mock('../../src/features/card/components/QuickAddCardFlow', () => ({
  QuickAddCardFlow: () => null,
}));

jest.mock('../../src/services/shared/network', () => ({
  useIsOnline: jest.fn(() => true),
}));

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

jest.mock('expo-router', () => {
  const router = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };
  return {
    ...jest.requireActual('expo-router'),
    router,
    useRouter: () => router,
    useFocusEffect: () => {},
  };
});

const renderScreen = () => render(<SearchScreen />, { wrapper: ThemeWrapper });
const input = () => screen.getByTestId('search-input');
const hit = (remoteId: string, boardRemoteId: string, title: string, boardTitle: string) => ({
  card: { remoteId, boardRemoteId, title },
  boardTitle,
  stackTitle: 'Done',
});
const recentTerms = () => (useRecentSearchStore.getState().byAccount.a1 ?? []).map((r) => r.term);

beforeEach(() => {
  jest.clearAllMocks();
  (useRemoteSearch as jest.Mock).mockReturnValue({ hits: [], loading: false, failed: false });
  (useIsOnline as jest.Mock).mockReturnValue(true);
  act(() => useAccountStore.getState().setActiveAccountId('a1'));
  act(() => useRecentSearchStore.setState({ byAccount: {} }));
});

it('shows the filter menu for an empty search', () => {
  renderScreen();
  for (const key of ['board', 'tag', 'assigned', 'list', 'date']) {
    expect(screen.getByTestId(`filter-${key}`)).toBeTruthy();
  }
});

it('filters by a tag picked from the menu', () => {
  renderScreen();
  fireEvent.press(screen.getByTestId('filter-tag'));
  expect(screen.getByTestId('pending-token')).toBeTruthy();
  fireEvent.press(screen.getByTestId('suggestion-Urgent'));
  expect(screen.getByTestId('token-tag-Urgent')).toBeTruthy();
  expect(screen.getByText('Payer le loyer')).toBeTruthy();
  expect(screen.queryByText('Relancer le client')).toBeNull();
});

it('removes a typed key with a single backspace', () => {
  renderScreen();
  fireEvent.changeText(input(), 'loyer tag:');
  expect(screen.getByTestId('pending-token')).toBeTruthy();
  fireEvent(input(), 'keyPress', { nativeEvent: { key: 'Backspace' } });
  expect(screen.queryByTestId('pending-token')).toBeNull();
  expect(screen.getByText('loyer')).toBeTruthy();
});

it('filters the cache as the user types, without any network call', () => {
  renderScreen();
  fireEvent.changeText(input(), 'loyer');
  expect(screen.getByText('Payer le loyer')).toBeTruthy();
  expect(screen.queryByText('Relancer le client')).toBeNull();
  expect(useRemoteSearch).toHaveBeenCalledWith('a1', 'loyer', expect.any(Set));
});

it('keeps board filters on the device and applies them to server hits', () => {
  (useRemoteSearch as jest.Mock).mockReturnValue({
    hits: [hit('98', 'B2', 'Hit on commercial', 'Commercial'), hit('99', 'B1', 'Hit on finance', 'Finance & Juridique')],
    loading: false,
    failed: false,
  });
  renderScreen();
  fireEvent.changeText(input(), 'board:Commercial client');
  expect(useRemoteSearch).toHaveBeenLastCalledWith('a1', 'client', expect.any(Set));
  expect(screen.getByTestId('token-board-Commercial')).toBeTruthy();
  expect(screen.getByText('Hit on commercial')).toBeTruthy();
  expect(screen.queryByText('Hit on finance')).toBeNull();
  expect(screen.getByText('Relancer le client')).toBeTruthy();
  expect(screen.queryByText('Payer le loyer')).toBeNull();
});

it('ignores the server state when only board filters are set', () => {
  (useRemoteSearch as jest.Mock).mockReturnValue({
    hits: [hit('98', 'B2', 'Stale hit', 'Commercial')],
    loading: false,
    failed: true,
  });
  renderScreen();
  fireEvent.changeText(input(), 'board:Commercial ');
  expect(useRemoteSearch).toHaveBeenLastCalledWith('a1', '', expect.any(Set));
  expect(screen.queryByText('Stale hit')).toBeNull();
  expect(screen.queryByText('search.serverFailed')).toBeNull();
  expect(screen.getByText('Relancer le client')).toBeTruthy();
});

it('does not search the server for a half-typed filter value', () => {
  renderScreen();
  fireEvent.changeText(input(), 'loyer tag:Urg');
  expect(useRemoteSearch).toHaveBeenLastCalledWith('a1', 'loyer', expect.any(Set));
});

it('turns a typed word into a filter from a hint', () => {
  renderScreen();
  fireEvent.changeText(input(), 'urg');
  fireEvent.press(screen.getByTestId('hint-tag-Urgent'));
  expect(screen.getByTestId('token-tag-Urgent')).toBeTruthy();
  expect(input()).toHaveProp('value', '');
});

it('turns a typed filter into a token on Return without remembering the search', () => {
  renderScreen();
  fireEvent.changeText(input(), 'loyer tag:urgent');
  fireEvent(input(), 'submitEditing');
  expect(screen.getByTestId('token-tag-Urgent')).toBeTruthy();
  expect(screen.queryByTestId('pending-token')).toBeNull();
  expect(useRecentSearchStore.getState().byAccount.a1).toBeUndefined();
});

it('remembers the search on Return', () => {
  renderScreen();
  fireEvent.changeText(input(), 'loyer');
  fireEvent(input(), 'submitEditing');
  expect(recentTerms()).toEqual(['loyer']);
});

it('keeps a pending filter when the field loses focus with nothing typed', () => {
  renderScreen();
  fireEvent.press(screen.getByTestId('filter-tag'));
  fireEvent(input(), 'blur');
  expect(screen.getByTestId('pending-token')).toBeTruthy();
});

it('commits a typed filter value when the field loses focus', () => {
  renderScreen();
  fireEvent.changeText(input(), 'tag:urgent');
  fireEvent(input(), 'blur');
  expect(screen.getByTestId('token-tag-Urgent')).toBeTruthy();
  expect(screen.queryByTestId('pending-token')).toBeNull();
});

it('never commits a pending date when the field loses focus', () => {
  renderScreen();
  fireEvent.changeText(input(), 'date:ove');
  fireEvent(input(), 'blur');
  expect(screen.getByTestId('pending-token')).toBeTruthy();
  expect(screen.queryByTestId('token-date-ove')).toBeNull();
  expect(input()).toHaveProp('value', 'ove');
});

it('says there are no results rather than showing an empty list', () => {
  renderScreen();
  fireEvent.changeText(input(), 'zzz');
  expect(screen.getByTestId('search-empty')).toBeTruthy();
});

it('opens a card from a result and remembers the search', () => {
  renderScreen();
  fireEvent.changeText(input(), 'loyer');
  fireEvent.press(screen.getByTestId('result-card-c1'));
  const { router } = require('expo-router');
  expect(router.push).toHaveBeenCalledWith('/card/c1');
  expect(recentTerms()).toEqual(['loyer']);
});

it('opens a board from a result and remembers the search', () => {
  renderScreen();
  fireEvent.changeText(input(), 'Commercial');
  fireEvent.press(screen.getByTestId('result-board-b2'));
  const { router } = require('expo-router');
  expect(router.push).toHaveBeenCalledWith('/boards/b2', { withAnchor: true });
  expect(recentTerms()).toEqual(['Commercial']);
});

it('runs a recent search again', () => {
  act(() =>
    useRecentSearchStore.getState().add('a1', reduceSearch(EMPTY_MODEL, { type: 'input', text: 'loyer' }, () => null)),
  );
  renderScreen();
  fireEvent.press(screen.getByTestId('recent-loyer'));
  expect(input()).toHaveProp('value', 'loyer');
  expect(screen.getByText('Payer le loyer')).toBeTruthy();
});

it('lists a remote-only hit under its own section and opens its board', () => {
  (useRemoteSearch as jest.Mock).mockReturnValue({
    hits: [hit('99', 'B1', 'Only on server', 'Finance')],
    loading: false,
    failed: false,
  });
  renderScreen();
  fireEvent.changeText(input(), 'server');
  fireEvent.press(screen.getByText('Only on server'));
  const { router } = require('expo-router');
  expect(router.push).toHaveBeenCalledWith('/boards/b1', { withAnchor: true });
  expect(recentTerms()).toEqual(['server']);
});

it('notes that results are local only when offline', () => {
  (useIsOnline as jest.Mock).mockReturnValue(false);
  renderScreen();
  fireEvent.changeText(input(), 'loyer');
  expect(screen.getByText('search.offlineNote')).toBeTruthy();
});

it('offers the quick add from the search tab', () => {
  renderScreen();
  expect(screen.getByTestId('search-add-card')).toBeTruthy();
});

it('keeps its testID on a remote hit whose board cannot be resolved locally', () => {
  (useRemoteSearch as jest.Mock).mockReturnValue({
    hits: [hit('42', 'UNKNOWN', 'Orphan hit', 'Ghost')],
    loading: false,
    failed: false,
  });
  renderScreen();
  fireEvent.changeText(input(), 'orphan');
  expect(screen.getByTestId('result-hit-42')).toBeTruthy();
});
