import { Q } from '@nozbe/watermelondb';
import { useEffect, useMemo, useState } from 'react';

import { useDatabase } from '@/database/DatabaseProvider';
import { useBoards } from '@/database/hooks/useBoards';
import type Board from '@/database/models/Board';
import type RecentBoard from '@/database/models/RecentBoard';

export function useRecentBoards(accountId: string | null): Board[] {
  const database = useDatabase();
  const boards = useBoards(accountId);
  const [recents, setRecents] = useState<RecentBoard[]>([]);

  useEffect(() => {
    if (!accountId) {
      setRecents([]);
      return;
    }
    const subscription = database
      .get<RecentBoard>('recent_boards')
      .query(Q.where('account_id', accountId))
      .observeWithColumns(['board_id', 'opened_at'])
      .subscribe((rows) => setRecents([...rows]));
    return () => subscription.unsubscribe();
  }, [accountId, database]);

  return useMemo(() => {
    const boardById = new Map(boards.map((board) => [board.id, board]));
    return [...recents]
      .sort((a, b) => b.openedAt - a.openedAt)
      .map((recent) => boardById.get(recent.boardId))
      .filter((board): board is Board => board !== undefined);
  }, [recents, boards]);
}
