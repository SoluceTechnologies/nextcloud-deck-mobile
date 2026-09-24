import { Q } from '@nozbe/watermelondb';
import { useEffect, useState } from 'react';

import { useDatabase } from '@/database/DatabaseProvider';
import type Stack from '@/database/models/Stack';
import { STACK_OBSERVED_COLUMNS } from '@/database/observedColumns';

export function useBoardStacks(accountId: string | null, boardLocalId: string | null): Stack[] {
  const database = useDatabase();
  const [stacks, setStacks] = useState<Stack[]>([]);

  useEffect(() => {
    if (!accountId || !boardLocalId) {
      setStacks([]);
      return;
    }
    const subscription = database
      .get<Stack>('stacks')
      .query(Q.where('account_id', accountId), Q.where('board_id', boardLocalId))
      .observeWithColumns(STACK_OBSERVED_COLUMNS)
      .subscribe((rows) => setStacks([...rows].sort((a, b) => a.order - b.order)));
    return () => subscription.unsubscribe();
  }, [accountId, boardLocalId, database]);

  return stacks;
}
