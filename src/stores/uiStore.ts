import { create } from 'zustand';

const MAX_RECENT = 5;

interface UiState {
  /** The board the user is currently looking at, by Deck id. */
  activeBoardRemoteId: string | null;
  recentBoardRemoteIds: string[];
  setActiveBoardRemoteId: (remoteId: string | null) => void;
  pushRecentBoard: (remoteId: string) => void;
}

export const useUiStore = create<UiState>()((set, get) => ({
  activeBoardRemoteId: null,
  recentBoardRemoteIds: [],
  setActiveBoardRemoteId: (remoteId) => set({ activeBoardRemoteId: remoteId }),
  pushRecentBoard: (remoteId) =>
    set({
      recentBoardRemoteIds: [
        remoteId,
        ...get().recentBoardRemoteIds.filter((id) => id !== remoteId),
      ].slice(0, MAX_RECENT),
    }),
}));
