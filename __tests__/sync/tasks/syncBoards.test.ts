import { syncBoards } from '../../../src/sync/tasks/syncBoards';
import { fetchBoards } from '../../../src/services/deck/boards';
import { markLocalWrite } from '../../../src/sync/localWrites';
import type { Account } from '../../../src/types';
import type { DeckBoard } from '../../../src/services/deck/types';

jest.mock('../../../src/services/deck/boards');
jest.mock('../../../src/database/utils/safeTransaction', () => ({
  safeWrite: (_db: unknown, fn: () => Promise<unknown>) => fn(),
}));

const mockFetchBoards = fetchBoards as jest.Mock;

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

beforeEach(() => jest.clearAllMocks());

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
});
