import { searchCards } from '../../../src/services/deck/search';

const account = { baseUrl: 'https://cloud.example.com', username: 'john', appPassword: 'secret' };
const mockFetch = jest.fn();
(globalThis as any).fetch = mockFetch;

function ok(body: unknown) {
  return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(body) };
}
function emptyBody() {
  return { ok: true, status: 200, headers: { get: () => null }, text: async () => '' };
}

const hit = (over: Record<string, unknown> = {}) => ({
  id: 42, title: 'Payer le loyer', stackId: 7, relatedBoard: { id: 3, title: 'Finance' },
  relatedStack: { id: 7, title: 'En cours' }, ...over,
});

beforeEach(() => jest.clearAllMocks());

it('requests the OCS search route with the encoded term and the limit', async () => {
  mockFetch.mockResolvedValue(ok({ ocs: { data: [] } }));
  await searchCards(account, 'title:"le loyer"', { limit: 20 });
  const url = mockFetch.mock.calls[0][0] as string;
  expect(url).toContain('/ocs/v2.php/apps/deck/api/v1.1/search?');
  expect(url).toContain(`term=${encodeURIComponent('title:"le loyer"')}`);
  expect(url).toContain('limit=20');
  expect(url).not.toContain('cursor=');
});

it('forwards a cursor when given one', async () => {
  mockFetch.mockResolvedValue(ok({ ocs: { data: [] } }));
  await searchCards(account, 'x', { cursor: 'abc' });
  expect(mockFetch.mock.calls[0][0]).toContain('cursor=abc');
});

it('reads a bare array of enriched cards', async () => {
  mockFetch.mockResolvedValue(ok({ ocs: { data: [hit()] } }));
  const page = await searchCards(account, 'loyer');
  expect(page.cursor).toBeNull();
  expect(page.hits).toHaveLength(1);
  expect(page.hits[0]).toMatchObject({
    boardTitle: 'Finance', stackTitle: 'En cours',
    card: { remoteId: '42', boardRemoteId: '3', stackRemoteId: '7', title: 'Payer le loyer' },
  });
});

it('reads a paged object with a cursor', async () => {
  mockFetch.mockResolvedValue(ok({ ocs: { data: { cards: [hit()], cursor: 'next' } } }));
  const page = await searchCards(account, 'loyer');
  expect(page.cursor).toBe('next');
  expect(page.hits).toHaveLength(1);
});

it('drops a hit that carries no board reference', async () => {
  mockFetch.mockResolvedValue(ok({ ocs: { data: [hit({ relatedBoard: undefined, boardId: undefined })] } }));
  await expect(searchCards(account, 'loyer')).resolves.toEqual({ hits: [], cursor: null });
});

it('falls back to boardId and empty titles when the related objects are missing', async () => {
  mockFetch.mockResolvedValue(ok({ ocs: { data: [hit({ relatedBoard: undefined, relatedStack: undefined, boardId: 3 })] } }));
  const page = await searchCards(account, 'loyer');
  expect(page.hits[0]).toMatchObject({ boardTitle: '', stackTitle: '', card: { boardRemoteId: '3' } });
});

// A search page is not a reconcile input: an empty answer is simply "no hits".
it('returns an empty page for a body-less 200', async () => {
  mockFetch.mockResolvedValue(emptyBody());
  await expect(searchCards(account, 'loyer')).resolves.toEqual({ hits: [], cursor: null });
});
