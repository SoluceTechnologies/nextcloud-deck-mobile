import {
  fetchBoards,
  fetchStacks,
  createBoard,
  updateBoard,
  deleteBoard,
  createStack,
  updateStack,
  deleteStack,
} from '../../../src/services/deck/boards';

const account = {
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'secret',
};

const mockFetch = jest.fn();
(globalThis as any).fetch = mockFetch;

function ok(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  };
}

beforeEach(() => jest.clearAllMocks());

describe('fetchBoards', () => {
  it('requests the board list with details and normalizes the result', async () => {
    mockFetch.mockResolvedValue(
      ok([{ id: 7, title: 'Ops', color: '0082C9', acl: [], permissions: {}, lastModified: 100 }]),
    );

    const boards = await fetchBoards(account);

    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://cloud.example.com/index.php/apps/deck/api/v1.1/boards?details=true',
    );
    expect(boards).toHaveLength(1);
    expect(boards[0].remoteId).toBe('7');
    expect(boards[0].color).toBe('#0082c9');
    expect(boards[0].lastModified).toBe(100000);
  });

  it('sends If-Modified-Since when a since is given', async () => {
    mockFetch.mockResolvedValue(ok([]));
    await fetchBoards(account, Date.UTC(2019, 7, 3, 10, 34, 12));
    expect(mockFetch.mock.calls[0][1].headers['If-Modified-Since']).toBe(
      'Sat, 03 Aug 2019 10:34:12 GMT',
    );
  });

  it('returns an empty list on 304', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 304,
      headers: { get: () => null },
      text: async () => '',
    });
    await expect(fetchBoards(account, 1)).resolves.toEqual([]);
  });
});

describe('fetchStacks', () => {
  it('normalizes the nested cards and stamps the board id on each of them', async () => {
    mockFetch.mockResolvedValue(
      ok([
        {
          id: 5,
          title: 'Doing',
          order: 1,
          lastModified: 200,
          cards: [{ id: 42, title: 'Pay', stackId: 5, order: 0, lastModified: 300, createdAt: 1 }],
        },
      ]),
    );

    const stacks = await fetchStacks(account, '7');

    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://cloud.example.com/index.php/apps/deck/api/v1.1/boards/7/stacks',
    );
    expect(stacks[0].boardRemoteId).toBe('7');
    expect(stacks[0].cards[0].boardRemoteId).toBe('7');
    expect(stacks[0].cards[0].stackRemoteId).toBe('5');
  });
});

describe('createBoard', () => {
  it('posts the title and the wire-format colour', async () => {
    mockFetch.mockResolvedValue(ok({ id: 9, title: 'New', color: 'ff0000', acl: [], permissions: {}, lastModified: 1 }));

    const board = await createBoard(account, { title: 'New', color: '#ff0000' });

    const init = mockFetch.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ title: 'New', color: 'ff0000' });
    expect(board.remoteId).toBe('9');
  });

  it('defaults a null colour to the Nextcloud blue the server expects', async () => {
    mockFetch.mockResolvedValue(ok({ id: 9, title: 'New', color: '0082c9', acl: [], permissions: {}, lastModified: 1 }));
    await createBoard(account, { title: 'New', color: null });
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).color).toBe('0082c9');
  });
});

describe('updateBoard', () => {
  it('sends every field, because the endpoint replaces the board', async () => {
    mockFetch.mockResolvedValue(ok({ id: 7, title: 'Ops', color: '0082c9', archived: true, acl: [], permissions: {}, lastModified: 2 }));

    await updateBoard(account, '7', { title: 'Ops', color: '#0082c9', archived: true });

    const init = mockFetch.mock.calls[0][1];
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ title: 'Ops', color: '0082c9', archived: true });
  });
});

describe('createStack', () => {
  it('posts to the board stacks collection', async () => {
    mockFetch.mockResolvedValue(ok({ id: 5, title: 'Doing', order: 3, lastModified: 1, cards: [] }));

    const stack = await createStack(account, '7', { title: 'Doing', order: 3 });

    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://cloud.example.com/index.php/apps/deck/api/v1.1/boards/7/stacks',
    );
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ title: 'Doing', order: 3 });
    expect(stack.remoteId).toBe('5');
    expect(stack.boardRemoteId).toBe('7');
  });
});

describe('deleteBoard', () => {
  it('deletes a board with DELETE method', async () => {
    mockFetch.mockResolvedValue(ok(null));

    await deleteBoard(account, '7');

    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://cloud.example.com/index.php/apps/deck/api/v1.1/boards/7',
    );
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
  });
});

describe('updateStack', () => {
  it('updates a stack with PUT method and returns the normalized stack', async () => {
    mockFetch.mockResolvedValue(
      ok({ id: 5, title: 'In Progress', order: 2, lastModified: 1, cards: [] }),
    );

    const stack = await updateStack(account, '7', '5', { title: 'In Progress', order: 2 });

    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://cloud.example.com/index.php/apps/deck/api/v1.1/boards/7/stacks/5',
    );
    expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ title: 'In Progress', order: 2 });
    expect(stack.boardRemoteId).toBe('7');
  });
});

describe('deleteStack', () => {
  it('deletes a stack with DELETE method and correct URL', async () => {
    mockFetch.mockResolvedValue(ok(null));

    await deleteStack(account, '7', '5');

    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://cloud.example.com/index.php/apps/deck/api/v1.1/boards/7/stacks/5',
    );
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
  });
});
