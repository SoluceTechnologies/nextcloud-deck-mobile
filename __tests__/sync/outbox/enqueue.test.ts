import type { Model } from '@nozbe/watermelondb';

import { mutate, protectedFieldsOf, entityRefOf, OUTBOX_QUEUED, OUTBOX_FAILED } from '../../../src/sync/outbox/enqueue';
import type { Intent } from '../../../src/sync/outbox/types';
import { localWriteEpoch } from '../../../src/sync/localWrites';

/** A stand-in for a WatermelonDB record prepared via prepareCreate/prepareUpdate/prepareMarkAsDeleted. */
function fakePreparedOp(preparedState: string): Model {
  return { _preparedState: preparedState } as unknown as Model;
}

jest.mock('../../../src/database/utils/safeTransaction', () => ({
  safeWrite: (_db: unknown, fn: () => Promise<unknown>) => fn(),
}));

function makeDb() {
  const batches: any[][] = [];
  const collection = {
    prepareCreate: jest.fn((writer: (row: any) => void) => {
      const row: any = { _preparedState: 'create' };
      writer(row);
      return row;
    }),
  };
  const db = {
    get: jest.fn(() => collection),
    batch: jest.fn(async (records: any[]) => {
      batches.push(records);
    }),
  } as any;
  return { db, batches };
}

describe('constants', () => {
  it('defines outbox state constants', () => {
    expect(OUTBOX_QUEUED).toBe('queued');
    expect(OUTBOX_FAILED).toBe('failed');
  });
});

describe('protectedFieldsOf', () => {
  it('protects exactly the patched fields', () => {
    const intent: Intent = {
      kind: 'patchCard',
      cardId: 'c1',
      fields: ['title', 'duedate'],
      base: { title: 'old', duedate: null },
    };
    expect(protectedFieldsOf(intent)).toEqual(['title', 'duedate']);
  });

  it('protects the stack and the order for a move', () => {
    expect(
      protectedFieldsOf({ kind: 'moveCard', cardId: 'c1', toStackId: 's2', order: 3 }),
    ).toEqual(['stackId', 'order']);
  });

  it('protects the archived flag for an archive', () => {
    expect(
      protectedFieldsOf({ kind: 'setCardArchived', cardId: 'c1', archived: true }),
    ).toEqual(['archived']);
  });

  it('protects nothing for a label assignment', () => {
    expect(
      protectedFieldsOf({ kind: 'assignLabel', cardId: 'c1', labelId: 'l1' }),
    ).toEqual([]);
  });

  it('protects nothing for a board deletion', () => {
    expect(
      protectedFieldsOf({ kind: 'deleteBoard', boardId: 'b1', boardRemoteId: '7' }),
    ).toEqual([]);
  });

  // Explicit rather than left to the default: a comment touches no card
  // column, so there is nothing here for a card sync to shield.
  it('protects nothing for a comment creation', () => {
    expect(
      protectedFieldsOf({ kind: 'createComment', commentId: 'cm1', cardId: 'c1', message: 'hi' }),
    ).toEqual([]);
  });
});

describe('entityRefOf', () => {
  it('addresses a card intent by its local card id', () => {
    expect(entityRefOf({ kind: 'setCardArchived', cardId: 'c1', archived: true })).toEqual({
      entityType: 'card',
      entityId: 'c1',
    });
  });

  it('addresses a stack intent by its local stack id', () => {
    expect(entityRefOf({ kind: 'updateStack', stackId: 's1', title: 'Doing', order: 1 })).toEqual({
      entityType: 'stack',
      entityId: 's1',
    });
  });

  it('addresses a label intent by its local label id, not the board it also carries', () => {
    expect(entityRefOf({ kind: 'createLabel', labelId: 'l1', boardId: 'b1' })).toEqual({
      entityType: 'label',
      entityId: 'l1',
    });
  });

  it('addresses a board intent by its local board id', () => {
    expect(
      entityRefOf({ kind: 'updateBoard', boardId: 'b1', title: 'Ops', color: null, archived: false }),
    ).toEqual({ entityType: 'board', entityId: 'b1' });
  });

  // A queued comment must not shield or coalesce with its card (R46): it has
  // to be addressed by its own id even though it also carries a cardId.
  it('addresses a comment intent by its own comment id, not the card it also carries', () => {
    expect(
      entityRefOf({ kind: 'createComment', commentId: 'cm1', cardId: 'c1', message: 'hi' }),
    ).toEqual({ entityType: 'comment', entityId: 'cm1' });
  });
});

describe('mutate', () => {
  it('batches the prepared local operation with the outbox row in a single call', async () => {
    const { db, batches } = makeDb();
    const localOp = fakePreparedOp('update');

    await mutate({
      db,
      accountId: 'acc-1',
      intent: { kind: 'setCardArchived', cardId: 'c1', archived: true },
      applyLocal: () => localOp,
    });

    // One batch, containing exactly the local op and the outbox row together.
    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual([
      localOp,
      expect.objectContaining({
        accountId: 'acc-1',
        kind: 'setCardArchived',
        entityType: 'card',
        entityId: 'c1',
        state: OUTBOX_QUEUED,
        attempts: 0,
        nextAttemptAt: 0,
        serverValuesJson: '{}',
      }),
    ]);
    expect(JSON.parse(batches[0][1].payloadJson)).toEqual({
      kind: 'setCardArchived',
      cardId: 'c1',
      archived: true,
    });
  });

  it('batches every operation applyLocal returns, plus the outbox row', async () => {
    const { db, batches } = makeDb();
    const opA = fakePreparedOp('create');
    const opB = fakePreparedOp('update');

    await mutate({
      db,
      accountId: 'acc-1',
      intent: { kind: 'setCardArchived', cardId: 'c1', archived: true },
      applyLocal: async () => [opA, opB],
    });

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(3);
    expect(batches[0][0]).toBe(opA);
    expect(batches[0][1]).toBe(opB);
    expect(batches[0][2]).toMatchObject({ state: OUTBOX_QUEUED });
  });

  it('advances the local write epoch so a sync in flight backs off', async () => {
    const { db } = makeDb();
    const before = localWriteEpoch();

    await mutate({
      db,
      accountId: 'acc-1',
      intent: { kind: 'setCardArchived', cardId: 'c1', archived: false },
      applyLocal: () => fakePreparedOp('update'),
    });

    expect(localWriteEpoch()).toBe(before + 1);
  });

  it('does not enqueue when the local operation cannot be prepared', async () => {
    const { db, batches } = makeDb();

    await expect(
      mutate({
        db,
        accountId: 'acc-1',
        intent: { kind: 'setCardArchived', cardId: 'c1', archived: true },
        applyLocal: async () => {
          throw new Error('local write failed');
        },
      }),
    ).rejects.toThrow('local write failed');

    // Never reached db.batch() at all — not the local op, not the outbox row.
    expect(batches).toHaveLength(0);
  });
});
