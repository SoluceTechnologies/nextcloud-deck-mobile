import {
  createSyncScheduler,
  registerScheduler,
  requestBoardSnapshot,
  unregisterScheduler,
} from '../../src/sync/scheduler';
import { createTaskRunner } from '../../src/sync/runTask';
import type { SyncTask } from '../../src/sync/dueTasks';
import * as syncBoardsModule from '../../src/sync/tasks/syncBoards';
import * as syncUpcomingModule from '../../src/sync/tasks/syncUpcoming';
import * as syncBoardContentModule from '../../src/sync/tasks/syncBoardContent';
import { useUiStore } from '../../src/stores/uiStore';
import type { Database } from '@nozbe/watermelondb';
import type { Account } from '@/types';

function setup(over: Partial<Parameters<typeof createSyncScheduler>[0]> = {}) {
  const ran: SyncTask[] = [];
  let now = 10 * 60_000;
  const scheduler = createSyncScheduler({
    runTask: async (task) => {
      ran.push(task);
      return true;
    },
    getActiveBoardRemoteId: () => null,
    getRecentBoardRemoteIds: () => [],
    isOnline: () => true,
    now: () => now,
    intervalMs: 30_000,
    ...over,
  });
  return { scheduler, ran, advance: (ms: number) => (now += ms) };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('createSyncScheduler', () => {
  it('runs the due tasks on demand', async () => {
    const { scheduler, ran } = setup();
    await scheduler.runNow();
    expect(ran.map((t) => t.kind)).toEqual(['boards', 'upcoming']);
  });

  it('skips the run entirely when offline', async () => {
    const { scheduler, ran } = setup({ isOnline: () => false });
    await scheduler.runNow();
    expect(ran).toEqual([]);
  });

  it('never runs two passes at once', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const ran: SyncTask[] = [];
    const scheduler = createSyncScheduler({
      runTask: async (task) => {
        ran.push(task);
        await gate;
        return true;
      },
      getActiveBoardRemoteId: () => null,
      getRecentBoardRemoteIds: () => [],
      isOnline: () => true,
    });

    const first = scheduler.runNow();
    await scheduler.runNow();
    expect(ran).toHaveLength(1);

    release();
    await first;
  });

  it('reports whether a pass is in flight', async () => {
    const { scheduler } = setup();
    expect(scheduler.isRunning()).toBe(false);
    const pass = scheduler.runNow();
    expect(scheduler.isRunning()).toBe(true);
    await pass;
    expect(scheduler.isRunning()).toBe(false);
  });

  it('keeps going when one task throws', async () => {
    const ran: SyncTask[] = [];
    const scheduler = createSyncScheduler({
      runTask: async (task) => {
        if (task.kind === 'boards') throw new Error('boom');
        ran.push(task);
        return true;
      },
      getActiveBoardRemoteId: () => null,
      getRecentBoardRemoteIds: () => [],
      isOnline: () => true,
    });

    await expect(scheduler.runNow()).resolves.toBeUndefined();
    expect(ran.map((t) => t.kind)).toEqual(['upcoming']);
  });

  it('ticks on the interval once started, and stops on stop', async () => {
    const { scheduler, ran } = setup();

    scheduler.start();
    // start() fires the immediate pass synchronously (running flips to true
    // before start() returns); drain it via the public isRunning() flag
    // rather than a fixed number of awaits, since the exact microtask count
    // per pass is a Babel-transform detail, not a contract. That leaves the
    // baseline free of the immediate pass, so growth below can only come
    // from the interval.
    while (scheduler.isRunning()) {
      await Promise.resolve();
    }
    const afterStart = ran.length;
    expect(afterStart).toBeGreaterThan(0);

    // advanceTimersByTime fires all due timers back-to-back with no
    // microtask flush between them, so a tick landing while the prior pass
    // is still in its own await chain gets dropped by the running guard.
    // advanceTimersByTimeAsync flushes microtasks between due timers, so the
    // interval's runNow() actually completes and is observed here as a
    // second, distinct pass.
    await jest.advanceTimersByTimeAsync(30_000);
    expect(ran.length).toBeGreaterThan(afterStart);

    scheduler.stop();
    const afterStop = ran.length;
    await jest.advanceTimersByTimeAsync(90_000);
    expect(ran.length).toBe(afterStop);
  });

  // A task that loses the epoch race resolves without throwing, so a scheduler
  // that only watched for exceptions would still credit it as a snapshot and
  // stamp its cadence clock. `runTask` reporting `false` must stop that: the
  // very next pass should still see the snapshot as due, not skip it for
  // another ten minutes because of a pass that wrote nothing.
  it('does not stamp the snapshot clock for a task that reports it was aborted', async () => {
    const seen: SyncTask[] = [];
    let now = 10 * 60_000; // the default SNAPSHOT_INTERVAL_MS, so `boards` starts full
    const scheduler = createSyncScheduler({
      runTask: async (task) => {
        seen.push(task);
        // The boards task lost the epoch race and aborted without writing.
        return task.kind !== 'boards';
      },
      getActiveBoardRemoteId: () => null,
      getRecentBoardRemoteIds: () => [],
      isOnline: () => true,
      now: () => now,
    });

    await scheduler.runNow();
    now += 1000; // well under the ten-minute snapshot interval
    seen.length = 0;
    await scheduler.runNow();

    expect(seen.find((t) => t.kind === 'boards')).toMatchObject({ kind: 'boards', full: true });
  });

  it('does not double up when start() is called twice', async () => {
    const { scheduler, ran } = setup();

    scheduler.start();
    while (scheduler.isRunning()) {
      await Promise.resolve();
    }
    scheduler.start(); // guarded no-op: must not create a second timer
    const afterStart = ran.length;

    await jest.advanceTimersByTimeAsync(30_000);

    // With these deps, dueTasks always returns exactly ['boards', 'upcoming']
    // (see 'runs the due tasks on demand' above), so one interval pass adds
    // exactly 2 entries. A second timer from the duplicate start() would
    // double that to 4.
    expect(ran.length - afterStart).toBe(2);

    scheduler.stop();
  });

  // The board screen calls this to reuse the scheduler's existing active-board
  // priority (see dueTasks) instead of bypassing it with a direct fetch.
  it('requestBoardSnapshot forces a full boardContent task even shortly after a snapshot', async () => {
    const seen: SyncTask[] = [];
    let now = 10 * 60_000; // the default SNAPSHOT_INTERVAL_MS, so the first pass is full
    const scheduler = createSyncScheduler({
      runTask: async (task) => {
        seen.push(task);
        return true;
      },
      getActiveBoardRemoteId: () => 'board-1',
      getRecentBoardRemoteIds: () => [],
      isOnline: () => true,
      now: () => now,
    });

    await scheduler.runNow();
    expect(seen.find((t) => t.kind === 'boardContent')).toMatchObject({
      boardRemoteId: 'board-1',
      full: true,
    });

    now += 60_000; // a minute later — well under the ten-minute interval
    seen.length = 0;

    scheduler.requestBoardSnapshot('board-1');
    while (scheduler.isRunning()) {
      await Promise.resolve();
    }

    expect(seen.find((t) => t.kind === 'boardContent')).toMatchObject({
      boardRemoteId: 'board-1',
      full: true,
    });
  });

  // A snapshot request that arrives while a pass is already running must not
  // be dropped: it queues exactly one more pass to run right after the
  // in-flight one finishes, instead of waiting for the next 30s tick — that
  // 30s gap is what left a freshly opened board looking empty.
  it('queues a rerun for a snapshot request that arrives mid-pass, instead of dropping it', async () => {
    let now = 10 * 60_000; // the default SNAPSHOT_INTERVAL_MS, so the first pass is already full
    let releaseHeld: (ok: boolean) => void = () => {};
    const held = new Promise<boolean>((resolve) => (releaseHeld = resolve));
    const ran: SyncTask[] = [];

    const scheduler = createSyncScheduler({
      runTask: async (task) => {
        ran.push(task);
        return held;
      },
      getActiveBoardRemoteId: () => 'B1',
      getRecentBoardRemoteIds: () => [],
      isOnline: () => true,
      now: () => now,
    });

    const firstPass = scheduler.runNow();

    // The pass is genuinely in flight (its first task is awaiting `held`),
    // so this must be queued rather than run now.
    scheduler.requestBoardSnapshot('B1');
    // By the time the queued rerun calls dueTasks, the board reads as due
    // again regardless of exactly when its clock was last stamped.
    now += 10 * 60_000;

    releaseHeld(true);
    await firstPass;
    while (scheduler.isRunning()) {
      await Promise.resolve();
    }

    // Exactly two passes ran: the one in flight, and one queued rerun — no
    // third from a stray extra call.
    expect(ran.filter((t) => t.kind === 'boards')).toHaveLength(2);
    expect(ran).toContainEqual({ kind: 'boardContent', boardRemoteId: 'B1', full: true });
  });
});

