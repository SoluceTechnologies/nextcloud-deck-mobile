import { syncBoardContent } from '../../../src/sync/tasks/syncBoardContent';
import { fetchStacks } from '../../../src/services/deck/boards';
import type { Account } from '../../../src/types';
import type { DeckCard, DeckStack } from '../../../src/services/deck/types';

jest.mock('../../../src/services/deck/boards');
jest.mock('../../../src/database/utils/safeTransaction', () => ({
  safeWrite: (_db: unknown, fn: () => Promise<unknown>) => fn(),
}));

const mockFetchStacks = fetchStacks as jest.Mock;

const account: Account = {
  id: 'acc-1',
  displayName: 'Work',
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'x',
  davUserId: 'john',
};

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
    createdAt: 1000,
    lastModified: 5000,
    attachmentCount: 0,
    commentsCount: 0,
    dependentCardIds: [],
    labels: [],
    assignees: [],
    ...over,
  };
}

function stack(cards: DeckCard[], over: Partial<DeckStack> = {}): DeckStack {
  return {
    remoteId: '5',
    boardRemoteId: '7',
    title: 'Doing',
    order: 0,
    lastModified: 4000,
    cards,
    ...over,
  };
}

function prepared(tag: string) {
  return jest.fn((writer: (r: any) => void) => {
    const r: any = { _op: 'create', id: `${tag}-new`, _tag: tag };
    writer(r);
    return r;
  });
}

function makeRow(tag: string, over: Record<string, unknown>) {
  return {
    _tag: tag,
    id: `${tag}-1`,
    prepareUpdate: jest.fn((writer: (r: any) => void) => {
      const r: any = { _op: 'update', _tag: tag };
      writer(r);
      return r;
    }),
    prepareMarkAsDeleted: jest.fn(() => ({ _op: 'delete', _tag: tag })),
    ...over,
  } as any;
}

function makeDb(tables: Record<string, any[]>) {
  const batch = jest.fn(async () => {});
  const collections: Record<string, any> = {};
  for (const name of ['boards', 'stacks', 'cards', 'outbox', 'card_labels', 'card_assignees']) {
    collections[name] = {
      query: jest.fn(() => ({ fetch: jest.fn(async () => tables[name] ?? []) })),
      prepareCreate: prepared(name),
    };
  }
  return {
    db: {
      get: jest.fn((t: string) => collections[t]),
      batch,
      write: jest.fn(async (fn: any) => fn()),
    } as any,
    batch,
  };
}

const boardRow = makeRow('boards', { id: 'b-local', remoteId: '7' });

beforeEach(() => jest.clearAllMocks());

