import { Q, type Database } from '@nozbe/watermelondb';

import type Board from '@/database/models/Board';
import { syncBoardContent } from '@/sync/tasks/syncBoardContent';
import type { Account } from '@/types';

export type SyncChangedBoardsParams = {
  db: Database;
  account: Account;
  seen: Map<string, string>;
  all: boolean;
  skip: string[];
  onBoardSynced?: (boardRemoteId: string) => void;
};

export function boardSignature(board: Pick<Board, 'lastModified' | 'etag'>): string {
  return `${board.lastModified}:${board.etag ?? ''}`;
}

export async function syncChangedBoards({
  db,
  account,
  seen,
  all,
  skip,
  onBoardSynced,
}: SyncChangedBoardsParams): Promise<boolean> {
  const boards = await db
    .get<Board>('boards')
    .query(Q.where('account_id', account.id), Q.where('archived', false))
    .fetch();

  for (const board of boards) {
    if (!board.remoteId || skip.includes(board.remoteId)) continue;
    const signature = boardSignature(board);
    if (!all && seen.get(board.remoteId) === signature) continue;

    try {
      if (await syncBoardContent({ db, account, boardRemoteId: board.remoteId, full: true })) {
        seen.set(board.remoteId, signature);
      }
      onBoardSynced?.(board.remoteId);
    } catch (error) {
      console.warn('[sync] changed board content failed', board.remoteId, String(error));
    }
  }

  return true;
}
