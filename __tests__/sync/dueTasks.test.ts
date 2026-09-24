import { dueTasks, applyRun, INITIAL_SCHEDULER_STATE } from '../../src/sync/dueTasks';

const MINUTE = 60_000;

const base = {
  now: 10 * MINUTE,
  state: { boardsSnapshotAt: 10 * MINUTE, recentDeltaAt: 10 * MINUTE, boardSnapshotAt: { '7': 10 * MINUTE } },
  activeBoardRemoteId: null as string | null,
  recentBoardRemoteIds: [] as string[],
};

describe('dueTasks', () => {
  it('always refreshes the board list and the upcoming cards', () => {
    expect(dueTasks(base)).toEqual([{ kind: 'boards', full: false }, { kind: 'upcoming' }]);
  });

  it('adds a delta of the open board', () => {
    const tasks = dueTasks({ ...base, activeBoardRemoteId: '7' });
    expect(tasks).toContainEqual({ kind: 'boardContent', boardRemoteId: '7', full: false });
  });

  it('snapshots a board that has never been snapshotted', () => {
    const tasks = dueTasks({
      ...base,
      activeBoardRemoteId: '9',
      state: { ...base.state, boardSnapshotAt: {} },
    });
    expect(tasks).toContainEqual({ kind: 'boardContent', boardRemoteId: '9', full: true });
    expect(tasks).not.toContainEqual({ kind: 'boardContent', boardRemoteId: '9', full: false });
  });

  it('snapshots the open board again after ten minutes', () => {
    const tasks = dueTasks({ ...base, now: 20 * MINUTE + 1, activeBoardRemoteId: '7' });
    expect(tasks).toContainEqual({ kind: 'boardContent', boardRemoteId: '7', full: true });
  });

  it('snapshots the board list after ten minutes, in place of the delta', () => {
    const tasks = dueTasks({ ...base, now: 20 * MINUTE + 1 });
    expect(tasks).toContainEqual({ kind: 'boards', full: true });
    expect(tasks).not.toContainEqual({ kind: 'boards', full: false });
  });

  it('leaves the recent boards alone before the two-minute mark', () => {
    const tasks = dueTasks({ ...base, recentBoardRemoteIds: ['1', '2', '3'] });
    expect(tasks.filter((t) => t.kind === 'boardContent')).toEqual([]);
  });

  it('refreshes the recent boards after two minutes, capped at three', () => {
    const tasks = dueTasks({
      ...base,
      now: 12 * MINUTE + 1,
      recentBoardRemoteIds: ['1', '2', '3', '4'],
    });
    expect(tasks.filter((t) => t.kind === 'boardContent')).toEqual([
      { kind: 'boardContent', boardRemoteId: '1', full: false },
      { kind: 'boardContent', boardRemoteId: '2', full: false },
      { kind: 'boardContent', boardRemoteId: '3', full: false },
    ]);
  });

  it('never queues the open board twice', () => {
    const tasks = dueTasks({
      ...base,
      now: 12 * MINUTE + 1,
      activeBoardRemoteId: '1',
      recentBoardRemoteIds: ['1', '2'],
    });
    expect(tasks.filter((t) => t.kind === 'boardContent' && t.boardRemoteId === '1')).toHaveLength(1);
  });

  it('orders the work by priority: the open board, then the board list, then upcoming', () => {
    const tasks = dueTasks({ ...base, activeBoardRemoteId: '7' });
    expect(tasks.map((t) => t.kind)).toEqual(['boardContent', 'boards', 'upcoming']);
  });
});

describe('applyRun', () => {
  it('records a board-list snapshot', () => {
    const next = applyRun(INITIAL_SCHEDULER_STATE, [{ kind: 'boards', full: true }], 500);
    expect(next.boardsSnapshotAt).toBe(500);
  });

  it('does not record a board-list delta as a snapshot', () => {
    const next = applyRun(INITIAL_SCHEDULER_STATE, [{ kind: 'boards', full: false }], 500);
    expect(next.boardsSnapshotAt).toBe(INITIAL_SCHEDULER_STATE.boardsSnapshotAt);
  });

  it('records a per-board snapshot', () => {
    const next = applyRun(
      INITIAL_SCHEDULER_STATE,
      [{ kind: 'boardContent', boardRemoteId: '7', full: true }],
      500,
    );
    expect(next.boardSnapshotAt['7']).toBe(500);
  });

  it('records the recent-boards pass when a delta of a non-active board ran', () => {
    const next = applyRun(
      INITIAL_SCHEDULER_STATE,
      [{ kind: 'boardContent', boardRemoteId: '7', full: false }],
      500,
    );
    expect(next.recentDeltaAt).toBe(500);
  });

  it('leaves the input state untouched', () => {
    const state = { ...INITIAL_SCHEDULER_STATE, boardSnapshotAt: {} };
    applyRun(state, [{ kind: 'boardContent', boardRemoteId: '7', full: true }], 500);
    expect(state.boardSnapshotAt).toEqual({});
  });
});
