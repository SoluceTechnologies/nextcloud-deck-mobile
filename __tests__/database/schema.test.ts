// __tests__/database/schema.test.ts
import { deckSchema } from '../../src/database/schema';

function table(name: string) {
  const t = deckSchema.tables[name];
  if (!t) throw new Error(`missing table ${name}`);
  return t;
}

function columnNames(name: string): string[] {
  return Object.keys(table(name).columns).sort();
}

describe('deckSchema', () => {
  it('declares every table the sync engine writes', () => {
    expect(Object.keys(deckSchema.tables).sort()).toEqual([
      'attachments',
      'boards',
      'card_assignees',
      'card_labels',
      'cards',
      'comments',
      'labels',
      'outbox',
      'recent_boards',
      'stacks',
    ]);
  });

  it('indexes account_id on every synced table', () => {
    for (const name of ['boards', 'stacks', 'cards', 'labels', 'card_labels', 'card_assignees', 'comments', 'attachments', 'outbox', 'recent_boards']) {
      expect(table(name).columns.account_id.isIndexed).toBe(true);
    }
  });

  it('gives every synced table a remote_id and indexes it', () => {
    for (const name of ['boards', 'stacks', 'cards', 'labels', 'comments', 'attachments']) {
      expect(table(name).columns.remote_id.isIndexed).toBe(true);
    }
  });

  it('carries every card column the spec lists', () => {
    expect(columnNames('cards')).toEqual([
      'account_id',
      'archived',
      'attachment_count',
      'board_id',
      'color',
      'comments_count',
      'created_at',
      'dependent_cards_json',
      'description',
      'done_at',
      'duedate',
      'last_modified',
      'order',
      'owner',
      'pending',
      'remote_id',
      'stack_id',
      'startdate',
      'title',
      'type',
    ]);
  });

  it('indexes the columns the board view queries by', () => {
    expect(table('cards').columns.board_id.isIndexed).toBe(true);
    expect(table('cards').columns.stack_id.isIndexed).toBe(true);
    expect(table('cards').columns.duedate.isIndexed).toBe(true);
  });

  it('starts at version 1', () => {
    expect(deckSchema.version).toBe(1);
  });
});
