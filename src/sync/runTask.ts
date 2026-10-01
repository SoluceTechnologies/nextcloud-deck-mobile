import type { Database } from '@nozbe/watermelondb';

import { useUiStore } from '@/stores/uiStore';
import type { Account } from '@/types';

import type { SyncTask } from './dueTasks';
import { syncBoardContent } from './tasks/syncBoardContent';
import { syncBoards } from './tasks/syncBoards';
import { syncChangedBoards } from './tasks/syncChangedBoards';
import { syncUpcoming } from './tasks/syncUpcoming';

export function createTaskRunner(
  db: Database,
  account: Account,
): (task: SyncTask) => Promise<boolean> {
  const seen = new Map<string, string>();

  return async (task) => {
    switch (task.kind) {
      case 'boards':
        return syncBoards({ db, account, full: task.full });
      case 'changedBoards':
        return syncChangedBoards({
          db,
          account,
          seen,
          all: task.all,
          skip: task.skip,
          onBoardSynced: (boardRemoteId) =>
            useUiStore.getState().markBoardContentFetched(account.id, boardRemoteId),
        });
      case 'upcoming':
        return syncUpcoming({ db, account });
      case 'boardContent':
        try {
          return await syncBoardContent({
            db,
            account,
            boardRemoteId: task.boardRemoteId,
            full: task.full,
          });
        } finally {
          useUiStore.getState().markBoardContentFetched(account.id, task.boardRemoteId);
        }
    }
  };
}
