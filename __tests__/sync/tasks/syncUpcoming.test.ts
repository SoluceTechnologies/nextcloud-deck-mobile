// __tests__/sync/tasks/syncUpcoming.test.ts
import { syncUpcoming } from '../../../src/sync/tasks/syncUpcoming';
import { fetchUpcoming, flattenUpcoming } from '../../../src/services/deck/overview';
import { reconcile } from '../../../src/sync/reconcile';
import { markLocalWrite } from '../../../src/sync/localWrites';
import type { Account } from '../../../src/types';
import type { DeckCard } from '../../../src/services/deck/types';
import { syncBoardContent } from '../../../src/sync/tasks/syncBoardContent';

jest.mock('../../../src/services/deck/overview');
jest.mock('../../../src/sync/reconcile');
jest.mock('../../../src/sync/tasks/syncBoardContent', () => ({
  syncBoardContent: jest.fn(async () => true),
}));
jest.mock('../../../src/database/utils/safeTransaction', () => ({
  safeWrite: (_db: unknown, fn: () => Promise<unknown>) => fn(),
}));

const mockFetchUpcoming = fetchUpcoming as jest.Mock;
const mockFlattenUpcoming = flattenUpcoming as jest.Mock;
const mockReconcile = reconcile as jest.Mock;

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
    duedate: 5000,
    startdate: null,
    createdAt: 0,
    lastModified: 5000,
    attachmentCount: 0,
    commentsCount: 0,
    dependentCardIds: [],
    labels: [],
    assignees: [],
    ...over,
  };
}

