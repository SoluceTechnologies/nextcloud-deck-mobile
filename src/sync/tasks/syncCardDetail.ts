import { Q, type Database, type Model } from '@nozbe/watermelondb';

import type Attachment from '@/database/models/Attachment';
import type Card from '@/database/models/Card';
import type Comment from '@/database/models/Comment';
import { safeWrite } from '@/database/utils/safeTransaction';
import {
  attachmentUnchanged,
  commentUnchanged,
  writeAttachmentRow,
  writeCommentRow,
} from '@/database/writers';
import { fetchAttachments } from '@/services/deck/attachments';
import type { CardRef } from '@/services/deck/cards';
import { fetchComments } from '@/services/deck/comments';
import { cardRefOf, DeferredIntentError } from '@/sync/outbox/handlers';
import { loadQueuedIntents } from '@/sync/outbox/pending';
import { reconcile } from '@/sync/reconcile';
import type { Account } from '@/types';

/** Deck paginates comments; a full page might not be the last one. */
const PAGE_SIZE = 20;

export type SyncCardDetailParams = {
  db: Database;
  account: Account;
  cardLocalId: string;
  offset?: number;
};

export async function syncCardDetail({
  db,
  account,
  cardLocalId,
  offset = 0,
}: SyncCardDetailParams): Promise<{ hasMore: boolean }> {
  const card = await db.get<Card>('cards').find(cardLocalId);
  // Never pushed yet: there is no remote card to fetch detail for.
  if (card.remoteId === '') return { hasMore: false };

  let ref: CardRef;
  try {
    ({ ref } = await cardRefOf({ db, account }, cardLocalId));
  } catch (err) {
    // The card itself is synced, but its stack or board is not yet — retry
    // once the outbox has pushed that prerequisite.
    if (err instanceof DeferredIntentError) return { hasMore: false };
    throw err;
  }

  const comments = await fetchComments(account, ref.cardRemoteId, { limit: PAGE_SIZE, offset });
  const attachments = await fetchAttachments(account, ref);

  await safeWrite(
    db,
    async () => {
      const ops: Model[] = [];
      const ctx = { accountId: account.id, cardLocalId };

      // `null` means "no news" (a 304, or a body-less 200) — never the same
      // answer as `[]`, which means the card really has none. Reconciling
      // against `null` would read silence as an authoritative empty set and
      // delete every row on the next pass.
      if (comments !== null) {
        const rows = (
          await db
            .get<Comment>('comments')
            .query(Q.where('account_id', account.id), Q.where('card_id', cardLocalId))
            .fetch()
        ).filter((r) => r.remoteId !== '');

        // Mirrors the board and stack shields in syncBoardContent: a queued
        // edit is protected through the row it still owns, a queued delete
        // through its intent, since that row is already destroyed and no
        // longer carries the key.
        const queued = await loadQueuedIntents(db, account.id, 'comment');
        const queuedIds = new Set(queued.map(({ entry }) => entry.entityId));
        const protectedRowIds = new Set(
          rows.filter((r) => queuedIds.has(r.id)).map((r) => r.remoteId),
        );
        for (const { intent } of queued) {
          if (intent.kind === 'deleteComment') protectedRowIds.add(intent.commentRemoteId);
        }

        const plan = reconcile({
          remote: comments,
          rows,
          remoteKey: (c) => c.remoteId,
          rowKey: (r) => r.remoteId,
          unchanged: commentUnchanged,
          // A page is authoritative for the whole set only when it is the
          // first page and it came back short (R46) — anywhere else, a
          // comment merely absent from *this* page may still exist on another.
          deleteMissing: offset === 0 && comments.length < PAGE_SIZE,
          protectedRowIds,
        });

        const collection = db.get<Comment>('comments');
        for (const c of plan.create) {
          ops.push(collection.prepareCreate((r: Comment) => writeCommentRow(r, c, ctx)));
        }
        for (const { row, remote } of plan.update) {
          // `protectedRowIds` guards create/remove, not update — a queued edit
          // still needs its own check here, or the message this pass just
          // fetched would revert it before the drain runs.
          if (protectedRowIds.has(row.remoteId)) continue;
          ops.push(row.prepareUpdate((r: Comment) => writeCommentRow(r, remote, ctx)));
        }
        for (const row of plan.remove) {
          ops.push(row.prepareMarkAsDeleted());
        }
      }

      if (attachments !== null) {
        const rows = (
          await db
            .get<Attachment>('attachments')
            .query(Q.where('account_id', account.id), Q.where('card_id', cardLocalId))
            .fetch()
        ).filter((r) => r.remoteId !== '');

        const plan = reconcile({
          remote: attachments,
          rows,
          remoteKey: (a) => a.remoteId,
          rowKey: (r) => r.remoteId,
          unchanged: attachmentUnchanged,
          // Unlike comments, attachments are never paginated: every fetch is
          // the card's complete set.
          deleteMissing: true,
        });

        const collection = db.get<Attachment>('attachments');
        for (const a of plan.create) {
          ops.push(collection.prepareCreate((r: Attachment) => writeAttachmentRow(r, a, ctx)));
        }
        for (const { row, remote } of plan.update) {
          ops.push(row.prepareUpdate((r: Attachment) => writeAttachmentRow(r, remote, ctx)));
        }
        for (const row of plan.remove) {
          ops.push(row.prepareMarkAsDeleted());
        }
      }

      if (ops.length > 0) await db.batch(ops);
    },
    30000,
    'syncCardDetail',
  );

  return { hasMore: comments !== null && comments.length === PAGE_SIZE };
}
