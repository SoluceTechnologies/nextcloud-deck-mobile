import { buildCardRelationOps, assigneeKey, pendingRelationIds } from '../../../src/sync/tasks/cardRelations';
import type { DeckCard } from '../../../src/services/deck/types';
import type { PendingCards } from '../../../src/sync/outbox/pending';
import type { Intent } from '../../../src/sync/outbox/types';

function makeDb() {
  const make = (tag: string) => ({
    prepareCreate: jest.fn((writer: (r: any) => void) => {
      const r: any = { _op: 'create', _tag: tag };
      writer(r);
      return r;
    }),
  });
  const tables: Record<string, any> = {
    card_labels: make('card_labels'),
    card_assignees: make('card_assignees'),
  };
  return { get: jest.fn((t: string) => tables[t]) } as any;
}

function joinRow(tag: string, over: Record<string, unknown>) {
  return {
    _tag: tag,
    prepareUpdate: jest.fn((writer: (r: any) => void) => {
      const r: any = { _op: 'update', _tag: tag };
      writer(r);
      return r;
    }),
    prepareMarkAsDeleted: jest.fn(() => ({ _op: 'delete', _tag: tag })),
    ...over,
  } as any;
}

function card(over: Partial<DeckCard> = {}): DeckCard {
  return {
    remoteId: '42',
    boardRemoteId: '7',
    stackRemoteId: '5',
    title: 'Pay',
    description: '',
    type: 'plain',
    order: 0,
    owner: 'john',
    color: null,
    archived: false,
    doneAt: null,
    duedate: null,
    startdate: null,
    createdAt: 0,
    lastModified: 0,
    attachmentCount: 0,
    commentsCount: 0,
    dependentCardIds: [],
    labels: [],
    assignees: [],
    ...over,
  };
}

function pendingWith(cardLocalId: string, intents: Intent[]): PendingCards {
  return new Map([
    [cardLocalId, { fields: new Set(), entries: intents.map((intent) => ({ entry: {} as any, intent })) }],
  ]) as any;
}

const base = {
  db: makeDb(),
  accountId: 'acc-1',
  cardLocalId: 'c-local',
  labelLocalIdByRemote: new Map([['3', 'label-local']]),
  labelRows: [],
  assigneeRows: [],
  pending: new Map() as PendingCards,
};

describe('assigneeKey', () => {
  it('combines the participant and its type, so a user and a group never collide', () => {
    expect(assigneeKey('jane', 0)).toBe('jane|0');
    expect(assigneeKey('jane', 1)).toBe('jane|1');
  });
});

