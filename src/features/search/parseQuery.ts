export type DateComparator = '<' | '<=' | '>' | '>=' | '=';
export type DateTerm = { comparator: DateComparator; value: string };

export type SearchQuery = {
  title: string[];
  description: string[];
  list: string[];
  tag: string[];
  assigned: string[];
  date: DateTerm[];
  /** Tokens without a recognised operator, matched against title and description. */
  text: string[];
};

export const OPERATORS = ['title', 'description', 'list', 'tag', 'assigned', 'date'] as const;
type Operator = (typeof OPERATORS)[number];

const QUOTES = new Set(['"', "'"]);

/**
 * Splits on whitespace outside quotes. A quote opened right after `name:` keeps
 * the operator prefix attached ("title:" + "traiter le contrat"), so the token
 * carries its quoted value with the quotes stripped. An unterminated quote runs
 * to the end of the input, the way Deck's parser tolerates it.
 */
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
  const query: SearchQuery = { title: [], description: [], list: [], tag: [], assigned: [], date: [], text: [] };

  for (const token of tokenize(input)) {
    const colon = token.indexOf(':');
    const name = colon === -1 ? null : token.slice(0, colon).toLowerCase();
    if (name && (OPERATORS as readonly string[]).includes(name)) {
      const value = token.slice(colon + 1);
      if (name === 'date') query.date.push(parseDate(value));
      else query[name as Exclude<Operator, 'date'>].push(value);
      continue;
    }
    query.text.push(token);
  }

  return query;
}

export function isEmptyQuery(query: SearchQuery): boolean {
  return (
    query.title.length + query.description.length + query.list.length + query.tag.length +
      query.assigned.length + query.date.length + query.text.length === 0
  );
}
