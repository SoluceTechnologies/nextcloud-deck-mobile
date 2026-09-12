import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeWrapper } from '../../helpers/theme';
import { DateRow } from '../../../src/features/card/components/DateRow';

// The native picker itself is not under test here — only the row that owns
// its open/close state. Mocking it to `null` also sidesteps needing a real
// native module in the jest-expo environment.
jest.mock('@react-native-community/datetimepicker', () => () => null);

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string) => k }),
}));

it('shows the empty label when there is no date', () => {
  render(<DateRow label="card.dueDate" value={null} emptyLabel="card.noDueDate" onChange={jest.fn()} />, {
    wrapper: ThemeWrapper,
  });
  expect(screen.getByText('card.noDueDate')).toBeTruthy();
});

it('offers a clear control only when a date is set', () => {
  const { rerender } = render(
    <DateRow label="card.dueDate" value={null} emptyLabel="card.noDueDate" onChange={jest.fn()} />,
    { wrapper: ThemeWrapper },
  );
  expect(screen.queryByTestId('date-clear')).toBeNull();

  rerender(
    <DateRow label="card.dueDate" value={1757000000000} emptyLabel="card.noDueDate" onChange={jest.fn()} />,
  );
  expect(screen.getByTestId('date-clear')).toBeTruthy();
});

it('clears to null rather than to zero', () => {
  const onChange = jest.fn();
  render(
    <DateRow label="card.dueDate" value={1757000000000} emptyLabel="card.noDueDate" onChange={onChange} />,
    { wrapper: ThemeWrapper },
  );
  fireEvent.press(screen.getByTestId('date-clear'));
  expect(onChange).toHaveBeenCalledWith(null);
});

it('renders the overdue line when given one', () => {
  render(
    <DateRow
      label="card.dueDate"
      value={1}
      emptyLabel="card.noDueDate"
      overdueLine="Needs attention · 7d overdue"
      onChange={jest.fn()}
    />,
    { wrapper: ThemeWrapper },
  );
  expect(screen.getByText('Needs attention · 7d overdue')).toBeTruthy();
});
