import { render, screen, fireEvent } from '@testing-library/react-native';

import { ThemeWrapper } from '../../helpers/theme';
import { BoardFormSheet } from '../../../src/features/board/components/BoardFormSheet';
import { DECK_PALETTE } from '../../../src/features/board/palette';

// Sheet renders via useSafeAreaInsets(), which throws without a provider —
// same fix already used in __tests__/features/board/BoardActionsSheet.test.tsx.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string) => k }),
}));

const props = (over: Partial<any> = {}) => ({
  visible: true,
  onClose: jest.fn(),
  onSubmit: jest.fn(),
  ...over,
});

const renderSheet = (p: any) => render(<BoardFormSheet {...(p as any)} />, { wrapper: ThemeWrapper });

it('leaves Save inert on a whitespace-only title', () => {
  const p = props();
  renderSheet(p);
  fireEvent.changeText(screen.getByPlaceholderText('boards.form.titlePlaceholder'), '   ');
  fireEvent.press(screen.getByText('boards.form.save'));

  expect(p.onSubmit).not.toHaveBeenCalled();
});

it('reports the trimmed title and the tapped colour on submit', () => {
  const p = props();
  renderSheet(p);
  fireEvent.changeText(screen.getByPlaceholderText('boards.form.titlePlaceholder'), '  Commercial  ');
  fireEvent.press(screen.getByTestId(`color-swatch-${DECK_PALETTE[1]}`));
  fireEvent.press(screen.getByText('boards.form.save'));

  expect(p.onSubmit).toHaveBeenCalledWith({ title: 'Commercial', color: DECK_PALETTE[1] });
});

it('seeds the title field from initial for a rename', () => {
  const p = props({ initial: { title: 'Existing', color: DECK_PALETTE[0] } });
  renderSheet(p);

  expect(screen.getByDisplayValue('Existing')).toBeTruthy();
});
