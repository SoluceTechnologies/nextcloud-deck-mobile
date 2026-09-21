import { Q, type Database, type Model } from '@nozbe/watermelondb';

import type RecentBoard from '@/database/models/RecentBoard';
import { safeWrite } from '@/database/utils/safeTransaction';

export const MAX_RECENT_BOARDS = 10;

export async function recordRecentBoard(
  db: Database,
  accountId: string,
  boardLocalId: string,
  now: number = Date.now(),
): Promise<void> {
  await safeWrite(
    db,
    async () => {
      const recentBoards = db.get<RecentBoard>('recent_boards');
      const rows = await recentBoards.query(Q.where('account_id', accountId)).fetch();

      const existing = rows.find((row) => row.boardId === boardLocalId);
      const touched: Model = existing
        ? existing.prepareUpdate((row) => {
            row.openedAt = now;
          })
        : recentBoards.prepareCreate((row) => {
            row.accountId = accountId;
            row.boardId = boardLocalId;
            row.openedAt = now;
          });

      const pruned = rows
        .filter((row) => row.boardId !== boardLocalId)
        .sort((a, b) => b.openedAt - a.openedAt)
        .slice(MAX_RECENT_BOARDS - 1)
        .map((row) => row.prepareMarkAsDeleted());

      await db.batch([touched, ...pruned]);
    },
    10000,
    'recordRecentBoard',
  );
}
