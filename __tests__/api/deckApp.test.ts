import { fetchCapabilities } from '../../src/services/nextcloud/nextcloud';
import type { Account } from '../../src/types';

const account: Account = {
  id: 'acc-1',
  displayName: 'Work',
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'xxxx',
  davUserId: 'john',
};

const mockFetch = jest.fn();
(globalThis as any).fetch = mockFetch;

beforeEach(() => jest.clearAllMocks());

describe('fetchCapabilities', () => {
  it('reports the Deck app as available and carries its version', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        ocs: {
          data: {
            capabilities: {
              deck: { version: '1.14.2', canCreateBoards: true, apiVersions: ['1.0', '1.1'] },
            },
          },
        },
      }),
    });

    await expect(fetchCapabilities(account)).resolves.toEqual({
      deckApp: 'available',
      deckVersion: '1.14.2',
      canCreateBoards: true,
    });
  });

  it('reports the Deck app as unavailable when the capability is absent', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ ocs: { data: { capabilities: { spreed: {} } } } }),
    });

    await expect(fetchCapabilities(account)).resolves.toEqual({
      deckApp: 'unavailable',
      deckVersion: '',
      canCreateBoards: false,
    });
  });

  it('reports unknown when the request fails', async () => {
    mockFetch.mockRejectedValue(new Error('network error'));

    await expect(fetchCapabilities(account)).resolves.toEqual({
      deckApp: 'unknown',
      deckVersion: '',
      canCreateBoards: false,
    });
  });
});
