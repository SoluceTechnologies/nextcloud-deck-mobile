import { renderHook, waitFor } from '@testing-library/react-native';

import { useRecentBoards } from '../../src/database/hooks/useRecentBoards';
import { useBoards } from '../../src/database/hooks/useBoards';
import { useDatabase } from '../../src/database/DatabaseProvider';

jest.mock('../../src/database/DatabaseProvider', () => ({ useDatabase: jest.fn() }));
// The hook composes useBoards (already non-archived) rather than querying
// boards itself, so this test drives it directly instead of the database.
jest.mock('../../src/database/hooks/useBoards', () => ({ useBoards: jest.fn() }));

const mockUseDatabase = useDatabase as jest.Mock;
const mockUseBoards = useBoards as jest.Mock;

/**
 * Single-table cousin of boardRelations.test.tsx's makeRelationDb: one
 * `recent_boards` observation only, so `query`'s call count is exactly the
 * number of subscriptions opened.
 */
function makeRecentBoardsDb(rows: any[]) {
  const query = jest.fn(() => ({
    observeWithColumns: jest.fn(() => ({
      subscribe: (fn: (rows: any[]) => void) => {
        fn(rows);
        return { unsubscribe: jest.fn() };
      },
    })),
  }));
  const get = jest.fn(() => ({ query }));
  return { db: { get }, query };
}

beforeEach(() => jest.clearAllMocks());

it('returns nothing and queries nothing without an account', () => {
  const { db, query } = makeRecentBoardsDb([]);
  mockUseDatabase.mockReturnValue(db);
  mockUseBoards.mockReturnValue([]);

  const { result } = renderHook(() => useRecentBoards(null));

  expect(result.current).toEqual([]);
  expect(query).not.toHaveBeenCalled();
});

it('orders boards by most recently opened', async () => {
  const b1 = { id: 'b1', title: 'B1' };
  const b2 = { id: 'b2', title: 'B2' };
  const { db } = makeRecentBoardsDb([
    { boardId: 'b1', openedAt: 1 },
    { boardId: 'b2', openedAt: 5 },
  ]);
  mockUseDatabase.mockReturnValue(db);
  mockUseBoards.mockReturnValue([b1, b2]);

  const { result } = renderHook(() => useRecentBoards('a1'));

  await waitFor(() => expect(result.current.map((b: any) => b.id)).toEqual(['b2', 'b1']));
});

it('drops a recent entry whose board is gone or archived', async () => {
  // useBoards already filters out archived boards, so a boardId useBoards
  // doesn't return covers both "deleted" and "archived" the same way.
  const b1 = { id: 'b1', title: 'B1' };
  const { db } = makeRecentBoardsDb([
    { boardId: 'gone', openedAt: 9 },
    { boardId: 'b1', openedAt: 1 },
  ]);
  mockUseDatabase.mockReturnValue(db);
  mockUseBoards.mockReturnValue([b1]);

  const { result } = renderHook(() => useRecentBoards('a1'));

  await waitFor(() => expect(result.current.map((b: any) => b.id)).toEqual(['b1']));
});
