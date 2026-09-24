import type { Intent } from '@/sync/outbox/types';

export type SubjectRef = { table: 'cards' | 'stacks' | 'labels' | 'boards'; id: string };

/** The record an outbox entry is about, so the Sync page can name it by title. */
export function subjectOf(payloadJson: string): SubjectRef | null {
  let intent: Intent;
  try {
    intent = JSON.parse(payloadJson) as Intent;
  } catch {
    return null;
  }
  if (!intent || typeof intent !== 'object') return null;
  if ('cardId' in intent) return { table: 'cards', id: intent.cardId };
  if ('stackId' in intent) return { table: 'stacks', id: intent.stackId };
  if ('labelId' in intent) return { table: 'labels', id: intent.labelId };
  if ('boardId' in intent) return { table: 'boards', id: intent.boardId };
  return null;
}

export function subjectKey(ref: SubjectRef): string {
  return `${ref.table}:${ref.id}`;
}
