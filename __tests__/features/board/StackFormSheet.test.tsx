import { render, screen, fireEvent } from '@testing-library/react-native';

import { ThemeWrapper } from '../../helpers/theme';
import { StackFormSheet } from '../../../src/features/board/components/StackFormSheet';

// Sheet renders via useSafeAreaInsets(), which throws without a provider —
// same fix already used in __tests__/features/board/BoardFormSheet.test.tsx.
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

const renderSheet = (p: any) => render(<StackFormSheet {...(p as any)} />, { wrapper: ThemeWrapper });

it('leaves Save inert on a whitespace-only title', () => {
  const p = props();
  renderSheet(p);
  fireEvent.changeText(screen.getByPlaceholderText('board.listTitle'), '   ');
  fireEvent.press(screen.getByText('board.form.save'));

  expect(p.onSubmit).not.toHaveBeenCalled();
});

it('submits the trimmed title', () => {
  const p = props();
  renderSheet(p);
  fireEvent.changeText(screen.getByPlaceholderText('board.listTitle'), '  Groceries  ');
  fireEvent.press(screen.getByText('board.form.save'));

  expect(p.onSubmit).toHaveBeenCalledWith({ title: 'Groceries' });
});

it('seeds the title field from initial for a rename', () => {
  const p = props({ initial: { title: 'Existing' } });
  renderSheet(p);

  expect(screen.getByDisplayValue('Existing')).toBeTruthy();
});
