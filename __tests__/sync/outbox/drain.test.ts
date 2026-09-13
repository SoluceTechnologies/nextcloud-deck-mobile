// __tests__/sync/outbox/drain.test.ts
import { drainOutbox, backoffMs, MAX_ATTEMPTS } from '../../../src/sync/outbox/drain';
import { executeIntent, DeferredIntentError } from '../../../src/sync/outbox/handlers';
import { HttpError } from '../../../src/services/shared/errors';
import type { Account } from '../../../src/types';
import type { Intent } from '../../../src/sync/outbox/types';

jest.mock('../../../src/sync/outbox/handlers', () => {
  const actual = jest.requireActual('../../../src/sync/outbox/handlers');
  return { ...actual, executeIntent: jest.fn() };
});
jest.mock('../../../src/database/utils/safeTransaction', () => ({
  safeWrite: (_db: unknown, fn: () => Promise<unknown>) => fn(),
}));

const mockExecute = executeIntent as jest.Mock;

const account: Account = {
  id: 'acc-1',
  displayName: 'Work',
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'x',
  davUserId: 'john',
};

function entryRow(id: string, intent: Intent, over: Record<string, unknown> = {}) {
  const row: any = {
    id,
    accountId: 'acc-1',
    entityId: (intent as any).cardId ?? 'e1',
    kind: intent.kind,
    payloadJson: JSON.stringify(intent),
    serverValuesJson: '{}',
    createdAt: Number(id),
    attempts: 0,
    nextAttemptAt: 0,
    state: 'queued',
    lastError: undefined,
    destroyed: false,
  };
  row.destroyPermanently = jest.fn(async () => {
    row.destroyed = true;
  });
  row.update = jest.fn(async (writer: (r: any) => void) => writer(row));
  Object.assign(row, over);
  return row;
}

// A destroyed row is gone from the next query, as it would be from the real
// table — a follow-up pass must only ever see what is still queued.
function makeDb(rows: any[]) {
  return {
    get: jest.fn(() => ({
      query: jest.fn(() => ({ fetch: jest.fn(async () => rows.filter((r) => !r.destroyed)) })),
    })),
    write: jest.fn(async (fn: any) => fn()),
  } as any;
}

const archive: Intent = { kind: 'setCardArchived', cardId: 'c1', archived: true };

beforeEach(() => jest.clearAllMocks());

describe('backoffMs', () => {
  it('grows exponentially from one second', () => {
    expect(backoffMs(0)).toBe(1000);
    expect(backoffMs(1)).toBe(2000);
    expect(backoffMs(4)).toBe(16000);
  });

  it('never exceeds five minutes', () => {
    expect(backoffMs(20)).toBe(300000);
  });
});

