import { Q, type Database } from '@nozbe/watermelondb';

import type Board from '@/database/models/Board';
import type Label from '@/database/models/Label';
import { safeWrite } from '@/database/utils/safeTransaction';
import { boardUnchanged, writeBoardRow } from '@/database/writers';
import { fetchBoards } from '@/services/deck/boards';
import { localWriteEpoch } from '@/sync/localWrites';
import { reconcile } from '@/sync/reconcile';
import { buildLabelOps } from '@/sync/tasks/syncLabels';
import type { Account } from '@/types';

/**
 * Deck compares `If-Modified-Since` against `last_modified > since`, on the server
 * clock and at second resolution. Rewinding two seconds re-sends a handful of
 * already-known boards rather than missing one written in the same second.
 */
const OVERLAP_MS = 2000;

export type SyncBoardsParams = {
  db: Database;
  account: Account;
  /** `true` runs a snapshot pass, which is authoritative and removes stale rows. */
  full: boolean;
};

/**
 * `true` if the pass actually reconciled (including a legitimate no-op, such
 * as a 304); `false` if it aborted without writing because a local write
 * raced the fetch. The caller must not credit a `false` pass as a snapshot —
 * see `scheduler.ts`.
 */
export async function syncBoards({ db, account, full }: SyncBoardsParams): Promise<boolean> {
  const boards = db.get<Board>('boards');
  const rows = await boards.query(Q.where('account_id', account.id)).fetch();

  const newest = rows.reduce((max, row) => Math.max(max, row.lastModified), 0);
  const sinceMs = full || newest === 0 ? undefined : Math.max(0, newest - OVERLAP_MS);

  const epoch = localWriteEpoch();
  const remote = await fetchBoards(account, sinceMs);
  // 304: nothing changed since the cursor, so there is nothing to reconcile.
  // `deleteMissing` is false on this path today, but treating "no news" as an
  // empty snapshot is the same latent bug the stacks pass had.
  if (remote === null) return true;

  return safeWrite(
    db,
    async () => {
      // A write landed while the fetch was in flight: the rows below would be
      // reconciled against a remote snapshot paired with a local state that is
      // already stale. Abort without writing, and report it — a bare success
      // here would let the caller stamp a snapshot clock for a pass that did
      // nothing, corrupting the one mechanism that ever notices a deletion.
      if (localWriteEpoch() !== epoch) return false;

      const fresh = await boards.query(Q.where('account_id', account.id)).fetch();
      // Filter out boards awaiting their first push: they carry remoteId = '' until the create
      // flushes to the server, but they cannot match any remote board and are already protected
      // by the outbox. Passing them to reconcile would risk marking them deleted if another
      // offline board collides on that empty key.
      const synced = fresh.filter((r) => r.remoteId);

      const plan = reconcile({
        remote,
        rows: synced,
        remoteKey: (b) => b.remoteId,
        rowKey: (r) => r.remoteId,
        unchanged: boardUnchanged,
        deleteMissing: full,
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
