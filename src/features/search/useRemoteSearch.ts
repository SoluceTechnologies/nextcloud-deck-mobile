import { useEffect, useRef, useState } from 'react';

import { useActiveAccount } from '@/hooks/useAccounts';
import { searchCards } from '@/services/deck/search';
import type { DeckSearchHit } from '@/services/deck/search';
import { useIsOnline } from '@/services/shared/network';
import { trailingDebounce } from '@/utils/debounce';

export type RemoteSearchHit = DeckSearchHit;
export type RemoteSearchState = { hits: RemoteSearchHit[]; loading: boolean; failed: boolean };

const DEBOUNCE_MS = 300;

export function useRemoteSearch(
  accountId: string | null,
  input: string,
  knownRemoteIds: Set<string>,
): RemoteSearchState {
  const account = useActiveAccount(accountId);
  const online = useIsOnline();
  const accountRef = useRef(account);
  accountRef.current = account;
  const knownRemoteIdsRef = useRef(knownRemoteIds);
  knownRemoteIdsRef.current = knownRemoteIds;

  const [hits, setHits] = useState<RemoteSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const generationRef = useRef(0);
  const activeRef = useRef(true);

  const [debounced] = useState(() =>
    trailingDebounce((term: string) => {
      const acc = accountRef.current;
      if (!acc) return;
      const generation = generationRef.current;
      const stillCurrent = () => activeRef.current && generation === generationRef.current;
      setLoading(true);
      setFailed(false);
      searchCards(acc, term)
        .then((page) => {
          if (!stillCurrent()) return;
          const known = knownRemoteIdsRef.current;
          setHits(page.hits.filter((h) => !known.has(h.card.remoteId)));
        })
        .catch(() => {
          if (!stillCurrent()) return;
          setFailed(true);
        })
        .finally(() => {
          if (!stillCurrent()) return;
          setLoading(false);
        });
    }, DEBOUNCE_MS),
  );

  useEffect(() => {
    activeRef.current = true;
    generationRef.current += 1;
    const term = input.trim();
    if (accountRef.current && term.length > 0 && online) {
      debounced.call(input);
    } else {
      debounced.cancel();
      setLoading(false);
    }
    return () => {
      activeRef.current = false;
      debounced.cancel();
    };
  }, [accountId, input, debounced, online]);

  return { hits, loading, failed };
}
