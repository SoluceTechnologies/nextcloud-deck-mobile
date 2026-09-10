import { buildCardRelationOps, assigneeKey } from '../../../src/sync/tasks/cardRelations';
import type { DeckCard } from '../../../src/services/deck/types';

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

const base = {
  db: makeDb(),
  accountId: 'acc-1',
  cardLocalId: 'c-local',
  labelLocalIdByRemote: new Map([['3', 'label-local']]),
  labelRows: [],
  assigneeRows: [],
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
});
