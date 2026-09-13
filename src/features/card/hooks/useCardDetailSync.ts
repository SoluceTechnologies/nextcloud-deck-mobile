import { useCallback, useEffect, useRef, useState } from 'react';

import { useDatabase } from '@/database/DatabaseProvider';
import { useActiveAccount } from '@/hooks/useAccounts';
import { getIsOnline } from '@/services/shared/network';
import { syncCardDetail } from '@/sync/tasks/syncCardDetail';

const PAGE_SIZE = 20;

export type CardDetailSync = { hasMore: boolean; loadMore: () => void; loading: boolean };

/**
 * Fetches a card's comments and attachments (Task 26's syncCardDetail) on mount
 * and whenever the card or the account id changes, then again — one page
 * further — every time the caller asks for more. A screen with no account or no
 * card yet has nothing to fetch and stays a no-op.
 */
export function useCardDetailSync(
  accountId: string | null,
  cardLocalId: string | null,
): CardDetailSync {
  const db = useDatabase();
  // Resolved every render so a real account switch is picked up, but read
  // only through the ref below rather than depended on directly:
  // useActiveAccount returns a referentially-new object whenever the
  // accounts list is reassigned (a profile refresh, a capability probe,
  // account settings) even when accountId hasn't moved, so putting it in a
  // useCallback/useEffect dependency array re-fires the sync on that churn
  // alone (see useAccounts.ts).
  const account = useActiveAccount(accountId);
  const accountRef = useRef(account);
  accountRef.current = account;
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  // How many pages are in, so loadMore knows the next offset. A ref, not
  // state: it drives an outgoing request rather than a render.
  const pagesRef = useRef(1);
  // Guards a run's `.then`/`.finally` against applying once the component has
  // unmounted while the request was in flight.
  const activeRef = useRef(true);
  // Latest {accountId, cardLocalId}, updated every render. A run compares its
  // own closed-over id against this once its promise settles: activeRef alone
  // isn't enough, since the mount effect for a NEW id flips activeRef back to
  // true before an OLD run's promise can settle, which would otherwise let a
  // stale run commit hasMore for an id this hook has already moved on from.
  const idRef = useRef({ accountId, cardLocalId });
  idRef.current = { accountId, cardLocalId };

  const run = useCallback(
    (offset: number) => {
      const account = accountRef.current;
      if (!account || !cardLocalId) return;
      const stillCurrent = () =>
        activeRef.current &&
        idRef.current.accountId === accountId &&
        idRef.current.cardLocalId === cardLocalId;
      setLoading(true);
      syncCardDetail({ db, account, cardLocalId, offset })
        .then((result) => {
          if (stillCurrent()) setHasMore(result.hasMore);
        })
        .catch((e: unknown) => {
          console.warn('[card] detail sync failed', String(e));
        })
        .finally(() => {
          if (stillCurrent()) setLoading(false);
        });
    },
    [db, accountId, cardLocalId],
  );

  useEffect(() => {
    activeRef.current = true;
    pagesRef.current = 1;
    if (accountId && cardLocalId && getIsOnline()) run(0);
    return () => {
      activeRef.current = false;
    };
  }, [run, accountId, cardLocalId]);

  const loadMore = useCallback(() => {
    // accountRef, not accountId: bail before touching pagesRef if the id is
    // set but the account hasn't actually resolved yet, same as run() itself.
    if (!accountRef.current || !cardLocalId || !getIsOnline()) return;
    const offset = pagesRef.current * PAGE_SIZE;
    pagesRef.current += 1;
    run(offset);
  }, [run, accountId, cardLocalId]);

  return { hasMore, loadMore, loading };
}
