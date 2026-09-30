import { EMPTY_MODEL } from '../../../src/features/search/searchModel';
import type { Resolve, SearchModel } from '../../../src/features/search/searchModel';
import { lastOpenWord, matchKey, parseInput, splitWords, toTerm } from '../../../src/features/search/searchSyntax';
import { parseQuery } from '../../../src/features/search/parseQuery';

const resolve: Resolve = (key, raw) =>
  key === 'tag' && raw.toLowerCase() === 'design' ? { value: 'design', label: 'design', color: '#D4537E' } : null;

const shape = (segments: SearchModel['segments']) =>
  segments.map((s) =>
    s.kind === 'text'
      ? { text: s.text }
      : { key: s.token.key, value: s.token.value, label: s.token.label, color: s.token.color },
  );

const model = (text: string): SearchModel => ({ ...EMPTY_MODEL, ...parseInput(text, resolve)! });

describe('splitWords', () => {
  it('splits on whitespace, keeps double-quoted spaces and marks the word being typed', () => {
    expect(splitWords('tag:design list:"En cours" lo')).toEqual([
      { text: 'tag:design', start: 0, closed: true },
      { text: 'list:En cours', start: 11, closed: true },
      { text: 'lo', start: 27, closed: false },
    ]);
  });

  it("keeps an apostrophe as an ordinary character", () => {
    expect(splitWords("d'équipe tag:")).toEqual([
      { text: "d'équipe", start: 0, closed: true },
      { text: 'tag:', start: 9, closed: false },
    ]);
  });
});

describe('matchKey', () => {
  it('recognises the filter keys case-insensitively and nothing else', () => {
    expect(matchKey('TAG:design')).toEqual({ key: 'tag', value: 'design' });
    expect(matchKey('board:')).toEqual({ key: 'board', value: '' });
    expect(matchKey('http://x.io')).toBeNull();
    expect(matchKey(':design')).toBeNull();
  });
});

describe('parseInput', () => {
  it('leaves plain words alone', () => {
    expect(parseInput('loyer urgent', resolve)).toBeNull();
  });

  it('turns a trailing key into a pending filter and freezes the text before it', () => {
    const parsed = parseInput('loyer tag:', resolve)!;
    expect(shape(parsed.segments)).toEqual([{ text: 'loyer' }]);
    expect(parsed).toMatchObject({ input: '', pending: 'tag' });
  });

  it('keeps a pasted open value as the pending value', () => {
    expect(parseInput('tag:des', resolve)).toMatchObject({ segments: [], input: 'des', pending: 'tag' });
  });

  it('turns complete key:value words into tokens, resolving labels', () => {
    const parsed = parseInput('tag:DESIGN list:"En cours" loyer', resolve)!;
    expect(shape(parsed.segments)).toEqual([
      { key: 'tag', value: 'design', label: 'design', color: '#D4537E' },
      { key: 'list', value: 'En cours', label: 'En cours', color: undefined },
    ]);
    expect(parsed).toMatchObject({ input: 'loyer', pending: null });
  });

  it('merges new text into the last text segment', () => {
    const base = parseInput('loyer tag:', resolve)!.segments;
    const parsed = parseInput('urgent list:', resolve, base)!;
    expect(shape(parsed.segments)).toEqual([{ text: 'loyer urgent' }]);
    expect(parsed.pending).toBe('list');
  });

  it('never adds the same filter twice', () => {
    const base = parseInput('tag:design ', resolve)!.segments;
    expect(parseInput('tag:Design ', resolve, base)!.segments).toHaveLength(1);
  });

  it('treats a key followed by a space as plain text', () => {
    expect(parseInput('tag: loyer', resolve)).toBeNull();
  });
});

describe('toTerm', () => {
  it('writes tokens as key:value, quoting spaces, then the free text', () => {
    expect(toTerm(model('loyer list:"En cours" board:"Finance & Juridique" urgent'), { board: true })).toBe(
      'loyer list:"En cours" board:"Finance & Juridique" urgent',
    );
  });

  it('leaves board filters out of the server term', () => {
    expect(toTerm(model('board:Commercial loyer'), { board: false })).toBe('loyer');
  });

  it('never sends a pending filter or its value', () => {
    expect(toTerm(model('loyer tag:des'), { board: true })).toBe('loyer');
  });

  it('drops double quotes inside a quoted value', () => {
    const quoted: SearchModel = {
      ...EMPTY_MODEL,
      segments: [{ kind: 'token', token: { id: 't', key: 'title', value: 'say "hi" now', label: 'say "hi" now' } }],
    };
    expect(toTerm(quoted, { board: true })).toBe('title:"say hi now"');
  });

  it('round-trips through parseQuery', () => {
    const term = toTerm(model('loyer list:"En cours" board:"Finance & Juridique" date:overdue urgent'), { board: true });
    expect(parseQuery(term)).toMatchObject({
      list: ['En cours'],
      board: ['Finance & Juridique'],
      date: [{ comparator: '=', value: 'overdue' }],
      text: ['loyer', 'urgent'],
    });
  });
});

describe('lastOpenWord', () => {
  it('returns the word being typed, not a finished one', () => {
    expect(lastOpenWord('loyer desi')).toEqual({ text: 'desi', start: 6, closed: false });
    expect(lastOpenWord('loyer ')).toBeNull();
  });
});
