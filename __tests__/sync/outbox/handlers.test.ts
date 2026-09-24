import { executeIntent, DeferredIntentError } from '../../../src/sync/outbox/handlers';
import * as boardsApi from '../../../src/services/deck/boards';
import * as cardsApi from '../../../src/services/deck/cards';
import * as commentsApi from '../../../src/services/deck/comments';
import type { Account } from '../../../src/types';

jest.mock('../../../src/services/deck/cards');
jest.mock('../../../src/services/deck/boards');
jest.mock('../../../src/services/deck/comments');
jest.mock('../../../src/database/utils/safeTransaction', () => ({
  safeWrite: (_db: unknown, fn: () => Promise<unknown>) => fn(),
}));

const account: Account = {
  id: 'acc-1',
  displayName: 'Work',
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'x',
  davUserId: 'john',
};

// Mirrors WatermelonDB's real `record.update(writer)`: the writer receives
// the record itself and mutates it in place, so callers observe the change
// on the same object reference (not a snapshot taken when it was built).
function row(over: Record<string, unknown>) {
  const record: any = { ...over };
  record.update = jest.fn(async (writer: (r: any) => void) => writer(record));
  return record;
}

function makeDb(byId: Record<string, any>) {
  return {
    get: jest.fn(() => ({
      find: jest.fn(async (id: string) => {
        const found = byId[id];
        if (!found) throw new Error(`not found: ${id}`);
        return found;
      }),
    })),
    write: jest.fn(async (fn: any) => fn()),
  } as any;
}

const stackRow = row({ id: 's-local', remoteId: '5', boardId: 'b-local' });
const boardRow = row({ id: 'b-local', remoteId: '7' });

function cardRow(over: Record<string, unknown> = {}) {
  return row({
    id: 'c-local',
    remoteId: '42',
    boardId: 'b-local',
    stackId: 's-local',
    title: 'Pay the rent',
    description: 'body',
    type: 'plain',
    owner: 'john',
    order: 2,
    color: '#ff0000',
    archived: false,
    doneAt: undefined,
    duedate: 1000,
    startdate: undefined,
    pending: false,
    ...over,
  });
}

beforeEach(() => jest.clearAllMocks());

