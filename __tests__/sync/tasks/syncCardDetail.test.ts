import { syncCardDetail } from '../../../src/sync/tasks/syncCardDetail';
import { fetchComments } from '../../../src/services/deck/comments';
import { fetchAttachments } from '../../../src/services/deck/attachments';
import type { Account } from '../../../src/types';
import type { DeckAttachment, DeckComment } from '../../../src/services/deck/types';

jest.mock('../../../src/services/deck/comments');
jest.mock('../../../src/services/deck/attachments');
jest.mock('../../../src/database/utils/safeTransaction', () => ({
  safeWrite: (_db: unknown, fn: () => Promise<unknown>) => fn(),
}));

const fetchCommentsMock = fetchComments as jest.Mock;
const fetchAttachmentsMock = fetchAttachments as jest.Mock;

const account: Account = {
  id: 'acc-1',
  displayName: 'Work',
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'x',
  davUserId: 'john',
};

function comment(over: Partial<DeckComment> = {}): DeckComment {
  return {
    remoteId: '9',
    message: 'hello',
    actorId: 'alice',
    actorDisplayName: 'Alice',
    createdAt: 1000,
    parentId: null,
    ...over,
  };
}

function attachment(over: Partial<DeckAttachment> = {}): DeckAttachment {
  return {
    remoteId: '3',
    attachmentType: 'file',
    fileName: 'photo.jpg',
    mime: 'image/jpeg',
    size: 1024,
    createdAt: 2000,
    createdBy: 'alice',
    ...over,
  };
}

/** A local row with the prepare* methods `reconcile`'s update/remove plans call. */
function makeRow(over: Record<string, unknown>) {
  return {
    prepareUpdate: jest.fn((writer: (r: any) => void) => {
      const r: any = { op: 'update' };
      writer(r);
      return r;
    }),
    prepareMarkAsDeleted: jest.fn(() => ({ op: 'delete' })),
    ...over,
  };
}

// Mutable fixtures the tests reassign; the mock db's methods close over these
// bindings so a reassignment is visible on the next call, same idiom as
// `syncBoardContent.test.ts`'s per-test row overrides.
let cardRow: any;
let stackRow: any;
let boardRow: any;
let existingComments: any[];
let existingAttachments: any[];

function prepareCreate(tag: string) {
  return jest.fn((writer: (r: any) => void) => {
    const r: any = { op: 'create', _tag: tag };
    writer(r);
    return r;
  });
}

const collections: Record<string, any> = {
  cards: { find: jest.fn(async () => cardRow) },
  stacks: { find: jest.fn(async () => stackRow) },
  boards: { find: jest.fn(async () => boardRow) },
  comments: {
    query: jest.fn(() => ({ fetch: jest.fn(async () => existingComments) })),
    prepareCreate: prepareCreate('comments'),
  },
  attachments: {
    query: jest.fn(() => ({ fetch: jest.fn(async () => existingAttachments) })),
    prepareCreate: prepareCreate('attachments'),
  },
};

const db: any = {
  get: jest.fn((t: string) => collections[t]),
  batch: jest.fn(async () => {}),
};

function batchedOps() {
  return (db.batch as jest.Mock).mock.calls[0]?.[0] ?? [];
}

beforeEach(() => {
  jest.clearAllMocks();
  cardRow = { id: 'c1', remoteId: '42', stackId: 's-local', boardId: 'b-local' };
  stackRow = { id: 's-local', remoteId: '5', boardId: 'b-local' };
  boardRow = { id: 'b-local', remoteId: '7' };
  // Each defaults to one already-synced row, so a reconcile that wrongly
  // treated `null` as `[]` would have something on hand to delete — see the
  // two "answers null" tests below.
  existingComments = [
    makeRow({
      id: 'cm1',
      remoteId: '7',
      message: 'old',
      actorId: 'alice',
      actorDisplayName: 'Alice',
      createdAt: 1000,
      parentId: null,
    }),
  ];
  existingAttachments = [makeRow({ id: 'at1', ...attachment() })];
  // The remote twin of cm1 with a different message: the "one batch" test
  // observes exactly one update op.
  fetchCommentsMock.mockResolvedValue([comment({ remoteId: '7', message: 'new' })]);
  // The unchanged remote twin of at1: contributes no op, so tests that don't
  // care about attachments see a clean batch.
  fetchAttachmentsMock.mockResolvedValue([attachment()]);
});

describe('syncCardDetail', () => {
  it('writes the fetched comments and attachments in one batch', async () => {
    await syncCardDetail({ db, account, cardLocalId: 'c1' });
    expect(db.batch).toHaveBeenCalledTimes(1);
  });

  // The convention that cost tranche A a Critical: null is not an empty list.
  it('deletes nothing when the comments call answers null', async () => {
    fetchCommentsMock.mockResolvedValue(null);
    await syncCardDetail({ db, account, cardLocalId: 'c1' });
    expect(batchedOps()).not.toContainEqual(expect.objectContaining({ op: 'delete' }));
  });

  it('deletes nothing when the attachments call answers null', async () => {
    fetchAttachmentsMock.mockResolvedValue(null);
    await syncCardDetail({ db, account, cardLocalId: 'c1' });
    expect(batchedOps()).not.toContainEqual(expect.objectContaining({ op: 'delete' }));
  });

  // A comment posted offline has remote_id = '' and must survive the pass.
  it('does not delete a locally created comment that has no remote id', async () => {
    existingComments = [{ id: 'local-1', remoteId: '' }];
    fetchCommentsMock.mockResolvedValue([]);

    await syncCardDetail({ db, account, cardLocalId: 'c1' });
    expect(batchedOps()).toEqual([]);
  });

  it('reports hasMore when a full page came back', async () => {
    fetchCommentsMock.mockResolvedValue(new Array(20).fill(comment()));
    await expect(syncCardDetail({ db, account, cardLocalId: 'c1' })).resolves.toEqual({ hasMore: true });
  });

  it('reports no more when a partial page came back', async () => {
    fetchCommentsMock.mockResolvedValue(new Array(7).fill(comment()));
    await expect(syncCardDetail({ db, account, cardLocalId: 'c1' })).resolves.toEqual({ hasMore: false });
  });

  it('does nothing for a card that has never synced', async () => {
    cardRow = { id: 'c1', remoteId: '' };
    await syncCardDetail({ db, account, cardLocalId: 'c1' });
    expect(fetchCommentsMock).not.toHaveBeenCalled();
  });

  // Paging rule (R46): a page is authoritative only when it is the complete
  // set. At a later offset a short page is still just one page among others,
  // so a local comment the page didn't happen to include must not be read as
  // "the server deleted it".
  it('does not delete a local comment missing from a partial page fetched at a later offset', async () => {
    existingComments = [makeRow({ id: 'local-1', remoteId: '99' })];
    fetchCommentsMock.mockResolvedValue(new Array(7).fill(comment({ remoteId: '5' })));

    await syncCardDetail({ db, account, cardLocalId: 'c1', offset: 20 });

    expect(batchedOps().filter((o: any) => o.op === 'delete')).toEqual([]);
  });

  // cardRefOf throws DeferredIntentError when the card's stack or board
  // hasn't itself been pushed yet; the pass must back off quietly rather
  // than propagate that as a hard failure.
  it('does nothing when the stack has not synced yet', async () => {
    stackRow = { id: 's-local', remoteId: '', boardId: 'b-local' };

    await expect(syncCardDetail({ db, account, cardLocalId: 'c1' })).resolves.toEqual({ hasMore: false });
    expect(fetchCommentsMock).not.toHaveBeenCalled();
  });
});
