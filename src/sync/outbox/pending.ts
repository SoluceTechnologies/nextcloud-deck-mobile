import { Q, type Database } from '@nozbe/watermelondb';

import type OutboxEntry from '@/database/models/OutboxEntry';
import type { CardFieldName } from '@/database/writers';

import { OUTBOX_QUEUED, protectedFieldsOf } from './enqueue';
import type { Intent } from './types';

export type PendingEntry = { entry: OutboxEntry; intent: Intent };

export type PendingCards = Map<string, { fields: Set<CardFieldName>; entries: PendingEntry[] }>;

function parseIntent(entry: OutboxEntry): Intent | null {
  try {
    return JSON.parse(entry.payloadJson) as Intent;
  } catch {
    console.warn('[outbox] dropping an entry with an unparsable payload', entry.id);
    return null;
  }
}

/**
 * Every card that a queued mutation currently owns, with the columns it owns.
 * The sync consults this before writing, so an optimistic value is never
 * clobbered and the server's competing value is preserved for conflict detection.
 */
export async function loadPendingCards(db: Database, accountId: string): Promise<PendingCards> {
  const rows = await db
    .get<OutboxEntry>('outbox')
    .query(
      Q.where('account_id', accountId),
      Q.where('state', OUTBOX_QUEUED),
      Q.where('entity_type', 'card'),
    )
    .fetch();

  const pending: PendingCards = new Map();

  for (const entry of rows) {
    if (entry.entityType !== 'card') continue;
    const intent = parseIntent(entry);
    if (!intent) continue;

    const bucket = pending.get(entry.entityId) ?? { fields: new Set<CardFieldName>(), entries: [] };
    for (const field of protectedFieldsOf(intent)) bucket.fields.add(field);
    bucket.entries.push({ entry, intent });
    pending.set(entry.entityId, bucket);
  }

  return pending;
}

export function mergeServerValues(
  entry: OutboxEntry,
  values: Record<string, unknown>,
): string {
  let stored: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(entry.serverValuesJson);
    if (parsed && typeof parsed === 'object') stored = parsed as Record<string, unknown>;
  } catch {
    stored = {};
  }
  return JSON.stringify({ ...stored, ...values });
}

export function pendingEntityIds(pending: PendingCards): Set<string> {
  return new Set(pending.keys());
}

/**
 * The queued intents filed against boards or stacks. `loadPendingCards` answers a
 * card-shaped question — which columns a queued mutation owns — because cards are
 * reconciled field by field. Boards and stacks are reconciled whole, so their
 * shield only needs to know which entities have something in flight and what it is.
 */
export async function loadQueuedIntents(
  db: Database,
  accountId: string,
  entityType: 'board' | 'stack',
): Promise<PendingEntry[]> {
  const rows = await db
    .get<OutboxEntry>('outbox')
    .query(
      Q.where('account_id', accountId),
      Q.where('state', OUTBOX_QUEUED),
      Q.where('entity_type', entityType),
    )
    .fetch();

  const queued: PendingEntry[] = [];
  for (const entry of rows) {
    const intent = parseIntent(entry);
    if (!intent) continue;
    queued.push({ entry, intent });
  }
  return queued;
}
