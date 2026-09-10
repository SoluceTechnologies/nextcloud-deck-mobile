import type { CardFieldName } from '@/database/writers';

import type { Intent } from './types';

export type ConflictResolution = {
  /** The intent to send, or `null` when nothing survives. */
  intent: Intent | null;
  conflictedFields: CardFieldName[];
};

/**
 * `patchCard` is the only intent that replaces the whole card server-side, so it
 * is the only one that can silently overwrite someone else's edit. Every other
 * intent hits an endpoint scoped to its own field and is always safe to send.
 */
export function resolveConflict(
  intent: Intent,
  serverValues: Record<string, unknown>,
): ConflictResolution {
  if (intent.kind !== 'patchCard') return { intent, conflictedFields: [] };

  const conflicted: CardFieldName[] = [];
  const kept: CardFieldName[] = [];

  for (const field of intent.fields) {
    if (!(field in serverValues)) {
      kept.push(field);
      continue;
    }
    const server = serverValues[field] ?? null;
    const base = intent.base[field] ?? null;
    if (server === base) kept.push(field);
    else conflicted.push(field);
  }

  if (kept.length === 0) return { intent: null, conflictedFields: conflicted };

  return {
    intent: { ...intent, fields: kept },
    conflictedFields: conflicted,
  };
}
