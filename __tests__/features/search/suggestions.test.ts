import {
  buildHints,
  buildValueSuggestions,
  resolveValue,
  type SuggestionData,
} from '../../../src/features/search/suggestions';

const data: SuggestionData = {
  boards: [
    { id: 'b1', title: 'Finance & Juridique', color: '#0082c9' },
    { id: 'b2', title: 'Commercial', color: '#e9322d' },
  ],
  labels: [
    { boardId: 'b1', title: 'Design', color: '#D4537E' },
    { boardId: 'b2', title: 'design', color: '#1D9E75' },
    { boardId: 'b2', title: 'Urgent', color: '#E24B4A' },
  ],
  stacks: [
    { boardId: 'b1', title: 'En cours' },
    { boardId: 'b2', title: 'En cours' },
    { boardId: 'b2', title: 'À faire' },
  ],
  people: [
    { participant: 'alice', displayName: 'Alice Martin' },
    { participant: 'alice', displayName: 'Alice Martin' },
    { participant: 'bob', displayName: '' },
  ],
};
const boardsLabel = (count: number) => `${count} boards`;

it('groups tags by title across boards, keeping the first color', () => {
  expect(buildValueSuggestions('tag', '', data, boardsLabel)).toEqual([
    { key: 'tag', value: 'Design', label: 'Design', color: '#D4537E', detail: '2 boards' },
    { key: 'tag', value: 'Urgent', label: 'Urgent', color: '#E24B4A', detail: 'Commercial' },
  ]);
});

it('names the board of a list found on a single board', () => {
  expect(buildValueSuggestions('list', '', data, boardsLabel)).toEqual([
    { key: 'list', value: 'À faire', label: 'À faire', detail: 'Commercial' },
    { key: 'list', value: 'En cours', label: 'En cours', detail: '2 boards' },
  ]);
});

it('lists each person once by id, falling back to the id as name', () => {
  expect(buildValueSuggestions('assigned', '', data, boardsLabel)).toEqual([
    { key: 'assigned', value: 'alice', label: 'Alice Martin', detail: 'alice' },
    { key: 'assigned', value: 'bob', label: 'bob', detail: 'bob' },
  ]);
});

it('ranks matches that start with the typed text first', () => {
  const boards: SuggestionData = {
    ...data,
    boards: [
      { id: 'x', title: 'Web design' },
      { id: 'y', title: 'Design team' },
      { id: 'z', title: 'Marketing' },
    ],
  };
  expect(buildValueSuggestions('board', 'design', boards, boardsLabel).map((s) => s.label)).toEqual([
    'Design team',
    'Web design',
  ]);
});

it('keeps the date presets in order and filters them', () => {
  expect(buildValueSuggestions('date', '', data, boardsLabel).map((s) => s.value)).toEqual([
    'overdue', 'today', 'week', 'month', 'none',
  ]);
  expect(buildValueSuggestions('date', 'o', data, boardsLabel).map((s) => s.value)).toEqual([
    'overdue', 'today', 'month', 'none',
  ]);
});

it('offers nothing for free text keys and caps long lists', () => {
  expect(buildValueSuggestions('title', 'x', data, boardsLabel)).toEqual([]);
  const many: SuggestionData = {
    ...data,
    boards: Array.from({ length: 25 }, (_, i) => ({ id: `b${i}`, title: `Board ${i}` })),
  };
  expect(buildValueSuggestions('board', '', many, boardsLabel)).toHaveLength(20);
});

it('resolves an exact label or value, case-insensitively', () => {
  expect(resolveValue('assigned', 'alice martin', data)).toEqual({ value: 'alice', label: 'Alice Martin' });
  expect(resolveValue('tag', 'DESIGN', data)).toEqual({ value: 'Design', label: 'Design', color: '#D4537E' });
  expect(resolveValue('tag', 'des', data)).toBeNull();
  expect(resolveValue('date', 'overdue', data)).toEqual({ value: 'overdue', label: 'overdue' });
  expect(resolveValue('date', '<2026-10-01', data)).toEqual({ value: '<2026-10-01', label: '<2026-10-01' });
  expect(resolveValue('title', 'loyer', data)).toBeNull();
});

it('suggests up to three filters for a typed word, skipping those already present', () => {
  expect(buildHints('co', data, []).map((s) => `${s.key}:${s.value}`)).toEqual(['board:Commercial', 'list:En cours']);
  expect(buildHints('co', data, [{ key: 'board', value: 'commercial' }]).map((s) => s.value)).toEqual(['En cours']);
  expect(buildHints('c', data, [])).toEqual([]);
});
