import { useRecentSearchStore } from '../../src/stores/recentSearchStore';
import { EMPTY_MODEL, reduceSearch } from '../../src/features/search/searchModel';
import type { SearchModel } from '../../src/features/search/searchModel';

const typed = (text: string): SearchModel => reduceSearch(EMPTY_MODEL, { type: 'input', text }, () => null);
const terms = (accountId: string) => useRecentSearchStore.getState().byAccount[accountId]?.map((r) => r.term);

beforeEach(() => useRecentSearchStore.setState({ byAccount: {} }));

it('keeps the five newest searches per account, newest first', () => {
  const { add } = useRecentSearchStore.getState();
  for (const word of ['a', 'b', 'c', 'd', 'e', 'f']) add('acc', typed(word));
  expect(terms('acc')).toEqual(['f', 'e', 'd', 'c', 'b']);
});

it('moves a repeated search to the top instead of duplicating it', () => {
  const { add } = useRecentSearchStore.getState();
  add('acc', typed('loyer'));
  add('acc', typed('tag:design '));
  add('acc', typed('loyer'));
  expect(terms('acc')).toEqual(['loyer', 'tag:design']);
});

it('ignores empty searches and keeps accounts apart', () => {
  const { add } = useRecentSearchStore.getState();
  add('acc', EMPTY_MODEL);
  add('other', typed('loyer'));
  expect(terms('acc')).toBeUndefined();
  expect(terms('other')).toEqual(['loyer']);
});

it('stores a search without its pending filter', () => {
  const pending = reduceSearch(typed('loyer'), { type: 'startFilter', key: 'tag' }, () => null);
  useRecentSearchStore.getState().add('acc', pending);
  const [entry] = useRecentSearchStore.getState().byAccount.acc;
  expect(entry.model.pending).toBeNull();
  expect(entry.term).toBe('loyer');
});

it('removes one entry', () => {
  const { add } = useRecentSearchStore.getState();
  add('acc', typed('loyer'));
  add('acc', typed('bail'));
  useRecentSearchStore.getState().remove('acc', 'loyer');
  expect(terms('acc')).toEqual(['bail']);
});
