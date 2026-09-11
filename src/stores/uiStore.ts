import { create } from 'zustand';

const MAX_RECENT = 5;
const MAX_CONFLICTS = 50;

/** A patchCard conflict the drain resolved by keeping the server's value. */
export type SyncConflict = {
  accountId: string;
  cardId: string;
  fields: string[];
};

/** Identity for dedup: same account, card and field set is the same conflict. */
function conflictKey(conflict: SyncConflict): string {
  return `${conflict.accountId}|${conflict.cardId}|${[...conflict.fields].sort().join(',')}`;
}

interface UiState {
  /** The board the user is currently looking at, by Deck id. */
  activeBoardRemoteId: string | null;
  recentBoardRemoteIds: string[];
  conflicts: SyncConflict[];
  setActiveBoardRemoteId: (remoteId: string | null) => void;
  pushRecentBoard: (remoteId: string) => void;
  reportConflict: (conflict: SyncConflict) => void;
  clearConflicts: () => void;
}

export const useUiStore = create<UiState>()((set, get) => ({
  activeBoardRemoteId: null,
  recentBoardRemoteIds: [],
  conflicts: [],
  setActiveBoardRemoteId: (remoteId) => set({ activeBoardRemoteId: remoteId }),
  pushRecentBoard: (remoteId) =>
    set({
      recentBoardRemoteIds: [
        remoteId,
        ...get().recentBoardRemoteIds.filter((id) => id !== remoteId),
      ].slice(0, MAX_RECENT),
    }),
  // A conflicted patch that then fails transiently re-drains and re-resolves
  // the same conflict every pass; dedup on identity so that does not grow the
  // list, and cap it so a chronic failure cannot grow it without bound.
  reportConflict: (conflict) => {
    const key = conflictKey(conflict);
    const rest = get().conflicts.filter((c) => conflictKey(c) !== key);
    set({ conflicts: [conflict, ...rest].slice(0, MAX_CONFLICTS) });
  },
  clearConflicts: () => set({ conflicts: [] }),
}));
