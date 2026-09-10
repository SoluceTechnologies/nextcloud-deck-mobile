import { createSyncScheduler } from '../../src/sync/scheduler';
import { createTaskRunner } from '../../src/sync/runTask';
import type { SyncTask } from '../../src/sync/dueTasks';
import type { Database } from '@nozbe/watermelondb';
import type { Account } from '@/types';

function setup(over: Partial<Parameters<typeof createSyncScheduler>[0]> = {}) {
  const ran: SyncTask[] = [];
  let now = 10 * 60_000;
  const scheduler = createSyncScheduler({
    runTask: async (task) => {
      ran.push(task);
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
    await Promise.resolve();
    const afterStart = ran.length;

    jest.advanceTimersByTime(30_000);
    await Promise.resolve();
    await Promise.resolve();
    expect(ran.length).toBeGreaterThan(afterStart);

    scheduler.stop();
    const afterStop = ran.length;
    jest.advanceTimersByTime(90_000);
    await Promise.resolve();
    expect(ran.length).toBe(afterStop);
  });
});

describe('createTaskRunner', () => {
  it('routes boards tasks to syncBoards', async () => {
    const syncBoardsMock = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(require('../../src/sync/tasks/syncBoards'), 'syncBoards').mockImplementation(syncBoardsMock);

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
    jest.spyOn(require('../../src/sync/tasks/syncUpcoming'), 'syncUpcoming').mockImplementation(syncUpcomingMock);

    const db = {} as Database;
    const account = {} as Account;
    const runner = createTaskRunner(db, account);

    await runner({ kind: 'upcoming' });

    expect(syncUpcomingMock).toHaveBeenCalledWith({ db, account });
  });

  it('routes boardContent tasks to syncBoardContent', async () => {
    const syncBoardContentMock = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(require('../../src/sync/tasks/syncBoardContent'), 'syncBoardContent').mockImplementation(syncBoardContentMock);

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
