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
import {
  loadPendingCards,
  loadQueuedIntents,
  mergeServerValues,
  pendingEntityIds,
} from '@/sync/outbox/pending';
import { reconcile } from '@/sync/reconcile';
import { buildCardRelationOps } from '@/sync/tasks/cardRelations';
import type { Account } from '@/types';

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

  if (remoteStacks === null) return true;

  return safeWrite(
    db,
    async () => {
      if (localWriteEpoch() !== epoch) return false;

      const stackRows = await stacks
        .query(Q.where('account_id', account.id), Q.where('board_id', boardLocalId))
        .fetch();
      const cardRows = await cards
        .query(Q.where('account_id', account.id), Q.where('board_id', boardLocalId))
        .fetch();
      const pending = await loadPendingCards(db, account.id);

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

      for (const bucket of pending.values()) {
        for (const { intent } of bucket.entries) {
          if (intent.kind === 'deleteCard') protectedRowIds.add(intent.ref.cardRemoteId);
        }
      }

      const { labelLocalIdByRemote, cardLabelRows, cardAssigneeRows } = await loadCardRelationContext(
        db,
        account.id,
        boardLocalId,
      );

      const ops: Model[] = [];
      const stackCtx = { accountId: account.id, boardLocalId };

      const syncedStackRows = stackRows.filter((r) => r.remoteId);

      const queuedStacks = await loadQueuedIntents(db, account.id, 'stack');
      const queuedStackIds = new Set(queuedStacks.map(({ entry }) => entry.entityId));
      const protectedStackIds = new Set(
        stackRows.filter((r) => queuedStackIds.has(r.id) && r.remoteId).map((r) => r.remoteId),
      );
      for (const { intent } of queuedStacks) {
        if (intent.kind === 'deleteStack') protectedStackIds.add(intent.stackRemoteId);
      }

      const stackPlan = reconcile({
        remote: remoteStacks,
        rows: syncedStackRows,
        remoteKey: (s) => s.remoteId,
        rowKey: (r) => r.remoteId,
        unchanged: (row, remote) => stackUnchanged(row, remote, boardLocalId),
        deleteMissing: true,
        protectedRowIds: protectedStackIds,
      });

      const stackLocalIdByRemote = new Map(stackRows.map((r) => [r.remoteId, r.id]));
      for (const s of stackPlan.create) {
        const created = stacks.prepareCreate((r: Stack) => writeStackRow(r, s, stackCtx));
        ops.push(created);
        stackLocalIdByRemote.set(s.remoteId, created.id);
      }
      for (const { row, remote: s } of stackPlan.update) {
        if (protectedStackIds.has(row.remoteId)) continue;
        ops.push(row.prepareUpdate((r: Stack) => writeStackRow(r, s, stackCtx)));
      }
      for (const row of stackPlan.remove) {
        ops.push(row.prepareMarkAsDeleted());
        stackLocalIdByRemote.delete(row.remoteId);
      }

      const remoteCards: DeckCard[] = remoteStacks.flatMap((s) => s.cards);

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
