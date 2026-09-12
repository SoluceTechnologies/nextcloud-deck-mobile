import { renderHook, act } from '@testing-library/react-native';

import { useStackActions } from '../../../src/features/board/hooks/useStackActions';
import { mutate } from '../../../src/sync/outbox/enqueue';
import { useDatabase } from '../../../src/database/DatabaseProvider';

jest.mock('../../../src/sync/outbox/enqueue', () => ({ mutate: jest.fn(async () => {}) }));
jest.mock('../../../src/database/DatabaseProvider', () => ({ useDatabase: jest.fn() }));

let queryResult: any[] = [];
const query = jest.fn(() => ({ fetch: jest.fn(async () => queryResult) }));
const prepareCreate = jest.fn((fn: (r: any) => void) => {
  const row: any = { id: 'new-local' };
  fn(row);
  return row;
});
const find = jest.fn(async (id: string) => ({ id, remoteId: `remote-${id}` }));
const db = { get: jest.fn(() => ({ query, prepareCreate, find })) };

beforeEach(() => {
  jest.clearAllMocks();
  (useDatabase as jest.Mock).mockReturnValue(db);
  queryResult = [];
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
  queryResult = [{ order: 0 }, { order: 3 }, { order: 1 }];

  await act(() => result.current.create('New list'));

  expect(prepareCreate.mock.results[0].value.order).toBe(4);
});

it('gives the first stack of an empty board order zero', async () => {
  const { result } = renderHook(() => useStackActions('a1', 'b1'));
  queryResult = [];

  await act(() => result.current.create('First'));

  expect(prepareCreate.mock.results[0].value.order).toBe(0);
});

it('enqueues createStack with the local row it just prepared', async () => {
  const { result } = renderHook(() => useStackActions('a1', 'b1'));
  queryResult = [];

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

// Coalescing (not this hook) is what collapses a create+delete pair for a row that
// never reached the server — the hook must always enqueue.
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
