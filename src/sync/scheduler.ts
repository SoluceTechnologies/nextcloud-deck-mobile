import { useUiStore } from '@/stores/uiStore';

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
  /** Zeroes this board's snapshot clock and triggers a run, so the very next
   * tick (this one if none is in flight, otherwise the next) sees it as due
   * for a full fetch — reusing the active-board priority in `dueTasks`
   * rather than bypassing the scheduler with a direct fetch. */
  requestBoardSnapshot: (boardRemoteId: string) => void;
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
    requestBoardSnapshot(boardRemoteId) {
      state = { ...state, boardSnapshotAt: { ...state.boardSnapshotAt, [boardRemoteId]: 0 } };
      void runNow();
    },
  };
}

// A registry of one scheduler per currently-mounted account (useDeckSync
// registers/unregisters around its own effect lifecycle), so code outside the
// sync loop — the board screen — can reach the right instance without a
// prop-drilled reference or a second source of truth for "which account is
// active".
let active: { accountId: string; scheduler: SyncScheduler } | null = null;

export function registerScheduler(accountId: string, scheduler: SyncScheduler): void {
  active = { accountId, scheduler };
}

export function unregisterScheduler(scheduler: SyncScheduler): void {
  if (active?.scheduler === scheduler) active = null;
}

/**
 * Called when the user opens a board: marks it active (and recent) in the ui
 * store regardless of sync state, then — if a scheduler is actually running
 * for this account — asks it to fetch a full snapshot on the next tick. A
 * no-op scheduler-side is fine: opening a board before the sync loop has
 * started must not throw.
 */
export function requestBoardSnapshot(accountId: string, boardRemoteId: string): void {
  useUiStore.getState().setActiveBoardRemoteId(boardRemoteId);
  useUiStore.getState().pushRecentBoard(boardRemoteId);
  if (active?.accountId === accountId) {
    active.scheduler.requestBoardSnapshot(boardRemoteId);
  }
}
