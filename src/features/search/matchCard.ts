import type { DateTerm, SearchQuery } from './parseQuery';

export type SearchableCard = {
  id: string;
  boardId: string;
  title: string;
  description: string;
  duedate: number | null;
  stackTitle: string;
  boardTitle: string;
  labels: string[];
  assignees: string[];
};

function contains(haystack: string, needle: string): boolean {
  if (needle.length === 0) return false;
  return haystack.toLocaleLowerCase().includes(needle.toLocaleLowerCase());
}

function anyContains(haystacks: string[], needle: string): boolean {
  return haystacks.some((h) => contains(h, needle));
}

function dayIndex(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return Math.round(d.getTime() / 86_400_000);
}

function termDay(term: DateTerm, now: number): number | null {
  if (term.value === 'today') return dayIndex(now);
  if (term.value === 'tomorrow') return dayIndex(now) + 1;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(term.value);
  if (!m) return null;
  return dayIndex(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).getTime());
}

function matchesDate(duedate: number | null, term: DateTerm, now: number): boolean {
  if (duedate === null) return false;
  const wanted = termDay(term, now);
  if (wanted === null) return false;
  const due = dayIndex(duedate);
  switch (term.comparator) {
    case '<': return due < wanted;
    case '<=': return due <= wanted;
    case '>': return due > wanted;
    case '>=': return due >= wanted;
    default: return due === wanted;
  }
}

function matchesAnyField(card: SearchableCard, needle: string): boolean {
  return (
    contains(card.title, needle) ||
    contains(card.description, needle) ||
    contains(card.stackTitle, needle) ||
    anyContains(card.labels, needle) ||
    anyContains(card.assignees, needle)
  );
}

export function matchesQuery(card: SearchableCard, query: SearchQuery, now: number): boolean {
  return (
    query.title.every((t) => contains(card.title, t)) &&
    query.description.every((t) => contains(card.description, t)) &&
    query.list.every((t) => contains(card.stackTitle, t)) &&
    query.tag.every((t) => anyContains(card.labels, t)) &&
    query.assigned.every((t) => anyContains(card.assignees, t)) &&
    query.text.every((t) => matchesAnyField(card, t)) &&
    query.date.every((t) => matchesDate(card.duedate, t, now))
  );
}

export function matchesBoardTitle(boardTitle: string, query: SearchQuery): boolean {
  if (query.text.length === 0) return false;
  return query.text.every((t) => contains(boardTitle, t));
}
