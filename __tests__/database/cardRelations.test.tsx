// __tests__/database/cardRelations.test.tsx
import { renderHook, waitFor } from '@testing-library/react-native';

import { useBoardLabels, useCardLabels, useCardAssignees } from '../../src/database/hooks/useCardRelations';
import { useDatabase } from '../../src/database/DatabaseProvider';

jest.mock('../../src/database/DatabaseProvider', () => ({ useDatabase: jest.fn() }));

const mockUseDatabase = useDatabase as jest.Mock;

/** Single-table observation, shaped like makeDb in hooks.test.tsx, plus a shared
 * `unsubscribe` spy so a test can assert unmount tears the subscription down. */
function makeDb(rows: any[]) {
  const unsubscribe = jest.fn();
  const observeWithColumns = jest.fn(() => ({
    subscribe: (fn: (r: any[]) => void) => {
      fn(rows);
      return { unsubscribe };
    },
  }));
  const query = jest.fn(() => ({ observeWithColumns }));
  return { db: { get: jest.fn(() => ({ query })) }, query, observeWithColumns, unsubscribe };
}

/**
 * `db.get(table)` dispatches to the right fixture rows by table name, mirroring
 * makeRelationDb in boardRelations.test.tsx, but for the two tables useCardLabels
 * joins (`card_labels`, `labels`).
 */
function makeJoinDb({ cardLabels, labels }: { cardLabels: any[]; labels: any[] }) {
  const rowsByTable: Record<string, any[]> = { card_labels: cardLabels, labels };
  let currentTable = '';
  const unsubscribe = jest.fn();

  const query = jest.fn(() => ({
    observeWithColumns: jest.fn(() => ({
      subscribe: (fn: (rows: any[]) => void) => {
        fn(rowsByTable[currentTable] ?? []);
        return { unsubscribe };
      },
    })),
  }));

  const get = jest.fn((table: string) => {
    currentTable = table;
    return { query };
  });

  return { db: { get }, query, unsubscribe };
}

beforeEach(() => jest.clearAllMocks());

describe('useBoardLabels', () => {
  it('returns nothing and queries nothing without an account', () => {
    const { db, query } = makeDb([]);
    mockUseDatabase.mockReturnValue(db);
    const { result } = renderHook(() => useBoardLabels(null, 'b1'));
    expect(result.current).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns nothing and queries nothing without a board', () => {
    const { db, query } = makeDb([]);
    mockUseDatabase.mockReturnValue(db);
    const { result } = renderHook(() => useBoardLabels('a1', null));
    expect(result.current).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('emits the observed rows, sorted by title', async () => {
    const { db } = makeDb([{ title: 'Zeta' }, { title: 'Alpha' }]);
    mockUseDatabase.mockReturnValue(db);
    const { result } = renderHook(() => useBoardLabels('a1', 'b1'));
    await waitFor(() => expect(result.current.map((l: any) => l.title)).toEqual(['Alpha', 'Zeta']));
  });

  it('unsubscribes when unmounted', () => {
    const { db, unsubscribe } = makeDb([]);
    mockUseDatabase.mockReturnValue(db);
    const { unmount } = renderHook(() => useBoardLabels('a1', 'b1'));
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('useCardAssignees', () => {
  it('returns nothing and queries nothing without an account', () => {
    const { db, query } = makeDb([]);
    mockUseDatabase.mockReturnValue(db);
    const { result } = renderHook(() => useCardAssignees(null, 'c1'));
    expect(result.current).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns nothing and queries nothing without a card', () => {
    const { db, query } = makeDb([]);
    mockUseDatabase.mockReturnValue(db);
    const { result } = renderHook(() => useCardAssignees('a1', null));
    expect(result.current).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('emits the observed rows', async () => {
    const { db } = makeDb([{ participant: 'alice' }, { participant: 'bob' }]);
    mockUseDatabase.mockReturnValue(db);
    const { result } = renderHook(() => useCardAssignees('a1', 'c1'));
    await waitFor(() => expect(result.current).toHaveLength(2));
  });

  it('unsubscribes when unmounted', () => {
    const { db, unsubscribe } = makeDb([]);
    mockUseDatabase.mockReturnValue(db);
    const { unmount } = renderHook(() => useCardAssignees('a1', 'c1'));
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('useCardLabels', () => {
  it('returns nothing and queries nothing without an account', () => {
    const { db, query } = makeJoinDb({ cardLabels: [], labels: [] });
    mockUseDatabase.mockReturnValue(db);
    const { result } = renderHook(() => useCardLabels(null, 'c1'));
    expect(result.current).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns nothing and queries nothing without a card', () => {
    const { db, query } = makeJoinDb({ cardLabels: [], labels: [] });
    mockUseDatabase.mockReturnValue(db);
    const { result } = renderHook(() => useCardLabels('a1', null));
    expect(result.current).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('unsubscribes both observations when unmounted', () => {
    const { db, unsubscribe } = makeJoinDb({ cardLabels: [], labels: [] });
    mockUseDatabase.mockReturnValue(db);
    const { unmount } = renderHook(() => useCardLabels('a1', 'c1'));
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(2);
  });

  it('resolves the joined label rows, not the join rows', async () => {
    const { db } = makeJoinDb({
      cardLabels: [{ cardId: 'c1', labelId: 'l1' }],
      labels: [{ id: 'l1', title: 'FACTURATION', color: '#ff0000' }],
    });
    mockUseDatabase.mockReturnValue(db);

    const { result } = renderHook(() => useCardLabels('a1', 'c1'));
    await waitFor(() => expect(result.current[0].title).toBe('FACTURATION'));
  });

  // A join whose label has not synced yet must not render a blank chip.
  it('drops a join whose label row is not in the cache', async () => {
    const { db } = makeJoinDb({
      cardLabels: [{ cardId: 'c1', labelId: 'missing' }],
      labels: [],
    });
    mockUseDatabase.mockReturnValue(db);

    const { result } = renderHook(() => useCardLabels('a1', 'c1'));
    await waitFor(() => expect(result.current).toEqual([]));
  });
});
