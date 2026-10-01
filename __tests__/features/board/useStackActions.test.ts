import { renderHook, act } from '@testing-library/react-native';

import { useStackActions } from '../../../src/features/board/hooks/useStackActions';
import { mutate } from '../../../src/sync/outbox/enqueue';
import { useDatabase } from '../../../src/database/DatabaseProvider';

jest.mock('../../../src/sync/outbox/enqueue', () => ({
  mutate: jest.fn(async () => {}),
  OUTBOX_QUEUED: 'queued',
}));
jest.mock('../../../src/database/DatabaseProvider', () => ({ useDatabase: jest.fn() }));

const prepareCreate = jest.fn((fn: (r: any) => void) => {
  const row: any = { id: 'new-local' };
  fn(row);
  return row;
});
const find = jest.fn(async (id: string) => ({ id, remoteId: `remote-${id}` }));
let rowsByTable: Record<string, any[]> = {};
const db = {
  get: jest.fn((table: string) => ({
    prepareCreate,
    find,
    query: jest.fn((...clauses: any[]) => ({
      fetch: jest.fn(async () => {
        const ids = clauses.find((c) => c.left === 'entity_id')?.comparison.right.values;
        return (rowsByTable[table] ?? []).filter((r) => !ids || ids.includes(r.entityId));
      }),
    })),
  })),
};

beforeEach(() => {
  jest.clearAllMocks();
  (useDatabase as jest.Mock).mockReturnValue(db);
  rowsByTable = {};
});

it('does nothing without an account rather than enqueuing an orphan intent', async () => {
  const { result } = renderHook(() => useStackActions(null, 'b1'));
  await act(() => result.current.create('New list'));
  expect(mutate).not.toHaveBeenCalled();
});

it('does nothing without a board', async () => {
  const { result } = renderHook(() => useStackActions('a1', null));
  await act(() => result.current.create('New list'));
  expect(mutate).not.toHaveBeenCalled();
});

it('appends a new stack after the last one on the board', async () => {
  const { result } = renderHook(() => useStackActions('a1', 'b1'));
  rowsByTable.stacks = [{ order: 0 }, { order: 3 }, { order: 1 }];

  await act(() => result.current.create('New list'));

  expect(prepareCreate.mock.results[0].value.order).toBe(4);
});

it('gives the first stack of an empty board order zero', async () => {
  const { result } = renderHook(() => useStackActions('a1', 'b1'));
  rowsByTable.stacks = [];

  await act(() => result.current.create('First'));

  expect(prepareCreate.mock.results[0].value.order).toBe(0);
});

it('enqueues createStack with the local row it just prepared', async () => {
  const { result } = renderHook(() => useStackActions('a1', 'b1'));
  rowsByTable.stacks = [];

  await act(() => result.current.create('First'));

  const call = (mutate as jest.Mock).mock.calls[0][0];
  expect(call.accountId).toBe('a1');
  expect(call.intent).toEqual({ kind: 'createStack', stackId: 'new-local' });
  const row = prepareCreate.mock.results[0].value;
  expect(row.boardId).toBe('b1');
  expect(row.remoteId).toBe('');
  expect(row.title).toBe('First');
});

it('renames through updateStack carrying the current order', async () => {
  const prepareUpdate = jest.fn((fn: any) => { const r: any = {}; fn(r); return r; });
  const stack: any = { id: 's1', title: 'Old', order: 2, remoteId: 'r1', prepareUpdate };

  const { result } = renderHook(() => useStackActions('a1', 'b1'));
  await act(() => result.current.rename(stack, 'New'));

  const call = (mutate as jest.Mock).mock.calls[0][0];
  expect(call.intent).toEqual({ kind: 'updateStack', stackId: 's1', title: 'New', order: 2 });
  const row = await call.applyLocal();
  expect(row.title).toBe('New');
});

it('marks the stack deleted locally and enqueues deleteStack with both remote ids', async () => {
  const markDeleted = jest.fn(() => ({ op: 'delete' }));
  const stack: any = {
    id: 's1',
    boardId: 'b1',
    remoteId: 'stack-remote',
    prepareMarkAsDeleted: markDeleted,
  };

  const { result } = renderHook(() => useStackActions('a1', 'b1'));
  await act(() => result.current.remove(stack));

  const call = (mutate as jest.Mock).mock.calls[0][0];
  expect(call.intent).toEqual({
    kind: 'deleteStack',
    stackId: 's1',
    boardRemoteId: 'remote-b1',
    stackRemoteId: 'stack-remote',
  });

  await call.applyLocal();
  expect(markDeleted).toHaveBeenCalled();
});

