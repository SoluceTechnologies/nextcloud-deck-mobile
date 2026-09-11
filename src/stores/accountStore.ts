import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { legacyBackedStorage } from '@/stores/legacyStorage';
import type { ServerCapabilities } from '@/types';

interface AccountState {
  activeAccountId: string | null;
  capabilities: ServerCapabilities;
  // The account the capability verdict above was actually measured against.
  // capabilities is one flat object, not keyed by account, so a verdict from
  // account A must not be read as if it described account B — see
  // useDeckAvailability in src/features/board/components/DeckUnavailable.tsx.
  capabilitiesAccountId: string | null;
  setActiveAccountId: (id: string | null) => void;
  setCapabilities: (caps: ServerCapabilities, accountId: string | null) => void;
}

export const useAccountStore = create<AccountState>()(
  persist(
    (set) => ({
      activeAccountId: null,
      capabilities: { deckApp: 'unknown', deckVersion: '', canCreateBoards: false },
      capabilitiesAccountId: null,
      setActiveAccountId: (id) => set({ activeAccountId: id }),
      setCapabilities: (caps, accountId) => set({ capabilities: caps, capabilitiesAccountId: accountId }),
    }),
    {
      name: 'account-store',
      storage: createJSONStorage(() => legacyBackedStorage(['activeAccountId'])),
      partialize: (state) => ({
        activeAccountId: state.activeAccountId,
        capabilities: state.capabilities,
        capabilitiesAccountId: state.capabilitiesAccountId,
      }),
    }
  )
);
