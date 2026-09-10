import { useEffect } from 'react';
import { AppState } from 'react-native';

import { getDatabaseInstance } from '@/database/DatabaseProvider';
import { useAccounts } from '@/hooks/useAccounts';
import { getIsOnline, useIsOnline } from '@/services/shared/network';
import { useAccountStore } from '@/stores/accountStore';
import { useUiStore } from '@/stores/uiStore';

import { drainOutbox } from './outbox/drain';
import { createTaskRunner } from './runTask';
import { createSyncScheduler } from './scheduler';

/**
 * Owns the whole background data loop: one scheduler and one outbox drain for
 * the active account, suspended while the app is backgrounded.
 */
export function useDeckSync(): void {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const accounts = useAccounts();
  const online = useIsOnline();

  const account = accounts.find((a) => a.id === activeAccountId) ?? null;

  useEffect(() => {
    if (!account) return;

    const db = getDatabaseInstance();

    const scheduler = createSyncScheduler({
      runTask: createTaskRunner(db, account),
      getActiveBoardRemoteId: () => useUiStore.getState().activeBoardRemoteId,
      getRecentBoardRemoteIds: () => useUiStore.getState().recentBoardRemoteIds,
      isOnline: getIsOnline,
    });

    const drain = () => {
      if (!getIsOnline()) return;
      void drainOutbox({ db, account }).catch((e) =>
        console.warn('[sync] outbox drain failed:', String(e)),
      );
    };

    scheduler.start();
    drain();

    const appStateSub = AppState.addEventListener('change', (status) => {
      if (status === 'active') {
        scheduler.start();
        drain();
      } else {
        scheduler.stop();
      }
    });

    return () => {
      appStateSub.remove();
      scheduler.stop();
    };
  }, [account]);

  // A reconnection is the moment queued work becomes sendable again.
  useEffect(() => {
    if (!account || !online) return;
    void drainOutbox({ db: getDatabaseInstance(), account }).catch(() => undefined);
  }, [account, online]);
}
