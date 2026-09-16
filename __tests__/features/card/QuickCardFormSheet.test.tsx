import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeWrapper } from '../../helpers/theme';
import { QuickCardFormSheet } from '../../../src/features/card/components/QuickCardFormSheet';

// Sheet renders via useSafeAreaInsets(), which throws without a provider —
// same fix already used in DependenciesSheet.test.tsx.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string) => k }),
}));
jest.mock('@react-native-community/datetimepicker', () => () => null);

// DateRow is exercised on its own (DateRow.test.tsx); here it is replaced with
// a stub that captures `onChange`, same idiom as CardPickerSheet in
// DependenciesSheet.test.tsx — a test can then simulate a date pick without
// driving the real native picker.
let capturedOnChange: ((next: number | null) => void) | null = null;
jest.mock('../../../src/features/card/components/DateRow', () => ({
  DateRow: (props: any) => {
    capturedOnChange = props.onChange;
    return null;
  },
}));

function pickDate(value: number) {
  // The stub above isn't a fireEvent dispatch, so the resulting state update
  // must be wrapped explicitly, same as RTL's own event helpers do internally.
  act(() => capturedOnChange?.(value));
}

const props = (over: Partial<any> = {}) => ({
  visible: true,
  boardTitle: 'Finance',
  stackTitle: 'En cours',
  onClose: jest.fn(),
  onSubmit: jest.fn(),
  ...over,
});

const renderSheet = (p: Partial<any> = {}) =>
  render(<QuickCardFormSheet {...(props(p) as any)} />, { wrapper: ThemeWrapper });

beforeEach(() => {
  capturedOnChange = null;
});

it('keeps Save inert while the title is blank', () => {
  const onSubmit = jest.fn();
  renderSheet({ onSubmit });
  fireEvent.changeText(screen.getByTestId('quick-title'), '  ');
  fireEvent.press(screen.getByText('today.form.save'));

  expect(onSubmit).not.toHaveBeenCalled();
});

it('submits the trimmed title and a null due date by default', () => {
  const onSubmit = jest.fn();
  renderSheet({ onSubmit });
  fireEvent.changeText(screen.getByTestId('quick-title'), '  Loyer  ');
  fireEvent.press(screen.getByText('today.form.save'));

  expect(onSubmit).toHaveBeenCalledWith({ title: 'Loyer', duedate: null });
});

it('submits the picked due date', () => {
  const onSubmit = jest.fn();
  renderSheet({ onSubmit });
  fireEvent.changeText(screen.getByTestId('quick-title'), 'Loyer');
  pickDate(123);
  fireEvent.press(screen.getByText('today.form.save'));

  expect(onSubmit).toHaveBeenCalledWith({ title: 'Loyer', duedate: 123 });
});

it('names the target board and list', () => {
  renderSheet({ boardTitle: 'Finance', stackTitle: 'En cours' });
  expect(screen.getByText('Finance › En cours')).toBeTruthy();
});
