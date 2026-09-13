import { renderHook, act } from '@testing-library/react-native';

import { useCardActions } from '../../../src/features/board/hooks/useCardActions';
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
// Generic enough for both `boards` and `stacks` lookups: echoes a remote id (and,
// for a stack lookup, a board id) derived from whatever local id it was asked to find.
const find = jest.fn(async (id: string) => ({ id, remoteId: `remote-${id}`, boardId: `board-${id}` }));
const db = { get: jest.fn(() => ({ query, prepareCreate, find })) };

beforeEach(() => {
  jest.clearAllMocks();
  (useDatabase as jest.Mock).mockReturnValue(db);
  queryResult = [];
});

it('does nothing without an account rather than enqueuing an orphan intent', async () => {
  const { result } = renderHook(() => useCardActions(null));
  await act(() =>
    result.current.create({ boardLocalId: 'b1', stackLocalId: 's1', title: 'New' }),
  );
  expect(mutate).not.toHaveBeenCalled();
});

it('appends a new card after the last one in the stack', async () => {
  const { result } = renderHook(() => useCardActions('a1'));
  queryResult = [{ order: 0 }, { order: 4 }, { order: 2 }];

  await act(() => result.current.create({
    boardLocalId: 'b1', stackLocalId: 's1', title: 'New',
  }));

  expect(prepareCreate.mock.results[0].value.order).toBe(5);
});

it('gives the first card of an empty stack order zero', async () => {
  const { result } = renderHook(() => useCardActions('a1'));
  queryResult = [];

  await act(() => result.current.create({
    boardLocalId: 'b1', stackLocalId: 's1', title: 'First',
  }));

  expect(prepareCreate.mock.results[0].value.order).toBe(0);
});

it('marks a card pending so the board can show it as not yet synced', async () => {
  const { result } = renderHook(() => useCardActions('a1'));
  queryResult = [];
  await act(() => result.current.create({
    boardLocalId: 'b1', stackLocalId: 's1', title: 'First',
  }));
  expect(prepareCreate.mock.results[0].value.pending).toBe(true);
});

it('enqueues createCard with the local row it just prepared', async () => {
  const { result } = renderHook(() => useCardActions('a1'));
  queryResult = [];
  await act(() => result.current.create({
    boardLocalId: 'b1', stackLocalId: 's1', title: 'First',
  }));

  const call = (mutate as jest.Mock).mock.calls[0][0];
  expect(call.accountId).toBe('a1');
  expect(call.intent).toEqual({ kind: 'createCard', cardId: 'new-local' });
  expect(await call.applyLocal()).toBe(prepareCreate.mock.results[0].value);
});

it('names only the changed fields on a patch intent', async () => {
  const { result } = renderHook(() => useCardActions('a1'));
  const card: any = { id: 'c1', prepareUpdate: (fn: any) => { const r: any = {}; fn(r); return r; } };

  await act(() => result.current.patch(card, { title: 'Renamed' }));

  expect((mutate as jest.Mock).mock.calls[0][0].intent.fields).toEqual(['title']);
});

it('enqueues nothing when every patched field is undefined', async () => {
  const { result } = renderHook(() => useCardActions('a1'));
  const card: any = { id: 'c1', prepareUpdate: (fn: any) => { const r: any = {}; fn(r); return r; } };

  await act(() => result.current.patch(card, { title: undefined }));

  expect(mutate).not.toHaveBeenCalled();
});

it('captures the last-known values as intent.base before applying the local change', async () => {
  const { result } = renderHook(() => useCardActions('a1'));
  const card: any = {
    id: 'c1',
    title: 'Old title',
    color: '#ff0000',
    prepareUpdate: (fn: any) => { const r: any = {}; fn(r); return r; },
  };

  await act(() => result.current.patch(card, { title: 'New title', color: null }));

  const call = (mutate as jest.Mock).mock.calls[0][0];
  expect(call.intent.kind).toBe('patchCard');
  expect(call.intent.fields).toEqual(['title', 'color']);
  expect(call.intent.base).toEqual({ title: 'Old title', color: '#ff0000' });

  const row = await call.applyLocal();
  expect(row.title).toBe('New title');
  expect(row.color).toBeUndefined();
});

