import { isEmptyQuery, parseQuery } from '../../../src/features/search/parseQuery';

const empty = { title: [], description: [], list: [], tag: [], assigned: [], date: [], text: [] };

describe('parseQuery', () => {
  it('turns plain words into free-text terms', () => {
    expect(parseQuery('traiter le contrat')).toEqual({ ...empty, text: ['traiter', 'le', 'contrat'] });
  });

  it('reads a title operator', () => {
    expect(parseQuery('title:traiter')).toEqual({ ...empty, title: ['traiter'] });
  });

  it('keeps a double-quoted value as one term', () => {
    expect(parseQuery('title:"traiter le contrat"')).toEqual({ ...empty, title: ['traiter le contrat'] });
  });

  it('keeps a single-quoted value as one term', () => {
    expect(parseQuery("list:'En cours'")).toEqual({ ...empty, list: ['En cours'] });
  });

  it('keeps a quoted free-text phrase together', () => {
    expect(parseQuery('"release notes"')).toEqual({ ...empty, text: ['release notes'] });
  });

  it('collects several operators in one query', () => {
    expect(parseQuery('tag:design assigned:alice description:spec')).toEqual({
      ...empty, tag: ['design'], assigned: ['alice'], description: ['spec'],
    });
  });

  it('matches the operator name case-insensitively', () => {
    expect(parseQuery('TITLE:x')).toEqual({ ...empty, title: ['x'] });
  });

  it('reads a date comparator', () => {
    expect(parseQuery('date:<2026-09-30 date:>=today')).toEqual({
      ...empty,
      date: [{ comparator: '<', value: '2026-09-30' }, { comparator: '>=', value: 'today' }],
    });
  });

  it('treats a date without a comparator as equality', () => {
    expect(parseQuery('date:tomorrow')).toEqual({ ...empty, date: [{ comparator: '=', value: 'tomorrow' }] });
  });

  // Deck has no `due:` operator — an unknown prefix is text, exactly as the server reads it.
  it('keeps an unknown operator as free text', () => {
    expect(parseQuery('due:soon')).toEqual({ ...empty, text: ['due:soon'] });
  });

  it('keeps an empty operator value as an empty term', () => {
    expect(parseQuery('title:""')).toEqual({ ...empty, title: [''] });
    expect(parseQuery('title:')).toEqual({ ...empty, title: [''] });
  });

  it('is lenient about an unterminated quote', () => {
    expect(parseQuery('title:"abc')).toEqual({ ...empty, title: ['abc'] });
  });

  it('ignores runs of whitespace and tabs', () => {
    expect(parseQuery('  a \t b  ')).toEqual({ ...empty, text: ['a', 'b'] });
  });

  it('mixes free text and operators in any order', () => {
    expect(parseQuery('loyer tag:urgent bureaux')).toEqual({ ...empty, tag: ['urgent'], text: ['loyer', 'bureaux'] });
  });
});

describe('isEmptyQuery', () => {
  it('is true for blank input and false for any term', () => {
    expect(isEmptyQuery(parseQuery('   '))).toBe(true);
    expect(isEmptyQuery(parseQuery('x'))).toBe(false);
    expect(isEmptyQuery(parseQuery('title:'))).toBe(false);
  });
});
