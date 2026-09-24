import { syncBoards } from '../../../src/sync/tasks/syncBoards';
import { fetchBoards } from '../../../src/services/deck/boards';
import { loadQueuedIntents } from '../../../src/sync/outbox/pending';
import { markLocalWrite } from '../../../src/sync/localWrites';
import { drainOutbox } from '../../../src/sync/outbox/drain';
import { executeIntent } from '../../../src/sync/outbox/handlers';
import type { Account } from '../../../src/types';
import type { DeckBoard } from '../../../src/services/deck/types';

jest.mock('../../../src/services/deck/boards');
jest.mock('../../../src/sync/outbox/pending');
jest.mock('../../../src/database/utils/safeTransaction', () => ({
  safeWrite: (_db: unknown, fn: () => Promise<unknown>) => fn(),
}));
jest.mock('../../../src/sync/outbox/handlers', () => {
  const actual = jest.requireActual('../../../src/sync/outbox/handlers');
  return { ...actual, executeIntent: jest.fn() };
});

const mockFetchBoards = fetchBoards as jest.Mock;
const mockLoadQueuedIntents = loadQueuedIntents as jest.Mock;
const mockExecuteIntent = executeIntent as jest.Mock;

const account: Account = {
  id: 'acc-1',
  displayName: 'Work',
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'x',
  davUserId: 'john',
};

function board(over: Partial<DeckBoard> = {}): DeckBoard {
  return {
    remoteId: '7',
    title: 'Ops',
    color: '#0082c9',
    archived: false,
    owner: 'john',
    shared: false,
    canEdit: true,
    canManage: true,
    canShare: true,
    lastModified: 5000,
    etag: null,
    users: [],
    acl: [],
    labels: [],
    ...over,
  };
}

function makeDb(boardRows: any[], labelRows: any[] = []) {
  const batch = jest.fn(async () => {});
  const make = (rows: any[], tag: string) => ({
    query: jest.fn(() => ({ fetch: jest.fn(async () => rows) })),
    prepareCreate: jest.fn((writer: (r: any) => void) => {
      const r: any = { _op: 'create', id: `${tag}-new`, _tag: tag };
      writer(r);
      return r;
    }),
  });
  const boards = make(boardRows, 'board');
  const labels = make(labelRows, 'label');
  return {
    db: {
      get: jest.fn((table: string) => (table === 'boards' ? boards : labels)),
      batch,
      write: jest.fn(async (fn: any) => fn()),
    } as any,
    batch,
  };
}

function makeRow(over: Record<string, unknown> = {}) {
  return {
    id: 'row-1',
    remoteId: '7',
    title: 'Ops',
    color: '#0082c9',
    archived: false,
    owner: 'john',
    shared: false,
    canEdit: true,
    canManage: true,
    canShare: true,
    lastModified: 5000,
    aclJson: '[]',
    usersJson: '[]',
    prepareUpdate: jest.fn((writer: (r: any) => void) => {
      const r: any = { _op: 'update' };
      writer(r);
      return r;
    }),
    prepareMarkAsDeleted: jest.fn(() => ({ _op: 'delete' })),
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadQueuedIntents.mockResolvedValue([]);
});

