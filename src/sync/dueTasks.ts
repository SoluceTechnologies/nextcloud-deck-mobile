export type SyncTask =
  | { kind: 'boards'; full: boolean }
  | { kind: 'upcoming' }
  | { kind: 'boardContent'; boardRemoteId: string; full: boolean };

export type SchedulerState = {
  boardsSnapshotAt: number;
  recentDeltaAt: number;
  boardSnapshotAt: Record<string, number>;
};

export const INITIAL_SCHEDULER_STATE: SchedulerState = {
  boardsSnapshotAt: 0,
  recentDeltaAt: 0,
  boardSnapshotAt: {},
};

const RECENT_DELTA_INTERVAL_MS = 2 * 60_000;
const SNAPSHOT_INTERVAL_MS = 10 * 60_000;
const MAX_RECENT_BOARDS = 3;

export type DueTasksInput = {
  now: number;
  state: SchedulerState;
  activeBoardRemoteId: string | null;
  /** Most recently opened first. */
  recentBoardRemoteIds: string[];
};

export function dueTasks({
  now,
  state,
  activeBoardRemoteId,
  recentBoardRemoteIds,
}: DueTasksInput): SyncTask[] {
  const tasks: SyncTask[] = [];

  if (activeBoardRemoteId !== null) {
    const snapshotAt = state.boardSnapshotAt[activeBoardRemoteId] ?? 0;
    tasks.push({
      kind: 'boardContent',
      boardRemoteId: activeBoardRemoteId,
      full: now - snapshotAt >= SNAPSHOT_INTERVAL_MS,
    });
  }

  tasks.push({ kind: 'boards', full: now - state.boardsSnapshotAt >= SNAPSHOT_INTERVAL_MS });
  tasks.push({ kind: 'upcoming' });

  if (now - state.recentDeltaAt >= RECENT_DELTA_INTERVAL_MS) {
    const recents = recentBoardRemoteIds
      .filter((id) => id !== activeBoardRemoteId)
      .slice(0, MAX_RECENT_BOARDS);
    for (const boardRemoteId of recents) {
      tasks.push({ kind: 'boardContent', boardRemoteId, full: false });
    }
  }

  return tasks;
}

export function applyRun(state: SchedulerState, tasks: SyncTask[], now: number): SchedulerState {
  const next: SchedulerState = {
    boardsSnapshotAt: state.boardsSnapshotAt,
    recentDeltaAt: state.recentDeltaAt,
    boardSnapshotAt: { ...state.boardSnapshotAt },
  };

  for (const task of tasks) {
    if (task.kind === 'boards' && task.full) next.boardsSnapshotAt = now;
    if (task.kind === 'boardContent') {
      if (task.full) next.boardSnapshotAt[task.boardRemoteId] = now;
      else next.recentDeltaAt = now;
    }
  }

  return next;
}
