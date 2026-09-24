import { Q, type Database } from '@nozbe/watermelondb';

import type Board from '@/database/models/Board';
import type Label from '@/database/models/Label';
import { safeWrite } from '@/database/utils/safeTransaction';
import { boardUnchanged, writeBoardRow } from '@/database/writers';
import { fetchBoards } from '@/services/deck/boards';
import { localWriteEpoch } from '@/sync/localWrites';
import { loadQueuedIntents } from '@/sync/outbox/pending';
import { reconcile } from '@/sync/reconcile';
import { buildLabelOps } from '@/sync/tasks/syncLabels';
import type { Account } from '@/types';

const OVERLAP_MS = 2000;

export type SyncBoardsParams = {
  db: Database;
  account: Account;
  full: boolean;
};

export async function syncBoards({ db, account, full }: SyncBoardsParams): Promise<boolean> {
  const boards = db.get<Board>('boards');
  const rows = await boards.query(Q.where('account_id', account.id)).fetch();

  const newest = rows.reduce((max, row) => Math.max(max, row.lastModified), 0);
  const sinceMs = full || newest === 0 ? undefined : Math.max(0, newest - OVERLAP_MS);

  const epoch = localWriteEpoch();
  const remote = await fetchBoards(account, sinceMs);
  if (remote === null) return true;

  return safeWrite(
    db,
    async () => {
      if (localWriteEpoch() !== epoch) return false;

      const fresh = await boards.query(Q.where('account_id', account.id)).fetch();
      const synced = fresh.filter((r) => r.remoteId);

      const queuedBoards = await loadQueuedIntents(db, account.id, 'board');
      const queuedBoardIds = new Set(queuedBoards.map(({ entry }) => entry.entityId));
      const protectedBoardIds = new Set(
        fresh.filter((r) => queuedBoardIds.has(r.id) && r.remoteId).map((r) => r.remoteId),
      );
      for (const { intent } of queuedBoards) {
        if (intent.kind === 'deleteBoard') protectedBoardIds.add(intent.boardRemoteId);
      }

      const plan = reconcile({
        remote,
        rows: synced,
        remoteKey: (b) => b.remoteId,
        rowKey: (r) => r.remoteId,
        unchanged: boardUnchanged,
        deleteMissing: full,
        protectedRowIds: protectedBoardIds,
      });

      const labelRows = await db
        .get<Label>('labels')
        .query(Q.where('account_id', account.id))
        .fetch();

      const localIdByRemote = new Map(fresh.map((row) => [row.remoteId, row.id]));

      const ops: any[] = [];

      for (const b of plan.create) {
        const created = boards.prepareCreate((r: Board) => writeBoardRow(r, b, account.id));
        ops.push(created);
        localIdByRemote.set(b.remoteId, created.id);
      }
      for (const { row, remote: b } of plan.update) {
        if (protectedBoardIds.has(row.remoteId)) continue;
        ops.push(row.prepareUpdate((r: Board) => writeBoardRow(r, b, account.id)));
      }
      for (const row of plan.remove) {
        ops.push(row.prepareMarkAsDeleted());
      }

      for (const b of remote) {
        const boardLocalId = localIdByRemote.get(b.remoteId);
        if (!boardLocalId) continue;
        ops.push(
          ...buildLabelOps({
            db,
            accountId: account.id,
            boardLocalId,
            remote: b.labels,
            rows: labelRows.filter((r) => r.boardId === boardLocalId),
          }),
        );
      }

      if (ops.length > 0) await db.batch(ops);
      return true;
    },
    20000,
    'syncBoards',
  );
}
