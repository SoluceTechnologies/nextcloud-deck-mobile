import { useCallback, useEffect, useRef, useState } from 'react';

import { useDatabase } from '@/database/DatabaseProvider';
import { useActiveAccount } from '@/hooks/useAccounts';
import { getIsOnline } from '@/services/shared/network';
import { syncCardDetail } from '@/sync/tasks/syncCardDetail';

const PAGE_SIZE = 20;

export type CardDetailSync = { hasMore: boolean; loadMore: () => void; loading: boolean };

export function useCardDetailSync(
  accountId: string | null,
  cardLocalId: string | null,
): CardDetailSync {
  const db = useDatabase();
  const account = useActiveAccount(accountId);
  const accountRef = useRef(account);
  accountRef.current = account;
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const pagesRef = useRef(1);
  const activeRef = useRef(true);
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
    if (!accountRef.current || !cardLocalId || !getIsOnline()) return;
    const offset = pagesRef.current * PAGE_SIZE;
    pagesRef.current += 1;
    run(offset);
  }, [run, accountId, cardLocalId]);

  return { hasMore, loadMore, loading };
}
