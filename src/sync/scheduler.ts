import { applyRun, dueTasks, INITIAL_SCHEDULER_STATE, type SchedulerState, type SyncTask } from './dueTasks';

const DEFAULT_INTERVAL_MS = 30_000;

export type SchedulerDeps = {
  /** Resolves `true` if the task ran (a snapshot may be stamped); `false` if it aborted. */
  runTask: (task: SyncTask) => Promise<boolean>;
  getActiveBoardRemoteId: () => string | null;
  getRecentBoardRemoteIds: () => string[];
  isOnline: () => boolean;
  now?: () => number;
  intervalMs?: number;
};

export type SyncScheduler = {
  start: () => void;
  stop: () => void;
  runNow: () => Promise<void>;
  isRunning: () => boolean;
};

export function createSyncScheduler(deps: SchedulerDeps): SyncScheduler {
  const now = deps.now ?? (() => Date.now());
  const intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS;

  let state: SchedulerState = INITIAL_SCHEDULER_STATE;
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  async function runNow(): Promise<void> {
    // A tick that arrives while the previous one is still working is dropped,
    // not queued: the next tick is thirty seconds away and will see fresh state.
    if (running || !deps.isOnline()) return;
    running = true;

    try {
      const at = now();
      const tasks = dueTasks({
        now: at,
        state,
        activeBoardRemoteId: deps.getActiveBoardRemoteId(),
        recentBoardRemoteIds: deps.getRecentBoardRemoteIds(),
      });

      const succeeded: SyncTask[] = [];
      for (const task of tasks) {
        try {
          // `false` means the task lost the epoch race and aborted without
          // writing: it must not advance its cadence clock any more than a
          // thrown error would.
          if (await deps.runTask(task)) succeeded.push(task);
        } catch (error) {
          // One failing scope must not cancel the others, and a failed task
          // must not advance its cadence clock.
          console.warn('[sync] task failed', task.kind, String(error));
        }
      }

      state = applyRun(state, succeeded, at);
    } finally {
      running = false;
    }
  }

  return {
    start() {
      if (timer !== null) return;
      void runNow();
      timer = setInterval(() => void runNow(), intervalMs);
    },
    stop() {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    },
    runNow,
    isRunning: () => running,
  };
}
