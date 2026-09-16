import { act, renderHook } from '@testing-library/react-native';

import { useActiveAccount } from '../../../src/hooks/useAccounts';
import { searchCards } from '../../../src/services/deck/search';
import { getIsOnline } from '../../../src/services/shared/network';
import { useRemoteSearch } from '../../../src/features/search/useRemoteSearch';

jest.mock('../../../src/services/deck/search', () => ({ searchCards: jest.fn() }));
jest.mock('../../../src/hooks/useAccounts', () => ({ useActiveAccount: jest.fn() }));
jest.mock('../../../src/services/shared/network', () => ({ getIsOnline: jest.fn(() => true) }));

jest.useFakeTimers();

const account: any = { id: 'a1', baseUrl: 'https://cloud.example.com', username: 'john', appPassword: 'secret' };
const hit = (remoteId: string): any => ({
  card: { remoteId },
  boardTitle: 'Finance & Juridique',
  stackTitle: 'En cours',
});

beforeEach(() => {
  jest.clearAllMocks();
  (useActiveAccount as jest.Mock).mockReturnValue(account);
  (getIsOnline as jest.Mock).mockReturnValue(true);
});

it('does not call the server before the debounce elapses', () => {
  renderHook(() => useRemoteSearch('a1', 'loyer', new Set()));
  jest.advanceTimersByTime(299);
  expect(searchCards).not.toHaveBeenCalled();
});
it('calls the server once with the raw input after 300 ms', async () => {
  (searchCards as jest.Mock).mockResolvedValue({ hits: [], cursor: null });
  renderHook(() => useRemoteSearch('a1', 'title:loyer', new Set()));
  await act(async () => { jest.advanceTimersByTime(300); });
  expect(searchCards).toHaveBeenCalledTimes(1);
  expect((searchCards as jest.Mock).mock.calls[0][1]).toBe('title:loyer');
});
it('does not call the server offline or for a blank input', async () => {
  (getIsOnline as jest.Mock).mockReturnValueOnce(false);
  renderHook(() => useRemoteSearch('a1', 'loyer', new Set()));
  renderHook(() => useRemoteSearch('a1', '  ', new Set()));
  await act(async () => { jest.advanceTimersByTime(300); });
  expect(searchCards).not.toHaveBeenCalled();
});
it('drops hits the cache already holds', async () => {
  (searchCards as jest.Mock).mockResolvedValue({ hits: [hit('7'), hit('8')], cursor: null });
  const { result } = renderHook(() => useRemoteSearch('a1', 'loyer', new Set(['7'])));
  await act(async () => { jest.advanceTimersByTime(300); });
  expect(result.current.hits.map((h) => h.card.remoteId)).toEqual(['8']);
});
it('ignores a response for an input that has since changed', async () => {
  let resolveFirst!: (v: unknown) => void;
  (searchCards as jest.Mock).mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }));
  (searchCards as jest.Mock).mockResolvedValueOnce({ hits: [hit('9')], cursor: null });
  const { result, rerender } = renderHook(
    ({ q }: { q: string }) => useRemoteSearch('a1', q, new Set()),
    { initialProps: { q: 'a' } },
  );
  await act(async () => { jest.advanceTimersByTime(300); });
  rerender({ q: 'ab' });
  await act(async () => { jest.advanceTimersByTime(300); });
  await act(async () => { resolveFirst({ hits: [hit('1')], cursor: null }); });
  expect(result.current.hits.map((h) => h.card.remoteId)).toEqual(['9']);
});
it('reports a failure instead of throwing', async () => {
  (searchCards as jest.Mock).mockRejectedValue(new Error('boom'));
  const { result } = renderHook(() => useRemoteSearch('a1', 'loyer', new Set()));
  await act(async () => { jest.advanceTimersByTime(300); });
  expect(result.current.failed).toBe(true);
});
it('resets loading when an in-flight request is abandoned', async () => {
  let resolvePending!: (v: unknown) => void;
  (searchCards as jest.Mock).mockImplementationOnce(() => new Promise((r) => { resolvePending = r; }));
  const { result, rerender } = renderHook(
    ({ q }: { q: string }) => useRemoteSearch('a1', q, new Set()),
    { initialProps: { q: 'loyer' } },
  );
  await act(async () => { jest.advanceTimersByTime(300); }); // dispatched, in flight
  expect(result.current.loading).toBe(true);
  rerender({ q: '' }); // cleared before it resolves -> cancel branch
  await act(async () => { resolvePending({ hits: [], cursor: null }); }); // abandoned response settles
  expect(result.current.loading).toBe(false);
});