describe('requestBoardSnapshot (module-level)', () => {
  afterEach(() => {
    useUiStore.setState({ activeBoardRemoteId: null, recentBoardRemoteIds: [] });
  });

  it('is a no-op, without throwing, when no scheduler is registered for the account', () => {
    expect(() => requestBoardSnapshot('acc-none', 'board-none')).not.toThrow();
  });

  it('marks the board active and recent', () => {
    requestBoardSnapshot('acc-1', 'board-1');
    expect(useUiStore.getState().activeBoardRemoteId).toBe('board-1');
    expect(useUiStore.getState().recentBoardRemoteIds).toEqual(['board-1']);
  });

  it('asks the registered scheduler for that account to force a full snapshot', async () => {
    const seen: SyncTask[] = [];
    const scheduler = createSyncScheduler({
      runTask: async (task) => {
        seen.push(task);
        return true;
      },
      getActiveBoardRemoteId: () => useUiStore.getState().activeBoardRemoteId,
      getRecentBoardRemoteIds: () => [],
      isOnline: () => true,
    });
    registerScheduler('acc-1', scheduler);

    try {
      requestBoardSnapshot('acc-1', 'board-1');
      while (scheduler.isRunning()) {
        await Promise.resolve();
      }
      expect(seen.find((t) => t.kind === 'boardContent')).toMatchObject({
        boardRemoteId: 'board-1',
        full: true,
      });
    } finally {
      unregisterScheduler(scheduler);
    }
  });

  it('does not ask a scheduler registered for a different account', async () => {
    const seen: SyncTask[] = [];
    const scheduler = createSyncScheduler({
      runTask: async (task) => {
        seen.push(task);
        return true;
      },
      getActiveBoardRemoteId: () => useUiStore.getState().activeBoardRemoteId,
      getRecentBoardRemoteIds: () => [],
      isOnline: () => true,
    });
    registerScheduler('acc-other', scheduler);

    try {
      requestBoardSnapshot('acc-1', 'board-1');
      await Promise.resolve();
      expect(seen).toEqual([]);
    } finally {
      unregisterScheduler(scheduler);
    }
  });
});