describe('syncBoardContent', () => {
  it('does nothing when the board is not in the local cache yet', async () => {
    const { db, batch } = makeDb({ boards: [] });
    await syncBoardContent({ db, account, boardRemoteId: '7', full: false });
    expect(mockFetchStacks).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });

  it('sends the newest card lastModified minus the overlap on a delta pass', async () => {
    mockFetchStacks.mockResolvedValue([]);
    const { db } = makeDb({
      boards: [boardRow],
      cards: [makeRow('cards', { boardId: 'b-local', lastModified: 9000 })],
    });

    await syncBoardContent({ db, account, boardRemoteId: '7', full: false });

    expect(mockFetchStacks).toHaveBeenCalledWith(account, '7', 7000);
  });

  it('sends no cursor on a snapshot pass', async () => {
    mockFetchStacks.mockResolvedValue([]);
    const { db } = makeDb({
      boards: [boardRow],
      cards: [makeRow('cards', { boardId: 'b-local', lastModified: 9000 })],
    });

    await syncBoardContent({ db, account, boardRemoteId: '7', full: true });

    expect(mockFetchStacks).toHaveBeenCalledWith(account, '7', undefined);
  });

  it('creates the stacks and their cards, linking the card to the new stack row', async () => {
    mockFetchStacks.mockResolvedValue([stack([card()])]);
    const { db, batch } = makeDb({ boards: [boardRow] });

    await syncBoardContent({ db, account, boardRemoteId: '7', full: true });

    const ops = (batch as any).mock.calls[0][0];
    const created = ops.find((o: any) => o._tag === 'cards');
    expect(created).toMatchObject({
      remoteId: '42',
      boardId: 'b-local',
      stackId: 'stacks-new',
      pending: false,
    });
  });

  it('reconciles stacks authoritatively even on a delta pass', async () => {
    mockFetchStacks.mockResolvedValue([]);
    const { db, batch } = makeDb({
      boards: [boardRow],
      stacks: [makeRow('stacks', { boardId: 'b-local', remoteId: '5' })],
    });

    await syncBoardContent({ db, account, boardRemoteId: '7', full: false });

    expect((batch as any).mock.calls[0][0]).toEqual([{ _op: 'delete', _tag: 'stacks' }]);
  });

  it('keeps a card missing from a delta response', async () => {
    mockFetchStacks.mockResolvedValue([stack([])]);
    const { db, batch } = makeDb({
      boards: [boardRow],
      stacks: [makeRow('stacks', { boardId: 'b-local', remoteId: '5', title: 'Doing', order: 0, lastModified: 4000 })],
      cards: [makeRow('cards', { boardId: 'b-local', remoteId: '42', lastModified: 5000 })],
    });

    await syncBoardContent({ db, account, boardRemoteId: '7', full: false });

    const ops = (batch as any).mock.calls[0]?.[0] ?? [];
    expect(ops.filter((o: any) => o._op === 'delete')).toEqual([]);
  });

  it('removes a card missing from a snapshot response', async () => {
    mockFetchStacks.mockResolvedValue([stack([])]);
    const { db, batch } = makeDb({
      boards: [boardRow],
      stacks: [makeRow('stacks', { boardId: 'b-local', remoteId: '5', title: 'Doing', order: 0, lastModified: 4000 })],
      cards: [makeRow('cards', { boardId: 'b-local', remoteId: '42', lastModified: 5000 })],
    });

    await syncBoardContent({ db, account, boardRemoteId: '7', full: true });

    const ops = (batch as any).mock.calls[0][0];
    expect(ops.some((o: any) => o._op === 'delete' && o._tag === 'cards')).toBe(true);
  });

  it('never removes a card that a queued mutation owns', async () => {
    mockFetchStacks.mockResolvedValue([stack([])]);
    const { db, batch } = makeDb({
      boards: [boardRow],
      stacks: [makeRow('stacks', { boardId: 'b-local', remoteId: '5', title: 'Doing', order: 0, lastModified: 4000 })],
      cards: [makeRow('cards', { id: 'cards-1', boardId: 'b-local', remoteId: '', lastModified: 0 })],
      outbox: [
        makeRow('outbox', {
          entityType: 'card',
          entityId: 'cards-1',
          state: 'queued',
          serverValuesJson: '{}',
          payloadJson: JSON.stringify({ kind: 'createCard', cardId: 'cards-1' }),
        }),
      ],
    });

    await syncBoardContent({ db, account, boardRemoteId: '7', full: true });

    const ops = (batch as any).mock.calls[0]?.[0] ?? [];
    expect(ops.some((o: any) => o._op === 'delete' && o._tag === 'cards')).toBe(false);
  });

  // Correction: `reconcile` removes duplicate keys unconditionally, whatever
  // `deleteMissing` says. Two offline-created cards both carry remoteId = ''
  // until their create flushes, so they collide on that empty key and — unless
  // rows without a remoteId are filtered out before reaching `reconcile` — all
  // but the first are silently marked deleted, losing the user's offline work.
  it('does not delete two offline-created cards that collide on an empty remoteId key', async () => {
    mockFetchStacks.mockResolvedValue([stack([])]);
    const { db, batch } = makeDb({
      boards: [boardRow],
      stacks: [makeRow('stacks', { boardId: 'b-local', remoteId: '5', title: 'Doing', order: 0, lastModified: 4000 })],
      cards: [
        makeRow('cards', { id: 'cards-1', boardId: 'b-local', remoteId: '', lastModified: 0 }),
        makeRow('cards', { id: 'cards-2', boardId: 'b-local', remoteId: '', lastModified: 0 }),
      ],
    });

    await syncBoardContent({ db, account, boardRemoteId: '7', full: true });

    const ops = (batch as any).mock.calls[0]?.[0] ?? [];
    expect(ops.filter((o: any) => o._op === 'delete' && o._tag === 'cards')).toEqual([]);
  });

  it('keeps the optimistic title and records the server value on the outbox entry', async () => {
    mockFetchStacks.mockResolvedValue([stack([card({ title: 'server title', lastModified: 9000 })])]);
    const outboxRow = makeRow('outbox', {
      entityType: 'card',
      entityId: 'cards-1',
      state: 'queued',
      serverValuesJson: '{}',
      payloadJson: JSON.stringify({
        kind: 'patchCard',
        cardId: 'cards-1',
        fields: ['title'],
        base: { title: 'Pay' },
      }),
    });
    const { db, batch } = makeDb({
      boards: [boardRow],
      stacks: [makeRow('stacks', { boardId: 'b-local', remoteId: '5', title: 'Doing', order: 0, lastModified: 4000 })],
      cards: [makeRow('cards', { id: 'cards-1', boardId: 'b-local', remoteId: '42', title: 'my edit', lastModified: 5000 })],
      outbox: [outboxRow],
    });

    await syncBoardContent({ db, account, boardRemoteId: '7', full: false });

    const ops = (batch as any).mock.calls[0][0];
    const cardUpdate = ops.find((o: any) => o._op === 'update' && o._tag === 'cards');
    expect(cardUpdate.title).toBeUndefined();
    expect(cardUpdate.lastModified).toBe(9000);

    const outboxUpdate = ops.find((o: any) => o._op === 'update' && o._tag === 'outbox');
    expect(JSON.parse(outboxUpdate.serverValuesJson)).toEqual({ title: 'server title' });
  });
});
