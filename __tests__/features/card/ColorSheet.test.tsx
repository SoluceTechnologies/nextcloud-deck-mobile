import { render, screen, fireEvent } from '@testing-library/react-native';
// Pulls in the ambient `toHaveAccessibilityState` matcher type — the runtime
// matcher is already global via jest.config's setupFilesAfterEnv, but tsc's
// program only sees jest-native's global type augmentation for files that
// actually import it.
import '@testing-library/jest-native/extend-expect';

import { ThemeWrapper } from '../../helpers/theme';
import { ColorSheet, DECK_PALETTE } from '../../../src/features/card/components/ColorSheet';
import { normalizeColor, denormalizeColor } from '../../../src/services/deck/normalize';

// Sheet renders via useSafeAreaInsets(), which throws without a provider —
// same fix already used in __tests__/features/board/BoardFormSheet.test.tsx.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string) => k }),
}));

const renderSheet = (p: any) => render(<ColorSheet {...p} />, { wrapper: ThemeWrapper });

it('offers every palette colour plus a clear control', () => {
  renderSheet({ visible: true, value: null, onClose: jest.fn(), onSelect: jest.fn() });
  expect(screen.getAllByTestId(/^color-swatch-/)).toHaveLength(DECK_PALETTE.length);
  expect(screen.getByText('card.clearColor')).toBeTruthy();
});

it('reports the chosen colour', () => {
  const onSelect = jest.fn();
  renderSheet({ visible: true, value: null, onClose: jest.fn(), onSelect });
  fireEvent.press(screen.getByTestId(`color-swatch-${DECK_PALETTE[0]}`));
  expect(onSelect).toHaveBeenCalledWith(DECK_PALETTE[0]);
});

it('clears to null, not to an empty string', () => {
  const onSelect = jest.fn();
  renderSheet({ visible: true, value: '#ff0000', onClose: jest.fn(), onSelect });
  fireEvent.press(screen.getByText('card.clearColor'));
  expect(onSelect).toHaveBeenCalledWith(null);
});

it('marks the current colour as selected', () => {
  renderSheet({ visible: true, value: DECK_PALETTE[1], onClose: jest.fn(), onSelect: jest.fn() });
  expect(screen.getByTestId(`color-swatch-${DECK_PALETTE[1]}`)).toHaveAccessibilityState({
    selected: true,
  });
});

// A palette entry the API cannot express would silently fail on sync.
it('round-trips every palette colour through the wire format', () => {
  for (const c of DECK_PALETTE) expect(normalizeColor(denormalizeColor(c))).toBe(c);
});
