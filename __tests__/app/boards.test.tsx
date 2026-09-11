import { render, screen, fireEvent } from '@testing-library/react-native';

import { ThemeWrapper } from '../helpers/theme';
import BoardsScreen from '../../app/(tabs)/boards/index';

jest.mock('../../src/database/hooks/useBoards', () => ({
  useBoards: jest.fn(() => [
    { id: 'b1', title: 'Commercial', color: '#0082c9', lastModified: 1, shared: true, canManage: true, archived: false },
    { id: 'b2', title: 'Finance', color: null, lastModified: 2, shared: false, canManage: true, archived: false },
  ]),
  useAccountCards: jest.fn(() => []),
  useBoardCards: jest.fn(() => []),
}));
jest.mock('../../src/features/board/hooks/useBoardActions', () => ({
  useBoardActions: () => ({
    create: jest.fn(), rename: jest.fn(), recolor: jest.fn(),
    setArchived: jest.fn(), remove: jest.fn(),
  }),
}));
jest.mock('../../src/utils/haptics', () => ({ haptic: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string) => k }),
}));
// Sheet renders via useSafeAreaInsets(), which throws without a provider —
// same fix already used in __tests__/features/board/BoardActionsSheet.test.tsx.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useFocusEffect: () => {},
}));

const renderScreen = () => render(<BoardsScreen />, { wrapper: ThemeWrapper });

beforeEach(() => jest.clearAllMocks());

it('lists the account\'s boards', () => {
  renderScreen();
  expect(screen.getByText('Commercial')).toBeTruthy();
  expect(screen.getByText('Finance')).toBeTruthy();
});

// The filter is local: it must never trigger a fetch, and must react per keystroke.
it('filters the list as the user types, without any network call', () => {
  renderScreen();
  fireEvent.changeText(screen.getByPlaceholderText('boards.filter'), 'fin');

  expect(screen.queryByText('Commercial')).toBeNull();
  expect(screen.getByText('Finance')).toBeTruthy();
});

it('shows a filtered-empty message distinct from the never-had-any message', () => {
  renderScreen();
  fireEvent.changeText(screen.getByPlaceholderText('boards.filter'), 'zzz');
  expect(screen.getByText('boards.emptyFiltered')).toBeTruthy();
  expect(screen.queryByText('boards.empty')).toBeNull();
});

it('opens the actions sheet on a long press, after a haptic', () => {
  const { haptic } = require('../../src/utils/haptics');
  renderScreen();
  fireEvent(screen.getByText('Commercial'), 'longPress');

  expect(haptic).toHaveBeenCalled();
  expect(screen.getByText('boards.actions.rename')).toBeTruthy();
});
