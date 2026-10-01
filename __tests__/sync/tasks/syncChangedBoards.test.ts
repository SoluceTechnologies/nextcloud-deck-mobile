import { syncChangedBoards } from '../../../src/sync/tasks/syncChangedBoards';
import { syncBoardContent } from '../../../src/sync/tasks/syncBoardContent';
import type { Account } from '../../../src/types';

jest.mock('../../../src/sync/tasks/syncBoardContent', () => ({ syncBoardContent: jest.fn() }));

const mockSyncBoardContent = syncBoardContent as jest.Mock;

const account = { id: 'acc-1' } as Account;

function dbWith(boards: { remoteId: string; lastModified: number; etag?: string }[]) {
  return {
    get: () => ({ query: () => ({ fetch: async () => boards }) }),
  } as any;
}

const synced = () => mockSyncBoardContent.mock.calls.map(([p]) => p.boardRemoteId);

beforeEach(() => {
  mockSyncBoardContent.mockReset().mockResolvedValue(true);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

it('snapshots every board on the first pass, then only the ones whose signature changed', async () => {
  const seen = new Map<string, string>();
  const boards = [
    { remoteId: '1', lastModified: 100, etag: 'a' },
    { remoteId: '2', lastModified: 200, etag: 'b' },
  ];

  await syncChangedBoards({ db: dbWith(boards), account, seen, all: false, skip: [] });
  expect(synced()).toEqual(['1', '2']);
  expect(mockSyncBoardContent).toHaveBeenCalledWith(expect.objectContaining({ full: true }));

  mockSyncBoardContent.mockClear();
  boards[1] = { remoteId: '2', lastModified: 200, etag: 'c' };
  await syncChangedBoards({ db: dbWith(boards), account, seen, all: false, skip: [] });
  expect(synced()).toEqual(['2']);
});

it('resyncs unchanged boards when asked for all of them, but never a skipped one', async () => {
  const seen = new Map([['1', '100:a'], ['2', '200:b']]);
  const boards = [
    { remoteId: '1', lastModified: 100, etag: 'a' },
    { remoteId: '2', lastModified: 200, etag: 'b' },
  ];

  await syncChangedBoards({ db: dbWith(boards), account, seen, all: true, skip: ['2'] });
  expect(synced()).toEqual(['1']);
});

it('retries a board whose sync failed or was aborted, and keeps going past it', async () => {
  const seen = new Map<string, string>();
  const boards = [
    { remoteId: '1', lastModified: 100 },
    { remoteId: '2', lastModified: 200 },
    { remoteId: '3', lastModified: 300 },
  ];
  mockSyncBoardContent
    .mockRejectedValueOnce(new Error('boom'))
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(true);

  const onBoardSynced = jest.fn();
  await syncChangedBoards({ db: dbWith(boards), account, seen, all: false, skip: [], onBoardSynced });
  expect(synced()).toEqual(['1', '2', '3']);
  expect([...seen.keys()]).toEqual(['3']);
  expect(onBoardSynced.mock.calls.map(([id]) => id)).toEqual(['2', '3']);
});
