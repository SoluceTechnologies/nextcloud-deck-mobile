import { AppState } from 'react-native';
import { renderHook, act, waitFor } from '@testing-library/react-native';

import { useAppInitialization } from '@/hooks/useAppInitialization';
import { loadAccounts } from '@/services/nextcloud/auth';
import { fetchCapabilities } from '@/services/nextcloud/nextcloud';
import { getAccounts } from '@/hooks/useAccounts';
import { useAccountStore } from '@/stores/accountStore';
import type { Account } from '@/types';

jest.mock('@/services/nextcloud/auth', () => ({
  loadAccounts: jest.fn(),
  getActiveAccountId: jest.fn(async () => null),
  setActiveAccountId: jest.fn(async () => undefined),
  refreshAccountProfiles: jest.fn(async () => []),
}));
jest.mock('@/database/utils/initialization', () => ({ initializeDatabaseOnStartup: jest.fn(async () => undefined) }));
jest.mock('@/services/nextcloud/nextcloud', () => ({ fetchCapabilities: jest.fn(async () => null) }));
jest.mock('@/services/shared/network', () => ({ setupOnlineManager: () => () => undefined }));
jest.mock('@/services/shared/certPins', () => ({ pushPinsToNative: jest.fn() }));
jest.mock('@/storage', () => ({
  ...jest.requireActual('@/storage'),
  migrateFromAsyncStorage: jest.fn(async () => undefined),
}));

const load = loadAccounts as jest.MockedFunction<typeof loadAccounts>;
const account = { id: 'acc1', baseUrl: 'https://x', username: 'u', appPassword: 'p' } as Account;

const appStateHandlers = new Set<(s: string) => void>();
jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, handler: (s: string) => void) => {
  appStateHandlers.add(handler);
  return { remove: () => appStateHandlers.delete(handler) };
}) as typeof AppState.addEventListener);

function foreground() {
  act(() => { appStateHandlers.forEach((h) => h('active')); });
}

describe('useAppInitialization', () => {
  beforeEach(() => jest.clearAllMocks());

  it('holds the splash instead of reporting ready when secure storage is unreachable', async () => {
    load.mockRejectedValue(new Error('User interaction is not allowed.'));

    const { result } = renderHook(() => useAppInitialization());

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    expect(result.current.isAppReady).toBe(false);
    expect(getAccounts()).toEqual([]);
  });

  it('recovers the account on the next foreground, without a process restart', async () => {
    load.mockRejectedValueOnce(new Error('User interaction is not allowed.'));
    load.mockResolvedValue([account]);

    const { result } = renderHook(() => useAppInitialization());

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    expect(result.current.isAppReady).toBe(false);

    foreground();

    await waitFor(() => expect(result.current.isAppReady).toBe(true));
    // refreshAccountProfiles is mocked to return [] (a failed re-read); it must
    // not wipe the accounts the boot just recovered.
    expect(getAccounts()).toEqual([account]);
  });

  it('gives up after repeated failures so the user can still reach setup', async () => {
    load.mockRejectedValue(new Error('User interaction is not allowed.'));

    const { result } = renderHook(() => useAppInitialization());
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));

    foreground();
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(result.current.isAppReady).toBe(false);

    foreground();
    await waitFor(() => expect(result.current.isAppReady).toBe(true));
  });

  it('does not re-run the boot once it has succeeded', async () => {
    load.mockResolvedValue([account]);

    const { result } = renderHook(() => useAppInitialization());
    await waitFor(() => expect(result.current.isAppReady).toBe(true));

    foreground();
    foreground();

    expect(load).toHaveBeenCalledTimes(1);
  });

  // The capability probe is fired without being awaited, so the app can already
  // be interactive - and the user can already have switched accounts - by the
  // time it resolves. Unlike useCapabilitiesSync's own effect, boot has no
  // natural per-account cleanup to cancel it, so the write itself must check
  // whether it is still describing the active account.
  it('discards a capability probe for an account that is no longer active by the time it resolves', async () => {
    const accountA = { id: 'accA', baseUrl: 'https://x', username: 'u', appPassword: 'p' } as Account;
    const accountB = { id: 'accB', baseUrl: 'https://y', username: 'v', appPassword: 'q' } as Account;
    load.mockResolvedValue([accountA, accountB]);

    let resolveProbe: (caps: unknown) => void = () => {};
    (fetchCapabilities as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveProbe = resolve;
      }),
    );

    const { result } = renderHook(() => useAppInitialization());
    await waitFor(() => expect(result.current.isAppReady).toBe(true));
    expect(fetchCapabilities).toHaveBeenCalledWith(accountA);

    // The user switches to B while A's probe is still in flight; B's own
    // (faster) probe has already landed with the correct verdict.
    const bCaps = { deckApp: 'available' as const, deckVersion: '2.0', canCreateBoards: true };
    act(() => {
      useAccountStore.getState().setActiveAccountId(accountB.id);
      useAccountStore.getState().setCapabilities(bCaps, accountB.id);
    });

    // accountA's slow boot probe resolves only now, after the switch.
    await act(async () => {
      resolveProbe({ deckApp: 'unavailable', deckVersion: '', canCreateBoards: false });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(useAccountStore.getState().capabilitiesAccountId).toBe(accountB.id);
    expect(useAccountStore.getState().capabilities).toEqual(bCaps);
  });
});
