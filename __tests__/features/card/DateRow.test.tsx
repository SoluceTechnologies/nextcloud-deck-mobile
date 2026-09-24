import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeWrapper } from '../../helpers/theme';
import { DateRow } from '../../../src/features/card/components/DateRow';
import DateTimePicker from '@react-native-community/datetimepicker';

// The mock factory below attaches `onChanges`/`valueTimestamps`, which isn't
// part of the real module's typed shape — this is how the test reaches into it.
const mockPicker = DateTimePicker as unknown as { onChanges: unknown[]; valueTimestamps: number[] };

// The native picker itself is not under test here — only the row that owns
// its open/close state. Mocking it to a function (rather than an object with
// a `default`) relies on the same babel interop the real default import uses,
// and sidesteps needing a real native module in the jest-expo environment.
// It also records the `onChange` it's given, and the seeded `value`'s
// timestamp, on every render — so a test can assert both stay put across
// unrelated parent re-renders.
jest.mock('@react-native-community/datetimepicker', () => {
  const onChanges: unknown[] = [];
  const valueTimestamps: number[] = [];
  function MockPicker({ onChange, value }: { onChange: unknown; value: Date }) {
    onChanges.push(onChange);
    valueTimestamps.push(value.getTime());
    return null;
  }
  MockPicker.onChanges = onChanges;
  MockPicker.valueTimestamps = valueTimestamps;
  return MockPicker;
});

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

it('keeps the picker handler stable across unrelated parent re-renders', () => {
  mockPicker.onChanges.length = 0;
  const { rerender } = render(
    <DateRow label="card.dueDate" value={null} emptyLabel="card.noDueDate" onChange={jest.fn()} />,
    { wrapper: ThemeWrapper },
  );

  // Open the two-step Android/iOS picker so it mounts and hands the mock its
  // current `onChange`.
  fireEvent.press(screen.getByText('card.dueDate'));

  // Re-render with a brand new inline `onChange` (same shape, new identity) —
  // exactly what the screen does on any unrelated change (theme, navigation,
  // sibling state), while the picker is still open (`stage` unchanged).
  rerender(<DateRow label="card.dueDate" value={null} emptyLabel="card.noDueDate" onChange={jest.fn()} />);

  const { onChanges } = mockPicker;
  expect(onChanges.length).toBeGreaterThanOrEqual(2);
  expect(onChanges[onChanges.length - 1]).toBe(onChanges[onChanges.length - 2]);
});

it('seeds an empty picker once per open, not fresh on every render', () => {
  mockPicker.valueTimestamps.length = 0;
  // Two distinct values so a second Date.now() call (the bug) is visible even
  // when both calls land in the same millisecond in real time.
  const nowSpy = jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(2000);

  const { rerender } = render(
    <DateRow label="card.dueDate" value={null} emptyLabel="card.noDueDate" onChange={jest.fn()} />,
    { wrapper: ThemeWrapper },
  );

  // Open the picker on a field with no date set — the path that previously
  // fell back to `new Date(value ?? Date.now())` on every render.
  fireEvent.press(screen.getByText('card.dueDate'));

  // Re-render with a brand new inline `onChange`, picker still open.
  rerender(<DateRow label="card.dueDate" value={null} emptyLabel="card.noDueDate" onChange={jest.fn()} />);

  nowSpy.mockRestore();

  const { valueTimestamps } = mockPicker;
  expect(valueTimestamps.length).toBeGreaterThanOrEqual(2);
  expect(valueTimestamps[valueTimestamps.length - 1]).toBe(valueTimestamps[valueTimestamps.length - 2]);
});
