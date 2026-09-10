import { resolveConflict } from '../../../src/sync/outbox/conflict';
import type { Intent } from '../../../src/sync/outbox/types';

const patch = (fields: string[], base: Record<string, unknown>): Intent => ({
  kind: 'patchCard',
  cardId: 'c1',
  fields: fields as any,
  base,
});

describe('resolveConflict', () => {
  it('passes a patch through when the server has not touched the fields', () => {
    const intent = patch(['title'], { title: 'old' });
    expect(resolveConflict(intent, {})).toEqual({ intent, conflictedFields: [] });
  });

  it('passes a patch through when the server value still equals the base', () => {
    const intent = patch(['title'], { title: 'old' });
    expect(resolveConflict(intent, { title: 'old' })).toEqual({ intent, conflictedFields: [] });
  });

  it('drops only the field the server changed', () => {
    const intent = patch(['title', 'duedate'], { title: 'old', duedate: null });
    const result = resolveConflict(intent, { title: 'someone else edited this' });

    expect(result.conflictedFields).toEqual(['title']);
    expect(result.intent).toEqual(patch(['duedate'], { title: 'old', duedate: null }));
  });

  it('abandons the intent when every field is in conflict', () => {
    const intent = patch(['title'], { title: 'old' });
    const result = resolveConflict(intent, { title: 'theirs' });

    expect(result.intent).toBeNull();
    expect(result.conflictedFields).toEqual(['title']);
  });

  it('compares null and undefined as the same absence', () => {
    const intent = patch(['duedate'], {});
    const result = resolveConflict(intent, { duedate: null });
    expect(result.conflictedFields).toEqual([]);
    expect((result.intent as Extract<Intent, { kind: 'patchCard' }> | null)?.fields).toEqual(['duedate']);
  });

  it('treats absent key as equal to explicit null (mirror case)', () => {
    const intent = patch(['duedate'], { duedate: null });
    const result = resolveConflict(intent, { duedate: undefined });
    expect(result.conflictedFields).toEqual([]);
    expect((result.intent as Extract<Intent, { kind: 'patchCard' }> | null)?.fields).toEqual(['duedate']);
  });

  it('never reports a conflict for a granular intent', () => {
    const intent: Intent = { kind: 'assignLabel', cardId: 'c1', labelId: 'l1' };
    expect(resolveConflict(intent, { title: 'changed' })).toEqual({ intent, conflictedFields: [] });
  });

  it('never reports a conflict for a move, which only touches its own columns', () => {
    const intent: Intent = { kind: 'moveCard', cardId: 'c1', toStackId: 's2', order: 1 };
    expect(resolveConflict(intent, { stackId: '9', order: 4 })).toEqual({
      intent,
      conflictedFields: [],
    });
  });
});
