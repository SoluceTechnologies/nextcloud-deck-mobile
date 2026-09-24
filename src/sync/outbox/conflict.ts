import type { CardFieldName } from '@/database/writers';

import type { Intent } from './types';

export type ConflictResolution = {
  intent: Intent | null;
  conflictedFields: CardFieldName[];
};

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
