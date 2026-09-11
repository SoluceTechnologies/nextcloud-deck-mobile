// __tests__/database/hooks.test.tsx
import { renderHook, waitFor } from '@testing-library/react-native';

import { useBoards, useBoardCards } from '../../src/database/hooks/useBoards';
import { useBoardStacks } from '../../src/database/hooks/useBoardContent';
import { useCard } from '../../src/database/hooks/useCard';
import { useDatabase } from '../../src/database/DatabaseProvider';
import { STACK_OBSERVED_COLUMNS } from '../../src/database/observedColumns';

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

/** `useCard` skips `.query()` entirely and observes a single row via `findAndObserve`. */
function makeCardDb(row: any) {
  const unsubscribe = jest.fn();
  const subscribe = jest.fn((observer: { next: (r: any) => void }) => {
    observer.next(row);
    return { unsubscribe };
  });
  const findAndObserve = jest.fn(() => ({ subscribe }));
  const get = jest.fn(() => ({ findAndObserve }));
  return { db: { get }, get, findAndObserve, unsubscribe };
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

    expect(observeWithColumns).toHaveBeenCalledWith(expect.arrayContaining(['title', 'color']));
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

  it('sorts the cards by their board position', async () => {
    const { db } = makeDb([{ order: 2 }, { order: 0 }, { order: 1 }]);
    mockUseDatabase.mockReturnValue(db);

    const { result } = renderHook(() => useBoardCards('acc-1', 'b-local'));

    await waitFor(() => expect(result.current.map((c: any) => c.order)).toEqual([0, 1, 2]));
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

    expect(observeWithColumns).toHaveBeenCalledWith(STACK_OBSERVED_COLUMNS);
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

  it('unsubscribes when unmounted', () => {
    const { db, unsubscribe } = makeCardDb({ id: 'c-1' });
    mockUseDatabase.mockReturnValue(db);

    const { unmount } = renderHook(() => useCard('c-1'));
    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
