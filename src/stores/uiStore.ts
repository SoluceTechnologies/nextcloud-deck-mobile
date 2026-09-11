import { create } from 'zustand';

const MAX_RECENT = 5;

/** A patchCard conflict the drain resolved by keeping the server's value. */
export type SyncConflict = {
  accountId: string;
  cardId: string;
  fields: string[];
};

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
  reportConflict: (conflict) => set({ conflicts: [...get().conflicts, conflict] }),
  clearConflicts: () => set({ conflicts: [] }),
}));
