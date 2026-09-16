import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeWrapper } from '../helpers/theme';
import { useAccountStore } from '../../src/stores/accountStore';
import SearchScreen from '../../app/(tabs)/search/index';
import { useRemoteSearch } from '../../src/features/search/useRemoteSearch';
import { useIsOnline } from '../../src/services/shared/network';

// Task-5 fixtures (see useLocalSearch.test.tsx / cardDetail.test.tsx): b1's
// remoteId is 'B1', c1 'Payer le loyer' on b1, c2 'Relancer le client' on b2.
// useLocalSearch itself is NOT mocked — it runs for real over these DB hooks.
jest.mock('../../src/database/hooks/useBoards', () => ({
  useBoards: jest.fn(() => [
    { id: 'b1', title: 'Finance & Juridique', remoteId: 'B1', color: null, archived: false },
    { id: 'b2', title: 'Commercial', remoteId: 'B2', color: null, archived: false },
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
  useAccountCardRelations: jest.fn(() => ({ labelsByCard: new Map(), assigneesByCard: new Map() })),
}));

jest.mock('../../src/features/search/useRemoteSearch', () => ({
  useRemoteSearch: jest.fn(() => ({ hits: [], loading: false, failed: false })),
}));

jest.mock('../../src/services/shared/network', () => ({
  useIsOnline: jest.fn(() => true),
}));

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string) => k }),
}));

// Sheet/screen chrome reads insets from context — same fix used throughout __tests__/app.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

// `router` and `useRouter()` must resolve to the SAME spy object — built
// entirely inside the factory, not from an outer `const` (see boardView.test.tsx).
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

beforeEach(() => {
  jest.clearAllMocks();
  (useRemoteSearch as jest.Mock).mockReturnValue({ hits: [], loading: false, failed: false });
  (useIsOnline as jest.Mock).mockReturnValue(true);
  act(() => useAccountStore.getState().setActiveAccountId('a1'));
});

it('shows the operators help for an empty query', () => {
  renderScreen();
  for (const op of ['title', 'description', 'list', 'tag', 'assigned', 'date']) {
    expect(screen.getByTestId(`operator-${op}`)).toBeTruthy();
  }
});

it('inserts the operator into the field when its row is tapped', () => {
  renderScreen();
  fireEvent.press(screen.getByTestId('operator-title'));
  expect(screen.getByTestId('search-input')).toHaveProp('value', 'title:');
});

it('filters the cache as the user types, without any network call', () => {
  renderScreen();
  fireEvent.changeText(screen.getByTestId('search-input'), 'loyer');
  expect(screen.getByText('Payer le loyer')).toBeTruthy();
  expect(screen.queryByText('Relancer le client')).toBeNull();
  expect(useRemoteSearch).toHaveBeenCalledWith('a1', 'loyer', expect.any(Set)); // the hook is the only network path
});

it('says there are no results rather than showing an empty list', () => {
  renderScreen();
  fireEvent.changeText(screen.getByTestId('search-input'), 'zzz');
  expect(screen.getByTestId('search-empty')).toBeTruthy();
});

it('opens a card from a result', () => {
  renderScreen();
  fireEvent.changeText(screen.getByTestId('search-input'), 'loyer');
  fireEvent.press(screen.getByTestId('result-card-c1'));
  const { router } = require('expo-router');
  expect(router.push).toHaveBeenCalledWith('/card/c1');
});

it('lists a remote-only hit under its own section and opens its board', () => {
  (useRemoteSearch as jest.Mock).mockReturnValue({
    hits: [{ card: { remoteId: '99', boardRemoteId: 'B1', title: 'Only on server' }, boardTitle: 'Finance', stackTitle: 'Done' }],
    loading: false,
    failed: false,
  });
  renderScreen();
  fireEvent.changeText(screen.getByTestId('search-input'), 'server');
  fireEvent.press(screen.getByText('Only on server'));
  const { router } = require('expo-router');
  expect(router.push).toHaveBeenCalledWith('/boards/b1'); // b1's remoteId is 'B1' in the fixtures
});

it('notes that results are local only when offline', () => {
  (useIsOnline as jest.Mock).mockReturnValue(false);
  renderScreen();
  fireEvent.changeText(screen.getByTestId('search-input'), 'loyer');
  expect(screen.getByText('search.offlineNote')).toBeTruthy();
});