describe('executeIntent', () => {
  it('creates a card and writes the server id back onto the local row', async () => {
    const card = cardRow({ remoteId: '', pending: true });
    const db = makeDb({ 'c-local': card, 's-local': stackRow, 'b-local': boardRow });
    (cardsApi.createCard as jest.Mock).mockResolvedValue({ remoteId: '99', lastModified: 7000 });

    await executeIntent({ db, account }, { kind: 'createCard', cardId: 'c-local' });

    expect(cardsApi.createCard).toHaveBeenCalledWith(
      account,
      { boardRemoteId: '7', stackRemoteId: '5' },
      { title: 'Pay the rent', description: 'body', order: 2, duedate: 1000, startdate: null },
    );
    expect(card.update).toHaveBeenCalled();
    expect(card.remoteId).toBe('99');
    expect(card.pending).toBe(false);
    expect(card.lastModified).toBe(7000);
  });

  it('sends the whole card state on a patch, read from the row at send time', async () => {
    const card = cardRow({ title: 'edited just now' });
    const db = makeDb({ 'c-local': card, 's-local': stackRow, 'b-local': boardRow });
    (cardsApi.updateCard as jest.Mock).mockResolvedValue({ remoteId: '42', lastModified: 8000 });

    await executeIntent(
      { db, account },
      { kind: 'patchCard', cardId: 'c-local', fields: ['title'], base: { title: 'Pay the rent' } },
    );

    expect(cardsApi.updateCard).toHaveBeenCalledWith(
      account,
      { boardRemoteId: '7', stackRemoteId: '5', cardRemoteId: '42' },
      {
        title: 'edited just now',
        description: 'body',
        type: 'plain',
        owner: 'john',
        order: 2,
        duedate: 1000,
        startdate: null,
        doneAt: null,
        color: '#ff0000',
        archived: false,
      },
    );
  });

  // `PUT /cards/{id}` replaces the card, so the body always carries every
  // column — but a field the conflict check dropped still holds the shielded
  // optimistic value on the local row, and sending it would overwrite the very
  // edit the user was just told had been protected.
  it('puts the server value back for a field the conflict check dropped', async () => {
    const card = cardRow({ title: 'my offline title', description: 'my offline body' });
    const db = makeDb({ 'c-local': card, 's-local': stackRow, 'b-local': boardRow });

    await executeIntent(
      { db, account },
      { kind: 'patchCard', cardId: 'c-local', fields: ['description'], base: { title: 'Pay the rent' } },
      { title: 'their title' },
    );

    expect((cardsApi.updateCard as jest.Mock).mock.calls[0][2]).toEqual({
      title: 'their title',
      description: 'my offline body',
      type: 'plain',
      owner: 'john',
      order: 2,
      duedate: 1000,
      startdate: null,
      doneAt: null,
      color: '#ff0000',
      archived: false,
    });
  });

  it('restores a server value of null or false instead of reading it as absent', async () => {
    const card = cardRow({ duedate: 5000, archived: true });
    const db = makeDb({ 'c-local': card, 's-local': stackRow, 'b-local': boardRow });

    await executeIntent(
      { db, account },
      { kind: 'patchCard', cardId: 'c-local', fields: ['title'], base: {} },
      { duedate: null, archived: false },
    );

    expect((cardsApi.updateCard as jest.Mock).mock.calls[0][2]).toMatchObject({
      duedate: null,
      archived: false,
    });
  });

  it('defers when the card has no remote id yet', async () => {
    const card = cardRow({ remoteId: '', pending: true });
    const db = makeDb({ 'c-local': card, 's-local': stackRow, 'b-local': boardRow });

    await expect(
      executeIntent({ db, account }, { kind: 'setCardArchived', cardId: 'c-local', archived: true }),
    ).rejects.toBeInstanceOf(DeferredIntentError);
  });

  it('moves a card to the remote id of its destination stack', async () => {
    const target = row({ id: 's2-local', remoteId: '6', boardId: 'b-local' });
    const db = makeDb({
      'c-local': cardRow(),
      's-local': stackRow,
      's2-local': target,
      'b-local': boardRow,
    });

    await executeIntent(
      { db, account },
      { kind: 'moveCard', cardId: 'c-local', toStackId: 's2-local', order: 3 },
    );

    expect(cardsApi.reorderCard).toHaveBeenCalledWith(
      account,
      { boardRemoteId: '7', stackRemoteId: '5', cardRemoteId: '42' },
      { order: 3, toStackRemoteId: '6' },
    );
  });

  it('archives through the dedicated endpoint', async () => {
    const db = makeDb({ 'c-local': cardRow(), 's-local': stackRow, 'b-local': boardRow });

    await executeIntent({ db, account }, { kind: 'setCardArchived', cardId: 'c-local', archived: true });

    expect(cardsApi.setCardArchived).toHaveBeenCalledWith(
      account,
      { boardRemoteId: '7', stackRemoteId: '5', cardRemoteId: '42' },
      true,
    );
  });

  it('deletes using the reference carried in the payload, since the row is gone', async () => {
    const db = makeDb({});
    const ref = { boardRemoteId: '7', stackRemoteId: '5', cardRemoteId: '42' };

    await executeIntent({ db, account }, { kind: 'deleteCard', cardId: 'c-local', ref });

    expect(cardsApi.deleteCard).toHaveBeenCalledWith(account, ref);
  });

  it('assigns a label using the label row remote id', async () => {
    const labelRow = row({ id: 'l-local', remoteId: '3' });
    const db = makeDb({
      'c-local': cardRow(),
      's-local': stackRow,
      'b-local': boardRow,
      'l-local': labelRow,
    });

    await executeIntent({ db, account }, { kind: 'assignLabel', cardId: 'c-local', labelId: 'l-local' });

    expect(cardsApi.assignLabelToCard).toHaveBeenCalledWith(
      account,
      { boardRemoteId: '7', stackRemoteId: '5', cardRemoteId: '42' },
      '3',
    );
  });

  it('assigns a user with its participant type', async () => {
    const db = makeDb({ 'c-local': cardRow(), 's-local': stackRow, 'b-local': boardRow });

    await executeIntent(
      { db, account },
      { kind: 'assignUser', cardId: 'c-local', participant: 'jane', assigneeType: 0 },
    );

    expect(cardsApi.assignUserToCard).toHaveBeenCalledWith(
      account,
      { boardRemoteId: '7', stackRemoteId: '5', cardRemoteId: '42' },
      { participant: 'jane', assigneeType: 0 },
    );
  });

  // removeLabel and unassignUser are close mirrors of the two tests above:
  // same lookups, same payload shape, differing only in which cardsApi
  // function is called (removeLabelFromCard / unassignUserFromCard). Not
  // re-tested here for that reason.

  it('clones a card by its remote id, without a local lookup', async () => {
    const db = makeDb({});

    await executeIntent({ db, account }, { kind: 'cloneCard', cardId: 'c-local', cardRemoteId: '42' });

    expect(cardsApi.cloneCard).toHaveBeenCalledWith(account, '42');
  });

  it('gives the copy the dates and color Deck does not clone, and stores its labels', async () => {
    const { normalizeCard } = jest.requireActual('../../../src/services/deck/normalize');
    (cardsApi.cloneCard as jest.Mock).mockResolvedValue(
      normalizeCard({ id: 99, stackId: 5, title: 'Pay the rent', labels: [{ id: 3, title: 'Urgent' }] }, '7'),
    );
    (cardsApi.updateCard as jest.Mock).mockResolvedValue(normalizeCard({ id: 99, lastModified: 500 }, '7'));
    const byId: Record<string, any> = {
      's-local': stackRow,
      'b-local': boardRow,
      'c-local': cardRow({ duedate: 86400000, color: '#ff0000' }),
    };
    const created: any = { id: 'copy-local' };
    const joins: any[] = [];
    const tables: Record<string, any> = {
      cards: {
        find: jest.fn(async (id: string) => byId[id]),
        query: jest.fn(() => ({ fetch: jest.fn(async () => []) })),
        prepareCreate: jest.fn((writer: (r: any) => void) => {
          writer(created);
          return created;
        }),
      },
      labels: { query: jest.fn(() => ({ fetch: jest.fn(async () => [{ id: 'l-local', remoteId: '3' }]) })) },
      card_labels: {
        prepareCreate: jest.fn((writer: (r: any) => void) => {
          const join: any = {};
          writer(join);
          joins.push(join);
          return join;
        }),
      },
      card_assignees: { prepareCreate: jest.fn() },
    };
    const db: any = {
      get: jest.fn((table: string) => tables[table] ?? { find: jest.fn(async (id: string) => byId[id]) }),
      batch: jest.fn(async () => {}),
    };

    await executeIntent(
      { db, account },
      { kind: 'cloneCard', cardId: 'c-local', cardRemoteId: '42', toStackId: 's-local' },
    );

    expect(cardsApi.updateCard).toHaveBeenCalledWith(
      account,
      { boardRemoteId: '7', stackRemoteId: '5', cardRemoteId: '99' },
      expect.objectContaining({ duedate: 86400000, color: '#ff0000' }),
    );
    expect(created).toMatchObject({ remoteId: '99', duedate: 86400000, color: '#ff0000' });
    expect(joins).toEqual([expect.objectContaining({ cardId: 'copy-local', labelId: 'l-local' })]);
  });

  it('adds a dependency between two cards by their remote ids', async () => {
    const db = makeDb({ 'c-local': cardRow(), 's-local': stackRow, 'b-local': boardRow });

    await executeIntent(
      { db, account },
      { kind: 'addDependency', cardId: 'c-local', dependentCardRemoteId: '55' },
    );

    expect(cardsApi.addDependentCard).toHaveBeenCalledWith(account, '42', '55');
  });

  // removeDependency mirrors addDependency above, differing only in which
  // cardsApi function is called (removeDependentCard). Not re-tested here.

  it('creates a label and writes the server id back onto the local row', async () => {
    const label = row({ id: 'l-local', remoteId: '', title: 'Urgent', color: '#00ff00' });
    const db = makeDb({ 'l-local': label, 'b-local': boardRow });
    (cardsApi.createLabel as jest.Mock).mockResolvedValue({ remoteId: '9', title: 'Urgent', color: '#00ff00' });

    await executeIntent({ db, account }, { kind: 'createLabel', labelId: 'l-local', boardId: 'b-local' });

    expect(cardsApi.createLabel).toHaveBeenCalledWith(account, '7', { title: 'Urgent', color: '#00ff00' });
    expect(label.update).toHaveBeenCalled();
    expect(label.remoteId).toBe('9');
  });

  it('creates a stack and writes the server id back onto the local row', async () => {
    const stack = row({ id: 's-new', remoteId: '', boardId: 'b-local', title: 'Doing', order: 1 });
    const db = makeDb({ 's-new': stack, 'b-local': boardRow });
    (boardsApi.createStack as jest.Mock).mockResolvedValue({ remoteId: '11', lastModified: 9000 });

    await executeIntent({ db, account }, { kind: 'createStack', stackId: 's-new' });

    expect(boardsApi.createStack).toHaveBeenCalledWith(account, '7', { title: 'Doing', order: 1 });
    expect(stack.update).toHaveBeenCalled();
    expect(stack.remoteId).toBe('11');
    expect(stack.lastModified).toBe(9000);
  });

  it('updates a stack title and order', async () => {
    const db = makeDb({ 's-local': stackRow, 'b-local': boardRow });

    await executeIntent(
      { db, account },
      { kind: 'updateStack', stackId: 's-local', title: 'Doing', order: 4 },
    );

    expect(boardsApi.updateStack).toHaveBeenCalledWith(account, '7', '5', { title: 'Doing', order: 4 });
  });

  it('deletes a stack using the remote ids carried in the payload', async () => {
    const db = makeDb({});

    await executeIntent(
      { db, account },
      { kind: 'deleteStack', stackId: 's-local', boardRemoteId: '7', stackRemoteId: '5' },
    );

    expect(boardsApi.deleteStack).toHaveBeenCalledWith(account, '7', '5');
  });

  it('creates a board and writes the server id back onto the local row', async () => {
    const board = row({ id: 'b-new', remoteId: '', title: 'Personal', color: '#0082c9' });
    const db = makeDb({ 'b-new': board });
    (boardsApi.createBoard as jest.Mock).mockResolvedValue({ remoteId: '21', lastModified: 6000 });

    await executeIntent({ db, account }, { kind: 'createBoard', boardId: 'b-new' });

    expect(boardsApi.createBoard).toHaveBeenCalledWith(account, { title: 'Personal', color: '#0082c9' });
    expect(board.update).toHaveBeenCalled();
    expect(board.remoteId).toBe('21');
    expect(board.lastModified).toBe(6000);
  });

  it('updates a board title, color, and archived flag', async () => {
    const db = makeDb({ 'b-local': boardRow });

    await executeIntent(
      { db, account },
      { kind: 'updateBoard', boardId: 'b-local', title: 'Ops', color: '#ffffff', archived: true },
    );

    expect(boardsApi.updateBoard).toHaveBeenCalledWith(account, '7', {
      title: 'Ops',
      color: '#ffffff',
      archived: true,
    });
  });

  it('deletes a board using the remote id carried in the payload', async () => {
    const db = makeDb({});

    await executeIntent(
      { db, account },
      { kind: 'deleteBoard', boardId: 'b-local', boardRemoteId: '7' },
    );

    expect(boardsApi.deleteBoard).toHaveBeenCalledWith(account, '7');
  });

  it('posts a comment and writes the server id back onto the local row', async () => {
    const comment = row({ id: 'cm-local', remoteId: '' });
    const db = makeDb({
      'cm-local': comment,
      'c-local': cardRow(),
      's-local': stackRow,
      'b-local': boardRow,
    });
    (commentsApi.postComment as jest.Mock).mockResolvedValue({ remoteId: '55', message: 'hi' });

    await executeIntent(
      { db, account },
      { kind: 'createComment', commentId: 'cm-local', cardId: 'c-local', message: 'hi' },
    );

    expect(commentsApi.postComment).toHaveBeenCalledWith(account, '42', 'hi', null);
    expect(comment.update).toHaveBeenCalled();
    expect(comment.remoteId).toBe('55');
  });

  // A locally written comment carries no actor, which the card screen reads
  // as "mine, still pending". Ending that pending state without filling the
  // author in would leave it rendering as an anonymous "?" until some later
  // syncCardDetail pass happened to refetch the thread.
  it('writes the author and the server timestamp back alongside the id', async () => {
    const comment = row({
      id: 'cm-local',
      remoteId: '',
      actorId: '',
      actorDisplayName: '',
      createdAt: 1000,
    });
    const db = makeDb({
      'cm-local': comment,
      'c-local': cardRow(),
      's-local': stackRow,
      'b-local': boardRow,
    });
    (commentsApi.postComment as jest.Mock).mockResolvedValue({
      remoteId: '55',
      message: 'hi',
      actorId: 'charles',
      actorDisplayName: 'Charles Gauthereau',
      createdAt: 9000,
    });

    await executeIntent(
      { db, account },
      { kind: 'createComment', commentId: 'cm-local', cardId: 'c-local', message: 'hi' },
    );

    expect(comment.actorId).toBe('charles');
    expect(comment.actorDisplayName).toBe('Charles Gauthereau');
    expect(comment.createdAt).toBe(9000);
  });

  it('posts a reply with its parent id', async () => {
    const db = makeDb({
      'cm-local': row({ id: 'cm-local', remoteId: '' }),
      'c-local': cardRow(),
      's-local': stackRow,
      'b-local': boardRow,
    });
    (commentsApi.postComment as jest.Mock).mockResolvedValue({ remoteId: '56', message: 'hi' });

    await executeIntent(
      { db, account },
      {
        kind: 'createComment',
        commentId: 'cm-local',
        cardId: 'c-local',
        message: 'hi',
        parentRemoteId: '55',
      },
    );

    expect(commentsApi.postComment).toHaveBeenCalledWith(account, '42', 'hi', '55');
  });

  it('sends an edit against the comment\'s own remote id', async () => {
    const db = makeDb({
      'cm-local': row({ id: 'cm-local', remoteId: '55' }),
      'c-local': cardRow(),
      's-local': stackRow,
      'b-local': boardRow,
    });

    await executeIntent(
      { db, account },
      { kind: 'updateComment', commentId: 'cm-local', cardId: 'c-local', message: 'amended' },
    );

    expect(commentsApi.updateComment).toHaveBeenCalledWith(account, '42', '55', 'amended');
  });

  // Only reachable when the create failed — coalesceIntents folds an edit of a
  // still-queued comment into that create.
  it('defers an edit of a comment that has no remote id yet', async () => {
    const db = makeDb({
      'cm-local': row({ id: 'cm-local', remoteId: '' }),
      'c-local': cardRow(),
      's-local': stackRow,
      'b-local': boardRow,
    });

    await expect(
      executeIntent(
        { db, account },
        { kind: 'updateComment', commentId: 'cm-local', cardId: 'c-local', message: 'amended' },
      ),
    ).rejects.toThrow(DeferredIntentError);
    expect(commentsApi.updateComment).not.toHaveBeenCalled();
  });

  // The row is destroyed on enqueue, so the remote id has to come off the payload.
  it('deletes a comment by the remote id carried in the intent', async () => {
    const db = makeDb({ 'c-local': cardRow(), 's-local': stackRow, 'b-local': boardRow });

    await executeIntent(
      { db, account },
      { kind: 'deleteComment', commentId: 'cm-local', cardId: 'c-local', commentRemoteId: '55' },
    );

    expect(commentsApi.deleteComment).toHaveBeenCalledWith(account, '42', '55');
  });

  // R45: a response with no usable id must count as a failed attempt, not a
  // silent write-back of the string "undefined".
  it('fails a comment creation whose response carries no id', async () => {
    const db = makeDb({
      'cm-local': row({ id: 'cm-local', remoteId: '' }),
      'c-local': cardRow(),
      's-local': stackRow,
      'b-local': boardRow,
    });
    (commentsApi.postComment as jest.Mock).mockResolvedValue({ remoteId: '', message: 'hi' });

    await expect(
      executeIntent(
        { db, account },
        { kind: 'createComment', commentId: 'cm-local', cardId: 'c-local', message: 'hi' },
      ),
    ).rejects.toThrow('createComment: no id in the response');
  });
});