function groups(overdue: DeckCard[]) {
  return { overdue, today: [], tomorrow: [], nextSevenDays: [], later: [], nodue: [] };
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
  for (const name of ['boards', 'stacks', 'cards', 'outbox']) {
    collections[name] = {
      query: jest.fn(() => ({ fetch: jest.fn(async () => tables[name] ?? []) })),
      prepareCreate: jest.fn((writer: (r: any) => void) => {
        const r: any = { _op: 'create', id: `${name}-new`, _tag: name };
        writer(r);
        return r;
      }),
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
const stackRow = makeRow('stacks', { id: 's-local', boardId: 'b-local', remoteId: '5' });

beforeEach(() => {
  jest.clearAllMocks();
  // Default flatten behavior: return the overdue array
  mockFlattenUpcoming.mockImplementation((upcoming: any) => upcoming.overdue || []);
  // Mock reconcile to delegate to real implementation while capturing arguments
  const realReconcile = jest.requireActual('../../../src/sync/reconcile').reconcile;
  mockReconcile.mockImplementation(realReconcile);
});

describe('syncUpcoming', () => {
  it('creates a card whose board and stack are cached', async () => {
    const testCard = card();
    mockFetchUpcoming.mockResolvedValue(groups([testCard]));
    mockFlattenUpcoming.mockImplementation((upcoming: any) => upcoming.overdue || []);
    const { db, batch } = makeDb({ boards: [boardRow], stacks: [stackRow] });

    await syncUpcoming({ db, account });

    const calls = (batch.mock.calls as any);
    expect(calls.length).toBeGreaterThan(0);
    const ops = calls[0][0];
    expect(ops[0]).toMatchObject({
      _tag: 'cards',
      remoteId: '42',
      boardId: 'b-local',
      stackId: 's-local',
    });
  });

  // A local write racing the fetch means the rows this pass is about to write
  // against are already stale. The pass must abort without writing, and it
  // must say so: a caller that reads a bare success here would stamp a
  // snapshot clock for a pass that reconciled nothing.
  it('reports failure and writes nothing when a local write races the fetch', async () => {
    mockFetchUpcoming.mockImplementation(async () => {
      markLocalWrite();
      return groups([card()]);
    });
    mockFlattenUpcoming.mockImplementation((upcoming: any) => upcoming.overdue || []);
    const { db, batch } = makeDb({ boards: [boardRow], stacks: [stackRow] });

    const result = await syncUpcoming({ db, account });

    expect(batch).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('skips a card whose board is not cached', async () => {
    const testCard = card({ boardRemoteId: '99' });
    mockFetchUpcoming.mockResolvedValue(groups([testCard]));
    mockFlattenUpcoming.mockImplementation((upcoming: any) => upcoming.overdue || []);
    const { db, batch } = makeDb({ boards: [boardRow], stacks: [stackRow] });

    await syncUpcoming({ db, account });

    expect(batch).not.toHaveBeenCalled();
  });

  it('pulls the board content when a card sits in a list not cached yet', async () => {
    const testCard = card({ stackRemoteId: '99' });
    mockFetchUpcoming.mockResolvedValue(groups([testCard]));
    mockFlattenUpcoming.mockImplementation((upcoming: any) => upcoming.overdue || []);
    const { db, batch } = makeDb({ boards: [boardRow], stacks: [stackRow] });

    await syncUpcoming({ db, account });

    // Fresh login: lists are unknown until the board content sync stores them
    // (and the card with them); this pass itself still can't place the card.
    expect(syncBoardContent).toHaveBeenCalledTimes(1);
    expect(syncBoardContent).toHaveBeenCalledWith(
      expect.objectContaining({ boardRemoteId: '7', full: true }),
    );
    expect(batch).not.toHaveBeenCalled();
  });

  it('does not pull board content when every list is cached, or the board is unknown', async () => {
    mockFetchUpcoming.mockResolvedValue(groups([card(), card({ remoteId: '43', boardRemoteId: '99', stackRemoteId: '98' })]));
    mockFlattenUpcoming.mockImplementation((upcoming: any) => upcoming.overdue || []);
    const { db } = makeDb({ boards: [boardRow], stacks: [stackRow] });

    await syncUpcoming({ db, account });

    expect(syncBoardContent).not.toHaveBeenCalled();
  });

  it('never removes a local card, because the response is a filtered subset', async () => {
    // The remote payload is non-empty but does not mention the existing local
    // card ('42'): a real delta, not the vacuous [] that short-circuits before
    // syncUpcoming ever reads cardRows.
    const remoteCard = card({ remoteId: '43' });
    mockFetchUpcoming.mockResolvedValue(groups([remoteCard]));
    mockFlattenUpcoming.mockImplementation((upcoming: any) => upcoming.overdue || []);
    const { db, batch } = makeDb({
      boards: [boardRow],
      stacks: [stackRow],
      cards: [makeRow('cards', { remoteId: '42', boardId: 'b-local' })],
    });

    await syncUpcoming({ db, account });

    expect(batch).toHaveBeenCalledTimes(1);
    const calls = (batch.mock.calls as any);
    const ops = calls[0][0];
    expect(ops).toHaveLength(1);
    expect(ops.some((o: any) => o._op === 'delete')).toBe(false);
    expect(ops[0]).toMatchObject({ _tag: 'cards', _op: 'create', remoteId: '43' });
  });

  it('respects the protected fields of a queued mutation', async () => {
    const testCard = card({ title: 'server title' });
    mockFetchUpcoming.mockResolvedValue(groups([testCard]));
    mockFlattenUpcoming.mockImplementation((upcoming: any) => upcoming.overdue || []);
    const { db, batch } = makeDb({
      boards: [boardRow],
      stacks: [stackRow],
      cards: [
        makeRow('cards', {
          id: 'cards-1',
          remoteId: '42',
          boardId: 'b-local',
          stackId: 's-local',
          title: 'my edit',
          lastModified: 1,
        }),
      ],
      outbox: [
        makeRow('outbox', {
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
        }),
      ],
    });

    await syncUpcoming({ db, account });

    const calls = (batch.mock.calls as any);
    expect(calls.length).toBeGreaterThan(0);
    const ops = calls[0][0];
    const update = ops.find((o: any) => o._op === 'update' && o._tag === 'cards');
    expect(update.title).toBeUndefined();
  });

  it('does not remove offline-created cards with empty remoteId even when absent from server response', async () => {
    // A placeable remote card keeps this run past the `placeable.length === 0`
    // early return, so it genuinely reaches the syncedCardRows filter and reconcile.
    const remoteCard = card();
    mockFetchUpcoming.mockResolvedValue(groups([remoteCard]));
    mockFlattenUpcoming.mockImplementation((upcoming: any) => upcoming.overdue || []);
    const { db, batch } = makeDb({
      boards: [boardRow],
      stacks: [stackRow],
      cards: [
        makeRow('cards', { id: 'card-offline-1', remoteId: '', boardId: 'b-local', stackId: 's-local' }),
        makeRow('cards', { id: 'card-offline-2', remoteId: '', boardId: 'b-local', stackId: 's-local' }),
      ],
    });

    await syncUpcoming({ db, account });

    // The two offline rows collide on the empty remoteId key; without the filter,
    // reconcile's duplicate-key loop pushes the second one onto `remove`. Assert on
    // what is actually batched: no delete-shaped op, and exactly one op for the
    // one placeable card.
    expect(batch).toHaveBeenCalledTimes(1);
    const calls = (batch.mock.calls as any);
    const ops = calls[0][0];
    expect(ops).toHaveLength(1);
    expect(ops.some((o: any) => o._op === 'delete')).toBe(false);
    expect(ops[0]).toMatchObject({ _tag: 'cards', _op: 'create', remoteId: '42' });
  });

  it('filters local cards with empty remoteId before passing rows to reconcile', async () => {
    // This test uses jest.mock to spy on the reconcile arguments directly,
    // capturing what syncUpcoming passes as the rows parameter.
    // The assertion is about what reconcile is asked to consider,
    // independent of what it returns or what syncUpcoming does with the result.
    const remoteCard = card();
    mockFetchUpcoming.mockResolvedValue(groups([remoteCard]));
    mockFlattenUpcoming.mockImplementation((upcoming: any) => upcoming.overdue || []);
    const { db } = makeDb({
      boards: [boardRow],
      stacks: [stackRow],
      cards: [
        // Local card with empty remoteId (offline-created): should be filtered out
        makeRow('cards', { id: 'offline-card', remoteId: '', boardId: 'b-local', stackId: 's-local' }),
        // Local card with real remoteId (synced): should be included
        makeRow('cards', { id: 'synced-card', remoteId: '99', boardId: 'b-local', stackId: 's-local' }),
      ],
    });

    await syncUpcoming({ db, account });

    // Assert reconcile was called
    expect(mockReconcile).toHaveBeenCalledTimes(1);
    // Capture the rows argument passed to reconcile
    const reconcileCall = mockReconcile.mock.calls[0][0];
    const rowsArg = reconcileCall.rows;

    // Assert: rows should exclude the offline card but include the synced one
    expect(rowsArg).toHaveLength(1);
    expect(rowsArg[0]).toMatchObject({ id: 'synced-card', remoteId: '99' });
  });
});