// setDone writes a timestamp, not a boolean — the column is done_at. patchCard carries
// no `values` (R20): assert the prepared row and the protected field name instead.
it('stamps doneAt when marking done and clears it when un-marking', async () => {
  const { result } = renderHook(() => useCardActions('a1'));
  const card: any = { id: 'c1', prepareUpdate: (fn: any) => { const r: any = {}; fn(r); return r; } };

  await act(() => result.current.setDone(card, true));
  const first = (mutate as jest.Mock).mock.calls[0][0];
  expect(first.intent.fields).toEqual(['doneAt']);
  const firstRow = await first.applyLocal();
  expect(typeof firstRow.doneAt).toBe('number');

  await act(() => result.current.setDone(card, false));
  const second = (mutate as jest.Mock).mock.calls[1][0];
  const secondRow = await second.applyLocal();
  expect(secondRow.doneAt).toBeUndefined();
});

// Deck stores `done` at second precision and echoes it without milliseconds; a
// ms-precise base would differ from the echoed value and read as a conflict.
it('stamps doneAt at the second Deck will echo, never with milliseconds', async () => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_123);
  const { result } = renderHook(() => useCardActions('a1'));
  const card: any = { id: 'c1', prepareUpdate: (fn: any) => { const r: any = {}; fn(r); return r; } };

  await act(() => result.current.setDone(card, true));

  const row = await (mutate as jest.Mock).mock.calls[0][0].applyLocal();
  expect(row.doneAt).toBe(1_700_000_000_000);
  now.mockRestore();
});

it('moves a card to another stack at the given order', async () => {
  const { result } = renderHook(() => useCardActions('a1'));
  const card: any = { id: 'c1', prepareUpdate: (fn: any) => { const r: any = {}; fn(r); return r; } };

  await act(() => result.current.move(card, 's2', 3));

  const call = (mutate as jest.Mock).mock.calls[0][0];
  expect(call.intent).toEqual({ kind: 'moveCard', cardId: 'c1', toStackId: 's2', order: 3 });
  const row = await call.applyLocal();
  expect(row.stackId).toBe('s2');
  expect(row.order).toBe(3);
});

// R30: a move to another board's list must not leave the local row pointing at its
// old board — order is computed the same way create() does (append to the end).
it('appends after the target stack’s last card and adopts its board when no order is given', async () => {
  const { result } = renderHook(() => useCardActions('a1'));
  const card: any = { id: 'c1', prepareUpdate: (fn: any) => { const r: any = {}; fn(r); return r; } };
  queryResult = [{ order: 0 }, { order: 4 }, { order: 2 }];

  await act(() => result.current.move(card, 's2'));

  const call = (mutate as jest.Mock).mock.calls[0][0];
  expect(call.intent).toEqual({ kind: 'moveCard', cardId: 'c1', toStackId: 's2', order: 5 });
  const row = await call.applyLocal();
  expect(row.boardId).toBe('board-s2');
  expect(row.stackId).toBe('s2');
  expect(row.order).toBe(5);
});

it('uses an explicit order as given, without recomputing it from the target stack', async () => {
  const { result } = renderHook(() => useCardActions('a1'));
  const card: any = { id: 'c1', prepareUpdate: (fn: any) => { const r: any = {}; fn(r); return r; } };
  // Would append at order 5 if the explicit order were ignored — it must not be.
  queryResult = [{ order: 0 }, { order: 4 }, { order: 2 }];

  await act(() => result.current.move(card, 's2', 3));

  const call = (mutate as jest.Mock).mock.calls[0][0];
  expect(call.intent).toEqual({ kind: 'moveCard', cardId: 'c1', toStackId: 's2', order: 3 });
  const row = await call.applyLocal();
  expect(row.boardId).toBe('board-s2');
});

it('archives a card through setCardArchived', async () => {
  const { result } = renderHook(() => useCardActions('a1'));
  const card: any = { id: 'c1', prepareUpdate: (fn: any) => { const r: any = {}; fn(r); return r; } };

  await act(() => result.current.setArchived(card, true));

  const call = (mutate as jest.Mock).mock.calls[0][0];
  expect(call.intent).toEqual({ kind: 'setCardArchived', cardId: 'c1', archived: true });
  const row = await call.applyLocal();
  expect(row.archived).toBe(true);
});

