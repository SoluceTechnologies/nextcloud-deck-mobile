import { groupUpcoming, UPCOMING_BUCKETS } from '../../../src/features/today/upcoming';

const NOW = new Date(2026, 8, 13, 12, 0, 0).getTime(); // local noon, 13 Sep 2026
const day = 24 * 60 * 60 * 1000;
const at = (d: number, h = 12) => new Date(2026, 8, d, h, 0, 0).getTime();
const card = (over: Partial<any> = {}): any => ({ id: 'c1', title: 'a', archived: false, doneAt: undefined, duedate: NOW, ...over });
const none = new Map() as any;
const assigned = (cardId: string, participant: string, type = 0) =>
  new Map([[cardId, [{ cardId, participant, assigneeType: type, displayName: participant }]]]) as any;

it('lists the buckets in display order', () => {
  expect(UPCOMING_BUCKETS).toEqual(['overdue', 'today', 'tomorrow', 'week']);
});

it('buckets by calendar day relative to now', () => {
  const groups = groupUpcoming([
    card({ id: 'o', duedate: at(6) }), card({ id: 't', duedate: at(13, 8) }),
    card({ id: 'm', duedate: at(14, 23) }), card({ id: 'w', duedate: at(20) }), card({ id: 'l', duedate: at(21) }),
  ], none, 'me', NOW);
  expect(groups.overdue.map((c) => c.id)).toEqual(['o']);
  expect(groups.today.map((c) => c.id)).toEqual(['t']);
  expect(groups.tomorrow.map((c) => c.id)).toEqual(['m']);
  expect(groups.week.map((c) => c.id)).toEqual(['w']);   // day 20 = today + 7, inclusive; day 21 dropped
});

it('drops archived, done and undated cards', () => {
  const groups = groupUpcoming([
    card({ id: 'a', archived: true }), card({ id: 'd', doneAt: NOW }), card({ id: 'u', duedate: undefined }),
  ], none, 'me', NOW);
  expect(Object.values(groups).flat()).toEqual([]);
});

// The server's upcoming view is "assigned to me or unassigned"; the local one must agree.
it('keeps unassigned cards and cards assigned to me, drops cards assigned only to others', () => {
  const byCard = new Map([...assigned('mine', 'me'), ...assigned('theirs', 'bob')]) as any;
  const groups = groupUpcoming([card({ id: 'free' }), card({ id: 'mine' }), card({ id: 'theirs' })], byCard, 'me', NOW);
  expect(groups.today.map((c) => c.id).sort()).toEqual(['free', 'mine']);
});

it('does not count a group assignment as "me" even when the ids collide', () => {
  const groups = groupUpcoming([card({ id: 'g' })], assigned('g', 'me', 1), 'me', NOW);
  expect(groups.today).toEqual([]);
});

it('sorts each bucket by due date, then title', () => {
  const groups = groupUpcoming([
    card({ id: 'b', title: 'b', duedate: at(15) }), card({ id: 'a', title: 'a', duedate: at(15) }), card({ id: 'e', title: 'e', duedate: at(14, 6) }),
  ], none, 'me', NOW);
  expect(groups.week.map((c) => c.id)).toEqual(['a', 'b']);
  expect(groups.tomorrow.map((c) => c.id)).toEqual(['e']);
});
