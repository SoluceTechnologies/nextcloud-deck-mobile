import { mutate, protectedFieldsOf, entityRefOf, OUTBOX_QUEUED, OUTBOX_FAILED } from '../../../src/sync/outbox/enqueue';
import type { Intent } from '../../../src/sync/outbox/types';
import { localWriteEpoch } from '../../../src/sync/localWrites';

jest.mock('../../../src/database/utils/safeTransaction', () => ({
  safeWrite: (_db: unknown, fn: () => Promise<unknown>) => fn(),
}));

function makeDb() {
  const created: any[] = [];
  const collection = {
    create: jest.fn(async (writer: (row: any) => void) => {
      const row: any = {};
      writer(row);
      created.push(row);
      return row;
    }),
  };
  return {
    db: { get: jest.fn(() => collection), write: jest.fn(async (fn: any) => fn()) } as any,
    created,
  };
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

  it('addresses a board intent by its local board id', () => {
    expect(
      entityRefOf({ kind: 'updateBoard', boardId: 'b1', title: 'Ops', color: null, archived: false }),
    ).toEqual({ entityType: 'board', entityId: 'b1' });
  });
});

describe('mutate', () => {
  it('applies the optimistic write and enqueues in the same transaction', async () => {
    const { db, created } = makeDb();
    const order: string[] = [];

    await mutate({
      db,
      accountId: 'acc-1',
      intent: { kind: 'setCardArchived', cardId: 'c1', archived: true },
      applyLocal: async () => {
        order.push('local');
      },
    });

    expect(order).toEqual(['local']);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      accountId: 'acc-1',
      kind: 'setCardArchived',
      entityType: 'card',
      entityId: 'c1',
      state: OUTBOX_QUEUED,
      attempts: 0,
      nextAttemptAt: 0,
      serverValuesJson: '{}',
    });
    expect(JSON.parse(created[0].payloadJson)).toEqual({
      kind: 'setCardArchived',
      cardId: 'c1',
      archived: true,
    });
  });

  it('advances the local write epoch so a sync in flight backs off', async () => {
    const { db } = makeDb();
    const before = localWriteEpoch();

    await mutate({
      db,
      accountId: 'acc-1',
      intent: { kind: 'setCardArchived', cardId: 'c1', archived: false },
      applyLocal: () => undefined,
    });

    expect(localWriteEpoch()).toBe(before + 1);
  });

  it('does not enqueue when the optimistic write throws', async () => {
    const { db, created } = makeDb();

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

    expect(created).toHaveLength(0);
  });
});
