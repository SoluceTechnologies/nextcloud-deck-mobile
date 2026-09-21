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

  it('collapses an add then remove dependency of the same dependent card to the removal', () => {
    const result = coalesceIntents([
      e('1', { kind: 'addDependency', cardId: 'c1', dependentCardRemoteId: 'd1' }),
      e('2', { kind: 'removeDependency', cardId: 'c1', dependentCardRemoteId: 'd1' }),
    ]);
    expect(result.drop).toEqual(['1']);
    expect(result.send.map((s) => s.id)).toEqual(['2']);
  });

  it('keeps dependency operations on different dependent cards', () => {
    const entries = [
      e('1', { kind: 'addDependency', cardId: 'c1', dependentCardRemoteId: 'd1' }),
      e('2', { kind: 'addDependency', cardId: 'c1', dependentCardRemoteId: 'd2' }),
    ];
    expect(coalesceIntents(entries).send.map((s) => s.id)).toEqual(['1', '2']);
  });
});

describe('comments', () => {
  // The create carries the message in its own payload, so posting the text as
  // it stood at enqueue time and then editing it would be two requests for one
  // comment — and a failing edit would leave the server holding a message the
  // local row no longer shows.
  it('folds an edit of a still-queued comment into its create', () => {
    const { send, drop } = coalesceIntents([
      { id: '1', intent: { kind: 'createComment', commentId: 'cm1', cardId: 'c1', message: 'draft' } },
      { id: '2', intent: { kind: 'updateComment', commentId: 'cm1', cardId: 'c1', message: 'final' } },
    ]);

    expect(drop).toEqual(['2']);
    expect(send).toEqual([
      { id: '1', intent: { kind: 'createComment', commentId: 'cm1', cardId: 'c1', message: 'final' } },
    ]);
  });

  it('keeps the parent id when it folds an edit into a reply', () => {
    const { send } = coalesceIntents([
      {
        id: '1',
        intent: { kind: 'createComment', commentId: 'cm1', cardId: 'c1', message: 'draft', parentRemoteId: '9' },
      },
      { id: '2', intent: { kind: 'updateComment', commentId: 'cm1', cardId: 'c1', message: 'final' } },
    ]);

    expect(send[0].intent).toEqual({
      kind: 'createComment',
      commentId: 'cm1',
      cardId: 'c1',
      message: 'final',
      parentRemoteId: '9',
    });
  });

  it('sends only the last of several edits of a synced comment', () => {
    const { send, drop } = coalesceIntents([
      { id: '1', intent: { kind: 'updateComment', commentId: 'cm1', cardId: 'c1', message: 'one' } },
      { id: '2', intent: { kind: 'updateComment', commentId: 'cm1', cardId: 'c1', message: 'two' } },
    ]);

    expect(drop).toEqual(['1']);
    expect(send.map((e) => e.id)).toEqual(['2']);
  });

  // Written and deleted offline: the comment never reached the server, so
  // there is nothing to post and nothing to delete.
  it('drops a comment created and deleted before either reached the server', () => {
    const { send, drop } = coalesceIntents([
      { id: '1', intent: { kind: 'createComment', commentId: 'cm1', cardId: 'c1', message: 'oops' } },
      { id: '2', intent: { kind: 'deleteComment', commentId: 'cm1', cardId: 'c1', commentRemoteId: '' } },
    ]);

    expect(send).toEqual([]);
    expect(drop.sort()).toEqual(['1', '2']);
  });

  it('sends only the delete when the comment was already on the server', () => {
    const { send, drop } = coalesceIntents([
      { id: '1', intent: { kind: 'updateComment', commentId: 'cm1', cardId: 'c1', message: 'never mind' } },
      { id: '2', intent: { kind: 'deleteComment', commentId: 'cm1', cardId: 'c1', commentRemoteId: '55' } },
    ]);

    expect(send.map((e) => e.id)).toEqual(['2']);
    expect(drop).toEqual(['1']);
  });
});
