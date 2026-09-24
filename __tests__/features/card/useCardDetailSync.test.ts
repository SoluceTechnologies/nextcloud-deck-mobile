import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useCardDetailSync } from '../../../src/features/card/hooks/useCardDetailSync';
import { syncCardDetail } from '../../../src/sync/tasks/syncCardDetail';
import { useDatabase } from '../../../src/database/DatabaseProvider';
import { useActiveAccount } from '../../../src/hooks/useAccounts';
import { getIsOnline } from '../../../src/services/shared/network';

jest.mock('../../../src/sync/tasks/syncCardDetail', () => ({ syncCardDetail: jest.fn() }));
jest.mock('../../../src/database/DatabaseProvider', () => ({ useDatabase: jest.fn() }));
jest.mock('../../../src/hooks/useAccounts', () => ({ useActiveAccount: jest.fn() }));
jest.mock('../../../src/services/shared/network', () => ({ getIsOnline: jest.fn() }));

const mockSyncCardDetail = syncCardDetail as jest.Mock;
const db = { tag: 'db' };
const account: any = { id: 'a1' };

beforeEach(() => {
  jest.clearAllMocks();
  (useDatabase as jest.Mock).mockReturnValue(db);
  (useActiveAccount as jest.Mock).mockReturnValue(account);
  (getIsOnline as jest.Mock).mockReturnValue(true);
  mockSyncCardDetail.mockResolvedValue({ hasMore: false });
});

it('runs once on mount with offset 0', async () => {
  renderHook(() => useCardDetailSync('a1', 'c1'));
  await waitFor(() => expect(mockSyncCardDetail).toHaveBeenCalledTimes(1));
  expect(mockSyncCardDetail).toHaveBeenCalledWith({ db, account, cardLocalId: 'c1', offset: 0 });
});

it('loadMore fetches offset 20, then 40', async () => {
  const { result } = renderHook(() => useCardDetailSync('a1', 'c1'));
  await waitFor(() => expect(mockSyncCardDetail).toHaveBeenCalledTimes(1));

  act(() => result.current.loadMore());
  await waitFor(() => expect(mockSyncCardDetail).toHaveBeenCalledTimes(2));
  expect(mockSyncCardDetail).toHaveBeenNthCalledWith(2, { db, account, cardLocalId: 'c1', offset: 20 });

  act(() => result.current.loadMore());
  await waitFor(() => expect(mockSyncCardDetail).toHaveBeenCalledTimes(3));
  expect(mockSyncCardDetail).toHaveBeenNthCalledWith(3, { db, account, cardLocalId: 'c1', offset: 40 });
});

it('reflects hasMore from the sync result', async () => {
  mockSyncCardDetail.mockResolvedValue({ hasMore: true });
  const { result } = renderHook(() => useCardDetailSync('a1', 'c1'));
  await waitFor(() => expect(result.current.hasMore).toBe(true));
});

// A rejected run must not be thrown to the caller, and must leave hasMore as-is.
it('warns and leaves hasMore unchanged when the sync run rejects', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  mockSyncCardDetail.mockRejectedValue(new Error('boom'));
  const { result } = renderHook(() => useCardDetailSync('a1', 'c1'));
  await waitFor(() => expect(mockSyncCardDetail).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.hasMore).toBe(false);
  expect(warn).toHaveBeenCalledWith('[card] detail sync failed', expect.stringContaining('boom'));
  warn.mockRestore();
});

it('does not sync while offline', () => {
  (getIsOnline as jest.Mock).mockReturnValue(false);
  renderHook(() => useCardDetailSync('a1', 'c1'));
  expect(mockSyncCardDetail).not.toHaveBeenCalled();
});

it('does not sync without a card', () => {
  renderHook(() => useCardDetailSync('a1', null));
  expect(mockSyncCardDetail).not.toHaveBeenCalled();
});

// useActiveAccount returns a referentially-new object whenever the accounts
// list is reassigned (init, account settings, a profile/capability refresh)
// even when the id hasn't moved — the effect must not treat that churn as an
// account change and re-run the sync from offset 0.
it('does not re-sync when the account object changes but the id does not', async () => {
  const { rerender } = renderHook(() => useCardDetailSync('a1', 'c1'));
  await waitFor(() => expect(mockSyncCardDetail).toHaveBeenCalledTimes(1));

  (useActiveAccount as jest.Mock).mockReturnValue({ id: 'a1' }); // a new object, same id
  rerender(undefined);

  expect(mockSyncCardDetail).toHaveBeenCalledTimes(1);
});
