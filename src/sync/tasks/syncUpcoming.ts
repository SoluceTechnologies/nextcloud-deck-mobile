import { Q, type Database, type Model } from '@nozbe/watermelondb';

import type Card from '@/database/models/Card';
import type Board from '@/database/models/Board';
import type Stack from '@/database/models/Stack';
import { safeWrite } from '@/database/utils/safeTransaction';
import { cardUnchanged, writeCardRow } from '@/database/writers';
import { fetchUpcoming, flattenUpcoming } from '@/services/deck/overview';
import { localWriteEpoch } from '@/sync/localWrites';
import { loadPendingCards } from '@/sync/outbox/pending';
import { reconcile } from '@/sync/reconcile';
import type { Account } from '@/types';

export type SyncUpcomingParams = {
  db: Database;
  account: Account;
};

/**
 * `overview/upcoming` returns only the cards assigned to the user or unassigned,
 * across every board, in one request. It is a filtered subset, never a snapshot:
 * this pass creates and updates, and removes nothing.
 *
 * Returns `true` if the pass actually ran (including a legitimate no-op);
 * `false` if it aborted without writing because a local write raced the
 * fetch. The caller must not credit a `false` pass as having synced — see
 * `scheduler.ts`.
 */
export async function syncUpcoming({ db, account }: SyncUpcomingParams): Promise<boolean> {
  const epoch = localWriteEpoch();
  const remote = flattenUpcoming(await fetchUpcoming(account));

  return safeWrite(
    db,
    async () => {
      // A write landed while the fetch was in flight: the rows below would be
      // reconciled against a remote snapshot paired with a local state that is
      // already stale. Abort without writing, and report it, for the same
      // reason the board passes do.
      if (localWriteEpoch() !== epoch) return false;

      const boardRows = await db
        .get<Board>('boards')
        .query(Q.where('account_id', account.id))
        .fetch();
      const stackRows = await db
        .get<Stack>('stacks')
        .query(Q.where('account_id', account.id))
        .fetch();

      const boardLocalIdByRemote = new Map(boardRows.map((r) => [r.remoteId, r.id]));
      const stackLocalIdByRemote = new Map(stackRows.map((r) => [r.remoteId, r.id]));

      // A card can only be stored once its board and stack rows exist; the board
      // passes create those, and the next tick picks the card up.
      const placeable = remote.filter(
        (c) =>
          boardLocalIdByRemote.has(c.boardRemoteId) && stackLocalIdByRemote.has(c.stackRemoteId),
      );
      if (placeable.length === 0) return true;

      const cards = db.get<Card>('cards');
      const cardRows = await cards.query(Q.where('account_id', account.id)).fetch();
      const pending = await loadPendingCards(db, account.id);

      const ctxFor = (c: (typeof placeable)[number], rowId?: string) => ({
        accountId: account.id,
        boardLocalId: boardLocalIdByRemote.get(c.boardRemoteId) as string,
        stackLocalId: stackLocalIdByRemote.get(c.stackRemoteId) as string,
        protectedFields: rowId ? pending.get(rowId)?.fields : undefined,
      });

      // Filter out cards awaiting their first push: they carry remoteId = '' until the create
      // flushes to the server, but they cannot match any remote card and are already protected
      // by the outbox. Passing them to reconcile would risk marking them deleted if another
      // offline card collides on that empty key.
      const syncedCardRows = cardRows.filter((r) => r.remoteId);

      const plan = reconcile({
        remote: placeable,
        rows: syncedCardRows,
        remoteKey: (c) => c.remoteId,
        rowKey: (r) => r.remoteId,
        unchanged: (row, c) => cardUnchanged(row, c, ctxFor(c, row.id)),
        deleteMissing: false,
      });

      const ops: Model[] = [
        ...plan.create.map((c) => cards.prepareCreate((r: Card) => writeCardRow(r, c, ctxFor(c)))),
        ...plan.update.map(({ row, remote: c }) =>
          row.prepareUpdate((r: Card) => writeCardRow(r, c, ctxFor(c, row.id))),
        ),
      ];

      if (ops.length > 0) await db.batch(ops);
      return true;
    },
    20000,
    'syncUpcoming',
  );
}
