import { Q, type Database } from '@nozbe/watermelondb';

import type OutboxEntry from '@/database/models/OutboxEntry';
import { safeWrite } from '@/database/utils/safeTransaction';
import { HttpError } from '@/services/shared/errors';
import { bumpWriteEpoch } from '@/sync/localWrites';
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

function isPermanent(error: unknown): boolean {
  return error instanceof HttpError && [400, 403, 404].includes(error.status);
}

export type DrainParams = {
  db: Database;
  account: Account;
  now?: () => number;
  onConflict?: (info: { cardId: string; fields: string[] }) => void;
};

export async function nextRetryAt(db: Database, accountId: string, now: number): Promise<number | null> {
  const rows = await db
    .get<OutboxEntry>('outbox')
    .query(Q.where('account_id', accountId), Q.where('state', OUTBOX_QUEUED))
    .fetch();
  const later = rows.map((r) => r.nextAttemptAt).filter((at) => at > now);
  return later.length > 0 ? Math.min(...later) : null;
}

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

async function drainOnce({ db, account, now, onConflict }: DrainParams): Promise<boolean> {
  const clock = now ?? (() => Date.now());
  const collection = db.get<OutboxEntry>('outbox');

  const rows = await collection
    .query(Q.where('account_id', account.id), Q.where('state', OUTBOX_QUEUED))
    .fetch();
  if (rows.length === 0) return false;

  const ordered = [...rows].sort((a, b) => a.createdAt - b.createdAt);
  const byId = new Map(ordered.map((row) => [row.id, row]));

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
      await executeIntent(
        { db, account },
        resolved.intent,
        Object.fromEntries(resolved.conflictedFields.map((f) => [f, serverValues[f]])),
      );
      await safeWrite(db, () => row.destroyPermanently(), 10000, 'outbox:sent');
      bumpWriteEpoch();
    } catch (error) {
      const attempts = row.attempts + 1;
      const permanent = isPermanent(error) || attempts >= MAX_ATTEMPTS;
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
      if (!permanent) return true;
    }
  }
  return false;
}
