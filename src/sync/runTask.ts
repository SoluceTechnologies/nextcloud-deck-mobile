import type { Database } from '@nozbe/watermelondb';

import { useUiStore } from '@/stores/uiStore';
import type { Account } from '@/types';

import type { SyncTask } from './dueTasks';
import { syncBoardContent } from './tasks/syncBoardContent';
import { syncBoards } from './tasks/syncBoards';
import { syncUpcoming } from './tasks/syncUpcoming';

export function createTaskRunner(
  db: Database,
  account: Account,
): (task: SyncTask) => Promise<boolean> {
  return async (task) => {
    switch (task.kind) {
      case 'boards':
        return syncBoards({ db, account, full: task.full });
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
