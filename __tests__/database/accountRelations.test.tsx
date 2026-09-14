// __tests__/database/accountRelations.test.tsx
import { renderHook, waitFor } from '@testing-library/react-native';

import { groupRelations } from '../../src/database/hooks/groupRelations';
import {
  useAccountCardRelations,
  useAccountLabels,
  useAccountStacks,
} from '../../src/database/hooks/useAccountRelations';
import { useDatabase } from '../../src/database/DatabaseProvider';

jest.mock('../../src/database/DatabaseProvider', () => ({ useDatabase: jest.fn() }));

const mockUseDatabase = useDatabase as jest.Mock;

/**
 * Copied from boardRelations.test.tsx's makeRelationDb (a `db.get(table)`
 * dispatcher by table name with one shared `query` spy — the count of calls
 * to it is the number of observations opened, across all tables) and
 * extended with `stacks` rows plus a shared `unsubscribe` spy so unmount
 * tests can assert every open subscription was torn down.
 */
function makeRelationDb({
  cardLabels,
  labels,
  assignees,
  stacks,
}: {
  cardLabels: any[];
  labels: any[];
  assignees: any[];
  stacks: any[];
}) {
  const rowsByTable: Record<string, any[]> = {
    card_labels: cardLabels,
    labels,
    card_assignees: assignees,
    stacks,
  };
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

const emptyRows = { cardLabels: [], labels: [], assignees: [], stacks: [] };

beforeEach(() => jest.clearAllMocks());

describe('useAccountStacks', () => {
  it('returns nothing and queries nothing without an account', () => {
    const { db, query } = makeRelationDb(emptyRows);
    mockUseDatabase.mockReturnValue(db);

    const { result } = renderHook(() => useAccountStacks(null));

    expect(result.current).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('emits every stack of the account sorted by order', async () => {
    const { db } = makeRelationDb({ ...emptyRows, stacks: [{ order: 2 }, { order: 0 }] });
    mockUseDatabase.mockReturnValue(db);

    const { result } = renderHook(() => useAccountStacks('a1'));

    await waitFor(() => expect(result.current.map((s: any) => s.order)).toEqual([0, 2]));
  });

  it('unsubscribes on unmount', () => {
    const { db, unsubscribe } = makeRelationDb(emptyRows);
    mockUseDatabase.mockReturnValue(db);

    const { unmount } = renderHook(() => useAccountStacks('a1'));
    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('useAccountLabels', () => {
  it('returns nothing and queries nothing without an account', () => {
    const { db, query } = makeRelationDb(emptyRows);
    mockUseDatabase.mockReturnValue(db);

    const { result } = renderHook(() => useAccountLabels(null));

    expect(result.current).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('emits every label of the account', async () => {
    const { db } = makeRelationDb({
      ...emptyRows,
      labels: [{ id: 'l1', title: 'A' }, { id: 'l2', title: 'B' }],
    });
    mockUseDatabase.mockReturnValue(db);

    const { result } = renderHook(() => useAccountLabels('a1'));

    await waitFor(() => expect(result.current).toHaveLength(2));
  });

  it('unsubscribes on unmount', () => {
    const { db, unsubscribe } = makeRelationDb(emptyRows);
    mockUseDatabase.mockReturnValue(db);

    const { unmount } = renderHook(() => useAccountLabels('a1'));
    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('useAccountCardRelations', () => {
  it('groups labels and assignees by card from three subscriptions', async () => {
    const { db, query } = makeRelationDb({
      cardLabels: [{ cardId: 'c1', labelId: 'l1' }, { cardId: 'c1', labelId: 'l2' }],
      labels: [{ id: 'l1', title: 'A' }, { id: 'l2', title: 'B' }],
      assignees: [{ cardId: 'c1', participant: 'alice' }],
      stacks: [],
    });
    mockUseDatabase.mockReturnValue(db);

    const { result } = renderHook(() => useAccountCardRelations('a1'));

    await waitFor(() => expect(result.current.labelsByCard.get('c1')).toHaveLength(2));
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('drops a join whose label is not cached', async () => {
    const { db } = makeRelationDb({
      cardLabels: [{ cardId: 'c1', labelId: 'not-cached' }],
      labels: [{ id: 'l1', title: 'A' }],
      assignees: [],
      stacks: [],
    });
    mockUseDatabase.mockReturnValue(db);

    const { result } = renderHook(() => useAccountCardRelations('a1'));

    await waitFor(() => expect(result.current.labelsByCard.size).toBe(0));
  });

  it('returns empty maps and queries nothing without an account', () => {
    const { db, query } = makeRelationDb(emptyRows);
    mockUseDatabase.mockReturnValue(db);

    const { result } = renderHook(() => useAccountCardRelations(null));

    expect(result.current.labelsByCard.size).toBe(0);
    expect(result.current.assigneesByCard.size).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('groupRelations', () => {
  it('is what useBoardCardRelations uses', () => {
    const { labelsByCard, assigneesByCard } = groupRelations(
      [{ cardId: 'c1', labelId: 'l1' }, { cardId: 'c1', labelId: 'missing' }] as any,
      [{ id: 'l1', title: 'A' }] as any,
      [{ cardId: 'c1', participant: 'alice' }] as any,
    );

    expect(labelsByCard.get('c1')).toEqual([{ id: 'l1', title: 'A' }]);
    expect(assigneesByCard.get('c1')).toEqual([{ cardId: 'c1', participant: 'alice' }]);
  });
});
