import { renderHook, waitFor } from '@testing-library/react-native';
import { useAvatar } from '@/features/account/hooks/useAvatar';
import { storage } from '@/storage';
import { utf8ToBase64 } from '@/services/shared/base64';
import type { Account } from '../../src/types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const account: Account = {
  id: 'acc-1',
  displayName: 'John Doe',
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'secret',
  davUserId: 'john',
};

describe('useAvatar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storage.clearAll();
    (globalThis as any).fetch = jest.fn();
  });

  it('returns undefined when account is null', () => {
    const { result } = renderHook(() => useAvatar(null));
    expect(result.current.data).toBeUndefined();
    expect((globalThis as any).fetch).not.toHaveBeenCalled();
  });

  it('returns a base64 data URI built from the response body + content-type', async () => {
    ((globalThis as any).fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'PNGDATA',
      headers: { forEach: (cb: (v: string, k: string) => void) => cb('image/png', 'content-type') },
    });

    const { result } = renderHook(() => useAvatar(account));
    const expected = `data:image/png;base64,${utf8ToBase64('PNGDATA')}`;
    await waitFor(() => expect(result.current.data).toBe(expected));

    expect((globalThis as any).fetch).toHaveBeenCalledWith(
      'https://cloud.example.com/index.php/avatar/john/96',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Basic /) }),
      }),
    );
  });

  it('returns null on a non-ok response', async () => {
    ((globalThis as any).fetch as jest.Mock).mockResolvedValue({ ok: false, status: 404 });
    const { result } = renderHook(() => useAvatar(account));
    await waitFor(() => expect(result.current.data).toBeNull());
  });

  it('returns null on a network error', async () => {
    ((globalThis as any).fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useAvatar(account));
    await waitFor(() => expect(result.current.data).toBeNull());
  });

  // A participant's avatar (Task 18) is not the account owner's — it must fetch
  // and cache under its own key, so it never collides with or overwrites the
  // account's own cached avatar.
  it('fetches and caches a given userId under a per-user key, separate from the account avatar', async () => {
    // Seeded so the assertion below proves the account's own slot survives
    // untouched — an empty cache would pass this test vacuously either way.
    storage.set('avatar:acc-1', 'data:image/jpeg;base64,OWNAVATAR');
    ((globalThis as any).fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'PNGDATA',
      headers: { forEach: (cb: (v: string, k: string) => void) => cb('image/png', 'content-type') },
    });

    const { result } = renderHook(() => useAvatar(account, 'alice'));
    const expected = `data:image/png;base64,${utf8ToBase64('PNGDATA')}`;
    await waitFor(() => expect(result.current.data).toBe(expected));

    expect((globalThis as any).fetch).toHaveBeenCalledWith(
      'https://cloud.example.com/index.php/avatar/alice/96',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Basic /) }),
      }),
    );
    expect(storage.getString('avatar:acc-1:alice')).toBe(expected);
    expect(storage.getString('avatar:acc-1')).toBe('data:image/jpeg;base64,OWNAVATAR');
  });

  // A card's assignee list mounts one row per participant; a cache hit must
  // not re-fetch on every mount, or a large board triggers a fetch storm.
  it('returns a cached per-user avatar without fetching', async () => {
    storage.set('avatar:acc-1:alice', 'data:image/png;base64,CACHED');

    const { result } = renderHook(() => useAvatar(account, 'alice'));

    await waitFor(() => expect(result.current.data).toBe('data:image/png;base64,CACHED'));
    expect((globalThis as any).fetch).not.toHaveBeenCalled();
  });
});
