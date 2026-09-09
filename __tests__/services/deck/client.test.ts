import {
  deckRestUrl,
  deckOcsUrl,
  toImfFixdate,
  deckRequest,
} from '../../../src/services/deck/client';
import { HttpError } from '../../../src/services/shared/errors';

const account = {
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'secret',
};

const mockFetch = jest.fn();
(globalThis as any).fetch = mockFetch;

function jsonResponse(body: unknown, init: { status?: number; etag?: string } = {}) {
  return {
    ok: (init.status ?? 200) < 300,
    status: init.status ?? 200,
    headers: { get: (n: string) => (n.toLowerCase() === 'etag' ? init.etag ?? null : null) },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

beforeEach(() => jest.clearAllMocks());

describe('url builders', () => {
  it('builds the REST prefix', () => {
    expect(deckRestUrl('https://cloud.example.com', '/boards')).toBe(
      'https://cloud.example.com/index.php/apps/deck/api/v1.1/boards',
    );
  });

  it('builds the OCS prefix', () => {
    expect(deckOcsUrl('https://cloud.example.com', '/overview/upcoming')).toBe(
      'https://cloud.example.com/ocs/v2.php/apps/deck/api/v1.1/overview/upcoming',
    );
  });

  it('drops a trailing slash on the base url', () => {
    expect(deckRestUrl('https://cloud.example.com/', '/boards')).toBe(
      'https://cloud.example.com/index.php/apps/deck/api/v1.1/boards',
    );
  });
});

describe('toImfFixdate', () => {
  it('formats in GMT with the IMF-fixdate shape', () => {
    expect(toImfFixdate(Date.UTC(2019, 7, 3, 10, 34, 12))).toBe('Sat, 03 Aug 2019 10:34:12 GMT');
  });
});

describe('deckRequest', () => {
  it('sends Basic auth and the OCS header, and returns the parsed body', async () => {
    mockFetch.mockResolvedValue(jsonResponse([{ id: 1 }], { etag: 'abc' }));

    const result = await deckRequest<{ id: number }[]>(account, {
      path: '/boards',
      context: 'fetchBoards',
    });

    expect(result).toEqual({ data: [{ id: 1 }], etag: 'abc', notModified: false });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://cloud.example.com/index.php/apps/deck/api/v1.1/boards',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Basic ' + btoa('john:secret'),
          'OCS-APIRequest': 'true',
          Accept: 'application/json',
        }),
      }),
    );
  });

  it('unwraps the OCS envelope', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ ocs: { data: { overdue: [] } } }));

    const result = await deckRequest<{ overdue: unknown[] }>(account, {
      path: '/overview/upcoming',
      api: 'ocs',
      context: 'fetchUpcoming',
    });

    expect(result.data).toEqual({ overdue: [] });
  });

  it('sends If-Modified-Since when sinceMs is given', async () => {
    mockFetch.mockResolvedValue(jsonResponse([]));

    await deckRequest(account, {
      path: '/boards',
      sinceMs: Date.UTC(2019, 7, 3, 10, 34, 12),
      context: 'fetchBoards',
    });

    expect(mockFetch.mock.calls[0][1].headers['If-Modified-Since']).toBe(
      'Sat, 03 Aug 2019 10:34:12 GMT',
    );
  });

  it('reports 304 without a body', async () => {
    mockFetch.mockResolvedValue(jsonResponse(null, { status: 304 }));

    const result = await deckRequest(account, {
      path: '/boards',
      etag: 'abc',
      context: 'fetchBoards',
    });

    expect(result).toEqual({ data: null, etag: null, notModified: true });
  });

  it('serialises the body as JSON and sets the content type', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ id: 7 }));

    await deckRequest(account, {
      path: '/boards',
      method: 'POST',
      body: { title: 'Ops', color: '0082c9' },
      context: 'createBoard',
    });

    const init = mockFetch.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ title: 'Ops', color: '0082c9' });
  });

  it('throws an HttpError on a failing status', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'nope' }, { status: 403 }));

    await expect(
      deckRequest(account, { path: '/boards', context: 'fetchBoards' }),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it('returns null data on a 204', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      headers: { get: () => null },
      text: async () => '',
    });

    const result = await deckRequest(account, {
      path: '/boards/1',
      method: 'DELETE',
      context: 'deleteBoard',
    });

    expect(result.data).toBeNull();
  });
});
