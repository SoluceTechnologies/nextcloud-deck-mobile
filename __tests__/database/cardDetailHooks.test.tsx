// __tests__/database/cardDetailHooks.test.tsx
import { renderHook, waitFor } from '@testing-library/react-native';

import { useCardComments, useCardAttachments } from '../../src/database/hooks/useCardDetail';
import { useDatabase } from '../../src/database/DatabaseProvider';

jest.mock('../../src/database/DatabaseProvider', () => ({ useDatabase: jest.fn() }));

const mockUseDatabase = useDatabase as jest.Mock;

/** Single-table observation, shaped like makeDb in cardRelations.test.tsx, plus a
 * shared `unsubscribe` spy so a test can assert unmount tears the subscription down. */
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

beforeEach(() => jest.clearAllMocks());

describe('useCardComments', () => {
  it('returns nothing and queries nothing without an account', () => {
    const { db, query } = makeDb([]);
    mockUseDatabase.mockReturnValue(db);
    const { result } = renderHook(() => useCardComments(null, 'c1'));
    expect(result.current).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns nothing and queries nothing without a card', () => {
    const { db, query } = makeDb([]);
    mockUseDatabase.mockReturnValue(db);
    const { result } = renderHook(() => useCardComments('a1', null));
    expect(result.current).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('emits the observed rows sorted oldest first', async () => {
    const { db } = makeDb([
      { id: 'c2', createdAt: 200, message: 'second' },
      { id: 'c1', createdAt: 100, message: 'first' },
    ]);
    mockUseDatabase.mockReturnValue(db);
    const { result } = renderHook(() => useCardComments('a1', 'c1'));
    await waitFor(() => expect(result.current.map((c: any) => c.message)).toEqual(['first', 'second']));
  });

  it('unsubscribes when unmounted', () => {
    const { db, unsubscribe } = makeDb([]);
    mockUseDatabase.mockReturnValue(db);
    const { unmount } = renderHook(() => useCardComments('a1', 'c1'));
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('useCardAttachments', () => {
  it('returns nothing and queries nothing without an account', () => {
    const { db, query } = makeDb([]);
    mockUseDatabase.mockReturnValue(db);
    const { result } = renderHook(() => useCardAttachments(null, 'c1'));
    expect(result.current).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns nothing and queries nothing without a card', () => {
    const { db, query } = makeDb([]);
    mockUseDatabase.mockReturnValue(db);
    const { result } = renderHook(() => useCardAttachments('a1', null));
    expect(result.current).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('emits the observed rows sorted by createdAt', async () => {
    const { db } = makeDb([
      { id: 'a2', createdAt: 200, fileName: 'b.jpg' },
      { id: 'a1', createdAt: 100, fileName: 'a.jpg' },
    ]);
    mockUseDatabase.mockReturnValue(db);
    const { result } = renderHook(() => useCardAttachments('a1', 'c1'));
    await waitFor(() => expect(result.current.map((a: any) => a.fileName)).toEqual(['a.jpg', 'b.jpg']));
  });

  it('unsubscribes when unmounted', () => {
    const { db, unsubscribe } = makeDb([]);
    mockUseDatabase.mockReturnValue(db);
    const { unmount } = renderHook(() => useCardAttachments('a1', 'c1'));
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
