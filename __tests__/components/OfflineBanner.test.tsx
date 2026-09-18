import { render, screen } from '@testing-library/react-native';

import { OfflineBanner } from '../../src/components/OfflineBanner';
import { ThemeWrapper } from '../helpers/theme';

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string) => k }),
}));
jest.mock('../../src/services/shared/network', () => ({ useIsOnline: jest.fn(() => true) }));

import { useIsOnline } from '../../src/services/shared/network';

function renderBanner() {
  return render(<OfflineBanner />, { wrapper: ThemeWrapper });
}

beforeEach(() => jest.clearAllMocks());

it('renders nothing while online', () => {
  (useIsOnline as jest.Mock).mockReturnValue(true);
  expect(renderBanner().toJSON()).toBeNull();
});

it('shows the offline message while offline', () => {
  (useIsOnline as jest.Mock).mockReturnValue(false);
  renderBanner();
  expect(screen.getByTestId('offline-banner')).toBeTruthy();
  expect(screen.getByText('offline.banner')).toBeTruthy();
});

it('disappears again when connectivity returns', () => {
  (useIsOnline as jest.Mock).mockReturnValue(false);
  const { rerender } = renderBanner();
  expect(screen.queryByTestId('offline-banner')).toBeTruthy();
  (useIsOnline as jest.Mock).mockReturnValue(true);
  rerender(<OfflineBanner />);
  expect(screen.queryByTestId('offline-banner')).toBeNull();
});
