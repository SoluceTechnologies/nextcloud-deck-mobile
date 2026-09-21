import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { legacyBackedStorage } from '@/stores/legacyStorage';
import type { ServerCapabilities } from '@/types';

interface AccountState {
  activeAccountId: string | null;
  capabilities: ServerCapabilities;
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
