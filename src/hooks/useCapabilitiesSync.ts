import { useEffect, useRef } from 'react';

import { useAccountStore } from '@/stores/accountStore';
import { useActiveAccount } from '@/hooks/useAccounts';
import { fetchCapabilities } from '@/services/nextcloud/nextcloud';

export function useCapabilitiesSync(): void {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const account = useActiveAccount(activeAccountId);
  const setCapabilities = useAccountStore((s) => s.setCapabilities);
  const launchHandled = useRef(false);

  useEffect(() => {
    if (!account) return;
    if (!launchHandled.current) {
      launchHandled.current = true;
      return;
    }
    let active = true;
    fetchCapabilities(account)
      .then((caps) => { if (active) setCapabilities(caps); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [account?.id, setCapabilities]);
}
