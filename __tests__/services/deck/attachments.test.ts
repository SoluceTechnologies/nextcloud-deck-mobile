import {
  fetchAttachments,
  normalizeAttachment,
  attachmentDownloadUrl,
} from '../../../src/services/deck/attachments';

const account = {
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'secret',
};

const ref = { boardRemoteId: '1', stackRemoteId: '2', cardRemoteId: '42' };

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

it('requests the REST attachments route for the card', async () => {
  mockFetch.mockResolvedValue(ok([]));
  await fetchAttachments(account, { boardRemoteId: '1', stackRemoteId: '2', cardRemoteId: '42' });
  expect(mockFetch.mock.calls[0][0]).toContain(
    '/index.php/apps/deck/api/v1.1/boards/1/stacks/2/cards/42/attachments',
  );
});

it('normalizes the wire shape, reading the size out of extendedData', async () => {
  mockFetch.mockResolvedValue(ok([{
    id: 3, type: 'deck_file', data: 'contract.pdf',
    createdBy: 'alice', createdAt: 1755000000,
    extendedData: { filesize: 20480, mimetype: 'application/pdf' },
  }]));

  const [a] = (await fetchAttachments(account, ref))!;
  expect(a).toMatchObject({
    remoteId: '3', attachmentType: 'deck_file',
    fileName: 'contract.pdf', mime: 'application/pdf', size: 20480,
  });
});

it('returns null on 304 and on a body-less 200', async () => {
  mockFetch.mockResolvedValue(notModified());
  await expect(fetchAttachments(account, ref)).resolves.toBeNull();

  mockFetch.mockResolvedValue(emptyBody());
  await expect(fetchAttachments(account, ref)).resolves.toBeNull();
});

// The v1.1 display route carries the type as its own path segment.
it('builds a download url with the type segment before the id', () => {
  const url = attachmentDownloadUrl(
    account,
    { boardRemoteId: '1', stackRemoteId: '2', cardRemoteId: '42' },
    { remoteId: '3', attachmentType: 'deck_file' } as never,
  );
  expect(url).toContain('/boards/1/stacks/2/cards/42/attachments/deck_file/3');
});

it('defaults an unknown mime rather than emitting undefined', () => {
  expect(normalizeAttachment({ id: 3, data: 'x' } as never).mime).toBe('application/octet-stream');
});

it('defaults a missing size to zero', () => {
  expect(normalizeAttachment({ id: 3, data: 'x' } as never).size).toBe(0);
});