describe('createTaskRunner', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('routes boards tasks to syncBoards', async () => {
    const syncBoardsMock = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(syncBoardsModule, 'syncBoards').mockImplementation(syncBoardsMock);

    const db = {} as Database;
    const account = {} as Account;
    const runner = createTaskRunner(db, account);

    await runner({ kind: 'boards', full: true });

    expect(syncBoardsMock).toHaveBeenCalledWith({
      db,
      account,
      full: true,
    });
  });

  it('routes upcoming tasks to syncUpcoming', async () => {
    const syncUpcomingMock = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(syncUpcomingModule, 'syncUpcoming').mockImplementation(syncUpcomingMock);

    const db = {} as Database;
    const account = {} as Account;
    const runner = createTaskRunner(db, account);

    await runner({ kind: 'upcoming' });

    expect(syncUpcomingMock).toHaveBeenCalledWith({ db, account });
  });

  it('routes boardContent tasks to syncBoardContent', async () => {
    const syncBoardContentMock = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(syncBoardContentModule, 'syncBoardContent').mockImplementation(syncBoardContentMock);

    const db = {} as Database;
    const account = {} as Account;
    const runner = createTaskRunner(db, account);

    await runner({
      kind: 'boardContent',
      boardRemoteId: 'board-123',
      full: false,
    });

    expect(syncBoardContentMock).toHaveBeenCalledWith({
      db,
      account,
      boardRemoteId: 'board-123',
      full: false,
    });
  });
});
