import { render, screen, fireEvent } from '@testing-library/react-native';

import { ThemeWrapper } from '../../helpers/theme';
import { BoardActionsSheet } from '../../../src/features/board/components/BoardActionsSheet';

// Sheet renders via useSafeAreaInsets(), which throws without a provider —
// same fix already used in __tests__/app/setup.test.tsx.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string) => k }),
}));

const props = (over: Partial<any> = {}) => ({
  summary: {
    board: { id: 'b1', title: 'Commercial', canManage: true, canEdit: true, archived: false },
    doneCount: 0, totalCount: 0, shared: false,
  },
  visible: true,
  onClose: jest.fn(),
  onOpen: jest.fn(),
  onRename: jest.fn(),
  onRecolor: jest.fn(),
  onArchive: jest.fn(),
  onDelete: jest.fn(),
  ...over,
});

const renderSheet = (p: any) => render(<BoardActionsSheet {...(p as any)} />, { wrapper: ThemeWrapper });

it('offers every action to a board the user manages', () => {
  renderSheet(props());
  for (const key of ['open', 'rename', 'color', 'archive', 'delete']) {
    expect(screen.getByText(`boards.actions.${key}`)).toBeTruthy();
  }
});

// Hidden, not disabled — a greyed row invites a tap that can only fail.
it('hides every managing action when the user cannot manage the board', () => {
  const p = props();
  p.summary.board.canManage = false;
  renderSheet(p);

  expect(screen.getByText('boards.actions.open')).toBeTruthy();
  for (const key of ['rename', 'color', 'archive', 'delete']) {
    expect(screen.queryByText(`boards.actions.${key}`)).toBeNull();
  }
});

it('offers unarchive instead of archive for an archived board', () => {
  const p = props();
  p.summary.board.archived = true;
  renderSheet(p);

  expect(screen.getByText('boards.actions.unarchive')).toBeTruthy();
  expect(screen.queryByText('boards.actions.archive')).toBeNull();
});

it('calls the handler and closes for a non-destructive action', () => {
  const p = props();
  renderSheet(p);
  fireEvent.press(screen.getByText('boards.actions.rename'));

  expect(p.onRename).toHaveBeenCalledTimes(1);
  expect(p.onClose).toHaveBeenCalledTimes(1);
});

// Deleting a board destroys every card on it, for everyone.
it('does not delete until the confirmation is accepted', () => {
  const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
  const p = props();
  renderSheet(p);
  fireEvent.press(screen.getByText('boards.actions.delete'));

  expect(p.onDelete).not.toHaveBeenCalled();
  expect(alert).toHaveBeenCalled();

  // Fire the destructive button the Alert was configured with.
  const buttons = alert.mock.calls[0][2] as { style?: string; onPress?: () => void }[];
  buttons.find((b) => b.style === 'destructive')?.onPress?.();
  expect(p.onDelete).toHaveBeenCalledTimes(1);

  alert.mockRestore();
});
