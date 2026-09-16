import { recordRecentBoard, MAX_RECENT_BOARDS } from '../../../src/features/today/recentBoards';

jest.mock('../../../src/database/utils/safeTransaction', () => ({
  safeWrite: (_db: unknown, fn: () => Promise<unknown>) => fn(),
}));

function makeRow(fields: { boardId: string; openedAt: number }) {
  const row: any = { ...fields };
  row.prepareUpdate = jest.fn((writer: (r: any) => void) => {
    writer(row);
    return row;
  });
  row.prepareMarkAsDeleted = jest.fn(() => ({ _op: 'delete', boardId: fields.boardId }));
  return row;
}

// `db.get('recent_boards')` in the useBoardActions.test.ts style: query().fetch()
// plus prepareCreate, with a db-level batch spy alongside it (safeWrite above
// runs its callback straight through, so this exercises the real batching).
function makeDb(rows: any[]) {
  const batch = jest.fn(async (_ops: unknown[]) => {});
  const prepareCreate = jest.fn((writer: (r: any) => void) => {
    const r: any = { _op: 'create' };
    writer(r);
    return r;
  });
  const fetch = jest.fn(async () => rows);
  const query = jest.fn(() => ({ fetch }));
  const get = jest.fn(() => ({ query, prepareCreate }));
  return { db: { get, batch } as any, batch, prepareCreate };
}

beforeEach(() => jest.clearAllMocks());

it('exposes a cap of ten recent boards', () => {
  expect(MAX_RECENT_BOARDS).toBe(10);
});

it('creates a row the first time a board is opened', async () => {
  const { db, batch, prepareCreate } = makeDb([]);

  await recordRecentBoard(db, 'a1', 'b1', 1000);

  expect(prepareCreate).toHaveBeenCalledTimes(1);
  const created = prepareCreate.mock.results[0].value;
  expect(created.accountId).toBe('a1');
  expect(created.boardId).toBe('b1');
  expect(created.openedAt).toBe(1000);
  expect(batch).toHaveBeenCalledTimes(1);
});

it('updates openedAt instead of duplicating an existing row', async () => {
  const existing = makeRow({ boardId: 'b1', openedAt: 500 });
  const { db, batch, prepareCreate } = makeDb([existing]);

  await recordRecentBoard(db, 'a1', 'b1', 1000);

  expect(existing.prepareUpdate).toHaveBeenCalledTimes(1);
  expect(existing.openedAt).toBe(1000);
  expect(prepareCreate).not.toHaveBeenCalled();
  expect(batch).toHaveBeenCalledTimes(1);
});

it('keeps only the ten most recent rows', async () => {
  // MAX_RECENT_BOARDS + 1 rows already exist; the call touches one of them
  // (an update, not a create), so the total stays the same and pruning must
  // drop exactly the oldest to get back down to the cap.
  const rows = Array.from({ length: MAX_RECENT_BOARDS + 1 }, (_, i) =>
    makeRow({ boardId: `b${i}`, openedAt: i }),
  );
  const touched = rows[5];
  const oldest = rows[0];
  const { db, batch } = makeDb(rows);

  await recordRecentBoard(db, 'a1', touched.boardId, 999);

  expect(oldest.prepareMarkAsDeleted).toHaveBeenCalledTimes(1);
  expect(touched.prepareMarkAsDeleted).not.toHaveBeenCalled();
  expect(batch).toHaveBeenCalledTimes(1);
});

it('commits everything in one batch', async () => {
  // Already at the cap; opening one more board both creates its row and
  // prunes the oldest of the existing ones — both must travel in the SAME
  // db.batch call, not two separate ones.
  const rows = Array.from({ length: MAX_RECENT_BOARDS }, (_, i) =>
    makeRow({ boardId: `b${i}`, openedAt: i }),
  );
  const oldest = rows[0];
  const { db, batch, prepareCreate } = makeDb(rows);

  await recordRecentBoard(db, 'a1', 'b-new', 999);

  expect(batch).toHaveBeenCalledTimes(1);
  const ops = batch.mock.calls[0][0];
  expect(ops).toHaveLength(2);
  expect(ops).toContain(prepareCreate.mock.results[0].value);
  expect(oldest.prepareMarkAsDeleted).toHaveBeenCalledTimes(1);
});
