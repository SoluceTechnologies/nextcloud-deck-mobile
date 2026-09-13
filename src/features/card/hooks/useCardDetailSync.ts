import { useCallback, useEffect, useRef, useState } from 'react';

import { useDatabase } from '@/database/DatabaseProvider';
import { useActiveAccount } from '@/hooks/useAccounts';
import { getIsOnline } from '@/services/shared/network';
import { useAccountStore } from '@/stores/accountStore';
import { syncCardDetail } from '@/sync/tasks/syncCardDetail';

const PAGE_SIZE = 20;

export type CardDetailSync = { hasMore: boolean; loadMore: () => void; loading: boolean };

/**
 * Fetches a card's comments and attachments (Task 26's syncCardDetail) on mount
 * and whenever the card or the active account changes, then again — one page
 * further — every time the caller asks for more. A screen with no account or no
 * card yet has nothing to fetch and stays a no-op.
 */
export function useCardDetailSync(cardLocalId: string | null): CardDetailSync {
  const db = useDatabase();
  const accountId = useAccountStore((s) => s.activeAccountId);
  const account = useActiveAccount(accountId);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  // How many pages are in, so loadMore knows the next offset. A ref, not
  // state: it drives an outgoing request rather than a render.
  const pagesRef = useRef(1);
  // Guards a run's `.then` against applying once it is no longer the
  // relevant one — the card changed, the account changed, or the component
  // unmounted while the request was in flight.
  // ponytail: one shared flag, not a per-run token — a loadMore started just
  // before an id/account switch can still land after the switch's mount
  // effect re-arms this flag. Upgrade to a generation counter if that
  // (rare: cardLocalId is a stable route param) is ever observed.
  const activeRef = useRef(true);

  const run = useCallback(
    (offset: number) => {
      if (!account || !cardLocalId) return;
      setLoading(true);
      syncCardDetail({ db, account, cardLocalId, offset })
        .then((result) => {
          if (activeRef.current) setHasMore(result.hasMore);
        })
        .catch((e: unknown) => {
          console.warn('[card] detail sync failed', String(e));
        })
        .finally(() => {
          if (activeRef.current) setLoading(false);
        });
    },
    [db, account, cardLocalId],
  );

  useEffect(() => {
    activeRef.current = true;
    pagesRef.current = 1;
    if (account && cardLocalId && getIsOnline()) run(0);
    return () => {
      activeRef.current = false;
    };
  }, [run, account, cardLocalId]);

  const loadMore = useCallback(() => {
    if (!account || !cardLocalId || !getIsOnline()) return;
    const offset = pagesRef.current * PAGE_SIZE;
    pagesRef.current += 1;
    run(offset);
  }, [run, account, cardLocalId]);

  return { hasMore, loadMore, loading };
}
