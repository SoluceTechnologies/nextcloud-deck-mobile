import { matchesBoardTitle, matchesQuery } from '../../../src/features/search/matchCard';
import { parseQuery } from '../../../src/features/search/parseQuery';

const NOW = new Date(2026, 8, 13, 12, 0, 0).getTime(); // 13 Sep 2026, local noon
const day = 24 * 60 * 60 * 1000;

const card = (over: Partial<any> = {}): any => ({
  id: 'c1', boardId: 'b1', title: 'Payer le loyer', description: 'Virement avant le 30',
  duedate: null, stackTitle: 'En cours', boardTitle: 'Finance & Juridique',
  labels: ['URGENT'], assignees: ['Alice Martin', 'alice'], ...over,
});

it('matches free text on the title or the description, case-insensitively', () => {
  expect(matchesQuery(card(), parseQuery('LOYER'), NOW)).toBe(true);
  expect(matchesQuery(card(), parseQuery('virement'), NOW)).toBe(true);
  expect(matchesQuery(card(), parseQuery('zzz'), NOW)).toBe(false);
});

it('requires every term to match', () => {
  expect(matchesQuery(card(), parseQuery('loyer virement'), NOW)).toBe(true);
  expect(matchesQuery(card(), parseQuery('loyer zzz'), NOW)).toBe(false);
});

it('scopes title: to the title only', () => {
  expect(matchesQuery(card(), parseQuery('title:loyer'), NOW)).toBe(true);
  expect(matchesQuery(card(), parseQuery('title:virement'), NOW)).toBe(false);
});

it('scopes description: to the description only', () => {
  expect(matchesQuery(card(), parseQuery('description:virement'), NOW)).toBe(true);
  expect(matchesQuery(card(), parseQuery('description:loyer'), NOW)).toBe(false);
});

it('matches list: against the stack title', () => {
  expect(matchesQuery(card(), parseQuery('list:"en cours"'), NOW)).toBe(true);
  expect(matchesQuery(card(), parseQuery('list:done'), NOW)).toBe(false);
});

it('matches tag: against any label and assigned: against any assignee name or id', () => {
  expect(matchesQuery(card(), parseQuery('tag:urg'), NOW)).toBe(true);
  expect(matchesQuery(card(), parseQuery('assigned:martin'), NOW)).toBe(true);
  expect(matchesQuery(card(), parseQuery('assigned:alice'), NOW)).toBe(true);
  expect(matchesQuery(card(), parseQuery('assigned:bob'), NOW)).toBe(false);
});

// The reference screenshot: `title:""` yields no results.
it('never matches an empty operator value', () => {
  expect(matchesQuery(card(), parseQuery('title:""'), NOW)).toBe(false);
});

it('compares date: by calendar day', () => {
  const dueToday = card({ duedate: NOW - 3 * 60 * 60 * 1000 }); // 09:00 today
  expect(matchesQuery(dueToday, parseQuery('date:today'), NOW)).toBe(true);
  expect(matchesQuery(dueToday, parseQuery('date:2026-09-13'), NOW)).toBe(true);
  expect(matchesQuery(dueToday, parseQuery('date:tomorrow'), NOW)).toBe(false);
});

it('applies the date comparators', () => {
  const dueIn3 = card({ duedate: NOW + 3 * day });
  expect(matchesQuery(dueIn3, parseQuery('date:>today'), NOW)).toBe(true);
  expect(matchesQuery(dueIn3, parseQuery('date:<=2026-09-15'), NOW)).toBe(false);
  expect(matchesQuery(dueIn3, parseQuery('date:<=2026-09-16'), NOW)).toBe(true);
  expect(matchesQuery(dueIn3, parseQuery('date:>=2026-09-17'), NOW)).toBe(false);
});

it('never matches a date term on a card without a due date, or with an unreadable value', () => {
  expect(matchesQuery(card(), parseQuery('date:today'), NOW)).toBe(false);
  expect(matchesQuery(card({ duedate: NOW }), parseQuery('date:whenever'), NOW)).toBe(false);
});

it('matches a board title on free text only', () => {
  expect(matchesBoardTitle('Finance & Juridique', parseQuery('juridique'))).toBe(true);
  expect(matchesBoardTitle('Finance & Juridique', parseQuery('title:juridique'))).toBe(false);
  expect(matchesBoardTitle('Finance & Juridique', parseQuery(''))).toBe(false);
});