it('marks a card deleted locally and enqueues deleteCard with the board, stack, and card remote ids', async () => {
  const markDeleted = jest.fn(() => ({ op: 'delete' }));
  const card: any = {
    id: 'c1',
    boardId: 'b1',
    stackId: 's1',
    remoteId: 'card-remote',
    prepareMarkAsDeleted: markDeleted,
  };

  const { result } = renderHook(() => useCardActions('a1'));
  await act(() => result.current.remove(card));

  const call = (mutate as jest.Mock).mock.calls[0][0];
  expect(call.intent).toEqual({
    kind: 'deleteCard',
    cardId: 'c1',
    ref: { boardRemoteId: 'remote-b1', stackRemoteId: 'remote-s1', cardRemoteId: 'card-remote' },
  });

  await call.applyLocal();
  expect(markDeleted).toHaveBeenCalled();
});

it('enqueues cloneCard with no local write', async () => {
  const card: any = { id: 'c1', remoteId: 'card-remote' };
  const { result } = renderHook(() => useCardActions('a1'));

  await act(() => result.current.clone(card));

  expect(mutate).toHaveBeenCalledTimes(1);
  const call = (mutate as jest.Mock).mock.calls[0][0];
  expect(call.intent).toEqual({ kind: 'cloneCard', cardId: 'c1', cardRemoteId: 'card-remote' });
  expect(await call.applyLocal()).toEqual([]);
});

// The copy is server-only (spec §9): a card with no remote id has nothing to clone.
it('does nothing when cloning a card that never synced', async () => {
  const card: any = { id: 'c1', remoteId: '' };
  const { result } = renderHook(() => useCardActions('a1'));

  await act(() => result.current.clone(card));

  expect(mutate).not.toHaveBeenCalled();
});

it('enqueues assignLabel and writes the join optimistically', async () => {
  const card: any = { id: 'c1' };
  const { result } = renderHook(() => useCardActions('a1'));
  await act(() => result.current.addLabel(card, 'l1'));

  const call = (mutate as jest.Mock).mock.calls[0][0];
  expect(call.intent).toEqual({ kind: 'assignLabel', cardId: 'c1', labelId: 'l1' });

  await call.applyLocal();
  expect(prepareCreate).toHaveBeenCalled();
});

it('does not create a duplicate join when the label is already assigned', async () => {
  const card: any = { id: 'c1' };
  queryResult = [{ id: 'join-existing' }];

  const { result } = renderHook(() => useCardActions('a1'));
  await act(() => result.current.addLabel(card, 'l1'));

  expect(mutate).not.toHaveBeenCalled();
  expect(prepareCreate).not.toHaveBeenCalled();
});

it('enqueues removeLabel and deletes the join optimistically', async () => {
  const card: any = { id: 'c1' };
  const markDeleted = jest.fn(() => ({ op: 'delete' }));
  queryResult = [{ id: 'join-1', prepareMarkAsDeleted: markDeleted }];

  const { result } = renderHook(() => useCardActions('a1'));
  await act(() => result.current.removeLabel(card, 'l1'));

  const call = (mutate as jest.Mock).mock.calls[0][0];
  expect(call.intent.kind).toBe('removeLabel');

  await call.applyLocal();
  expect(markDeleted).toHaveBeenCalled();
});

// No local join row for that label — nothing to un-assign, and nothing to tell the server.
it('does nothing when there is no join row to remove', async () => {
  const card: any = { id: 'c1' };
  queryResult = [];

  const { result } = renderHook(() => useCardActions('a1'));
  await act(() => result.current.removeLabel(card, 'l1'));

  expect(mutate).not.toHaveBeenCalled();
});

