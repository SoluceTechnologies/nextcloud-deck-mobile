import { renderHook, act } from '@testing-library/react-native';

import { useBoardActions } from '../../../src/features/board/hooks/useBoardActions';
import { mutate } from '../../../src/sync/outbox/enqueue';
import { useDatabase } from '../../../src/database/DatabaseProvider';

jest.mock('../../../src/sync/outbox/enqueue', () => ({ mutate: jest.fn(async () => {}) }));
jest.mock('../../../src/database/DatabaseProvider', () => ({ useDatabase: jest.fn() }));

const prepareCreate = jest.fn((fn: (r: any) => void) => {
  const row: any = { id: 'new-local' };
  fn(row);
  return row;
});
const db = { get: jest.fn(() => ({ prepareCreate })) };

beforeEach(() => {
  jest.clearAllMocks();
  (useDatabase as jest.Mock).mockReturnValue(db);
});

it('does nothing without an account rather than enqueuing an orphan intent', async () => {
  const { result } = renderHook(() => useBoardActions(null));
  await act(() => result.current.create({ title: 'X', color: null }));
  expect(mutate).not.toHaveBeenCalled();
});

it('enqueues createBoard with the local row it just prepared', async () => {
  const { result } = renderHook(() => useBoardActions('a1'));
  await act(() => result.current.create({ title: 'Commercial', color: '#0082c9' }));

  const call = (mutate as jest.Mock).mock.calls[0][0];
  expect(call.accountId).toBe('a1');
  expect(call.intent).toEqual({ kind: 'createBoard', boardId: 'new-local' });
});

// A board created offline must be findable before it has a remote id.
it('gives a newly created board an empty remote id and the given title', async () => {
  const { result } = renderHook(() => useBoardActions('a1'));
  await act(() => result.current.create({ title: 'Commercial', color: '#0082c9' }));

  const row = prepareCreate.mock.results[0].value;
  expect(row.remoteId).toBe('');
  expect(row.title).toBe('Commercial');
  expect(row.accountId).toBe('a1');
});

it('renames through updateBoard and leaves the colour alone', async () => {
  const update = jest.fn((fn: (r: any) => void) => { const r: any = {}; fn(r); return r; });
  const board: any = { id: 'b1', title: 'Old', color: '#ff0000', archived: false, prepareUpdate: update };

  const { result } = renderHook(() => useBoardActions('a1'));
  await act(() => result.current.rename(board, 'New'));

  const call = (mutate as jest.Mock).mock.calls[0][0];
  expect(call.intent.kind).toBe('updateBoard');
  expect(call.intent.title).toBe('New');
  expect(call.intent.color).toBe('#ff0000');
});

it('update applies a rename and a recolour as a single mutate call', async () => {
  const prepareUpdate = jest.fn((fn: (r: any) => void) => { const r: any = {}; fn(r); return r; });
  const board: any = { id: 'b1', title: 'Old', color: '#ff0000', archived: false, prepareUpdate };

  const { result } = renderHook(() => useBoardActions('a1'));
  await act(() => result.current.update(board, { title: 'New', color: '#00ff00' }));

  expect(mutate).toHaveBeenCalledTimes(1);
  const call = (mutate as jest.Mock).mock.calls[0][0];
  expect(call.intent.kind).toBe('updateBoard');
  expect(call.intent.title).toBe('New');
  expect(call.intent.color).toBe('#00ff00');
});

it('update with only a colour change clears the colour and keeps the title', async () => {
  const prepareUpdate = jest.fn((fn: (r: any) => void) => { const r: any = {}; fn(r); return r; });
  const board: any = { id: 'b1', title: 'Keep', color: '#ff0000', archived: false, prepareUpdate };

  const { result } = renderHook(() => useBoardActions('a1'));
  await act(() => result.current.update(board, { color: null }));

  expect(mutate).toHaveBeenCalledTimes(1);
  const call = (mutate as jest.Mock).mock.calls[0][0];
  expect(call.intent.title).toBe('Keep');
  expect(call.intent.color).toBeNull();
});

it('archives through updateBoard rather than deleting', async () => {
  const update = jest.fn((fn: (r: any) => void) => { const r: any = {}; fn(r); return r; });
  const board: any = { id: 'b1', title: 'B', color: null, archived: false, prepareUpdate: update };

  const { result } = renderHook(() => useBoardActions('a1'));
  await act(() => result.current.setArchived(board, true));

  expect((mutate as jest.Mock).mock.calls[0][0].intent.archived).toBe(true);
});

it('marks the row deleted locally when removing', async () => {
  const markDeleted = jest.fn(() => ({ op: 'delete' }));
  const board: any = { id: 'b1', remoteId: '7', prepareMarkAsDeleted: markDeleted };

  const { result } = renderHook(() => useBoardActions('a1'));
  await act(() => result.current.remove(board));

  await (mutate as jest.Mock).mock.calls[0][0].applyLocal();
  expect(markDeleted).toHaveBeenCalled();
});
