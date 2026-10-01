import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeWrapper } from '../../helpers/theme';
import { FilterMenu } from '../../../src/features/search/components/FilterMenu';
import { EMPTY_MODEL, reduceSearch } from '../../../src/features/search/searchModel';
import type { RecentSearch } from '../../../src/stores/recentSearchStore';

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string) => k }),
}));

const entry: RecentSearch = {
  id: 'tag:design loyer',
  term: 'tag:design loyer',
  model: reduceSearch(EMPTY_MODEL, { type: 'input', text: 'tag:design loyer' }, () => null),
  at: 0,
};

function setup(recent: RecentSearch[] = []) {
  const handlers = { onStart: jest.fn(), onLoadRecent: jest.fn(), onRemoveRecent: jest.fn() };
  render(<FilterMenu recent={recent} {...handlers} />, { wrapper: ThemeWrapper });
  return handlers;
}

it('lists the five main filters and reveals the others on demand', () => {
  setup();
  for (const key of ['board', 'tag', 'assigned', 'list', 'date']) {
    expect(screen.getByTestId(`filter-${key}`)).toBeTruthy();
  }
  expect(screen.queryByTestId('filter-title')).toBeNull();
  fireEvent.press(screen.getByTestId('filter-more'));
  expect(screen.getByTestId('filter-title')).toBeTruthy();
  expect(screen.getByTestId('filter-description')).toBeTruthy();
});

it('starts a filter from its row and shows its syntax', () => {
  const handlers = setup();
  expect(screen.getByText('tag: search.hint.name')).toBeTruthy();
  expect(screen.getByText('date: overdue')).toBeTruthy();
  fireEvent.press(screen.getByTestId('filter-tag'));
  expect(handlers.onStart).toHaveBeenCalledWith('tag');
});

it('loads and removes a recent search', () => {
  const handlers = setup([entry]);
  expect(screen.getByText('search.recent')).toBeTruthy();
  fireEvent.press(screen.getByTestId('recent-tag:design loyer'));
  expect(handlers.onLoadRecent).toHaveBeenCalledWith(entry);
  fireEvent.press(screen.getByLabelText('search.removeRecent'));
  expect(handlers.onRemoveRecent).toHaveBeenCalledWith(entry);
});

it('offers removal of a recent search as an accessibility action', () => {
  const handlers = setup([entry]);
  const row = screen.getByTestId('recent-tag:design loyer');
  expect(row).toHaveProp('accessibilityActions', [{ name: 'delete', label: 'search.removeRecent' }]);
  fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
  expect(handlers.onRemoveRecent).toHaveBeenCalledWith(entry);
});

it('hides the recent section when there is none', () => {
  setup();
  expect(screen.queryByText('search.recent')).toBeNull();
});