describe('syncBoards', () => {
  it('sends the newest known lastModified minus a 2 s overlap on a delta pass', async () => {
    mockFetchBoards.mockResolvedValue([]);
    const { db } = makeDb([makeRow({ lastModified: 9000 })]);

    await syncBoards({ db, account, full: false });

    expect(mockFetchBoards).toHaveBeenCalledWith(account, 7000);
  });

  it('sends no cursor on a snapshot pass', async () => {
    mockFetchBoards.mockResolvedValue([]);
    const { db } = makeDb([makeRow({ lastModified: 9000 })]);

    await syncBoards({ db, account, full: true });

    expect(mockFetchBoards).toHaveBeenCalledWith(account, undefined);
  });

  it('sends no cursor when nothing is cached yet', async () => {
    mockFetchBoards.mockResolvedValue([]);
    const { db } = makeDb([]);

    await syncBoards({ db, account, full: false });

    expect(mockFetchBoards).toHaveBeenCalledWith(account, undefined);
  });

  it('creates a board it has never seen', async () => {
    mockFetchBoards.mockResolvedValue([board({ remoteId: '9', title: 'New' })]);
    const { db, batch } = makeDb([]);

    await syncBoards({ db, account, full: false });

    const calls = (batch as any).mock.calls;
    const ops = calls[0]?.[0];
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ _op: 'create', remoteId: '9', title: 'New' });
  });

  it('updates a board whose title changed', async () => {
    mockFetchBoards.mockResolvedValue([board({ title: 'Ops renamed', lastModified: 6000 })]);
    const { db, batch } = makeDb([makeRow()]);

    await syncBoards({ db, account, full: false });

    const calls = (batch as any).mock.calls;
    const ops = calls[0]?.[0];
    expect(ops?.[0]).toMatchObject({ _op: 'update', title: 'Ops renamed' });
  });

  it('writes nothing when the board is byte-identical', async () => {
    mockFetchBoards.mockResolvedValue([board()]);
    const { db, batch } = makeDb([makeRow()]);

    await syncBoards({ db, account, full: false });

    expect(batch).not.toHaveBeenCalled();
  });

  it('keeps a board missing from a delta response', async () => {
    mockFetchBoards.mockResolvedValue([]);
    const { db, batch } = makeDb([makeRow()]);

    await syncBoards({ db, account, full: false });

    expect(batch).not.toHaveBeenCalled();
  });

  it('removes a board missing from a snapshot response', async () => {
    mockFetchBoards.mockResolvedValue([]);
    const { db, batch } = makeDb([makeRow()]);

    await syncBoards({ db, account, full: true });

    const calls = (batch as any).mock.calls;
    const ops = calls[0]?.[0];
    expect(ops).toEqual([{ _op: 'delete' }]);
  });

  it('does not delete offline boards with empty remoteId on a snapshot pass', async () => {
    mockFetchBoards.mockResolvedValue([board({ remoteId: '9', title: 'Remote board' })]);
    const { db, batch } = makeDb([
      makeRow({ id: 'offline-1', remoteId: '', title: 'Offline board 1' }),
      makeRow({ id: 'offline-2', remoteId: '', title: 'Offline board 2' }),
    ]);

    await syncBoards({ db, account, full: true });

    // Should only create the remote board, not delete the offline boards
    const calls = (batch as any).mock.calls;
    const ops = calls[0]?.[0];
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ _op: 'create', remoteId: '9' });
  });

  // A local write racing the fetch means the rows this pass is about to write
  // against are already stale. The pass must abort without writing, and it
  // must say so: a caller that reads a bare success here would stamp a
  // snapshot clock for a pass that reconciled nothing.
  it('reports failure and writes nothing when a local write races the fetch', async () => {
    mockFetchBoards.mockImplementation(async () => {
      markLocalWrite();
      return [];
    });
    const { db, batch } = makeDb([makeRow()]);

    const result = await syncBoards({ db, account, full: true });

    expect(batch).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('creates the labels carried by a new board', async () => {
    mockFetchBoards.mockResolvedValue([
      board({ remoteId: '9', labels: [{ remoteId: '3', title: 'Urgent', color: '#ff0000' }] }),
    ]);
    const { db, batch } = makeDb([]);

    await syncBoards({ db, account, full: false });

    const calls = (batch as any).mock.calls;
    const ops = calls[0]?.[0] as any[];
    expect(ops?.some((op: any) => op._tag === 'label' && op.title === 'Urgent')).toBe(true);
  });

  it('does not revert a board whose update is still queued', async () => {
    // Local row was renamed optimistically; the server still has the old title.
    mockLoadQueuedIntents.mockResolvedValue([
      {
        entry: { entityId: 'b1' },
        intent: { kind: 'updateBoard', boardId: 'b1', title: 'New', color: null, archived: false },
      },
    ]);
    mockFetchBoards.mockResolvedValue([board({ remoteId: '11', title: 'Old' })]);
    const { db, batch } = makeDb([makeRow({ id: 'b1', remoteId: '11', title: 'New' })]);

    await syncBoards({ db, account, full: false });

    const ops = (batch as any).mock.calls[0]?.[0] ?? [];
    expect(ops.filter((o: any) => o._op === 'update')).toEqual([]);
  });

  it('does not resurrect a board whose delete is still queued', async () => {
    // The row is already gone locally; a full snapshot still lists it.
    mockLoadQueuedIntents.mockResolvedValue([
      { entry: { entityId: 'b9' }, intent: { kind: 'deleteBoard', boardId: 'b9', boardRemoteId: '99' } },
    ]);
    mockFetchBoards.mockResolvedValue([board({ remoteId: '99' })]);
    const { db, batch } = makeDb([]);

    await syncBoards({ db, account, full: true });

    const ops = (batch as any).mock.calls[0]?.[0] ?? [];
    expect(ops.filter((o: any) => o._op === 'create')).toEqual([]);
  });

  it('still reconciles a board with nothing queued', async () => {
    mockLoadQueuedIntents.mockResolvedValue([]);
    mockFetchBoards.mockResolvedValue([board({ remoteId: '11', title: 'Renamed' })]);
    const { db, batch } = makeDb([makeRow({ id: 'b1', remoteId: '11', title: 'Old' })]);

    await syncBoards({ db, account, full: false });

    const ops = (batch as any).mock.calls[0]?.[0] ?? [];
    expect(ops.filter((o: any) => o._op === 'update')).toHaveLength(1);
  });

  // The drain and this pass are not serialized: a reconnect can fire both at
  // once. If a send completes and destroys its outbox row *while this pass's
  // fetch is still in flight*, the epoch captured before the fetch is stale by
  // the time it resolves — the drain's own write raced it, same as a direct
  // local edit would. Without the drain bumping the epoch on a successful
  // send, this pass has no way to notice and reverts the row to the
  // pre-mutation value the fetch happened to carry.
  it('aborts when an outbox drain completes while its fetch is still in flight', async () => {
    const outboxRow: any = {
      id: 'o1',
      accountId: 'acc-1',
      entityId: 'c1',
      kind: 'setCardArchived',
      payloadJson: JSON.stringify({ kind: 'setCardArchived', cardId: 'c1', archived: true }),
      serverValuesJson: '{}',
      createdAt: 1,
      attempts: 0,
      nextAttemptAt: 0,
      state: 'queued',
      lastError: undefined,
      destroyed: false,
    };
    outboxRow.destroyPermanently = jest.fn(async () => {
      outboxRow.destroyed = true;
    });
    const outboxDb = {
      get: jest.fn(() => ({
        query: jest.fn(() => ({
          fetch: jest.fn(async () => [outboxRow].filter((r) => !r.destroyed)),
        })),
      })),
    } as any;
    mockExecuteIntent.mockResolvedValue(undefined);

    mockFetchBoards.mockImplementation(async () => {
      // The reconnect's other half: a full drain runs — and finishes,
      // destroying its row — before this in-flight fetch resolves.
      await drainOutbox({ db: outboxDb, account });
      return [board({ title: 'Reverted' })];
    });
    const { db, batch } = makeDb([makeRow({ title: 'Renamed locally' })]);

    const result = await syncBoards({ db, account, full: false });

    expect(outboxRow.destroyed).toBe(true);
    expect(result).toBe(false);
    expect(batch).not.toHaveBeenCalled();
  });
});
