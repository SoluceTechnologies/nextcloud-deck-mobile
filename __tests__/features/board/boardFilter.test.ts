import { summarizeBoards, filterBoards, sortBoards } from '../../../src/features/board/boardFilter';

const board = (over: Partial<any> = {}): any => ({
  id: 'b1', title: 'Commercial', archived: false, shared: true, lastModified: 10, ...over,
});
const card = (over: Partial<any> = {}): any => ({
  id: 'c1', boardId: 'b1', archived: false, doneAt: null, ...over,
});

describe('summarizeBoards', () => {
  it('counts done and total cards per board', () => {
    const [row] = summarizeBoards([board()], [
      card({ id: 'c1', doneAt: 1 }),
      card({ id: 'c2', doneAt: null }),
      card({ id: 'c3', doneAt: null }),
    ] as never);
    expect([row.doneCount, row.totalCount]).toEqual([1, 3]);
  });

  // An archived card is not on the board any more, so it must not inflate the
  // denominator the user compares against what they can see.
  it('ignores archived cards in both counts', () => {
    const [row] = summarizeBoards([board()], [
      card({ id: 'c1', doneAt: 1, archived: true }),
      card({ id: 'c2', doneAt: null }),
    ] as never);
    expect([row.doneCount, row.totalCount]).toEqual([0, 1]);
  });

  it('does not count another board\'s cards', () => {
    const [row] = summarizeBoards([board()], [card({ boardId: 'other' })] as never);
    expect(row.totalCount).toBe(0);
  });

  it('gives a board with no cards a zero total rather than omitting it', () => {
    expect(summarizeBoards([board()], [] as never)).toHaveLength(1);
  });
});

describe('filterBoards', () => {
  const rows = [
    { board: board({ title: 'Commercial' }), doneCount: 0, totalCount: 0, shared: false },
    { board: board({ id: 'b2', title: 'Finance & Juridique' }), doneCount: 0, totalCount: 0, shared: false },
  ] as never[];

  it('matches case-insensitively on a substring', () => {
    expect(filterBoards(rows, 'finance')).toHaveLength(1);
  });

  it('returns everything for an empty or whitespace query', () => {
    expect(filterBoards(rows, '   ')).toHaveLength(2);
  });

  it('matches nothing rather than everything when no title contains the query', () => {
    expect(filterBoards(rows, 'zzz')).toHaveLength(0);
  });
});

describe('sortBoards', () => {
  it('sorts by title using locale comparison, not code points', () => {
    const rows = [
      { board: board({ title: 'Ingénierie' }) },
      { board: board({ title: 'Affaire' }) },
    ] as never[];
    expect(sortBoards(rows, 'title').map((r: any) => r.board.title)).toEqual([
      'Affaire', 'Ingénierie',
    ]);
  });

  it('sorts by last modified, newest first', () => {
    const rows = [
      { board: board({ title: 'old', lastModified: 1 }) },
      { board: board({ title: 'new', lastModified: 9 }) },
    ] as never[];
    expect(sortBoards(rows, 'lastModified').map((r: any) => r.board.title)).toEqual([
      'new', 'old',
    ]);
  });

  it('does not mutate the array it was given', () => {
    const rows = [
      { board: board({ title: 'b' }) },
      { board: board({ title: 'a' }) },
    ] as never[];
    sortBoards(rows, 'title');
    expect((rows[0] as any).board.title).toBe('b');
  });
});
