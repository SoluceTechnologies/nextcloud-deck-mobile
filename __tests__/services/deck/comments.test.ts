import { fetchComments, postComment, normalizeComment } from '../../../src/services/deck/comments';

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

function notModified() {
  return { ok: false, status: 304, headers: { get: () => null }, text: async () => '' };
}

// A 200 that carries no body at all. `deckRequest` cannot parse it into a list,
// so it is no more an answer than a 304 is.
function emptyBody() {
  return { ok: true, status: 200, headers: { get: () => null }, text: async () => '' };
}

beforeEach(() => jest.clearAllMocks());

it('requests the OCS comments route with limit and offset', async () => {
  mockFetch.mockResolvedValue(ok({ ocs: { data: [] } }));
  await fetchComments(account, '42', { limit: 20, offset: 20 });

  expect(mockFetch.mock.calls[0][0]).toContain(
    '/ocs/v2.php/apps/deck/api/v1.1/cards/42/comments',
  );
  expect(mockFetch.mock.calls[0][0]).toContain('limit=20');
  expect(mockFetch.mock.calls[0][0]).toContain('offset=20');
});

it('normalizes the wire shape', async () => {
  mockFetch.mockResolvedValue(ok({ ocs: { data: [{
    id: 7, message: 'hello', actorId: 'alice',
    actorDisplayName: 'Alice', creationDateTime: '2026-08-20T10:00:00+00:00',
    parentId: null,
  }] } }));

  const [c] = (await fetchComments(account, '42'))!;
  expect(c).toEqual({
    remoteId: '7', message: 'hello', actorId: 'alice',
    actorDisplayName: 'Alice', createdAt: Date.UTC(2026, 7, 20, 10, 0, 0), parentId: null,
  });
});

it('returns null on 304 rather than an empty list', async () => {
  mockFetch.mockResolvedValue(notModified());
  await expect(fetchComments(account, '42')).resolves.toBeNull();
});

it('returns null when a 200 carries no body', async () => {
  mockFetch.mockResolvedValue(emptyBody());
  await expect(fetchComments(account, '42')).resolves.toBeNull();
});

it('still returns an empty list when the card really has no comments', async () => {
  mockFetch.mockResolvedValue(ok({ ocs: { data: [] } }));
  await expect(fetchComments(account, '42')).resolves.toEqual([]);
});

it('posts the message and returns the created comment', async () => {
  mockFetch.mockResolvedValue(ok({ ocs: { data: { id: 9, message: 'hi' } } }));
  const created = await postComment(account, '42', 'hi');

  expect(mockFetch.mock.calls[0][1].method).toBe('POST');
  expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ message: 'hi' });
  expect(created.remoteId).toBe('9');
});

// An id that arrives as a number must not become the string "undefined".
it('coerces a numeric id to a string', () => {
  expect(normalizeComment({ id: 7 } as never).remoteId).toBe('7');
});

it('survives a comment with no actor display name', () => {
  const c = normalizeComment({ id: 7, actorId: 'alice' } as never);
  expect(c.actorDisplayName).toBe('alice');
});
