import { fetchUserInfo, exchangeOneTimeToken, validateCredentials } from '../../src/services/nextcloud/nextcloud';
import { HttpError } from '../../src/services/shared/errors';
import type { Account } from '../../src/types';

const account: Account = {
  id: 'acc-1',
  displayName: 'Work',
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'xxxx-xxxx',
  davUserId: 'john',
};

const mockFetch = jest.fn();
(globalThis as any).fetch = mockFetch;

beforeEach(() => jest.clearAllMocks());

describe('fetchUserInfo', () => {
  it('returns the display name from OCS JSON response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ocs: {
          data: {
            displayname: 'John Doe',
          },
        },
      }),
    });

    const result = await fetchUserInfo(account);

    expect(result).toEqual({ displayName: 'John Doe' });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://cloud.example.com/ocs/v2.php/cloud/users/john',
      expect.objectContaining({
        headers: expect.objectContaining({
          'OCS-APIRequest': 'true',
          'Accept': 'application/json',
        }),
      })
    );
  });

  it('returns empty strings on network error', async () => {
    mockFetch.mockRejectedValue(new Error('network error'));
    const result = await fetchUserInfo(account);
    expect(result).toEqual({ displayName: '' });
  });

  it('returns empty strings on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    const result = await fetchUserInfo(account);
    expect(result).toEqual({ displayName: '' });
  });

  it('returns empty strings when OCS data fields are missing', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ocs: { data: {} } }),
    });
    const result = await fetchUserInfo(account);
    expect(result).toEqual({ displayName: '' });
  });
});

describe('exchangeOneTimeToken', () => {
  const params = {
    baseUrl: 'https://cloud.example.com',
    username: 'john',
    oneTimeToken: 'one-time-abc',
  };

  it('trades the one-time token for a permanent app password', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ocs: { data: { apppassword: 'perm-xyz' } } }),
    });

    await expect(exchangeOneTimeToken(params)).resolves.toBe('perm-xyz');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://cloud.example.com/ocs/v2.php/core/getapppassword-onetime',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Basic ' + btoa('john:one-time-abc'),
          'OCS-APIRequest': 'true',
        }),
      })
    );
  });

  it('throws HttpError when the token is already used or expired', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => null },
      json: async () => ({}),
    });

    await expect(exchangeOneTimeToken(params)).rejects.toBeInstanceOf(HttpError);
  });

  it('throws when the response carries no app password', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ocs: { data: {} } }),
    });

    await expect(exchangeOneTimeToken(params)).rejects.toThrow(/apppassword/i);
  });
});

describe('validateCredentials davUserId discovery', () => {
  const creds = { baseUrl: 'https://cloud.example.com', username: 'jdoe', appPassword: 'xxxx' };

  const principalXml = (href: string) =>
    `<d:multistatus xmlns:d="DAV:"><d:response><d:href>/remote.php/dav/</d:href><d:propstat><d:prop>` +
    `<d:current-user-principal><d:href>${href}</d:href></d:current-user-principal>` +
    `</d:prop></d:propstat></d:response></d:multistatus>`;

  it('derives davUserId from the principal href for an LDAP-UUID account, in a single PROPFIND', async () => {
    const uuid = '143A944C-B602-469F-BB9D-F4241F188524';
    mockFetch.mockResolvedValueOnce({
      status: 207,
      ok: true,
      text: async () => principalXml('/remote.php/dav/principals/users/' + uuid + '/'),
    });

    const res = await validateCredentials(creds);

    expect(res.davUserId).toBe(uuid);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe('https://cloud.example.com/remote.php/dav/');
  });

  it('returns the login name unchanged for a database account', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 207,
      ok: true,
      text: async () => principalXml('/remote.php/dav/principals/users/jdoe/'),
    });

    const res = await validateCredentials(creds);

    expect(res.davUserId).toBe('jdoe');
  });

  it('falls back to the login name when current-user-principal is not advertised', async () => {
    mockFetch
      .mockResolvedValueOnce({ status: 207, ok: true, text: async () => '<d:multistatus xmlns:d="DAV:"></d:multistatus>' })
      .mockResolvedValueOnce({ status: 207, ok: true, text: async () => '' });

    const res = await validateCredentials(creds);

    expect(res.davUserId).toBe('jdoe');
    expect(mockFetch.mock.calls[1][0]).toBe('https://cloud.example.com/remote.php/dav/principals/users/jdoe/');
  });

  it('resolves the principal discovery URL against a subdirectory install, in a single PROPFIND', async () => {
    const uuid = 'ABCDEF';
    mockFetch.mockResolvedValueOnce({
      status: 207,
      ok: true,
      text: async () => principalXml('/nextcloud/remote.php/dav/principals/users/' + uuid + '/'),
    });

    const res = await validateCredentials({ ...creds, baseUrl: 'https://cloud.example.com/nextcloud' });

    expect(res.davUserId).toBe(uuid);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe('https://cloud.example.com/nextcloud/remote.php/dav/');
  });
});
