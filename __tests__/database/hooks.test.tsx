// __tests__/database/hooks.test.tsx
import { renderHook, waitFor, act } from '@testing-library/react-native';

import { useBoards, useBoardCards, useAccountCards } from '../../src/database/hooks/useBoards';
import { useBoardStacks } from '../../src/database/hooks/useBoardContent';
import { useCard } from '../../src/database/hooks/useCard';
import { useDatabase } from '../../src/database/DatabaseProvider';

jest.mock('../../src/database/DatabaseProvider', () => ({ useDatabase: jest.fn() }));

const mockUseDatabase = useDatabase as jest.Mock;

function makeDb(rows: any[]) {
  const observeWithColumns = jest.fn(() => ({
    subscribe: (fn: (r: any[]) => void) => {
      fn(rows);
      return { unsubscribe: jest.fn() };
    },
  }));
  const query = jest.fn(() => ({ observeWithColumns }));
  return { db: { get: jest.fn(() => ({ query })) }, query, observeWithColumns };
}

/**
 * `useCard` skips `.query()` entirely and observes a single row via `findAndObserve`.
 * The `observer` returned here is the live `{ next, error, complete }` object the hook
 * itself passed to `.subscribe(...)`, so a test can drive any of the three signals
 * (e.g. `observer.complete()` to simulate a server-side delete reconciling).
 */
function makeCardDb(row: any) {
  const unsubscribe = jest.fn();
  const observer: { next: (r: any) => void; error: (e: unknown) => void; complete: () => void } = {
    next: () => {},
    error: () => {},
    complete: () => {},
  };
  const subscribe = jest.fn((obs: typeof observer) => {
    Object.assign(observer, obs);
    obs.next(row);
    return { unsubscribe };
  });
  const findAndObserve = jest.fn(() => ({ subscribe }));
  const get = jest.fn(() => ({ findAndObserve }));
  return { db: { get }, get, findAndObserve, unsubscribe, observer };
}

beforeEach(() => jest.clearAllMocks());