describe('drainOutbox', () => {
  it('sends a queued intent and removes the entry', async () => {
    const row = entryRow('1', archive);
    mockExecute.mockResolvedValue(undefined);

    await drainOutbox({ db: makeDb([row]), account });

    expect(mockExecute).toHaveBeenCalledWith(expect.anything(), archive, {});
    expect(row.destroyed).toBe(true);
  });

  it('drops redundant entries without sending them', async () => {
    const first = entryRow('1', archive);
    const second = entryRow('2', { kind: 'setCardArchived', cardId: 'c1', archived: false });
    mockExecute.mockResolvedValue(undefined);

    await drainOutbox({ db: makeDb([first, second]), account });

    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(first.destroyed).toBe(true);
    expect(second.destroyed).toBe(true);
  });

  it('drops the conflicting field and reports it', async () => {
    const row = entryRow(
      '1',
      { kind: 'patchCard', cardId: 'c1', fields: ['title', 'duedate'], base: { title: 'a', duedate: null } },
      { serverValuesJson: JSON.stringify({ title: 'someone else' }) },
    );
    const onConflict = jest.fn();
    mockExecute.mockResolvedValue(undefined);

    await drainOutbox({ db: makeDb([row]), account, onConflict });

    expect(mockExecute.mock.calls[0][1]).toMatchObject({ fields: ['duedate'] });
    expect(onConflict).toHaveBeenCalledWith({ cardId: 'c1', fields: ['title'] });
  });

  // Narrowing `fields` is inert unless the request body follows it: the dropped
  // field's server value has to reach the handler, or the PUT sends the local
  // value anyway and destroys the edit `onConflict` just reported as protected.
  it('hands the handler the server value of every field it dropped', async () => {
    const row = entryRow(
      '1',
      { kind: 'patchCard', cardId: 'c1', fields: ['title', 'duedate'], base: { title: 'a', duedate: null } },
      { serverValuesJson: JSON.stringify({ title: 'someone else' }) },
    );
    mockExecute.mockResolvedValue(undefined);

    await drainOutbox({ db: makeDb([row]), account });

    expect(mockExecute.mock.calls[0][2]).toEqual({ title: 'someone else' });
  });

  it('abandons an intent whose every field is in conflict', async () => {
    const row = entryRow(
      '1',
      { kind: 'patchCard', cardId: 'c1', fields: ['title'], base: { title: 'a' } },
      { serverValuesJson: JSON.stringify({ title: 'theirs' }) },
    );

    await drainOutbox({ db: makeDb([row]), account });

    expect(mockExecute).not.toHaveBeenCalled();
    expect(row.destroyed).toBe(true);
  });

  it('stops at a deferred intent, leaves it queued, and counts the deferral', async () => {
    const first = entryRow('1', { kind: 'createCard', cardId: 'c1' });
    const second = entryRow('2', { kind: 'setCardArchived', cardId: 'c2', archived: true });
    mockExecute.mockRejectedValueOnce(new DeferredIntentError('card'));

    await drainOutbox({ db: makeDb([first, second]), account, now: () => 5000 });

    // The pass ends here, so a deferred intent is never reordered past the
    // create it waits on — but the deferral is recorded and backed off, so the
    // rows behind it are reachable on the next pass instead of never.
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(first.destroyed).toBe(false);
    expect(first.state).toBe('queued');
    expect(first.attempts).toBe(1);
    expect(first.nextAttemptAt).toBe(6000);
  });

  // A prerequisite create that fails permanently is never retried, so its
  // dependents defer forever. Uncounted, they stay queued, never reach
  // MAX_ATTEMPTS, and so never surface in SyncStatus — the only screen that can
  // retry or discard them. The queue wedges with no affordance to unstick it.
  it('fails a row that has exhausted its attempts on deferrals alone', async () => {
    const row = entryRow('1', archive, { attempts: MAX_ATTEMPTS - 1 });
    mockExecute.mockRejectedValue(new DeferredIntentError('stack'));

    await drainOutbox({ db: makeDb([row]), account });

    expect(row.state).toBe('failed');
    expect(row.lastError).toContain('Deferred');
  });

  it('marks a permanent HTTP failure as failed instead of retrying forever', async () => {
    const row = entryRow('1', archive);
    mockExecute.mockRejectedValue(new HttpError(403, 'setCardArchived'));

    await drainOutbox({ db: makeDb([row]), account });

    expect(row.state).toBe('failed');
    expect(row.destroyed).toBe(false);
    expect(row.lastError).toContain('403');
  });

  it('backs off after a transient failure and stops the pass', async () => {
    const first = entryRow('1', archive);
    const second = entryRow('2', { kind: 'setCardArchived', cardId: 'c2', archived: true });
    mockExecute.mockRejectedValue(new Error('Network request failed'));

    await drainOutbox({ db: makeDb([first, second]), account, now: () => 5000 });

    expect(first.attempts).toBe(1);
    expect(first.nextAttemptAt).toBe(6000);
    expect(first.state).toBe('queued');
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('gives up after the maximum number of attempts', async () => {
    const row = entryRow('1', archive, { attempts: MAX_ATTEMPTS - 1 });
    mockExecute.mockRejectedValue(new Error('Network request failed'));

    await drainOutbox({ db: makeDb([row]), account });

    expect(row.state).toBe('failed');
  });

  it('skips an entry whose backoff has not elapsed', async () => {
    const row = entryRow('1', archive, { attempts: 2, nextAttemptAt: 10_000 });

    await drainOutbox({ db: makeDb([row]), account, now: () => 5000 });

    expect(mockExecute).not.toHaveBeenCalled();
    expect(row.destroyed).toBe(false);
  });

  it('destroys an entry whose payload will not parse, instead of retrying it forever', async () => {
    const row = entryRow('1', archive, { payloadJson: '{not valid json' });

    await drainOutbox({ db: makeDb([row]), account });

    expect(mockExecute).not.toHaveBeenCalled();
    expect(row.destroyed).toBe(true);
  });

  it('shares one pass between two overlapping calls for the same account, so each queued intent runs once', async () => {
    const first = entryRow('1', archive);
    const second = entryRow('2', { kind: 'createCard', cardId: 'c2' });
    mockExecute.mockResolvedValue(undefined);
    const db = makeDb([first, second]);

    // Neither call is awaited before the other starts: this is the scheduler
    // tick and a reconnect (or two mount-time effects) racing each other.
    const [a, b] = [drainOutbox({ db, account }), drainOutbox({ db, account })];
    await Promise.all([a, b]);

    // The second call joined the in-flight pass instead of starting its own,
    // so nothing was sent twice. It cannot tell a race from a write that
    // landed mid-pass, so the drain reads the queue once more when the pass
    // ends — and that follow-up finds nothing left to send.
    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(db.get).toHaveBeenCalledTimes(2);
    expect(first.destroyed).toBe(true);
    expect(second.destroyed).toBe(true);
  });

  // The queue is read once per pass, so a write committed while a pass is in
  // flight is invisible to it — and its onLocalWrite drain call only joins that
  // same pass. Nothing else is scheduled to pick the write up: it has to be the
  // drain itself, once, when the pass ends.
  it('runs one follow-up pass for a write that arrived while a pass was in flight', async () => {
    const first = entryRow('1', archive);
    const second = entryRow('2', { kind: 'createCard', cardId: 'c2' });
    const rows = [first, second];
    const db = makeDb(rows);

    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockExecute.mockImplementationOnce(() => held).mockResolvedValue(undefined);

    const pass = drainOutbox({ db, account });
    // Parks the pass on entry 1's executeIntent, past its one read of the queue.
    await new Promise((r) => setTimeout(r, 0));
    expect(mockExecute).toHaveBeenCalledTimes(1);

    const third = entryRow('3', { kind: 'setCardArchived', cardId: 'c3', archived: true });
    rows.push(third);
    const again = drainOutbox({ db, account });
    release();
    await Promise.all([pass, again]);

    expect(mockExecute).toHaveBeenCalledTimes(3);
    expect(third.destroyed).toBe(true);
    // One follow-up, not a loop: exactly two reads of the queue.
    expect(db.get).toHaveBeenCalledTimes(2);
  });

  it('does not rerun after a pass that ended on a transient failure, so the backed-off row is not retried early', async () => {
    const row = entryRow('1', archive);
    const db = makeDb([row]);
    let fail!: (error: Error) => void;
    mockExecute.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          fail = reject;
        }),
    );

    const pass = drainOutbox({ db, account, now: () => 5000 });
    await new Promise((r) => setTimeout(r, 0));
    const again = drainOutbox({ db, account, now: () => 5000 });
    fail(new Error('Network request failed'));
    await Promise.all([pass, again]);

    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(db.get).toHaveBeenCalledTimes(1);
    expect(row.nextAttemptAt).toBe(6000);
  });

  it('releases the in-flight guard when a pass rejects, so the next call for that account still runs', async () => {
    const failingDb = {
      get: jest.fn(() => ({
        query: jest.fn(() => ({
          fetch: jest.fn(async () => {
            throw new Error('read failed');
          }),
        })),
      })),
    } as any;

    await expect(drainOutbox({ db: failingDb, account })).rejects.toThrow('read failed');

    const row = entryRow('1', archive);
    mockExecute.mockResolvedValue(undefined);
    await drainOutbox({ db: makeDb([row]), account });

    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(row.destroyed).toBe(true);
  });
});
