import { useEffect, useRef, useState } from 'react';

import { useActiveAccount } from '@/hooks/useAccounts';
import { searchCards } from '@/services/deck/search';
import type { DeckSearchHit } from '@/services/deck/search';
import { getIsOnline } from '@/services/shared/network';
import { trailingDebounce } from '@/utils/debounce';

export type RemoteSearchHit = DeckSearchHit;
export type RemoteSearchState = { hits: RemoteSearchHit[]; loading: boolean; failed: boolean };

const DEBOUNCE_MS = 300;

/**
 * The one hook allowed to call a `src/services/deck/*` request directly (see
 * useCardDetailSync for the precedent). Runs a debounced `searchCards` while
 * online with an account and a non-blank input, and never touches the
 * database: a remote hit is display data whose row already exists locally
 * when its remoteId is in `knownRemoteIds`, so those are dropped and the rest
 * are left for the screen to render as a separate, board-opening section.
 */
export function useRemoteSearch(
  accountId: string | null,
  input: string,
  knownRemoteIds: Set<string>,
): RemoteSearchState {
  const account = useActiveAccount(accountId);
  // Read fresh inside the debounced callback below, which is created once
  // and so can't close over a given render's props (see accountRef in
  // useCardDetailSync for the same reasoning).
  const accountRef = useRef(account);
  accountRef.current = account;
  const knownRemoteIdsRef = useRef(knownRemoteIds);
  knownRemoteIdsRef.current = knownRemoteIds;

  const [hits, setHits] = useState<RemoteSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // Bumped once per effect run below — on a dispatch AND on the cancel
  // branch alike, since both mean "whatever is in flight is no longer the
  // request we want." A term-string comparison can't tell a same-term
  // request for a different account apart from the one it replaced, and
  // can't express "the input was cleared/went offline while a request was
  // in flight" at all; a generation counter captures "is this still the
  // current request" directly, which is the actual requirement.
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
    if (accountRef.current && term.length > 0 && getIsOnline()) {
      debounced.call(input);
    } else {
      debounced.cancel();
      // Unlike hits/failed, loading describes "is a request outstanding
      // right now" — the cancel branch answers that definitively, so it
      // resets loading itself rather than waiting for whatever is in
      // flight to settle (stillCurrent() will make that settle a no-op).
      setLoading(false);
    }
    return () => {
      activeRef.current = false;
      debounced.cancel();
    };
    // accountId, not account: useActiveAccount hands back a referentially new
    // object on any accounts-list refresh even when the id hasn't moved, and
    // that alone must not reschedule the debounce (see useCardDetailSync).
  }, [accountId, input, debounced]);

  return { hits, loading, failed };
}
