import { syncBoardContent } from '../../../src/sync/tasks/syncBoardContent';
import { fetchStacks } from '../../../src/services/deck/boards';
import { markLocalWrite } from '../../../src/sync/localWrites';
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
  for (const name of ['boards', 'stacks', 'cards', 'outbox', 'labels', 'card_labels', 'card_assignees']) {
    collections[name] = {
      // A `Q.oneOf` clause is the account-wide pending-card lookup (see
      // `syncBoardContent`): a fixture may supply a `<name>Pending` override
      // for it, distinct from the board-scoped rows under `<name>`, to
      // simulate a row that moved to another board. Absent an override, it
      // falls back to the same rows every other query on this table sees.
      query: jest.fn((...clauses: any[]) => ({
        fetch: jest.fn(async () => {
          const isOneOf = clauses.some((c: any) => c?.comparison?.operator === 'oneOf');
          return (isOneOf ? tables[`${name}Pending`] : undefined) ?? tables[name] ?? [];
        }),
      })),
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

const mockFetch = jest.fn();
(globalThis as any).fetch = mockFetch;

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

  // The stack reconcile is authoritative (`deleteMissing: true`), so a stack
  // created offline — remoteId = '' until its createStack flushes — matches no
  // remote stack and would be marked deleted before it is ever pushed. Two of
  // them also collide on that empty key, which `reconcile` dedups unconditionally.
  it('does not delete stacks created offline that have not been pushed yet', async () => {
    mockFetchStacks.mockResolvedValue([stack([])]);
    const { db, batch } = makeDb({
      boards: [boardRow],
      stacks: [
        makeRow('stacks', { id: 'stacks-1', boardId: 'b-local', remoteId: '5', title: 'Doing', order: 0, lastModified: 4000 }),
        makeRow('stacks', { id: 'stacks-2', boardId: 'b-local', remoteId: '' }),
        makeRow('stacks', { id: 'stacks-3', boardId: 'b-local', remoteId: '' }),
      ],
    });

    await syncBoardContent({ db, account, boardRemoteId: '7', full: true });

    const ops = (batch as any).mock.calls[0]?.[0] ?? [];
    expect(ops.filter((o: any) => o._op === 'delete' && o._tag === 'stacks')).toEqual([]);
  });

  // The real fetcher runs here: the response status is the thing under test,
  // and a 304 on a conditional GET must not read as "this board has no stacks"
  // — the stack reconcile is authoritative and would delete the whole board.
  it('deletes nothing when the stacks endpoint answers 304', async () => {
    const boards = jest.requireActual('../../../src/services/deck/boards');
    mockFetchStacks.mockImplementation(boards.fetchStacks);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 304,
      headers: { get: () => null },
      text: async () => '',
    });
    const { db, batch } = makeDb({
      boards: [boardRow],
      stacks: [makeRow('stacks', { boardId: 'b-local', remoteId: '5' })],
      cards: [makeRow('cards', { boardId: 'b-local', remoteId: '42', lastModified: 9000 })],
    });

    await syncBoardContent({ db, account, boardRemoteId: '7', full: false });

    const ops = (batch as any).mock.calls[0]?.[0] ?? [];
    expect(ops.filter((o: any) => o._op === 'delete')).toEqual([]);
  });

  // A local write racing the fetch means the rows this pass is about to write
  // against are already stale. The pass must abort without writing, and it
  // must say so: a caller that reads a bare success here would stamp a
  // snapshot clock for a pass that reconciled nothing.
  it('reports failure and writes nothing when a local write races the fetch', async () => {
    mockFetchStacks.mockImplementation(async () => {
      markLocalWrite();
      return [stack([])];
    });
    const { db, batch } = makeDb({ boards: [boardRow] });

    const result = await syncBoardContent({ db, account, boardRemoteId: '7', full: true });

    expect(batch).not.toHaveBeenCalled();
    expect(result).toBe(false);
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
      cards: [makeRow('cards', { id: 'cards-1', boardId: 'b-local', remoteId: '99', lastModified: 0 })],
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

  // `useCardActions.move` re-homes the local row to the target board right
  // away, while the `moveCard` intent is still queued. This board's own
  // cards query (scoped by board_id) therefore no longer sees the row at
  // all, so a protectedRowIds built from it would miss the card entirely —
  // and a full snapshot that still lists the card here (the server hasn't
  // seen the move yet) would get recreated as a second local row.
  it('does not recreate a card that moved to another board while its move is still queued', async () => {
    mockFetchStacks.mockResolvedValue([stack([card({ remoteId: '42' })])]);
    const { db, batch } = makeDb({
      boards: [boardRow],
      stacks: [makeRow('stacks', { boardId: 'b-local', remoteId: '5', title: 'Doing', order: 0, lastModified: 4000 })],
      cards: [], // the moved card's row now carries board_id = 'other'
      cardsPending: [makeRow('cards', { id: 'c1', boardId: 'other', remoteId: '42', lastModified: 0 })],
      outbox: [
        makeRow('outbox', {
          entityType: 'card',
          entityId: 'c1',
          state: 'queued',
          serverValuesJson: '{}',
          payloadJson: JSON.stringify({ kind: 'moveCard', cardId: 'c1', toStackId: '5', order: 0 }),
        }),
      ],
    });

    await syncBoardContent({ db, account, boardRemoteId: '7', full: true });

    const ops = (batch as any).mock.calls[0]?.[0] ?? [];
    expect(ops.some((o: any) => o._op === 'create' && o._tag === 'cards' && o.remoteId === '42')).toBe(false);
    expect(ops.some((o: any) => o._op === 'delete' && o._tag === 'cards')).toBe(false);
  });

  // `useCardActions.remove` marks the local row deleted right away, while the
  // `deleteCard` intent is still queued. No card row carries the key any more,
  // so a protectedRowIds built from rows alone would miss it — and a full
  // snapshot that still lists the card (the server hasn't seen the DELETE yet)
  // would recreate it, resurrecting a card the user just removed.
  it('does not recreate a card whose delete is still queued', async () => {
    mockFetchStacks.mockResolvedValue([stack([card({ remoteId: '42' })])]);
    const { db, batch } = makeDb({
      boards: [boardRow],
      stacks: [makeRow('stacks', { boardId: 'b-local', remoteId: '5', title: 'Doing', order: 0, lastModified: 4000 })],
      cards: [], // the row is already gone
      outbox: [
        makeRow('outbox', {
          entityType: 'card',
          entityId: 'c1',
          state: 'queued',
          serverValuesJson: '{}',
          payloadJson: JSON.stringify({
            kind: 'deleteCard',
            cardId: 'c1',
            ref: { boardRemoteId: '7', stackRemoteId: '5', cardRemoteId: '42' },
          }),
        }),
      ],
    });

    await syncBoardContent({ db, account, boardRemoteId: '7', full: true });

    const ops = (batch as any).mock.calls[0]?.[0] ?? [];
    expect(ops.filter((o: any) => o._op === 'create' && o._tag === 'cards')).toEqual([]);
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

  it('links the labels carried by a card', async () => {
    mockFetchStacks.mockResolvedValue([
      stack([card({ labels: [{ remoteId: '3', title: 'Urgent', color: null }] })]),
    ]);
    const { db, batch } = makeDb({
      boards: [boardRow],
      labels: [makeRow('labels', { id: 'label-local', boardId: 'b-local', remoteId: '3' })],
    });

    await syncBoardContent({ db, account, boardRemoteId: '7', full: true });

    const ops = (batch as any).mock.calls[0][0];
    expect(ops.some((o: any) => o._tag === 'card_labels' && o.labelId === 'label-local')).toBe(true);
  });

  // A label assigned offline creates its join row and queues assignLabel before
  // the server has ever seen it. The board pass that lands before the outbox
  // drains must not read "the server does not report this label" as "the user
  // removed it" — the join row is owned by a queued mutation.
  it('does not unlink a label a queued assignLabel intent owns, before the server reports it', async () => {
    mockFetchStacks.mockResolvedValue([stack([card()])]); // the remote card carries no labels yet
    const { db, batch } = makeDb({
      boards: [boardRow],
      labels: [makeRow('labels', { id: 'label-local', boardId: 'b-local', remoteId: '3' })],
      cards: [makeRow('cards', { id: 'cards-1', boardId: 'b-local', remoteId: '42', lastModified: 5000 })],
      card_labels: [makeRow('card_labels', { id: 'cl-1', cardId: 'cards-1', labelId: 'label-local' })],
      outbox: [
        makeRow('outbox', {
          entityType: 'card',
          entityId: 'cards-1',
          state: 'queued',
          serverValuesJson: '{}',
          payloadJson: JSON.stringify({ kind: 'assignLabel', cardId: 'cards-1', labelId: 'label-local' }),
        }),
      ],
    });

    await syncBoardContent({ db, account, boardRemoteId: '7', full: true });

    const ops = (batch as any).mock.calls[0]?.[0] ?? [];
    expect(ops.some((o: any) => o._op === 'delete' && o._tag === 'card_labels')).toBe(false);
  });
});
