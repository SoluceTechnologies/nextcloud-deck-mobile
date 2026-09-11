import type { Database, Model } from '@nozbe/watermelondb';

import type OutboxEntry from '@/database/models/OutboxEntry';
import { safeWrite } from '@/database/utils/safeTransaction';
import type { CardFieldName } from '@/database/writers';
import { markLocalWrite } from '@/sync/localWrites';

import type { Intent } from './types';

export const OUTBOX_QUEUED = 'queued';
export const OUTBOX_FAILED = 'failed';

/** Which card columns this intent owns, and so must be shielded from a sync overwrite. */
export function protectedFieldsOf(intent: Intent): CardFieldName[] {
  switch (intent.kind) {
    case 'patchCard':
      return intent.fields;
    case 'moveCard':
      return ['stackId', 'order'];
    case 'setCardArchived':
      return ['archived'];
    default:
      return [];
  }
}

export function entityRefOf(intent: Intent): { entityType: string; entityId: string } {
  if ('cardId' in intent) return { entityType: 'card', entityId: intent.cardId };
  if ('stackId' in intent) return { entityType: 'stack', entityId: intent.stackId };
  if ('labelId' in intent) return { entityType: 'label', entityId: intent.labelId };
  // Only createBoard | updateBoard | deleteBoard survive the three guards above, and all three
  // carry boardId — no cast needed, and a future Intent variant missing all four id fields would
  // fail to compile.
  return { entityType: 'board', entityId: intent.boardId };
}

export type MutateParams = {
  db: Database;
  accountId: string;
  intent: Intent;
  /**
   * Prepares (but does not commit) the optimistic local write: return the result of
   * `collection.prepareCreate(...)`, `record.prepareUpdate(...)`, or `record.prepareMarkAsDeleted()`
   * — one operation, or an array of several. You may `await` reads first (e.g. to look up the row
   * to update); only the prepare call itself must be synchronous, as WatermelonDB requires.
   * `mutate()` commits whatever is returned together with the outbox row in a single `db.batch()`.
   */
  applyLocal: () => Promise<Model | Model[]> | Model | Model[];
};

export async function mutate({ db, accountId, intent, applyLocal }: MutateParams): Promise<void> {
  const { entityType, entityId } = entityRefOf(intent);

  await safeWrite(
    db,
    async () => {
      const prepared = await applyLocal();
      const localOps = Array.isArray(prepared) ? prepared : [prepared];

      const outboxOp = db.get<OutboxEntry>('outbox').prepareCreate((row) => {
        row.accountId = accountId;
        row.kind = intent.kind;
        row.entityType = entityType;
        row.entityId = entityId;
        row.payloadJson = JSON.stringify(intent);
        row.serverValuesJson = '{}';
        row.createdAt = Date.now();
        row.attempts = 0;
        row.nextAttemptAt = 0;
        row.lastError = undefined;
        row.state = OUTBOX_QUEUED;
      });

      // Atomicity guarantee: `Database.write()` (which safeWrite calls) only gives
      // writer-exclusivity and FIFO ordering via a JS work queue — it is not a rollback-capable
      // transaction. The one primitive WatermelonDB actually commits atomically is `db.batch()`:
      // every operation passed to one batch() call becomes a single call into the native adapter,
      // which wraps them all in one SQL transaction (commit together, or roll back together on
      // failure). So the local write and the outbox row are only *prepared* above and committed
      // here, together, in one batch — the local change and its outbox entry always land as one.
      await db.batch([...localOps, outboxOp]);
    },
    15000,
    `mutate:${intent.kind}`,
  );

  markLocalWrite();
}

// Re-export intent types so callers have a single import site
export type { Intent, IntentKind, CardRemoteRef } from './types';
