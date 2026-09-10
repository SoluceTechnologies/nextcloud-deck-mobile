import { executeIntent, DeferredIntentError } from '../../../src/sync/outbox/handlers';
import * as boardsApi from '../../../src/services/deck/boards';
import * as cardsApi from '../../../src/services/deck/cards';
import type { Account } from '../../../src/types';

jest.mock('../../../src/services/deck/cards');
jest.mock('../../../src/services/deck/boards');
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
});
