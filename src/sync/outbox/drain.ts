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

// A local write, a foreground transition and a reconnect can genuinely
// overlap - a drain is slow and asynchronous - so a second call for an account
// already draining shares the in-flight pass instead of reading the queue
// again and sending every row twice. `finally` clears the guard on both
// success and failure so a rejected drain never wedges the account's queue.
//
// The pass reads the queue once, so a write committed while it is in flight
// is invisible to it, and the write's own drain call has just joined that
// pass. Nothing else is scheduled to pick it up: `rerun` remembers the request
// and the pass runs once more when it ends. Not after a transient failure —
// the row was backed off and the reconnect / foreground / next-write triggers
// take over — and never in a loop: a follow-up pass reruns only if a write
// arrived during it in turn.
const inFlight = new Map<string, Promise<void>>();
const rerun = new Set<string>();

export function drainOutbox(params: DrainParams): Promise<void> {
  const id = params.account.id;
  const existing = inFlight.get(id);
  if (existing) {
    rerun.add(id);
    return existing;
  }

  let requested = false;
  const run = drainOnce(params)
    .finally(() => {
      inFlight.delete(id);
      requested = rerun.delete(id);
    })
    .then((backedOff) => {
      if (requested && !backedOff) return drainOutbox(params);
    });
  inFlight.set(id, run);
  return run;
}

/** Resolves `true` when the pass ended early on a transient failure, leaving a backed-off row. */
async function drainOnce({ db, account, now, onConflict }: DrainParams): Promise<boolean> {
  const clock = now ?? (() => Date.now());
  const collection = db.get<OutboxEntry>('outbox');

  const rows = await collection
    .query(Q.where('account_id', account.id), Q.where('state', OUTBOX_QUEUED))
    .fetch();
  if (rows.length === 0) return false;

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
      if (!permanent) return true;
    }
  }
  return false;
}
