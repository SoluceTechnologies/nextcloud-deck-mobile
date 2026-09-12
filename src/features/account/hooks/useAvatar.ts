import { useEffect, useState } from 'react';

import { storage } from '@/storage';
import type { Account } from '@/types';
import { trustedFetch } from '@/services/shared/trustedFetch';

/** Without a userId this is the account owner's own avatar — unchanged cache key. */
function cacheKey(accountId: string, userId?: string): string {
  return userId ? `avatar:${accountId}:${userId}` : `avatar:${accountId}`;
}

function basicAuth(account: Pick<Account, 'username' | 'appPassword'>): string {
  return 'Basic ' + btoa(`${account.username}:${account.appPassword}`);
}

/**
 * The account owner's avatar by default; pass `userId` (e.g. a card
 * participant) to fetch and cache someone else's avatar under its own key
 * instead, using the same account's credentials.
 */
export function useAvatar(
  account: Account | null,
  userId?: string,
): { data: string | null | undefined } {
  const [data, setData] = useState<string | null | undefined>(() =>
    account ? (storage.getString(cacheKey(account.id, userId)) ?? undefined) : undefined,
  );

  useEffect(() => {
    if (!account) {
      setData(undefined);
      return;
    }
    let active = true;
    const key = cacheKey(account.id, userId);
    const cached = storage.getString(key);
    if (cached) setData(cached);

    (async () => {
      try {
        const target = userId ?? account.davUserId;
        const url = `${account.baseUrl}/index.php/avatar/${encodeURIComponent(target)}/96`;
        const res = await trustedFetch(url, { headers: { Authorization: basicAuth(account) } });
        if (!res.ok) {
          console.warn('[useAvatar] non-ok response', res.status, url);
          if (active && !cached) setData(null);
          return;
        }
        const contentType = res.headers.get('content-type') || 'image/jpeg';
        const base64 = await res.base64();
        const uri = `data:${contentType};base64,${base64}`;
        storage.set(key, uri);
        if (active) setData(uri);
      } catch (e) {
        console.warn('[useAvatar] failed to load avatar', account.baseUrl, e);
        if (active && !cached) setData(null);
      }
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id, userId]);

  return { data };
}