describe('useBoards', () => {
  it('returns nothing and queries nothing without an account', () => {
    const { db, query } = makeDb([]);
    mockUseDatabase.mockReturnValue(db);

    const { result } = renderHook(() => useBoards(null));

    expect(result.current).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('emits the observed rows, sorted by title', async () => {
    const { db } = makeDb([{ title: 'Zeta' }, { title: 'Alpha' }]);
    mockUseDatabase.mockReturnValue(db);

    const { result } = renderHook(() => useBoards('acc-1'));

    await waitFor(() => expect(result.current.map((b: any) => b.title)).toEqual(['Alpha', 'Zeta']));
  });

  it('observes only the declared columns', () => {
    const { db, observeWithColumns } = makeDb([]);
    mockUseDatabase.mockReturnValue(db);

    renderHook(() => useBoards('acc-1'));

    expect(observeWithColumns).toHaveBeenCalledWith([
      'title',
      'color',
      'archived',
      'shared',
      'can_edit',
      'can_manage',
      'last_modified',
    ]);
  });
});

describe('useBoardCards', () => {
  it('returns nothing without a board', () => {
    const { db, query } = makeDb([]);
    mockUseDatabase.mockReturnValue(db);

    const { result } = renderHook(() => useBoardCards('acc-1', null));

    expect(result.current).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns nothing without an account', () => {
    const { db, query } = makeDb([]);
    mockUseDatabase.mockReturnValue(db);

    const { result } = renderHook(() => useBoardCards(null, 'b-local'));

    expect(result.current).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('sorts the cards by their board position', async () => {
    const { db } = makeDb([{ order: 2 }, { order: 0 }, { order: 1 }]);
    mockUseDatabase.mockReturnValue(db);

    const { result } = renderHook(() => useBoardCards('acc-1', 'b-local'));

    await waitFor(() => expect(result.current.map((c: any) => c.order)).toEqual([0, 1, 2]));
  });

  it('observes exactly the declared card columns', () => {
    const { db, observeWithColumns } = makeDb([]);
    mockUseDatabase.mockReturnValue(db);

    renderHook(() => useBoardCards('acc-1', 'b-local'));

    expect(observeWithColumns).toHaveBeenCalledWith([
      'stack_id',
      'title',
      'order',
      'color',
      'archived',
      'done_at',
      'duedate',
      'startdate',
      'attachment_count',
      'comments_count',
      'pending',
    ]);
  });
});

describe('useAccountCards', () => {
  it('returns nothing and queries nothing without an account', () => {
    const { db, query } = makeDb([]);
    mockUseDatabase.mockReturnValue(db);
    const { result } = renderHook(() => useAccountCards(null));
    expect(result.current).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('emits every card of the account', async () => {
    const { db } = makeDb([{ id: 'c1' }, { id: 'c2' }]);
    mockUseDatabase.mockReturnValue(db);
    const { result } = renderHook(() => useAccountCards('a1'));
    await waitFor(() => expect(result.current).toHaveLength(2));
  });
});

describe('useBoardStacks', () => {
  it('returns nothing and queries nothing without a board', () => {
    const { db, query } = makeDb([]);
    mockUseDatabase.mockReturnValue(db);

    const { result } = renderHook(() => useBoardStacks('acc-1', null));

    expect(result.current).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns nothing and queries nothing without an account', () => {
    const { db, query } = makeDb([]);
    mockUseDatabase.mockReturnValue(db);

    const { result } = renderHook(() => useBoardStacks(null, 'b-local'));

    expect(result.current).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('emits the observed rows, sorted by order', async () => {
    const { db } = makeDb([{ order: 2 }, { order: 0 }, { order: 1 }]);
    mockUseDatabase.mockReturnValue(db);

    const { result } = renderHook(() => useBoardStacks('acc-1', 'b-local'));

    await waitFor(() => expect(result.current.map((s: any) => s.order)).toEqual([0, 1, 2]));
  });

  it('observes exactly the declared stack columns', () => {
    const { db, observeWithColumns } = makeDb([]);
    mockUseDatabase.mockReturnValue(db);

    renderHook(() => useBoardStacks('acc-1', 'b-local'));

    expect(observeWithColumns).toHaveBeenCalledWith(['title', 'order']);
  });
});

describe('useCard', () => {
  it('returns nothing and queries nothing without an id', () => {
    const { db, get } = makeCardDb({ id: 'c-1' });
    mockUseDatabase.mockReturnValue(db);

    const { result } = renderHook(() => useCard(null));

    expect(result.current).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it('emits the observed row', async () => {
    const row = { id: 'c-1', title: 'Card One' };
    const { db } = makeCardDb(row);
    mockUseDatabase.mockReturnValue(db);

    const { result } = renderHook(() => useCard('c-1'));

    await waitFor(() => expect(result.current).toEqual(row));
  });

  // `findAndObserve` emits the SAME model instance after an in-place update,
  // so a hook that stores the row itself hands React an identical reference
  // and the setState bails out — the screen keeps showing the stale field.
  // Two emissions: React still renders once before its eager same-value
  // bail-out engages, so only the second emission tells the two apart.
  it('re-renders on every in-place update of the observed row (same reference)', () => {
    const row: any = { id: 'c-1', title: 'a' };
    const { db, observer } = makeCardDb(row);
    mockUseDatabase.mockReturnValue(db);

    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useCard('c-1');
    });
    const before = renders;

    act(() => {
      row.title = 'b';
      observer.next(row);
    });
    act(() => {
      row.title = 'c';
      observer.next(row);
    });

    expect(renders).toBe(before + 2);
    expect(result.current?.title).toBe('c');
  });

  it('resets to null when the row is deleted (subscription completes)', () => {
    const row = { id: 'c-1', title: 'Card One' };
    const { db, observer } = makeCardDb(row);
    mockUseDatabase.mockReturnValue(db);

    const { result } = renderHook(() => useCard('c-1'));
    expect(result.current).toEqual(row);

    act(() => observer.complete());

    expect(result.current).toBeNull();
  });

  it('unsubscribes when unmounted', () => {
    const { db, unsubscribe } = makeCardDb({ id: 'c-1' });
    mockUseDatabase.mockReturnValue(db);

    const { unmount } = renderHook(() => useCard('c-1'));
    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