it('deletes all duplicate join rows when removing a label', async () => {
  const card: any = { id: 'c1' };
  const markDeleted1 = jest.fn(() => ({ op: 'delete' }));
  const markDeleted2 = jest.fn(() => ({ op: 'delete' }));
  queryResult = [
    { id: 'join-1', prepareMarkAsDeleted: markDeleted1 },
    { id: 'join-2', prepareMarkAsDeleted: markDeleted2 },
  ];

  const { result } = renderHook(() => useCardActions('a1'));
  await act(() => result.current.removeLabel(card, 'l1'));

  expect(mutate).toHaveBeenCalledTimes(1);
  const call = (mutate as jest.Mock).mock.calls[0][0];
  expect(call.intent.kind).toBe('removeLabel');

  const result_array = await call.applyLocal();
  expect(markDeleted1).toHaveBeenCalled();
  expect(markDeleted2).toHaveBeenCalled();
  expect(result_array).toHaveLength(2);
});

const alice = { participant: 'alice', displayName: 'Alice', assigneeType: 0 };

it('enqueues assignUser and writes the row optimistically', async () => {
  const card: any = { id: 'c1' };
  const { result } = renderHook(() => useCardActions('a1'));
  await act(() => result.current.assignUser(card, alice));

  const call = (mutate as jest.Mock).mock.calls[0][0];
  expect(call.intent).toEqual({ kind: 'assignUser', cardId: 'c1', participant: 'alice', assigneeType: 0 });

  await call.applyLocal();
  expect(prepareCreate).toHaveBeenCalled();
});

// A user and a group can share an id, so the check must also match the type —
// not just the participant id.
it('does not create a duplicate row when the participant is already assigned', async () => {
  const card: any = { id: 'c1' };
  queryResult = [{ id: 'join-existing' }];

  const { result } = renderHook(() => useCardActions('a1'));
  await act(() => result.current.assignUser(card, alice));

  expect(mutate).not.toHaveBeenCalled();
  expect(prepareCreate).not.toHaveBeenCalled();
});

it('enqueues unassignUser and deletes the row optimistically', async () => {
  const card: any = { id: 'c1' };
  const markDeleted = jest.fn(() => ({ op: 'delete' }));
  queryResult = [{ id: 'join-1', prepareMarkAsDeleted: markDeleted }];

  const { result } = renderHook(() => useCardActions('a1'));
  await act(() => result.current.unassignUser(card, alice));

  const call = (mutate as jest.Mock).mock.calls[0][0];
  expect(call.intent).toEqual({ kind: 'unassignUser', cardId: 'c1', participant: 'alice', assigneeType: 0 });

  await call.applyLocal();
  expect(markDeleted).toHaveBeenCalled();
});

// No local row for that participant — nothing to un-assign, and nothing to tell the server.
it('does nothing when there is no row to unassign', async () => {
  const card: any = { id: 'c1' };
  queryResult = [];

  const { result } = renderHook(() => useCardActions('a1'));
  await act(() => result.current.unassignUser(card, alice));

  expect(mutate).not.toHaveBeenCalled();
});

it('deletes all duplicate rows when unassigning a participant', async () => {
  const card: any = { id: 'c1' };
  const markDeleted1 = jest.fn(() => ({ op: 'delete' }));
  const markDeleted2 = jest.fn(() => ({ op: 'delete' }));
  queryResult = [
    { id: 'join-1', prepareMarkAsDeleted: markDeleted1 },
    { id: 'join-2', prepareMarkAsDeleted: markDeleted2 },
  ];

  const { result } = renderHook(() => useCardActions('a1'));
  await act(() => result.current.unassignUser(card, alice));

  expect(mutate).toHaveBeenCalledTimes(1);
  const call = (mutate as jest.Mock).mock.calls[0][0];
  const result_array = await call.applyLocal();
  expect(markDeleted1).toHaveBeenCalled();
  expect(markDeleted2).toHaveBeenCalled();
  expect(result_array).toHaveLength(2);
});

// A label created offline has no remote id; the join intent must wait for it.
it('creates a label with an empty remote id and resolves to its new local id', async () => {
  const { result } = renderHook(() => useCardActions('a1'));
  let id: string | null = null;
  await act(async () => {
    id = await result.current.createLabel('b1', { title: 'URGENT', color: null });
  });

  const row = prepareCreate.mock.results[0].value;
  expect(row.remoteId).toBe('');
  expect((mutate as jest.Mock).mock.calls[0][0].intent.kind).toBe('createLabel');
  expect(id).toBe(row.id);
});

