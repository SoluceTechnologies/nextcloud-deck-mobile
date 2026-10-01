import { act, fireEvent, render, screen } from '@testing-library/react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

import { ThemeWrapper } from '../../helpers/theme';
import { ValueSuggestions } from '../../../src/features/search/components/ValueSuggestions';
import { buildValueSuggestions, type Suggestion } from '../../../src/features/search/suggestions';

type PickerChange = (event: { type: string }, date?: Date) => void;
const mockPicker = DateTimePicker as unknown as { lastOnChange: PickerChange | null };

jest.mock('@react-native-community/datetimepicker', () => {
  function MockPicker(props: { onChange: unknown }) {
    MockPicker.lastOnChange = props.onChange;
    return null;
  }
  MockPicker.lastOnChange = null as unknown;
  return MockPicker;
});

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string, o?: { value?: string }) => (o?.value ? `${k}:${o.value}` : k) }),
}));

const tags: Suggestion[] = [{ key: 'tag', value: 'design', label: 'design', color: '#D4537E', detail: '2 boards' }];
const dates = buildValueSuggestions('date', '', { boards: [], labels: [], stacks: [], people: [] }, () => '');

it('offers to use the typed value as is', () => {
  const onUseTyped = jest.fn();
  render(<ValueSuggestions pending="tag" typed="des " suggestions={tags} onPick={jest.fn()} onUseTyped={onUseTyped} />, {
    wrapper: ThemeWrapper,
  });
  fireEvent.press(screen.getByText('search.use:des'));
  expect(onUseTyped).toHaveBeenCalled();
});

it('picks a suggestion with its label and color', () => {
  const onPick = jest.fn();
  render(<ValueSuggestions pending="tag" typed="" suggestions={tags} onPick={onPick} onUseTyped={jest.fn()} />, {
    wrapper: ThemeWrapper,
  });
  expect(screen.queryByTestId('suggestion-use')).toBeNull();
  expect(screen.getByText('2 boards')).toBeTruthy();
  fireEvent.press(screen.getByTestId('suggestion-design'));
  expect(onPick).toHaveBeenCalledWith({ value: 'design', label: 'design', color: '#D4537E' });
});

it('names the date presets and picks one', () => {
  const onPick = jest.fn();
  render(<ValueSuggestions pending="date" typed="" suggestions={dates} onPick={onPick} onUseTyped={jest.fn()} />, {
    wrapper: ThemeWrapper,
  });
  expect(screen.getByText('search.date.overdue')).toBeTruthy();
  expect(screen.getByText('search.date.none')).toBeTruthy();
  fireEvent.press(screen.getByTestId('suggestion-overdue'));
  expect(onPick).toHaveBeenCalledWith({ value: 'overdue', label: 'overdue', color: undefined });
});

it('commits a before-date filter from the picker', () => {
  const onPick = jest.fn();
  render(<ValueSuggestions pending="date" typed="" suggestions={dates} onPick={onPick} onUseTyped={jest.fn()} />, {
    wrapper: ThemeWrapper,
  });
  fireEvent.press(screen.getByTestId('suggestion-before'));
  act(() => mockPicker.lastOnChange?.({ type: 'set' }, new Date(2026, 9, 1, 12)));
  expect(onPick).toHaveBeenCalledWith({ value: '<2026-10-01', label: '<2026-10-01' });
});

it('commits nothing when the picker is dismissed', () => {
  const onPick = jest.fn();
  render(<ValueSuggestions pending="date" typed="" suggestions={dates} onPick={onPick} onUseTyped={jest.fn()} />, {
    wrapper: ThemeWrapper,
  });
  fireEvent.press(screen.getByTestId('suggestion-after'));
  act(() => mockPicker.lastOnChange?.({ type: 'dismissed' }));
  expect(onPick).not.toHaveBeenCalled();
});
