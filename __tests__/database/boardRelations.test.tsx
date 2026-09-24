// __tests__/database/boardRelations.test.tsx
import { renderHook, waitFor } from '@testing-library/react-native';

import { useBoardCardRelations } from '../../src/database/hooks/useBoardRelations';
import { useDatabase } from '../../src/database/DatabaseProvider';

jest.mock('../../src/database/DatabaseProvider', () => ({ useDatabase: jest.fn() }));

const mockUseDatabase = useDatabase as jest.Mock;

/**
 * `db.get(table)` dispatches to the right fixture rows by table name, but
 * `query` is the SAME shared jest.fn for every table — the count of calls to
 * it is exactly the number of observations opened, across all three tables.
 * This only works because the hook calls `.get(table).query(...).observeWith
 * Columns(...).subscribe(...)` fully, synchronously, before moving to the
 * next table, so `currentTable` is still correct when `query` reads it.
 */
function makeRelationDb({
  cardLabels,
  labels,
  assignees,
}: {
  cardLabels: any[];
  labels: any[];
  assignees: any[];
}) {
  const rowsByTable: Record<string, any[]> = { card_labels: cardLabels, labels, card_assignees: assignees };
  let currentTable = '';

  const query = jest.fn(() => ({
    observeWithColumns: jest.fn(() => ({
      subscribe: (fn: (rows: any[]) => void) => {
        fn(rowsByTable[currentTable] ?? []);
        return { unsubscribe: jest.fn() };
      },
    })),
  }));

  const get = jest.fn((table: string) => {
    currentTable = table;
    return { query };
  });

  return { db: { get }, query };
}

beforeEach(() => jest.clearAllMocks());

it('groups labels by card from a single observation', async () => {
  const { db, query } = makeRelationDb({
    cardLabels: [{ cardId: 'c1', labelId: 'l1' }, { cardId: 'c1', labelId: 'l2' }],
    labels: [{ id: 'l1', title: 'A' }, { id: 'l2', title: 'B' }],
    assignees: [],
  });
  mockUseDatabase.mockReturnValue(db);

  const { result } = renderHook(() => useBoardCardRelations('a1', 'b1'));

  await waitFor(() => expect(result.current.labelsByCard.get('c1')).toHaveLength(2));
  // Three tables, three subscriptions — never one per card.
  expect(query).toHaveBeenCalledTimes(3);
});

it('returns empty maps and queries nothing without a board', () => {
  const { db, query } = makeRelationDb({ cardLabels: [], labels: [], assignees: [] });
  mockUseDatabase.mockReturnValue(db);
  const { result } = renderHook(() => useBoardCardRelations('a1', null));
  expect(result.current.labelsByCard.size).toBe(0);
  expect(query).not.toHaveBeenCalled();
});

it('groups assignees by card from a single observation', async () => {
  const { db } = makeRelationDb({
    cardLabels: [],
    labels: [],
    assignees: [
      { cardId: 'c1', participant: 'alice', displayName: 'Alice' },
      { cardId: 'c1', participant: 'bob', displayName: 'Bob' },
    ],
  });
  mockUseDatabase.mockReturnValue(db);

  const { result } = renderHook(() => useBoardCardRelations('a1', 'b1'));

  await waitFor(() => expect(result.current.assigneesByCard.get('c1')).toHaveLength(2));
});

it('drops a card_labels join whose label is not in the board-scoped set', async () => {
  const { db } = makeRelationDb({
    cardLabels: [{ cardId: 'c1', labelId: 'other-board-label' }],
    labels: [{ id: 'l1', title: 'A' }],
    assignees: [],
  });
  mockUseDatabase.mockReturnValue(db);

  const { result } = renderHook(() => useBoardCardRelations('a1', 'b1'));

  await waitFor(() => expect(result.current.labelsByCard.size).toBe(0));
});
