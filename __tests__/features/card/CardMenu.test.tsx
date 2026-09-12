import { Alert } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';

import { ThemeWrapper } from '../../helpers/theme';
import { CardMenu } from '../../../src/features/card/components/CardMenu';

// Sheet renders via useSafeAreaInsets(), which throws without a provider —
// same fix already used in BoardActionsSheet.test.tsx.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('../../../src/services/shared/network', () => ({ useIsOnline: jest.fn(() => true) }));

const card = (over: any = {}) => ({
  id: 'c1',
  title: 'Payer le loyer',
  remoteId: '7',
  archived: false,
  ...over,
});

const handlers = () => ({
  onClose: jest.fn(),
  onMove: jest.fn(),
  onCopy: jest.fn(),
  onArchive: jest.fn(),
  onDelete: jest.fn(),
});

const renderMenu = (p: any) => render(<CardMenu {...p} />, { wrapper: ThemeWrapper });

beforeEach(() => {
  const { useIsOnline } = require('../../../src/services/shared/network');
  (useIsOnline as jest.Mock).mockReturnValue(true);
});

it('offers move, copy, archive and delete', () => {
  renderMenu({ visible: true, card: card(), ...handlers() });
  expect(screen.getByText('card.menu.move')).toBeTruthy();
  expect(screen.getByText('card.menu.copy')).toBeTruthy();
  expect(screen.getByText('card.menu.archive')).toBeTruthy();
  expect(screen.getByText('card.menu.delete')).toBeTruthy();
});

it('does not delete until the confirmation is accepted', () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const h = handlers();
  renderMenu({ visible: true, card: card(), ...h });
  fireEvent.press(screen.getByText('card.menu.delete'));

  expect(h.onDelete).not.toHaveBeenCalled();
  expect(alert).toHaveBeenCalled();

  // Fire the destructive button the Alert was configured with.
  const buttons = alert.mock.calls[0][2] as { style?: string; onPress?: () => void }[];
  buttons.find((b) => b.style === 'destructive')?.onPress?.();
  expect(h.onDelete).toHaveBeenCalledTimes(1);

  alert.mockRestore();
});

// Copy needs the server: there is no local clone semantics for an unsynced card.
it('hides copy for a card that has never reached the server', () => {
  renderMenu({ visible: true, card: { remoteId: '' } as never, ...handlers() });
  expect(screen.queryByText('card.menu.copy')).toBeNull();
});

// Copy is server-only (spec §9) — offline, there is nowhere to send the request.
it('hides copy while offline even for a synced card', () => {
  const { useIsOnline } = require('../../../src/services/shared/network');
  (useIsOnline as jest.Mock).mockReturnValue(false);
  renderMenu({ visible: true, card: card(), ...handlers() });
  expect(screen.queryByText('card.menu.copy')).toBeNull();
});
