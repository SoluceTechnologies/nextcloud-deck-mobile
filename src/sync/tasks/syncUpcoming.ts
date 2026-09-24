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
import { syncBoardContent } from '@/sync/tasks/syncBoardContent';
import type { DeckCard } from '@/services/deck/types';
import type { Account } from '@/types';

export type SyncUpcomingParams = {
  db: Database;
  account: Account;
};

// Lists only reach the local DB through a board content sync (opening the
// board), and a card can't be stored without its list. Pull the content of
// known boards whose lists are missing, or a fresh login shows an empty Today
// until every board has been opened once.
async function syncBoardsWithUnknownStacks(
  db: Database,
  account: Account,
  remote: DeckCard[],
): Promise<void> {
  const boardRows = await db.get<Board>('boards').query(Q.where('account_id', account.id)).fetch();
  const stackRows = await db.get<Stack>('stacks').query(Q.where('account_id', account.id)).fetch();
  const knownBoards = new Set(boardRows.map((r) => r.remoteId));
  const knownStacks = new Set(stackRows.map((r) => r.remoteId));

  const boardRemoteIds = new Set(
    remote
      .filter((c) => knownBoards.has(c.boardRemoteId) && !knownStacks.has(c.stackRemoteId))
      .map((c) => c.boardRemoteId),
  );
  for (const boardRemoteId of boardRemoteIds) {
    try {
      await syncBoardContent({ db, account, boardRemoteId, full: true });
    } catch (error) {
      console.warn('[sync] board content for upcoming failed', boardRemoteId, String(error));
    }
  }
}

export async function syncUpcoming({ db, account }: SyncUpcomingParams): Promise<boolean> {
  const epoch = localWriteEpoch();
  const remote = flattenUpcoming(await fetchUpcoming(account));
  await syncBoardsWithUnknownStacks(db, account, remote);

  return safeWrite(
    db,
    async () => {
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
