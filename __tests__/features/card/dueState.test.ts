import { dueStateOf } from '../../../src/features/card/dueState';

// Built from local-time components (not Date.UTC) so each fixture names a
// fixed local calendar day no matter which timezone the suite runs under —
// dueStateOf itself compares calendar days in local time, so "today",
// "tomorrow" and "yesterday" here must be pinned the same way.
const AUG_20_NOON = new Date(2026, 7, 20, 12, 0, 0).getTime();
const day = 24 * 60 * 60 * 1000;

it('reports nothing for a card with no due date', () => {
  expect(dueStateOf(null, null, AUG_20_NOON)).toEqual({ kind: 'none' });
});

// A finished card is never late, however old its due date.
it('reports nothing for a done card, even a long-overdue one', () => {
  expect(dueStateOf(AUG_20_NOON - 30 * day, AUG_20_NOON, AUG_20_NOON)).toEqual({ kind: 'none' });
});

it('counts whole days overdue', () => {
  expect(dueStateOf(AUG_20_NOON - 7 * day, null, AUG_20_NOON)).toEqual({ kind: 'overdue', days: 7 });
});

// The boundary the user actually feels: due this morning, now afternoon.
it('treats a due date earlier the same day as today, not as overdue', () => {
  const dueThisMorning = new Date(2026, 7, 20, 8, 0, 0).getTime();
  expect(dueStateOf(dueThisMorning, null, AUG_20_NOON)).toEqual({ kind: 'today' });
});

it('treats any time tomorrow as tomorrow', () => {
  const lateTomorrow = new Date(2026, 7, 21, 23, 0, 0).getTime();
  expect(dueStateOf(lateTomorrow, null, AUG_20_NOON)).toEqual({ kind: 'tomorrow' });
});

it('reports anything further out as upcoming, carrying the timestamp', () => {
  const nextWeek = AUG_20_NOON + 7 * day;
  expect(dueStateOf(nextWeek, null, AUG_20_NOON)).toEqual({ kind: 'upcoming', at: nextWeek });
});

// Yesterday at 23:59 is one day late, not zero.
it('counts a due date late yesterday as one day overdue', () => {
  const lateYesterday = new Date(2026, 7, 19, 23, 59, 0).getTime();
  expect(dueStateOf(lateYesterday, null, AUG_20_NOON)).toEqual({ kind: 'overdue', days: 1 });
});
