import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { DarkThemeWrapper, ThemeWrapper } from '../../helpers/theme';
import { OverdueBanner } from '../../../src/features/today/components/OverdueBanner';
import { darkTheme, lightTheme } from '../../../src/theme';

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

// This banner used to paint itself from the dark palette outright, so in light
// mode it was a black slab with white text whatever the app was set to.
describe('theming', () => {
  const backgroundOf = () =>
    StyleSheet.flatten(screen.getByTestId('overdue-banner').props.style).backgroundColor;

  it('tints itself from the active theme in light mode', () => {
    render(<OverdueBanner count={2} />, { wrapper: ThemeWrapper });
    expect(backgroundOf()).toBe(`${lightTheme.colors.danger}1f`);
  });

  it('and from the dark one in dark mode', () => {
    render(<OverdueBanner count={2} />, { wrapper: DarkThemeWrapper });
    expect(backgroundOf()).toBe(`${darkTheme.colors.danger}1f`);
  });

  // The text has to come from the theme too: hardcoded white was half the bug.
  it('leaves the text colour to the theme', () => {
    render(<OverdueBanner count={2} />, { wrapper: ThemeWrapper });
    const text = screen.getByText('today.overdueBanner:2');
    expect(StyleSheet.flatten(text.props.style).color).toBe(lightTheme.colors.text);
  });
});
