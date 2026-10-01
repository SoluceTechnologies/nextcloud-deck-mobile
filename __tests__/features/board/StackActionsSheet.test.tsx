import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeWrapper } from '../../helpers/theme';
import { StackActionsSheet } from '../../../src/features/board/components/StackActionsSheet';

jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string) => k }),
}));

const props = (over: Partial<any> = {}) => ({
  title: 'Todo',
  cardCount: 2,
  canManage: true,
  visible: true,
  onClose: jest.fn(),
  onRename: jest.fn(),
  onMarkAllDone: jest.fn(),
  onArchiveAll: jest.fn(),
  onDelete: jest.fn(),
  ...over,
});

const renderSheet = (p: any) => render(<StackActionsSheet {...p} />, { wrapper: ThemeWrapper });

function confirmAlert() {
  const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
  buttons.find((b: any) => b.style === 'destructive').onPress();
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it('offers every action to a manager of a list with cards', () => {
  renderSheet(props());
  for (const key of ['rename', 'markAllDone', 'archiveAll', 'delete']) {
    expect(screen.getByText(`board.actions.${key}`)).toBeTruthy();
  }
});

it('keeps only the card actions for an editor who cannot manage the board', () => {
  renderSheet(props({ canManage: false }));
  expect(screen.queryByText('board.actions.rename')).toBeNull();
  expect(screen.queryByText('board.actions.delete')).toBeNull();
  expect(screen.getByText('board.actions.markAllDone')).toBeTruthy();
});

it('hides the bulk card actions on an empty list', () => {
  renderSheet(props({ cardCount: 0 }));
  expect(screen.queryByText('board.actions.markAllDone')).toBeNull();
  expect(screen.queryByText('board.actions.archiveAll')).toBeNull();
});

it('marks all done straight away', () => {
  const p = props();
  renderSheet(p);
  fireEvent.press(screen.getByText('board.actions.markAllDone'));
  expect(p.onMarkAllDone).toHaveBeenCalled();
  expect(p.onClose).toHaveBeenCalled();
});

it.each([
  ['archiveAll', 'onArchiveAll'],
  ['delete', 'onDelete'],
])('asks before running %s', (key, handler) => {
  const p: any = props();
  renderSheet(p);
  fireEvent.press(screen.getByText(`board.actions.${key}`));
  expect(p[handler]).not.toHaveBeenCalled();

  confirmAlert();
  expect(p[handler]).toHaveBeenCalled();
  expect(p.onClose).toHaveBeenCalled();
});
