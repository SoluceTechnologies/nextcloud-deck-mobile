import { render, screen } from '@testing-library/react-native';

import { ThemeWrapper } from '../../helpers/theme';
import { OverdueBanner } from '../../../src/features/today/components/OverdueBanner';

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string, o?: any) => (o?.count != null ? `${k}:${o.count}` : k) }),
}));

it('renders nothing at zero', () => {
  const { toJSON } = render(<OverdueBanner count={0} />, { wrapper: ThemeWrapper });
  expect(toJSON()).toBeNull();
});

it('shows the count and the hint', () => {
  render(<OverdueBanner count={2} />, { wrapper: ThemeWrapper });
  expect(screen.getByText('today.overdueBanner:2')).toBeTruthy();
  expect(screen.getByText('today.overdueHint')).toBeTruthy();
});
