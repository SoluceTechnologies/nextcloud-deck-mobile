import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { getDatabaseInstance } from '@/database/DatabaseProvider';
import { useAccounts } from '@/hooks/useAccounts';
import { getIsOnline, useIsOnline } from '@/services/shared/network';
import { useAccountStore } from '@/stores/accountStore';
import { useUiStore } from '@/stores/uiStore';

import { onLocalWrite } from './localWrites';
import { drainOutbox, nextRetryAt } from './outbox/drain';
import { createTaskRunner } from './runTask';
import { createSyncScheduler, registerScheduler, unregisterScheduler } from './scheduler';

export function useDeckSync(): void {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const accounts = useAccounts();
  const online = useIsOnline();

  const account = accounts.find((a) => a.id === activeAccountId) ?? null;

  const onConflict = (info: { cardId: string; fields: string[] }) => {
    if (!account) return;
    useUiStore.getState().reportConflict({ accountId: account.id, ...info });
  };

  useEffect(() => {
    if (!account) return;

    const db = getDatabaseInstance();

    const scheduler = createSyncScheduler({
      runTask: createTaskRunner(db, account),
      getActiveBoardRemoteId: () => useUiStore.getState().activeBoardRemoteId,
      getRecentBoardRemoteIds: () => useUiStore.getState().recentBoardRemoteIds,
      isOnline: getIsOnline,
    });
    registerScheduler(account.id, scheduler);

    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const drain = () => {
      if (!getIsOnline()) return;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      void drainOutbox({ db, account, onConflict })
        .then(() => nextRetryAt(db, account.id, Date.now()))
        .then((at) => {
          if (disposed || at == null || retryTimer) return;
          retryTimer = setTimeout(() => {
            retryTimer = null;
            drain();
          }, Math.max(0, at - Date.now()));
        })
        .catch((e) => console.warn('[sync] outbox drain failed:', String(e)));
    };

    const offLocalWrite = onLocalWrite(drain);

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
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      appStateSub.remove();
      offLocalWrite();
      scheduler.stop();
      unregisterScheduler(scheduler);
    };
  }, [account]);

  const wasOnlineRef = useRef(online);
  useEffect(() => {
    const wasOnline = wasOnlineRef.current;
    wasOnlineRef.current = online;
    if (!account || !online || wasOnline) return;
    void drainOutbox({ db: getDatabaseInstance(), account, onConflict }).catch(() => undefined);
  }, [account, online]);
}