describe('buildCardRelationOps', () => {
  it('links a label the card gained', () => {
    const ops = buildCardRelationOps({
      ...base,
      remote: card({ labels: [{ remoteId: '3', title: 'Urgent', color: null }] }),
    });
    expect(ops).toEqual([
      expect.objectContaining({
        _tag: 'card_labels',
        accountId: 'acc-1',
        cardId: 'c-local',
        labelId: 'label-local',
      }),
    ]);
  });

  it('ignores a label whose board row is not cached yet', () => {
    const ops = buildCardRelationOps({
      ...base,
      remote: card({ labels: [{ remoteId: '99', title: 'Ghost', color: null }] }),
    });
    expect(ops).toEqual([]);
  });

  it('unlinks a label the card lost', () => {
    const ops = buildCardRelationOps({
      ...base,
      remote: card(),
      labelRows: [joinRow('card_labels', { cardId: 'c-local', labelId: 'label-local' })],
    });
    expect(ops).toEqual([{ _op: 'delete', _tag: 'card_labels' }]);
  });

  it('emits nothing when the links already match', () => {
    const ops = buildCardRelationOps({
      ...base,
      remote: card({ labels: [{ remoteId: '3', title: 'Urgent', color: null }] }),
      labelRows: [joinRow('card_labels', { cardId: 'c-local', labelId: 'label-local' })],
    });
    expect(ops).toEqual([]);
  });

  it('adds an assignee with its participant type and display name', () => {
    const ops = buildCardRelationOps({
      ...base,
      remote: card({ assignees: [{ participant: 'jane', displayName: 'Jane', assigneeType: 0 }] }),
    });
    expect(ops[0]).toMatchObject({
      _tag: 'card_assignees',
      participant: 'jane',
      assigneeType: 0,
      displayName: 'Jane',
    });
  });

  it('updates an assignee whose display name changed', () => {
    const ops = buildCardRelationOps({
      ...base,
      remote: card({ assignees: [{ participant: 'jane', displayName: 'Jane Doe', assigneeType: 0 }] }),
      assigneeRows: [
        joinRow('card_assignees', { participant: 'jane', assigneeType: 0, displayName: 'Jane' }),
      ],
    });
    expect(ops[0]).toMatchObject({ _op: 'update', displayName: 'Jane Doe' });
  });

  it('removes an assignee the card lost', () => {
    const ops = buildCardRelationOps({
      ...base,
      remote: card(),
      assigneeRows: [
        joinRow('card_assignees', { participant: 'jane', assigneeType: 0, displayName: 'Jane' }),
      ],
    });
    expect(ops).toEqual([{ _op: 'delete', _tag: 'card_assignees' }]);
  });

  // A label assigned offline writes its join row locally before the create/assign
  // intent ever reaches the server. A board pass that lands in between must not
  // read "the server does not report it yet" as "the user unassigned it" — the
  // join row is owned by a queued mutation, exactly like a card column pending a
  // patchCard.
  it('does not unlink a label a queued assignLabel intent owns, even though the server has not reported it yet', () => {
    const ops = buildCardRelationOps({
      ...base,
      pending: pendingWith('c-local', [{ kind: 'assignLabel', cardId: 'c-local', labelId: 'label-local' }]),
      remote: card(), // the server's snapshot does not carry the label yet
      labelRows: [joinRow('card_labels', { cardId: 'c-local', labelId: 'label-local' })],
    });
    expect(ops).toEqual([]);
  });

  it('does not unassign a user a queued assignUser intent owns, even though the server has not reported it yet', () => {
    const ops = buildCardRelationOps({
      ...base,
      pending: pendingWith('c-local', [
        { kind: 'assignUser', cardId: 'c-local', participant: 'jane', assigneeType: 0 },
      ]),
      remote: card(),
      assigneeRows: [
        joinRow('card_assignees', { participant: 'jane', assigneeType: 0, displayName: 'Jane' }),
      ],
    });
    expect(ops).toEqual([]);
  });

  // Tranche A protects a row a queued mutation owns from deletion. The reverse
  // direction is the actual gap: a queued removeLabel deletes the join row
  // locally right away, and a board pass landing before the server catches up
  // must not read "the server still reports it" as "recreate it".
  it('does not recreate a join a queued removeLabel has just deleted', () => {
    const ops = buildCardRelationOps({
      ...base,
      pending: pendingWith('c-local', [{ kind: 'removeLabel', cardId: 'c-local', labelId: 'label-local' }]),
      remote: card({ labels: [{ remoteId: '3', title: 'Urgent', color: null }] }), // server still reports the label the user removed offline
      labelRows: [], // the join was deleted optimistically
    });
    expect(ops).toEqual([]);
  });

  it('does not recreate an assignee join a queued unassignUser has just deleted', () => {
    const ops = buildCardRelationOps({
      ...base,
      pending: pendingWith('c-local', [
        { kind: 'unassignUser', cardId: 'c-local', participant: 'jane', assigneeType: 0 },
      ]),
      remote: card({ assignees: [{ participant: 'jane', displayName: 'Jane', assigneeType: 0 }] }), // server still reports the assignee the user removed offline
      assigneeRows: [], // the join was deleted optimistically
    });
    expect(ops).toEqual([]);
  });

  it('still unlinks a label with no pending intent, alongside one that is protected', () => {
    const ops = buildCardRelationOps({
      ...base,
      pending: pendingWith('c-local', [{ kind: 'assignLabel', cardId: 'c-local', labelId: 'label-local' }]),
      remote: card(),
      labelLocalIdByRemote: new Map([
        ['3', 'label-local'],
        ['9', 'label-other'],
      ]),
      labelRows: [
        joinRow('card_labels', { cardId: 'c-local', labelId: 'label-local' }),
        joinRow('card_labels', { cardId: 'c-local', labelId: 'label-other' }),
      ],
    });
    expect(ops).toEqual([{ _op: 'delete', _tag: 'card_labels' }]);
  });
});

describe('pendingRelationIds', () => {
  it('collects the labelId of a pending assignLabel or removeLabel intent', () => {
    const pending = pendingWith('c-local', [
      { kind: 'assignLabel', cardId: 'c-local', labelId: 'label-a' },
      { kind: 'removeLabel', cardId: 'c-local', labelId: 'label-b' },
    ]);
    expect(pendingRelationIds(pending, 'c-local').labelIds).toEqual(new Set(['label-a', 'label-b']));
  });

  it('collects the assignee key of a pending assignUser or unassignUser intent', () => {
    const pending = pendingWith('c-local', [
      { kind: 'assignUser', cardId: 'c-local', participant: 'jane', assigneeType: 0 },
      { kind: 'unassignUser', cardId: 'c-local', participant: 'group1', assigneeType: 1 },
    ]);
    expect(pendingRelationIds(pending, 'c-local').assigneeKeys).toEqual(
      new Set([assigneeKey('jane', 0), assigneeKey('group1', 1)]),
    );
  });

  it('ignores intents that do not touch labels or assignees', () => {
    const pending = pendingWith('c-local', [{ kind: 'setCardArchived', cardId: 'c-local', archived: true }]);
    const result = pendingRelationIds(pending, 'c-local');
    expect(result.labelIds.size).toBe(0);
    expect(result.assigneeKeys.size).toBe(0);
  });

  it('returns empty sets for a card with nothing pending', () => {
    const result = pendingRelationIds(new Map(), 'c-local');
    expect(result.labelIds.size).toBe(0);
    expect(result.assigneeKeys.size).toBe(0);
  });
});
