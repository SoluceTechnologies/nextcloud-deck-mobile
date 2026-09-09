import {
  loadPendingCards,
  mergeServerValues,
  pendingEntityIds,
} from '../../../src/sync/outbox/pending';

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
  return {
    get: jest.fn(() => ({ query: jest.fn(() => ({ fetch: jest.fn(async () => rows) })) })),
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
