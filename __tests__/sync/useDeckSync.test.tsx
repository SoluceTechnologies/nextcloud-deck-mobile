import { AppState } from 'react-native';
import { renderHook, act } from '@testing-library/react-native';

import { useDeckSync } from '../../src/sync/useDeckSync';
import { drainOutbox, nextRetryAt } from '../../src/sync/outbox/drain';
import { createSyncScheduler } from '../../src/sync/scheduler';
import { useAccountStore } from '../../src/stores/accountStore';
import { useUiStore } from '../../src/stores/uiStore';
import { setAccounts } from '../../src/hooks/useAccounts';
import { markLocalWrite } from '../../src/sync/localWrites';

jest.mock('../../src/sync/outbox/drain', () => ({
  drainOutbox: jest.fn(async () => {}),
  nextRetryAt: jest.fn(async () => null),
}));
jest.mock('../../src/sync/scheduler', () => {
  const start = jest.fn();
  const stop = jest.fn();
  return {
    __start: start,
    __stop: stop,
    createSyncScheduler: jest.fn(() => ({
      start,
      stop,
      runNow: jest.fn(async () => {}),
      isRunning: () => false,
      requestBoardSnapshot: jest.fn(),
    })),
    // Real behavior is covered in isolation by __tests__/sync/scheduler.test.ts;
    // this suite only needs the calls not to throw.
    registerScheduler: jest.fn(),
    unregisterScheduler: jest.fn(),
  };
});

const account = {
  id: 'acc-1',
  displayName: 'Work',
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'x',
  davUserId: 'john',
};

// Mirrors the AppState mock in __tests__/hooks/useAppInitialization.test.ts: a
// real listener registry so tests can drive foreground/background transitions
// the way the OS would. jest.clearAllMocks() below resets call counts but not
// this mockImplementation, same as that precedent.
const appStateHandlers = new Set<(status: string) => void>();
jest.spyOn(AppState, 'addEventListener').mockImplementation(((
  _: string,
  handler: (status: string) => void,
) => {
  appStateHandlers.add(handler);
  return { remove: () => appStateHandlers.delete(handler) };
}) as typeof AppState.addEventListener);

function setAppState(status: string) {
  act(() => appStateHandlers.forEach((h) => h(status)));
}

beforeEach(() => {
  jest.clearAllMocks();
  appStateHandlers.clear();
  setAccounts([]);
  act(() => useAccountStore.getState().setActiveAccountId(null));
});

describe('useDeckSync', () => {
  it('starts nothing without an active account', () => {
    renderHook(() => useDeckSync());
    expect(createSyncScheduler).not.toHaveBeenCalled();
  });

  it('starts a scheduler once an account is active', () => {
    setAccounts([account]);
    act(() => useAccountStore.getState().setActiveAccountId('acc-1'));

    renderHook(() => useDeckSync());

    expect(createSyncScheduler).toHaveBeenCalledTimes(1);
    expect(jest.requireMock('../../src/sync/scheduler').__start).toHaveBeenCalled();
  });

  it('drains the outbox on mount', () => {
    setAccounts([account]);
    act(() => useAccountStore.getState().setActiveAccountId('acc-1'));

    renderHook(() => useDeckSync());

    expect(drainOutbox).toHaveBeenCalled();
  });

  it('routes a conflict the drain reports into the ui store', () => {
    setAccounts([account]);
    act(() => useAccountStore.getState().setActiveAccountId('acc-1'));
    act(() => useUiStore.setState({ conflicts: [] }));

    renderHook(() => useDeckSync());

    const { onConflict } = (drainOutbox as jest.Mock).mock.calls[0][0];
    act(() => onConflict({ cardId: 'card-1', fields: ['title'] }));

    expect(useUiStore.getState().conflicts).toEqual([
      { accountId: 'acc-1', cardId: 'card-1', fields: ['title'] },
    ]);
  });

  it('drains exactly once on an online mount, not once per effect', () => {
    // `online` defaults to true (src/services/shared/network.ts), so this is
    // the ordinary "launch the app while online" case. Both effects run
    // after the initial commit regardless of their dependency arrays; only
    // the mount effect should actually drain.
    setAccounts([account]);
    act(() => useAccountStore.getState().setActiveAccountId('acc-1'));

    renderHook(() => useDeckSync());

    expect(drainOutbox).toHaveBeenCalledTimes(1);
  });

  // `mutate` (src/sync/outbox/enqueue.ts) calls the real `markLocalWrite` once
  // the outbox row is committed; the drain must follow it immediately rather
  // than wait for the next scheduler tick or foreground transition.
  it('drains again as soon as a local write is queued', () => {
    setAccounts([account]);
    act(() => useAccountStore.getState().setActiveAccountId('acc-1'));

    renderHook(() => useDeckSync());
    (drainOutbox as jest.Mock).mockClear();

    act(() => markLocalWrite());

    expect(drainOutbox).toHaveBeenCalledTimes(1);
  });

  it('drains again once the backoff of a failed send has elapsed', async () => {
    jest.useFakeTimers({ now: 1_000 });
    (nextRetryAt as jest.Mock).mockResolvedValueOnce(6_000);
    setAccounts([account]);
    act(() => useAccountStore.getState().setActiveAccountId('acc-1'));

    renderHook(() => useDeckSync());
    for (let i = 0; i < 5; i += 1) await act(async () => {});
    (drainOutbox as jest.Mock).mockClear();

    await act(async () => {
      jest.advanceTimersByTime(4_999);
    });
    expect(drainOutbox).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(drainOutbox).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('stops listening for local writes on unmount', () => {
    setAccounts([account]);
    act(() => useAccountStore.getState().setActiveAccountId('acc-1'));

    const { unmount } = renderHook(() => useDeckSync());
    unmount();
    (drainOutbox as jest.Mock).mockClear();

    act(() => markLocalWrite());

    expect(drainOutbox).not.toHaveBeenCalled();
  });

  it('stops the scheduler on unmount', () => {
    setAccounts([account]);
    act(() => useAccountStore.getState().setActiveAccountId('acc-1'));

    const { unmount } = renderHook(() => useDeckSync());
    unmount();

    expect(jest.requireMock('../../src/sync/scheduler').__stop).toHaveBeenCalled();
  });

  it('stops the scheduler when the app backgrounds', () => {
    setAccounts([account]);
    act(() => useAccountStore.getState().setActiveAccountId('acc-1'));

    renderHook(() => useDeckSync());
    setAppState('background');

    expect(jest.requireMock('../../src/sync/scheduler').__stop).toHaveBeenCalled();
  });

  it('restarts the scheduler and drains again when the app returns to the foreground', () => {
    setAccounts([account]);
    act(() => useAccountStore.getState().setActiveAccountId('acc-1'));

    renderHook(() => useDeckSync());
    setAppState('background');

    jest.requireMock('../../src/sync/scheduler').__start.mockClear();
    (drainOutbox as jest.Mock).mockClear();

    setAppState('active');

    expect(jest.requireMock('../../src/sync/scheduler').__start).toHaveBeenCalled();
    expect(drainOutbox).toHaveBeenCalled();
  });
});
