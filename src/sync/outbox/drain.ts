import { Q, type Database } from '@nozbe/watermelondb';

import type OutboxEntry from '@/database/models/OutboxEntry';
import { safeWrite } from '@/database/utils/safeTransaction';
import { HttpError } from '@/services/shared/errors';
import type { Account } from '@/types';

import { coalesceIntents, type CoalesceEntry } from './coalesce';
import { resolveConflict } from './conflict';
import { OUTBOX_FAILED, OUTBOX_QUEUED } from './enqueue';
import { executeIntent } from './handlers';
import type { Intent } from './types';

export const MAX_ATTEMPTS = 10;

const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 300_000;

export function backoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** attempts, MAX_BACKOFF_MS);
}

/** 400, 403 and 404 will not become true by waiting. */
function isPermanent(error: unknown): boolean {
  return error instanceof HttpError && [400, 403, 404].includes(error.status);
}

export type DrainParams = {
  db: Database;
  account: Account;
  now?: () => number;
  onConflict?: (info: { cardId: string; fields: string[] }) => void;
};

// The scheduler tick and a reconnect can genuinely overlap - a drain is slow
// and asynchronous - so a second call for an account already draining shares
// the in-flight pass instead of reading the queue again and sending every
// row twice. `finally` clears the guard on both success and failure so a
// rejected drain never wedges the account's queue.
const inFlight = new Map<string, Promise<void>>();

export function drainOutbox(params: DrainParams): Promise<void> {
  const existing = inFlight.get(params.account.id);
  if (existing) return existing;

  const run = drainOnce(params).finally(() => inFlight.delete(params.account.id));
  inFlight.set(params.account.id, run);
  return run;
}

async function drainOnce({ db, account, now, onConflict }: DrainParams): Promise<void> {
  const clock = now ?? (() => Date.now());
  const collection = db.get<OutboxEntry>('outbox');

  const rows = await collection
    .query(Q.where('account_id', account.id), Q.where('state', OUTBOX_QUEUED))
    .fetch();
  if (rows.length === 0) return;

  const ordered = [...rows].sort((a, b) => a.createdAt - b.createdAt);
  const byId = new Map(ordered.map((row) => [row.id, row]));

  // Coalesce per entity, then walk the survivors in global FIFO order so a
  // create always flushes before the edits that depend on its remote id.
  const groups = new Map<string, CoalesceEntry[]>();
  for (const row of ordered) {
    let intent: Intent;
    try {
      intent = JSON.parse(row.payloadJson) as Intent;
    } catch {
      await safeWrite(db, () => row.destroyPermanently(), 10000, 'outbox:dropUnparsable');
      continue;
    }
    const group = groups.get(row.entityId) ?? [];
    group.push({ id: row.id, intent });
    groups.set(row.entityId, group);
  }

  const sendable = new Map<string, Intent>();
  for (const group of groups.values()) {
    const { send, drop } = coalesceIntents(group);
    for (const id of drop) {
      const row = byId.get(id);
      if (row) await safeWrite(db, () => row.destroyPermanently(), 10000, 'outbox:coalesce');
    }
    for (const entry of send) sendable.set(entry.id, entry.intent);
  }

  for (const row of ordered) {
    const intent = sendable.get(row.id);
    if (!intent) continue;
    if (row.nextAttemptAt > clock()) continue;

    let serverValues: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(row.serverValuesJson);
      if (parsed && typeof parsed === 'object') serverValues = parsed as Record<string, unknown>;
    } catch {
      serverValues = {};
    }

    const resolved = resolveConflict(intent, serverValues);
    if (resolved.conflictedFields.length > 0 && intent.kind === 'patchCard') {
      onConflict?.({ cardId: intent.cardId, fields: resolved.conflictedFields });
    }
    if (resolved.intent === null) {
      await safeWrite(db, () => row.destroyPermanently(), 10000, 'outbox:conflictDrop');
      continue;
    }

    try {
      // A dropped field keeps its shielded optimistic value on the card row, so
      // the handler is given the server's value for it: `patchCard` replaces the
      // whole card, and without this the field the conflict check just protected
      // would be overwritten by the very request that reported it as protected.
      await executeIntent(
        { db, account },
        resolved.intent,
        Object.fromEntries(resolved.conflictedFields.map((f) => [f, serverValues[f]])),
      );
      await safeWrite(db, () => row.destroyPermanently(), 10000, 'outbox:sent');
    } catch (error) {
      // A DeferredIntentError means the prerequisite create has not landed yet.
      // It is counted and backed off like any other transient failure, for two
      // reasons: the pass still ends here, so a deferred intent is never
      // reordered past the create it waits on; and a prerequisite that fails
      // permanently no longer wedges the account's queue invisibly — the
      // dependent reaches MAX_ATTEMPTS, becomes FAILED, and finally shows up in
      // SyncStatus where it can be retried or discarded. `isPermanent` only ever
      // fires on an HttpError, so a deferral can only fail on the attempt count.
      const attempts = row.attempts + 1;
      const permanent = isPermanent(error) || attempts >= MAX_ATTEMPTS;
      // Backoff counts from the attempts *before* this failure (0 on the first
      // one), so it must be read here — row.update's writer receives this same
      // live record, and mutating r.attempts below would mutate row.attempts too.
      const nextAttemptAt = permanent ? 0 : clock() + backoffMs(row.attempts);

      await safeWrite(
        db,
        () =>
          row.update((r: OutboxEntry) => {
            r.attempts = attempts;
            r.lastError = String(error);
            r.state = permanent ? OUTBOX_FAILED : OUTBOX_QUEUED;
            r.nextAttemptAt = nextAttemptAt;
          }),
        10000,
        'outbox:failure',
      );

      // A transient failure almost always means the network is gone; there is
      // nothing to gain from hammering the rest of the queue.
      if (!permanent) return;
    }
  }
}
