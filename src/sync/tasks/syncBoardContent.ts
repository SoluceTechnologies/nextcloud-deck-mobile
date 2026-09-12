import { Q, type Database, type Model } from '@nozbe/watermelondb';

import type Board from '@/database/models/Board';
import type Card from '@/database/models/Card';
import type CardAssignee from '@/database/models/CardAssignee';
import type CardLabel from '@/database/models/CardLabel';
import type Label from '@/database/models/Label';
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
import { buildCardRelationOps } from '@/sync/tasks/cardRelations';
import type { Account } from '@/types';

/**
 * Deck compares `If-Modified-Since` against `last_modified > since`, on the server
 * clock and at second resolution. Rewinding two seconds re-sends a handful of
 * already-known rows rather than missing one written in the same second.
 */
const OVERLAP_MS = 2000;

async function loadCardRelationContext(
  db: Database,
  accountId: string,
  boardLocalId: string,
): Promise<{
  labelLocalIdByRemote: Map<string, string>;
  cardLabelRows: CardLabel[];
  cardAssigneeRows: CardAssignee[];
}> {
  const labelRows = await db
    .get<Label>('labels')
    .query(Q.where('account_id', accountId), Q.where('board_id', boardLocalId))
    .fetch();
  const labelLocalIdByRemote = new Map(labelRows.map((r) => [r.remoteId, r.id]));

  const cardLabelRows = await db
    .get<CardLabel>('card_labels')
    .query(Q.where('account_id', accountId))
    .fetch();
  const cardAssigneeRows = await db
    .get<CardAssignee>('card_assignees')
    .query(Q.where('account_id', accountId))
    .fetch();

  return { labelLocalIdByRemote, cardLabelRows, cardAssigneeRows };
}

export type SyncBoardContentParams = {
  db: Database;
  account: Account;
  boardRemoteId: string;
  full: boolean;
};

/**
 * `true` if the pass actually reconciled (including a legitimate no-op, such
 * as a 304); `false` if it aborted without writing because a local write
 * raced the fetch. The caller must not credit a `false` pass as a snapshot —
 * see `scheduler.ts`.
 */
export async function syncBoardContent({
  db,
  account,
  boardRemoteId,
  full,
}: SyncBoardContentParams): Promise<boolean> {
  const boardRow = (
    await db
      .get<Board>('boards')
      .query(Q.where('account_id', account.id), Q.where('remote_id', boardRemoteId))
      .fetch()
  )[0];

  // The board list pass owns board creation; without a row there is nowhere to attach.
  if (!boardRow) return true;
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
  // 304: nothing changed since the cursor. Reconciling against it would treat
  // "no news" as an empty snapshot and delete every stack on the board.
  if (remoteStacks === null) return true;

  return safeWrite(
    db,
    async () => {
      // A write landed while the fetch was in flight: the rows below would be
      // reconciled against a remote snapshot paired with a local state that is
      // already stale. Abort without writing, and report it — a bare success
      // here would let the caller stamp a snapshot clock for a pass that did
      // nothing, corrupting the one mechanism that ever notices a deletion.
      if (localWriteEpoch() !== epoch) return false;

      const stackRows = await stacks
        .query(Q.where('account_id', account.id), Q.where('board_id', boardLocalId))
        .fetch();
      const cardRows = await cards
        .query(Q.where('account_id', account.id), Q.where('board_id', boardLocalId))
        .fetch();
      const pending = await loadPendingCards(db, account.id);

      // A queued move can have re-homed a card's row to another board before
      // the intent flushed (`useCardActions.move` adopts the target board
      // locally right away). Scoping this lookup to `boardLocalId` would miss
      // it — this board's own snapshot still lists the card, the guard below
      // would not fire, and reconcile would recreate it here while it also
      // still exists on the board it moved to. Fetch pending cards account-wide.
      const pendingIds = pendingEntityIds(pending);
      const pendingCardRows =
        pendingIds.size === 0
          ? []
          : await cards
              .query(Q.where('account_id', account.id), Q.where('id', Q.oneOf([...pendingIds])))
              .fetch();
      const protectedRowIds = new Set(
        pendingCardRows.map((r) => r.remoteId).filter((id) => id !== ''),
      );

      const { labelLocalIdByRemote, cardLabelRows, cardAssigneeRows } = await loadCardRelationContext(
        db,
        account.id,
        boardLocalId,
      );

      const ops: Model[] = [];
      const stackCtx = { accountId: account.id, boardLocalId };

      // Filter out stacks awaiting their first push: they carry remoteId = '' until the create
      // flushes to the server, but they cannot match any remote stack and are already protected
      // by the outbox. Passing them to reconcile would risk marking them deleted if another
      // offline stack collides on that empty key.
      const syncedStackRows = stackRows.filter((r) => r.remoteId);

      // Stacks always come back whole, even on a delta call, so this pass is
      // always authoritative for the stack set.
      const stackPlan = reconcile({
        remote: remoteStacks,
        rows: syncedStackRows,
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
        protectedRowIds,
      });

      const cardLocalIdByRemote = new Map(cardRows.map((r) => [r.remoteId, r.id]));

      for (const c of cardPlan.create) {
        const stackLocalId = stackLocalIdByRemote.get(c.stackRemoteId);
        if (!stackLocalId) continue;
        const created = cards.prepareCreate((r: Card) =>
          writeCardRow(r, c, { accountId: account.id, boardLocalId, stackLocalId }),
        );
        ops.push(created);
        cardLocalIdByRemote.set(c.remoteId, created.id);
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

      for (const c of remoteCards) {
        const cardLocalId = cardLocalIdByRemote.get(c.remoteId);
        if (!cardLocalId) continue;
        ops.push(
          ...buildCardRelationOps({
            db,
            accountId: account.id,
            cardLocalId,
            remote: c,
            labelLocalIdByRemote,
            labelRows: cardLabelRows.filter((r) => r.cardId === cardLocalId),
            assigneeRows: cardAssigneeRows.filter((r) => r.cardId === cardLocalId),
            pending,
          }),
        );
      }

      for (const row of cardPlan.remove) {
        ops.push(row.prepareMarkAsDeleted());
        for (const join of cardLabelRows.filter((r) => r.cardId === row.id)) {
          ops.push(join.prepareMarkAsDeleted());
        }
        for (const join of cardAssigneeRows.filter((r) => r.cardId === row.id)) {
          ops.push(join.prepareMarkAsDeleted());
        }
      }

      if (ops.length > 0) await db.batch(ops);
      return true;
    },
    30000,
    'syncBoardContent',
  );
}
