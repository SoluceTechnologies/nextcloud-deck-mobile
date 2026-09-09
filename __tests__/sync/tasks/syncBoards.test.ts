import { syncBoards } from '../../../src/sync/tasks/syncBoards';
import { fetchBoards } from '../../../src/services/deck/boards';
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

function makeDb(rows: any[]) {
  const batch = jest.fn(async () => {});
  const collection = {
    query: jest.fn(() => ({ fetch: jest.fn(async () => rows) })),
    prepareCreate: jest.fn((writer: (r: any) => void) => {
      const r: any = { _op: 'create' };
      writer(r);
      return r;
    }),
  };
  return {
    db: { get: jest.fn(() => collection), batch, write: jest.fn(async (fn: any) => fn()) } as any,
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
});
