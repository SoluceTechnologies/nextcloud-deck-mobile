import { create } from 'zustand';

const MAX_RECENT = 5;
const MAX_CONFLICTS = 50;

export type SyncConflict = {
  accountId: string;
  cardId: string;
  fields: string[];
};

function conflictKey(conflict: SyncConflict): string {
  return `${conflict.accountId}|${conflict.cardId}|${[...conflict.fields].sort().join(',')}`;
}

export function boardContentKey(accountId: string, boardRemoteId: string): string {
  return `${accountId}|${boardRemoteId}`;
}

interface UiState {
  activeBoardRemoteId: string | null;
  recentBoardRemoteIds: string[];
  boardContentFetchedAt: Record<string, number>;
  conflicts: SyncConflict[];
  setActiveBoardRemoteId: (remoteId: string | null) => void;
  pushRecentBoard: (remoteId: string) => void;
  markBoardContentFetched: (accountId: string, boardRemoteId: string) => void;
  reportConflict: (conflict: SyncConflict) => void;
  clearConflicts: () => void;
}

export const useUiStore = create<UiState>()((set, get) => ({
  activeBoardRemoteId: null,
  recentBoardRemoteIds: [],
  boardContentFetchedAt: {},
  conflicts: [],
  setActiveBoardRemoteId: (remoteId) => set({ activeBoardRemoteId: remoteId }),
  pushRecentBoard: (remoteId) =>
    set({
      recentBoardRemoteIds: [
        remoteId,
        ...get().recentBoardRemoteIds.filter((id) => id !== remoteId),
      ].slice(0, MAX_RECENT),
    }),
  markBoardContentFetched: (accountId, boardRemoteId) =>
    set({
      boardContentFetchedAt: {
        ...get().boardContentFetchedAt,
        [boardContentKey(accountId, boardRemoteId)]: Date.now(),
      },
    }),
  reportConflict: (conflict) => {
    const key = conflictKey(conflict);
    const rest = get().conflicts.filter((c) => conflictKey(c) !== key);
    set({ conflicts: [conflict, ...rest].slice(0, MAX_CONFLICTS) });
  },
  clearConflicts: () => set({ conflicts: [] }),
}));
