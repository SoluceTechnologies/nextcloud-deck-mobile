import { Q } from '@nozbe/watermelondb';
import { useEffect, useState } from 'react';

import { useDatabase } from '@/database/DatabaseProvider';
import { useAccountStore } from '@/stores/accountStore';
import { OUTBOX_FAILED } from '@/sync/outbox/enqueue';

export function useFailedSyncCount(): number {
  const database = useDatabase();
  const accountId = useAccountStore((s) => s.activeAccountId);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!accountId) {
      setCount(0);
      return;
    }
    const subscription = database
      .get('outbox')
      .query(Q.where('account_id', accountId), Q.where('state', OUTBOX_FAILED))
      .observeCount()
      .subscribe(setCount);
    return () => subscription.unsubscribe();
  }, [accountId, database]);

  return count;
}
