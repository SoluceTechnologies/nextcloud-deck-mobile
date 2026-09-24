import { useEffect, useState } from 'react';

import { validateCredentials } from '@/services/nextcloud/nextcloud';
import { HttpError } from '@/services/shared/errors';
import type { Account } from '@/types';

export type AccountAuthStatus = 'checking' | 'valid' | 'lost' | 'unknown';

export function useAccountAuthStatus(account: Account | undefined): AccountAuthStatus {
  const [status, setStatus] = useState<AccountAuthStatus>('checking');
  const baseUrl = account?.baseUrl;
  const username = account?.username;
  const appPassword = account?.appPassword;

  useEffect(() => {
    if (!baseUrl || !username || !appPassword) return;
    let cancelled = false;

    validateCredentials({ baseUrl, username, appPassword })
      .then(() => { if (!cancelled) setStatus('valid'); })
      .catch((error: unknown) => {
        if (cancelled) return;
        const httpStatus = error instanceof HttpError ? error.status : undefined;
        setStatus(httpStatus === 401 || httpStatus === 403 ? 'lost' : 'unknown');
      });

    return () => { cancelled = true; };
  }, [baseUrl, username, appPassword]);

  return status;
}