it('enqueues deleteStack even when the stack never synced', async () => {
  const stack: any = {
    id: 's1',
    boardId: 'b1',
    remoteId: '',
    prepareMarkAsDeleted: jest.fn(() => ({ op: 'delete' })),
  };

  const { result } = renderHook(() => useStackActions('a1', 'b1'));
  await act(() => result.current.remove(stack));

  expect(mutate).toHaveBeenCalledTimes(1);
  expect((mutate as jest.Mock).mock.calls[0][0].intent.stackRemoteId).toBe('');
});

it('marks the stack’s card rows deleted along with it, in one batch', async () => {
  const stack: any = {
    id: 's1',
    boardId: 'b1',
    remoteId: 'stack-remote',
    prepareMarkAsDeleted: () => ({ op: 'delete', table: 'stacks' }),
  };
  rowsByTable = {
    cards: [{ id: 'c1', prepareMarkAsDeleted: () => ({ op: 'delete', table: 'cards' }) }],
  };

  const { result } = renderHook(() => useStackActions('a1', 'b1'));
  await act(() => result.current.remove(stack));

  const ops = await (mutate as jest.Mock).mock.calls[0][0].applyLocal();
  expect(ops).toEqual([
    { op: 'delete', table: 'stacks' },
    { op: 'delete', table: 'cards' },
  ]);
});

it('drops the queued intents of the cascaded cards, and no other', async () => {
  const mine = {
    id: 'o1',
    entityId: 'c1',
    prepareDestroyPermanently: jest.fn(() => ({ op: 'destroy', table: 'outbox' })),
  };
  const foreign = { id: 'o2', entityId: 'c-elsewhere', prepareDestroyPermanently: jest.fn() };
  rowsByTable = {
    cards: [{ id: 'c1', prepareMarkAsDeleted: () => ({ op: 'delete', table: 'cards' }) }],
    outbox: [mine, foreign],
  };
  const stack: any = {
    id: 's1',
    boardId: 'b1',
    remoteId: 'stack-remote',
    prepareMarkAsDeleted: () => ({ op: 'delete', table: 'stacks' }),
  };

  const { result } = renderHook(() => useStackActions('a1', 'b1'));
  await act(() => result.current.remove(stack));

  const ops = await (mutate as jest.Mock).mock.calls[0][0].applyLocal();
  expect(mine.prepareDestroyPermanently).toHaveBeenCalled();
  expect(foreign.prepareDestroyPermanently).not.toHaveBeenCalled();
  expect(ops).toContainEqual({ op: 'destroy', table: 'outbox' });
});

describe('move', () => {
  const row = (id: string, order: number) => ({
    id,
    title: id.toUpperCase(),
    order,
    prepareUpdate: jest.fn((fn: any) => {
      const r: any = {};
      fn(r);
      return { id, order: r.order };
    }),
  });

  it('renumbers every shifted list and applies all local orders in the first write', async () => {
    const a = row('a', 0), b = row('b', 1), c = row('c', 2), d = row('d', 5);
    rowsByTable.stacks = [c, a, d, b];

    const { result } = renderHook(() => useStackActions('a1', 'b1'));
    await act(() => result.current.move(d as any, 0));

    const calls = (mutate as jest.Mock).mock.calls.map(([p]) => p);
    expect(calls.map((p) => p.intent)).toEqual([
      { kind: 'updateStack', stackId: 'd', title: 'D', order: 0 },
      { kind: 'updateStack', stackId: 'a', title: 'A', order: 1 },
      { kind: 'updateStack', stackId: 'b', title: 'B', order: 2 },
      { kind: 'updateStack', stackId: 'c', title: 'C', order: 3 },
    ]);
    expect(await calls[0].applyLocal()).toEqual([
      { id: 'd', order: 0 },
      { id: 'a', order: 1 },
      { id: 'b', order: 2 },
      { id: 'c', order: 3 },
    ]);
    for (const later of calls.slice(1)) expect(await later.applyLocal()).toEqual([]);
  });

  it('leaves lists that keep their order alone', async () => {
    const a = row('a', 0), b = row('b', 1), c = row('c', 2);
    rowsByTable.stacks = [a, b, c];

    const { result } = renderHook(() => useStackActions('a1', 'b1'));
    await act(() => result.current.move(c as any, 1));

    expect((mutate as jest.Mock).mock.calls.map(([p]) => p.intent.stackId)).toEqual(['c', 'b']);
  });

  it('does nothing when dropped back on its own position', async () => {
    const a = row('a', 0), b = row('b', 1);
    rowsByTable.stacks = [a, b];

    const { result } = renderHook(() => useStackActions('a1', 'b1'));
    await act(() => result.current.move(b as any, 1));

    expect(mutate).not.toHaveBeenCalled();
  });
});
