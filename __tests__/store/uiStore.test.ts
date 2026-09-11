import { useUiStore } from '../../src/stores/uiStore';

describe('uiStore', () => {
  beforeEach(() => {
    useUiStore.setState({ activeBoardRemoteId: null, recentBoardRemoteIds: [], conflicts: [] });
  });

  it('setActiveBoardRemoteId sets the active board', () => {
    useUiStore.getState().setActiveBoardRemoteId('board-1');
    expect(useUiStore.getState().activeBoardRemoteId).toBe('board-1');

    useUiStore.getState().setActiveBoardRemoteId(null);
    expect(useUiStore.getState().activeBoardRemoteId).toBeNull();
  });

  it('pushRecentBoard adds the most recent board to the front', () => {
    useUiStore.getState().pushRecentBoard('board-1');
    useUiStore.getState().pushRecentBoard('board-2');

    expect(useUiStore.getState().recentBoardRemoteIds).toEqual(['board-2', 'board-1']);
  });

  it('pushRecentBoard deduplicates: re-pushing an existing id moves it to the front instead of repeating it', () => {
    useUiStore.getState().pushRecentBoard('board-1');
    useUiStore.getState().pushRecentBoard('board-2');
    useUiStore.getState().pushRecentBoard('board-3');
    useUiStore.getState().pushRecentBoard('board-1');

    expect(useUiStore.getState().recentBoardRemoteIds).toEqual(['board-1', 'board-3', 'board-2']);
  });

  it('pushRecentBoard caps the list at 5 entries, dropping the oldest', () => {
    for (const id of ['b1', 'b2', 'b3', 'b4', 'b5', 'b6']) {
      useUiStore.getState().pushRecentBoard(id);
    }

    expect(useUiStore.getState().recentBoardRemoteIds).toEqual(['b6', 'b5', 'b4', 'b3', 'b2']);
    expect(useUiStore.getState().recentBoardRemoteIds).not.toContain('b1');
  });

  it('reportConflict appends a conflict', () => {
    useUiStore.getState().reportConflict({ accountId: 'acc-1', cardId: 'c1', fields: ['title'] });

    expect(useUiStore.getState().conflicts).toEqual([
      { accountId: 'acc-1', cardId: 'c1', fields: ['title'] },
    ]);
  });

  it('reportConflict accumulates rather than replacing an earlier conflict', () => {
    useUiStore.getState().reportConflict({ accountId: 'acc-1', cardId: 'c1', fields: ['title'] });
    useUiStore.getState().reportConflict({ accountId: 'acc-1', cardId: 'c2', fields: ['order'] });

    expect(useUiStore.getState().conflicts).toHaveLength(2);
  });

  it('clearConflicts empties the list', () => {
    useUiStore.getState().reportConflict({ accountId: 'acc-1', cardId: 'c1', fields: ['title'] });

    useUiStore.getState().clearConflicts();

    expect(useUiStore.getState().conflicts).toEqual([]);
  });
});
