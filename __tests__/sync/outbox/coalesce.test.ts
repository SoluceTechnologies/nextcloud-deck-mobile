import { coalesceIntents } from '../../../src/sync/outbox/coalesce';
import type { Intent } from '../../../src/sync/outbox/types';

const e = (id: string, intent: Intent) => ({ id, intent });

describe('coalesceIntents', () => {
  it('leaves a single intent alone', () => {
    const entries = [e('1', { kind: 'setCardArchived', cardId: 'c1', archived: true })];
    expect(coalesceIntents(entries)).toEqual({ send: entries, drop: [] });
  });

  it('merges consecutive patches, keeping the earliest base per field', () => {
    const result = coalesceIntents([
      e('1', { kind: 'patchCard', cardId: 'c1', fields: ['title'], base: { title: 'a' } }),
      e('2', { kind: 'patchCard', cardId: 'c1', fields: ['title'], base: { title: 'b' } }),
      e('3', { kind: 'patchCard', cardId: 'c1', fields: ['duedate'], base: { duedate: null } }),
    ]);

    expect(result.drop).toEqual(['1', '2']);
    expect(result.send).toEqual([
      e('3', {
        kind: 'patchCard',
        cardId: 'c1',
        fields: ['title', 'duedate'],
        base: { title: 'a', duedate: null },
      }),
    ]);
  });

  it('keeps only the last archive toggle', () => {
    const result = coalesceIntents([
      e('1', { kind: 'setCardArchived', cardId: 'c1', archived: true }),
      e('2', { kind: 'setCardArchived', cardId: 'c1', archived: false }),
    ]);
    expect(result.drop).toEqual(['1']);
    expect(result.send.map((s) => s.id)).toEqual(['2']);
  });

  it('keeps only the last move', () => {
    const result = coalesceIntents([
      e('1', { kind: 'moveCard', cardId: 'c1', toStackId: 's2', order: 1 }),
      e('2', { kind: 'moveCard', cardId: 'c1', toStackId: 's3', order: 0 }),
    ]);
    expect(result.send.map((s) => s.id)).toEqual(['2']);
  });

  it('collapses an assign then remove of the same label to the removal', () => {
    const result = coalesceIntents([
      e('1', { kind: 'assignLabel', cardId: 'c1', labelId: 'l1' }),
      e('2', { kind: 'removeLabel', cardId: 'c1', labelId: 'l1' }),
    ]);
    expect(result.drop).toEqual(['1']);
    expect(result.send.map((s) => s.id)).toEqual(['2']);
  });

  it('keeps label operations on different labels', () => {
    const entries = [
      e('1', { kind: 'assignLabel', cardId: 'c1', labelId: 'l1' }),
      e('2', { kind: 'assignLabel', cardId: 'c1', labelId: 'l2' }),
    ];
    expect(coalesceIntents(entries).send.map((s) => s.id)).toEqual(['1', '2']);
  });

  it('keeps only the last assignment of the same participant and type', () => {
    const result = coalesceIntents([
      e('1', { kind: 'assignUser', cardId: 'c1', participant: 'jane', assigneeType: 0 }),
      e('2', { kind: 'unassignUser', cardId: 'c1', participant: 'jane', assigneeType: 0 }),
    ]);
    expect(result.send.map((s) => s.id)).toEqual(['2']);
  });

  it('treats the same name with a different participant type as a different target', () => {
    const entries = [
      e('1', { kind: 'assignUser', cardId: 'c1', participant: 'jane', assigneeType: 0 }),
      e('2', { kind: 'assignUser', cardId: 'c1', participant: 'jane', assigneeType: 1 }),
    ];
    expect(coalesceIntents(entries).send).toHaveLength(2);
  });

  it('drops everything queued before a delete', () => {
    const ref = { boardRemoteId: '7', stackRemoteId: '5', cardRemoteId: '42' };
    const result = coalesceIntents([
      e('1', { kind: 'patchCard', cardId: 'c1', fields: ['title'], base: {} }),
      e('2', { kind: 'assignLabel', cardId: 'c1', labelId: 'l1' }),
      e('3', { kind: 'deleteCard', cardId: 'c1', ref }),
    ]);
    expect(result.drop).toEqual(['1', '2']);
    expect(result.send.map((s) => s.id)).toEqual(['3']);
  });

  it('cancels a create followed by a delete, sending nothing at all', () => {
    const ref = { boardRemoteId: '7', stackRemoteId: '5', cardRemoteId: '' };
    const result = coalesceIntents([
      e('1', { kind: 'createCard', cardId: 'c1' }),
      e('2', { kind: 'patchCard', cardId: 'c1', fields: ['title'], base: {} }),
      e('3', { kind: 'deleteCard', cardId: 'c1', ref }),
    ]);
    expect(result.send).toEqual([]);
    expect(result.drop).toEqual(['1', '2', '3']);
  });

  it('cancels a board create followed by a delete, sending nothing at all', () => {
    const result = coalesceIntents([
      e('1', { kind: 'createBoard', boardId: 'b1' }),
      e('2', { kind: 'updateBoard', boardId: 'b1', title: 'Ops', color: null, archived: false }),
      e('3', { kind: 'deleteBoard', boardId: 'b1', boardRemoteId: '' }),
    ]);
    expect(result.send).toEqual([]);
    expect(result.drop).toEqual(['1', '2', '3']);
  });

  it('sends only the delete when a stack update precedes it without a create', () => {
    const result = coalesceIntents([
      e('1', { kind: 'updateStack', stackId: 's1', title: 'Doing', order: 1 }),
      e('2', { kind: 'deleteStack', stackId: 's1', boardRemoteId: '7', stackRemoteId: '5' }),
    ]);
    expect(result.drop).toEqual(['1']);
    expect(result.send.map((s) => s.id)).toEqual(['2']);
  });

  it('preserves the relative order of the intents it keeps', () => {
    const entries = [
      e('1', { kind: 'createCard', cardId: 'c1' }),
      e('2', { kind: 'assignLabel', cardId: 'c1', labelId: 'l1' }),
      e('3', { kind: 'patchCard', cardId: 'c1', fields: ['title'], base: {} }),
    ];
    expect(coalesceIntents(entries).send.map((s) => s.id)).toEqual(['1', '2', '3']);
  });
});
