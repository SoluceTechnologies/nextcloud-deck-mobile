import { subjectOf } from '@/features/settings/syncLabels';

it('points each outbox payload at the record it is about', () => {
  expect(subjectOf(JSON.stringify({ kind: 'createComment', commentId: 'c1', cardId: 'k1' })))
    .toEqual({ table: 'cards', id: 'k1' });
  expect(subjectOf(JSON.stringify({ kind: 'updateStack', stackId: 's1' }))).toEqual({ table: 'stacks', id: 's1' });
  expect(subjectOf(JSON.stringify({ kind: 'createLabel', labelId: 'l1', boardId: 'b1' })))
    .toEqual({ table: 'labels', id: 'l1' });
  expect(subjectOf(JSON.stringify({ kind: 'deleteBoard', boardId: 'b1' }))).toEqual({ table: 'boards', id: 'b1' });
  expect(subjectOf('not json')).toBeNull();
});
