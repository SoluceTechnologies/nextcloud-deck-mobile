import { matchesBoard, matchesBoardTitle, matchesQuery } from '../../../src/features/search/matchCard';
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

it('matches free text on the list, the tags and the assignees too', () => {
  const tagged = card({ title: 'Bulletins', description: '', labels: ['SOCIAL/PAIE'] });
  expect(matchesQuery(tagged, parseQuery('paie'), NOW)).toBe(true);
  expect(matchesQuery(card(), parseQuery('cours'), NOW)).toBe(true);
  expect(matchesQuery(card(), parseQuery('martin'), NOW)).toBe(true);
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

it('compares a plain date by calendar day', () => {
  const dueToday = card({ duedate: NOW - 3 * 60 * 60 * 1000 });
  expect(matchesQuery(dueToday, parseQuery('date:2026-09-13'), NOW)).toBe(true);
  expect(matchesQuery(dueToday, parseQuery('date:tomorrow'), NOW)).toBe(false);
});

it('applies the date comparators', () => {
  const dueIn3 = card({ duedate: NOW + 3 * day });
  expect(matchesQuery(dueIn3, parseQuery('date:>2026-09-13'), NOW)).toBe(true);
  expect(matchesQuery(dueIn3, parseQuery('date:<=2026-09-15'), NOW)).toBe(false);
  expect(matchesQuery(dueIn3, parseQuery('date:<=2026-09-16'), NOW)).toBe(true);
  expect(matchesQuery(dueIn3, parseQuery('date:>=2026-09-17'), NOW)).toBe(false);
});

it('never matches a date term on a card without a due date, or with an unreadable value', () => {
  expect(matchesQuery(card(), parseQuery('date:today'), NOW)).toBe(false);
  expect(matchesQuery(card(), parseQuery('date:<2026-09-30'), NOW)).toBe(false);
  expect(matchesQuery(card(), parseQuery('date:>2026-09-01'), NOW)).toBe(false);
  expect(matchesQuery(card({ duedate: NOW }), parseQuery('date:whenever'), NOW)).toBe(false);
});

it('matches a board title on free text only', () => {
  expect(matchesBoardTitle('Finance & Juridique', parseQuery('juridique'))).toBe(true);
  expect(matchesBoardTitle('Finance & Juridique', parseQuery('title:juridique'))).toBe(false);
  expect(matchesBoardTitle('Finance & Juridique', parseQuery(''))).toBe(false);
});

it('reads the date keywords the way the Deck server does', () => {
  const dueAt = (ms: number) => card({ duedate: ms });
  const hour = 60 * 60 * 1000;
  expect(matchesQuery(dueAt(NOW - 60_000), parseQuery('date:overdue'), NOW)).toBe(true);
  expect(matchesQuery(dueAt(NOW + 60_000), parseQuery('date:overdue'), NOW)).toBe(false);
  expect(matchesQuery(dueAt(NOW + 23 * hour), parseQuery('date:today'), NOW)).toBe(true);
  expect(matchesQuery(dueAt(NOW + 25 * hour), parseQuery('date:today'), NOW)).toBe(false);
  expect(matchesQuery(dueAt(NOW - 60_000), parseQuery('date:today'), NOW)).toBe(false);
  expect(matchesQuery(dueAt(NOW + 6 * day), parseQuery('date:week'), NOW)).toBe(true);
  expect(matchesQuery(dueAt(NOW + 8 * day), parseQuery('date:week'), NOW)).toBe(false);
  expect(matchesQuery(dueAt(NOW + 29 * day), parseQuery('date:month'), NOW)).toBe(true);
  expect(matchesQuery(dueAt(NOW + 31 * day), parseQuery('date:month'), NOW)).toBe(false);
});

it('matches date:none and an empty date value on the presence of a due date', () => {
  expect(matchesQuery(card(), parseQuery('date:none'), NOW)).toBe(true);
  expect(matchesQuery(card({ duedate: NOW }), parseQuery('date:none'), NOW)).toBe(false);
  expect(matchesQuery(card({ duedate: NOW }), parseQuery('date:""'), NOW)).toBe(true);
  expect(matchesQuery(card(), parseQuery('date:""'), NOW)).toBe(false);
});

it('lets a date keyword win over its comparator, like the server', () => {
  expect(matchesQuery(card({ duedate: NOW + 3 * day }), parseQuery('date:>today'), NOW)).toBe(false);
});

it('matches board: against the board title', () => {
  expect(matchesQuery(card(), parseQuery('board:juridique'), NOW)).toBe(true);
  expect(matchesQuery(card(), parseQuery('board:commercial'), NOW)).toBe(false);
});

it('checks a board title against every board filter', () => {
  expect(matchesBoard('Finance & Juridique', parseQuery('board:finance loyer'))).toBe(true);
  expect(matchesBoard('Commercial', parseQuery('board:finance'))).toBe(false);
  expect(matchesBoard('Commercial', parseQuery('loyer'))).toBe(true);
});
