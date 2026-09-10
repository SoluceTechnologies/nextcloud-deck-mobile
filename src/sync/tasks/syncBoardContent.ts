import { Q, type Database, type Model } from '@nozbe/watermelondb';

import type Board from '@/database/models/Board';
import type Card from '@/database/models/Card';
import type OutboxEntry from '@/database/models/OutboxEntry';
import type Stack from '@/database/models/Stack';
import { safeWrite } from '@/database/utils/safeTransaction';
import {
  cardUnchanged,
  serverValuesOf,
  stackUnchanged,
  writeCardRow,
  writeStackRow,
  type CardFieldName,
} from '@/database/writers';
import { fetchStacks } from '@/services/deck/boards';
import type { DeckCard } from '@/services/deck/types';
import { localWriteEpoch } from '@/sync/localWrites';
import { loadPendingCards, mergeServerValues, pendingEntityIds } from '@/sync/outbox/pending';
import { reconcile } from '@/sync/reconcile';
import type { Account } from '@/types';

/**
 * Deck compares `If-Modified-Since` against `last_modified > since`, on the server
 * clock and at second resolution. Rewinding two seconds re-sends a handful of
 * already-known rows rather than missing one written in the same second.
 */
const OVERLAP_MS = 2000;

export type SyncBoardContentParams = {
  db: Database;
  account: Account;
  boardRemoteId: string;
  full: boolean;
};

export async function syncBoardContent({
  db,
  account,
  boardRemoteId,
  full,
}: SyncBoardContentParams): Promise<void> {
  const boardRow = (
    await db
      .get<Board>('boards')
      .query(Q.where('account_id', account.id), Q.where('remote_id', boardRemoteId))
      .fetch()
  )[0];

  // The board list pass owns board creation; without a row there is nowhere to attach.
  if (!boardRow) return;
  const boardLocalId = boardRow.id;

  const cards = db.get<Card>('cards');
  const stacks = db.get<Stack>('stacks');

  const existingCards = await cards
    .query(Q.where('account_id', account.id), Q.where('board_id', boardLocalId))
    .fetch();

  const newest = existingCards.reduce((max, row) => Math.max(max, row.lastModified), 0);
  const sinceMs = full || newest === 0 ? undefined : Math.max(0, newest - OVERLAP_MS);

  const epoch = localWriteEpoch();
  const remoteStacks = await fetchStacks(account, boardRemoteId, sinceMs);

  await safeWrite(
    db,
    async () => {
      if (localWriteEpoch() !== epoch) return;

      const stackRows = await stacks
        .query(Q.where('account_id', account.id), Q.where('board_id', boardLocalId))
        .fetch();
      const cardRows = await cards
        .query(Q.where('account_id', account.id), Q.where('board_id', boardLocalId))
        .fetch();
      const pending = await loadPendingCards(db, account.id);

      const ops: Model[] = [];
      const stackCtx = { accountId: account.id, boardLocalId };

      // Stacks always come back whole, even on a delta call, so this pass is
      // always authoritative for the stack set.
      const stackPlan = reconcile({
        remote: remoteStacks,
        rows: stackRows,
        remoteKey: (s) => s.remoteId,
        rowKey: (r) => r.remoteId,
        unchanged: (row, remote) => stackUnchanged(row, remote, boardLocalId),
        deleteMissing: true,
      });

      const stackLocalIdByRemote = new Map(stackRows.map((r) => [r.remoteId, r.id]));
      for (const s of stackPlan.create) {
        const created = stacks.prepareCreate((r: Stack) => writeStackRow(r, s, stackCtx));
        ops.push(created);
        stackLocalIdByRemote.set(s.remoteId, created.id);
      }
      for (const { row, remote: s } of stackPlan.update) {
        ops.push(row.prepareUpdate((r: Stack) => writeStackRow(r, s, stackCtx)));
      }
      for (const row of stackPlan.remove) {
        ops.push(row.prepareMarkAsDeleted());
        stackLocalIdByRemote.delete(row.remoteId);
      }

      const remoteCards: DeckCard[] = remoteStacks.flatMap((s) => s.cards);

      // Filter out cards awaiting their first push: they carry remoteId = '' until the create
      // flushes to the server, but they cannot match any remote card and are already protected
      // by the outbox. Passing them to reconcile would risk marking them deleted if another
      // offline card collides on that empty key.
      const syncedCardRows = cardRows.filter((r) => r.remoteId);

      const cardPlan = reconcile({
        remote: remoteCards,
        rows: syncedCardRows,
        remoteKey: (c) => c.remoteId,
        rowKey: (r) => r.remoteId,
        unchanged: (row, remote) =>
          cardUnchanged(row, remote, {
            accountId: account.id,
            boardLocalId,
            stackLocalId: stackLocalIdByRemote.get(remote.stackRemoteId) ?? row.stackId,
            protectedFields: pending.get(row.id)?.fields,
          }),
        // A delta omits archived and deleted cards silently, so absence only
        // means "gone" when the response was a snapshot.
        deleteMissing: full,
        protectedRowIds: new Set(
          syncedCardRows.filter((r) => pendingEntityIds(pending).has(r.id)).map((r) => r.remoteId),
        ),
      });

      for (const c of cardPlan.create) {
        const stackLocalId = stackLocalIdByRemote.get(c.stackRemoteId);
        if (!stackLocalId) continue;
        ops.push(
          cards.prepareCreate((r: Card) =>
            writeCardRow(r, c, { accountId: account.id, boardLocalId, stackLocalId }),
          ),
        );
      }

      for (const { row, remote: c } of cardPlan.update) {
        const stackLocalId = stackLocalIdByRemote.get(c.stackRemoteId) ?? row.stackId;
        const bucket = pending.get(row.id);
        const protectedFields = bucket?.fields;

        ops.push(
          row.prepareUpdate((r: Card) =>
            writeCardRow(r, c, {
              accountId: account.id,
              boardLocalId,
              stackLocalId,
              protectedFields,
            }),
          ),
        );

        // The server's take on the fields we are shielding, kept for the
        // per-field conflict check the drain runs before sending.
        if (bucket && bucket.fields.size > 0) {
          const values = serverValuesOf(c, [...bucket.fields] as CardFieldName[]);
          for (const { entry } of bucket.entries) {
            const merged = mergeServerValues(entry, values);
            ops.push(entry.prepareUpdate((r: OutboxEntry) => (r.serverValuesJson = merged)));
          }
        }
      }

      for (const row of cardPlan.remove) {
        ops.push(row.prepareMarkAsDeleted());
      }

      if (ops.length > 0) await db.batch(ops);
    },
    30000,
    'syncBoardContent',
  );
}
