import type { FilterKey, Resolved } from './searchModel';

export type Suggestion = Resolved & { key: FilterKey; detail?: string };

export type SuggestionData = {
  boards: { id: string; title: string; color?: string | null }[];
  labels: { boardId: string; title: string; color?: string | null }[];
  stacks: { boardId: string; title: string }[];
  people: { participant: string; displayName: string }[];
};

type BoardsLabel = (count: number) => string;

export const DATE_PRESETS = ['overdue', 'today', 'week', 'month', 'none'] as const;

const MAX_VALUES = 20;
const MAX_HINTS = 3;
const DATED = /^[<>]=?\d{4}-\d{2}-\d{2}$/;

function byTitle(
  key: FilterKey,
  items: { boardId: string; title: string; color?: string | null }[],
  boardTitle: Map<string, string>,
  boardsLabel: BoardsLabel,
): Suggestion[] {
  const groups = new Map<string, { title: string; color?: string; boards: Set<string> }>();
  for (const item of items) {
    if (!boardTitle.has(item.boardId)) continue;
    const id = item.title.toLocaleLowerCase();
    const group = groups.get(id);
    if (group) group.boards.add(item.boardId);
    else groups.set(id, { title: item.title, color: item.color ?? undefined, boards: new Set([item.boardId]) });
  }
  return [...groups.values()].map((group) => ({
    key,
    value: group.title,
    label: group.title,
    color: group.color,
    detail: group.boards.size === 1 ? boardTitle.get([...group.boards][0]) : boardsLabel(group.boards.size),
  }));
}

function allValues(key: FilterKey, data: SuggestionData, boardsLabel: BoardsLabel): Suggestion[] {
  const boardTitle = new Map(data.boards.map((board) => [board.id, board.title]));
  switch (key) {
    case 'board': {
      const boards = new Map<string, Suggestion>();
      for (const board of data.boards) {
        const id = board.title.toLocaleLowerCase();
        if (boards.has(id)) continue;
        boards.set(id, { key, value: board.title, label: board.title, color: board.color ?? undefined });
      }
      return [...boards.values()];
    }
    case 'tag':
      return byTitle(key, data.labels, boardTitle, boardsLabel);
    case 'list':
      return byTitle(key, data.stacks, boardTitle, boardsLabel);
    case 'assigned': {
      const people = new Map<string, Suggestion>();
      for (const person of data.people) {
        if (people.has(person.participant)) continue;
        people.set(person.participant, {
          key,
          value: person.participant,
          label: person.displayName || person.participant,
          detail: person.participant,
        });
      }
      return [...people.values()];
    }
    case 'date':
      return DATE_PRESETS.map((preset) => ({ key, value: preset, label: preset }));
    default:
      return [];
  }
}

function rank(suggestion: Suggestion, query: string): number {
  if (!query) return 1;
  const label = suggestion.label.toLocaleLowerCase();
  const value = suggestion.value.toLocaleLowerCase();
  if (label.startsWith(query) || value.startsWith(query)) return 0;
  if (label.includes(query) || value.includes(query)) return 1;
  return -1;
}

export function buildValueSuggestions(
  key: FilterKey,
  typed: string,
  data: SuggestionData,
  boardsLabel: BoardsLabel,
): Suggestion[] {
  const query = typed.trim().toLocaleLowerCase();
  const matching = allValues(key, data, boardsLabel).filter((s) => rank(s, query) >= 0);
  if (key !== 'date') matching.sort((a, b) => rank(a, query) - rank(b, query) || a.label.localeCompare(b.label));
  return matching.slice(0, MAX_VALUES);
}

export function resolveValue(key: FilterKey, raw: string, data: SuggestionData): Resolved | null {
  const query = raw.trim().toLocaleLowerCase();
  if (!query) return null;
  if (key === 'date' && DATED.test(query)) return { value: query, label: query };
  const hit = allValues(key, data, () => '').find(
    (s) => s.label.toLocaleLowerCase() === query || s.value.toLocaleLowerCase() === query,
  );
  return hit ? { value: hit.value, label: hit.label, color: hit.color } : null;
}

export function buildHints(
  word: string,
  data: SuggestionData,
  present: { key: FilterKey; value: string }[],
): Suggestion[] {
  const query = word.trim().toLocaleLowerCase();
  if (query.length < 2) return [];
  const taken = new Set(present.map((token) => `${token.key}:${token.value.toLocaleLowerCase()}`));
  const startsFirst = (s: Suggestion) => Number(!s.label.toLocaleLowerCase().startsWith(query));
  return (['board', 'tag', 'list', 'assigned'] as const)
    .flatMap((key) => allValues(key, data, () => ''))
    .filter((s) => s.label.toLocaleLowerCase().includes(query) && !taken.has(`${s.key}:${s.value.toLocaleLowerCase()}`))
    .sort((a, b) => startsFirst(a) - startsFirst(b) || a.label.localeCompare(b.label))
    .slice(0, MAX_HINTS);
}
