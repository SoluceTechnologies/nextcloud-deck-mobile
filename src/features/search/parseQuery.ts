export type DateComparator = '<' | '<=' | '>' | '>=' | '=';
export type DateTerm = { comparator: DateComparator; value: string };

export type SearchQuery = {
  title: string[];
  description: string[];
  list: string[];
  tag: string[];
  assigned: string[];
  board: string[];
  date: DateTerm[];
  text: string[];
};

const KEYS = ['title', 'description', 'list', 'tag', 'assigned', 'board', 'date'] as const;
type Key = (typeof KEYS)[number];

const QUOTES = new Set(['"', "'"]);

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: string | null = null;
  let sawQuote = false;

  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (QUOTES.has(ch)) {
      quote = ch;
      sawQuote = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current.length > 0 || sawQuote) tokens.push(current);
      current = '';
      sawQuote = false;
      continue;
    }
    current += ch;
  }
  if (current.length > 0 || sawQuote) tokens.push(current);
  return tokens;
}

function parseDate(raw: string): DateTerm {
  const m = /^(<=|>=|<|>|=)?(.*)$/.exec(raw);
  const comparator = (m?.[1] as DateComparator | undefined) ?? '=';
  return { comparator, value: m?.[2] ?? '' };
}

export function parseQuery(input: string): SearchQuery {
  const query: SearchQuery = { title: [], description: [], list: [], tag: [], assigned: [], board: [], date: [], text: [] };

  for (const token of tokenize(input)) {
    const colon = token.indexOf(':');
    const name = colon === -1 ? null : token.slice(0, colon).toLowerCase();
    if (name && (KEYS as readonly string[]).includes(name)) {
      const value = token.slice(colon + 1);
      if (name === 'date') query.date.push(parseDate(value));
      else query[name as Exclude<Key, 'date'>].push(value);
      continue;
    }
    query.text.push(token);
  }

  return query;
}

export function isEmptyQuery(query: SearchQuery): boolean {
  return (
    query.title.length + query.description.length + query.list.length + query.tag.length +
      query.assigned.length + query.board.length + query.date.length + query.text.length === 0
  );
}