it('does nothing and resolves to null without an account', async () => {
  const { result } = renderHook(() => useCardActions(null));
  let id: string | null | undefined;
  await act(async () => {
    id = await result.current.createLabel('b1', { title: 'URGENT', color: null });
  });

  expect(mutate).not.toHaveBeenCalled();
  expect(id).toBeNull();
});

// dependentCardsJson carries remote ids (R38) — never a CardFieldName, so this
// write is not protected by protectedFieldsOf; a delta pass before the drain
// may briefly revert it, which is accepted.
it('adds a dependency by its remote id and enqueues the intent', async () => {
  const card: any = {
    id: 'c1',
    dependentCardsJson: '[]',
    prepareUpdate: (fn: any) => { const r: any = {}; fn(r); return r; },
  };
  const { result } = renderHook(() => useCardActions('a1'));

  await act(() => result.current.addDependency(card, '99'));

  const call = (mutate as jest.Mock).mock.calls[0][0];
  expect(call.intent).toEqual({ kind: 'addDependency', cardId: 'c1', dependentCardRemoteId: '99' });
  const row = await call.applyLocal();
  expect(row.dependentCardsJson).toBe(JSON.stringify(['99']));
});

it('does nothing when the dependency is already present', async () => {
  const card: any = { id: 'c1', dependentCardsJson: JSON.stringify(['99']) };
  const { result } = renderHook(() => useCardActions('a1'));

  await act(() => result.current.addDependency(card, '99'));

  expect(mutate).not.toHaveBeenCalled();
});

it('removes a dependency by its remote id and enqueues the intent', async () => {
  const card: any = {
    id: 'c1',
    dependentCardsJson: JSON.stringify(['99', '100']),
    prepareUpdate: (fn: any) => { const r: any = {}; fn(r); return r; },
  };
  const { result } = renderHook(() => useCardActions('a1'));

  await act(() => result.current.removeDependency(card, '99'));

  const call = (mutate as jest.Mock).mock.calls[0][0];
  expect(call.intent).toEqual({ kind: 'removeDependency', cardId: 'c1', dependentCardRemoteId: '99' });
  const row = await call.applyLocal();
  expect(row.dependentCardsJson).toBe(JSON.stringify(['100']));
});

it('does nothing when the dependency to remove is absent', async () => {
  const card: any = { id: 'c1', dependentCardsJson: '[]' };
  const { result } = renderHook(() => useCardActions('a1'));

  await act(() => result.current.removeDependency(card, '99'));

  expect(mutate).not.toHaveBeenCalled();
});

// addComment prepares the local row with remoteId '' before mutate, so an
// offline comment appears instantly and the drain fills the remote id later.
it('creates a comment row with an empty remote id and enqueues createComment', async () => {
  const card: any = { id: 'c1' };
  const { result } = renderHook(() => useCardActions('a1'));

  await act(() => result.current.addComment(card, '  hello  '));

  const row = prepareCreate.mock.results[0].value;
  expect(row.remoteId).toBe('');
  expect(row.message).toBe('hello');
  const call = (mutate as jest.Mock).mock.calls[0][0];
  expect(call.intent).toEqual({ kind: 'createComment', commentId: row.id, cardId: 'c1', message: 'hello' });
  expect(await call.applyLocal()).toBe(row);
});

it('does not enqueue a whitespace-only comment', async () => {
  const card: any = { id: 'c1' };
  const { result } = renderHook(() => useCardActions('a1'));

  await act(() => result.current.addComment(card, '   '));

  expect(mutate).not.toHaveBeenCalled();
  expect(prepareCreate).not.toHaveBeenCalled();
});

// A malformed column must contribute nothing rather than take the write down with it.
it('treats malformed dependentCardsJson as an empty list', async () => {
  const card: any = {
    id: 'c1',
    dependentCardsJson: 'not-json',
    prepareUpdate: (fn: any) => { const r: any = {}; fn(r); return r; },
  };
  const { result } = renderHook(() => useCardActions('a1'));

  await act(() => result.current.addDependency(card, '99'));

  const call = (mutate as jest.Mock).mock.calls[0][0];
  const row = await call.applyLocal();
  expect(row.dependentCardsJson).toBe(JSON.stringify(['99']));
});
