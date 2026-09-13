import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { getDatabaseInstance } from '@/database/DatabaseProvider';
import { useAccounts } from '@/hooks/useAccounts';
import { getIsOnline, useIsOnline } from '@/services/shared/network';
import { useAccountStore } from '@/stores/accountStore';
import { useUiStore } from '@/stores/uiStore';

import { onLocalWrite } from './localWrites';
import { drainOutbox } from './outbox/drain';
import { createTaskRunner } from './runTask';
import { createSyncScheduler, registerScheduler, unregisterScheduler } from './scheduler';

/**
 * Owns the whole background data loop: one scheduler and one outbox drain for
 * the active account, suspended while the app is backgrounded.
 */
export function useDeckSync(): void {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const accounts = useAccounts();
  const online = useIsOnline();

  const account = accounts.find((a) => a.id === activeAccountId) ?? null;

  // The per-field conflict resolution in the drain resolves a conflict and
  // then tells no one; this is the one place both call sites can route it to
  // something the user can actually see (SyncStatus).
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
    // Lets requestBoardSnapshot (called from the board screen, well outside
    // this effect's closure) reach this account's scheduler instance.
    registerScheduler(account.id, scheduler);

    const drain = () => {
      if (!getIsOnline()) return;
      void drainOutbox({ db, account, onConflict }).catch((e) =>
        console.warn('[sync] outbox drain failed:', String(e)),
      );
    };

    // A queued mutation is sendable the moment it is committed; without this
    // it would sit until a reconnect or foreground transition. `drainOutbox`
    // shares an in-flight pass per account, so a burst of writes costs one
    // drain, not one per write — and a write that lands mid-pass, which that
    // pass cannot see, is sent by the follow-up pass the drain schedules itself.
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
      appStateSub.remove();
      offLocalWrite();
      scheduler.stop();
      unregisterScheduler(scheduler);
    };
  }, [account]);

  // A reconnection is the moment queued work becomes sendable again. Every
  // effect re-runs after the initial commit regardless of its dependency
  // array, so without tracking the previous value this would also fire on
  // mount — where effect 1 above has already drained once — and double-send
  // whatever was still queued from a previous session.
  const wasOnlineRef = useRef(online);
  useEffect(() => {
    const wasOnline = wasOnlineRef.current;
    wasOnlineRef.current = online;
    if (!account || !online || wasOnline) return;
    void drainOutbox({ db: getDatabaseInstance(), account, onConflict }).catch(() => undefined);
  }, [account, online]);
}
