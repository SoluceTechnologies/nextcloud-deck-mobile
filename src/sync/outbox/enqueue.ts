import type { Database, Model } from '@nozbe/watermelondb';

import type OutboxEntry from '@/database/models/OutboxEntry';
import { safeWrite } from '@/database/utils/safeTransaction';
import type { CardFieldName } from '@/database/writers';
import { markLocalWrite } from '@/sync/localWrites';

import type { Intent } from './types';

export const OUTBOX_QUEUED = 'queued';
export const OUTBOX_FAILED = 'failed';

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
  if ('commentId' in intent) return { entityType: 'comment', entityId: intent.commentId };
  if ('cardId' in intent) return { entityType: 'card', entityId: intent.cardId };
  if ('stackId' in intent) return { entityType: 'stack', entityId: intent.stackId };
  if ('labelId' in intent) return { entityType: 'label', entityId: intent.labelId };
  return { entityType: 'board', entityId: intent.boardId };
}

export type MutateParams = {
  db: Database;
  accountId: string;
  intent: Intent;
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
      await db.batch([...localOps, outboxOp]);
    },
    15000,
    `mutate:${intent.kind}`,
  );
  markLocalWrite();
}

export type { Intent, IntentKind, CardRemoteRef } from './types';
