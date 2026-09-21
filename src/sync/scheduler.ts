import { useUiStore } from '@/stores/uiStore';

import { applyRun, dueTasks, INITIAL_SCHEDULER_STATE, type SchedulerState, type SyncTask } from './dueTasks';

const DEFAULT_INTERVAL_MS = 30_000;

export type SchedulerDeps = {
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
  requestBoardSnapshot: (boardRemoteId: string) => void;
};

export function createSyncScheduler(deps: SchedulerDeps): SyncScheduler {
  const now = deps.now ?? (() => Date.now());
  const intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS;

  let state: SchedulerState = INITIAL_SCHEDULER_STATE;
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;
  let rerun = false;

  async function runNow(): Promise<void> {
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
          if (await deps.runTask(task)) succeeded.push(task);
        } catch (error) {
          console.warn('[sync] task failed', task.kind, String(error));
        }
      }

      state = applyRun(state, succeeded, at);
    } finally {
      running = false;
      if (rerun) {
        rerun = false;
        void runNow();
      }
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
      if (running) {
        rerun = true;
      } else {
        void runNow();
      }
    },
  };
}

let active: { accountId: string; scheduler: SyncScheduler } | null = null;

export function registerScheduler(accountId: string, scheduler: SyncScheduler): void {
  active = { accountId, scheduler };
}

export function unregisterScheduler(scheduler: SyncScheduler): void {
  if (active?.scheduler === scheduler) active = null;
}

export function requestBoardSnapshot(accountId: string, boardRemoteId: string): void {
  useUiStore.getState().setActiveBoardRemoteId(boardRemoteId);
  useUiStore.getState().pushRecentBoard(boardRemoteId);
  if (active?.accountId === accountId) {
    active.scheduler.requestBoardSnapshot(boardRemoteId);
  }
}
