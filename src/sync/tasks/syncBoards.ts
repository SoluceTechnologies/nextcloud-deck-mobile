import { Q, type Database } from '@nozbe/watermelondb';

import type Board from '@/database/models/Board';
import { safeWrite } from '@/database/utils/safeTransaction';
import { boardUnchanged, writeBoardRow } from '@/database/writers';
import { fetchBoards } from '@/services/deck/boards';
import { localWriteEpoch } from '@/sync/localWrites';
import { reconcile } from '@/sync/reconcile';
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

export async function syncBoards({ db, account, full }: SyncBoardsParams): Promise<void> {
  const boards = db.get<Board>('boards');
  const rows = await boards.query(Q.where('account_id', account.id)).fetch();

  const newest = rows.reduce((max, row) => Math.max(max, row.lastModified), 0);
  const sinceMs = full || newest === 0 ? undefined : Math.max(0, newest - OVERLAP_MS);

  const epoch = localWriteEpoch();
  const remote = await fetchBoards(account, sinceMs);

  await safeWrite(
    db,
    async () => {
      if (localWriteEpoch() !== epoch) return;

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

      const ops = [
        ...plan.create.map((b) => boards.prepareCreate((r: Board) => writeBoardRow(r, b, account.id))),
        ...plan.update.map(({ row, remote: b }) =>
          row.prepareUpdate((r: Board) => writeBoardRow(r, b, account.id)),
        ),
        ...plan.remove.map((row) => row.prepareMarkAsDeleted()),
      ];

      if (ops.length > 0) await db.batch(ops);
    },
    20000,
    'syncBoards',
  );
}
