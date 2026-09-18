import {
  loadPendingCards,
  loadQueuedIntents,
  mergeServerValues,
  pendingEntityIds,
} from '../../../src/sync/outbox/pending';
import { OUTBOX_QUEUED } from '../../../src/sync/outbox/enqueue';

function entry(over: Record<string, unknown>) {
  return {
    entityType: 'card',
    entityId: 'c1',
    state: 'queued',
    serverValuesJson: '{}',
    payloadJson: JSON.stringify({ kind: 'setCardArchived', cardId: 'c1', archived: true }),
    ...over,
  } as any;
}

function makeDb(rows: any[]) {
  const tables = new Map();
  return {
    get: jest.fn((table: string) => {
      if (!tables.has(table)) {
        tables.set(table, { query: jest.fn(() => ({ fetch: jest.fn(async () => rows) })) });
      }
      return tables.get(table);
    }),
  } as any;
}

describe('loadPendingCards', () => {
  it('indexes queued card intents by their local card id', async () => {
    const pending = await loadPendingCards(makeDb([entry({})]), 'acc-1');
    expect([...pending.keys()]).toEqual(['c1']);
    expect([...pending.get('c1')!.fields]).toEqual(['archived']);
  });

  it('unions the protected fields of several intents on the same card', async () => {
    const rows = [
      entry({
        payloadJson: JSON.stringify({
          kind: 'patchCard',
          cardId: 'c1',
          fields: ['title'],
          base: {},
        }),
      }),
      entry({
        payloadJson: JSON.stringify({ kind: 'moveCard', cardId: 'c1', toStackId: 's2', order: 1 }),
      }),
    ];

    const pending = await loadPendingCards(makeDb(rows), 'acc-1');

    expect([...pending.get('c1')!.fields].sort()).toEqual(['order', 'stackId', 'title']);
    expect(pending.get('c1')!.entries).toHaveLength(2);
  });

  it('ignores an entry whose payload cannot be parsed', async () => {
    const pending = await loadPendingCards(makeDb([entry({ payloadJson: 'not json' })]), 'acc-1');
    expect(pending.size).toBe(0);
  });

  it('ignores non-card entities', async () => {
    const rows = [
      entry({
        entityType: 'stack',
        entityId: 's1',
        payloadJson: JSON.stringify({ kind: 'updateStack', stackId: 's1', title: 'x', order: 0 }),
      }),
    ];
    const pending = await loadPendingCards(makeDb(rows), 'acc-1');
    expect(pending.size).toBe(0);
  });
});

describe('mergeServerValues', () => {
  it('merges new values over the stored ones', () => {
    const merged = mergeServerValues(entry({ serverValuesJson: '{"title":"a"}' }), {
      duedate: 5,
    });
    expect(JSON.parse(merged)).toEqual({ title: 'a', duedate: 5 });
  });

  it('overwrites a value the server changed again', () => {
    const merged = mergeServerValues(entry({ serverValuesJson: '{"title":"a"}' }), {
      title: 'b',
    });
    expect(JSON.parse(merged)).toEqual({ title: 'b' });
  });

  it('recovers from a corrupt stored value', () => {
    const merged = mergeServerValues(entry({ serverValuesJson: 'oops' }), { title: 'b' });
    expect(JSON.parse(merged)).toEqual({ title: 'b' });
  });
});

describe('pendingEntityIds', () => {
  it('returns the set of protected local ids', async () => {
    const pending = await loadPendingCards(makeDb([entry({})]), 'acc-1');
    expect(pendingEntityIds(pending)).toEqual(new Set(['c1']));
  });
});

describe('loadQueuedIntents', () => {
  const entryFor = (id: string, entityType: string, entityId: string, intent: unknown) =>
    ({ id, entityType, entityId, payloadJson: JSON.stringify(intent) }) as any;

  it('returns the queued intents of the requested entity type', async () => {
    const rows = [
      entryFor('o1', 'board', 'b1', { kind: 'updateBoard', boardId: 'b1', title: 'X', color: null, archived: false }),
      entryFor('o2', 'board', 'b2', { kind: 'deleteBoard', boardId: 'b2', boardRemoteId: '22' }),
    ];
    const db = makeDb(rows);
    const queued = await loadQueuedIntents(db, 'a1', 'board');
    expect(queued.map(({ intent }) => intent.kind)).toEqual(['updateBoard', 'deleteBoard']);
    expect(queued.map(({ entry }) => entry.entityId)).toEqual(['b1', 'b2']);
  });

  it('scopes the query to the account, the queued state and the entity type', async () => {
    const db = makeDb([]);
    await loadQueuedIntents(db, 'a1', 'stack');
    const clauses = JSON.stringify(db.get('outbox').query.mock.calls[0]);
    expect(clauses).toContain('a1');
    expect(clauses).toContain(OUTBOX_QUEUED);
    expect(clauses).toContain('stack');
  });

  it('drops an entry whose payload will not parse, without throwing', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const db = makeDb([
      { id: 'o1', entityType: 'stack', entityId: 's1', payloadJson: '{not json' } as any,
      entryFor('o2', 'stack', 's2', { kind: 'updateStack', stackId: 's2', title: 'T', order: 0 }),
    ]);
    const queued = await loadQueuedIntents(db, 'a1', 'stack');
    expect(queued.map(({ entry }) => entry.id)).toEqual(['o2']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('returns an empty list when nothing is queued', async () => {
    await expect(loadQueuedIntents(makeDb([]), 'a1', 'board')).resolves.toEqual([]);
  });
});
