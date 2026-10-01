import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeWrapper } from '../../helpers/theme';
import { FilterBar } from '../../../src/features/search/components/FilterBar';
import type { Suggestion } from '../../../src/features/search/suggestions';

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string) => k }),
}));

const hint: Suggestion = { key: 'tag', value: 'design', label: 'design', color: '#D4537E' };

it('starts a filter from a shortcut', () => {
  const onStart = jest.fn();
  render(<FilterBar hints={[]} onStart={onStart} onHint={jest.fn()} />, { wrapper: ThemeWrapper });
  fireEvent.press(screen.getByText('search.short.date'));
  expect(onStart).toHaveBeenCalledWith('date');
});

it('turns a hint into a filter', () => {
  const onHint = jest.fn();
  render(<FilterBar hints={[hint]} onStart={jest.fn()} onHint={onHint} />, { wrapper: ThemeWrapper });
  expect(screen.getByText('search.filterHint')).toBeTruthy();
  fireEvent.press(screen.getByTestId('hint-tag-design'));
  expect(onHint).toHaveBeenCalledWith(hint);
});

it('hides the hint row without hints', () => {
  render(<FilterBar hints={[]} onStart={jest.fn()} onHint={jest.fn()} />, { wrapper: ThemeWrapper });
  expect(screen.queryByText('search.filterHint')).toBeNull();
});
