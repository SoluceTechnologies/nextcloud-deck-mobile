import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ThemeProvider } from 'expo-router';

import { lightTheme } from '@/theme';
import { SyncStatus } from '@/features/settings/components/SyncStatus';
import { useDatabase } from '@/database/DatabaseProvider';
import { safeWrite } from '@/database/utils/safeTransaction';
import { useAccountStore } from '@/stores/accountStore';
import { useUiStore } from '@/stores/uiStore';
import { OUTBOX_FAILED, OUTBOX_QUEUED } from '@/sync/outbox/enqueue';
import i18n from '@/utils/i18n';

// No precedent in this repo for full WatermelonDB wiring in a component
// test; a hand-rolled fake collection (same shape the sync task tests use)
// plus a hand-rolled observable is enough to drive the component.
jest.mock('@/database/DatabaseProvider', () => ({ useDatabase: jest.fn() }));
jest.mock('@/database/utils/safeTransaction', () => ({
  safeWrite: jest.fn((_db: unknown, fn: () => Promise<unknown>) => fn()),
}));

const mockUseDatabase = useDatabase as jest.Mock;
const mockSafeWrite = safeWrite as jest.Mock;

function fakeEntry(over: Record<string, unknown> = {}) {
  const row: any = {
    id: 'o1',
    kind: 'createCard',
    state: OUTBOX_FAILED,
    attempts: 3,
    nextAttemptAt: 999_999,
    lastError: 'HTTP 500',
    ...over,
  };
  row.update = jest.fn(async (writer: (r: any) => void) => writer(row));
  row.destroyPermanently = jest.fn(async () => {
    row.destroyed = true;
  });
  return row;
}

/** Mirrors `database.get(table).query(...).observeWithColumns(...).subscribe(cb)`. */
function makeDatabase(rows: any[]) {
  const subscribe = jest.fn((cb: (rows: any[]) => void) => {
    cb(rows);
    return { unsubscribe: jest.fn() };
  });
  const observeWithColumns = jest.fn(() => ({ subscribe }));
  const query = jest.fn(() => ({ observeWithColumns }));
  const get = jest.fn(() => ({ query }));
  return { get } as any;
}

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(ThemeProvider, { value: lightTheme, children });
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUseDatabase.mockReturnValue(makeDatabase([]));
  act(() => useAccountStore.getState().setActiveAccountId('acc-1'));
  act(() => useUiStore.setState({ conflicts: [] }));
});

describe('SyncStatus', () => {
  it('shows the empty state when nothing is queued or failed', () => {
    const { getByText } = render(<SyncStatus />, { wrapper });
    expect(getByText('Everything is in sync.')).toBeTruthy();
  });

  it('filters entries into queued and failed sections', () => {
    const queuedRow = fakeEntry({ id: 'q1', state: OUTBOX_QUEUED });
    const failedRow = fakeEntry({ id: 'f1', state: OUTBOX_FAILED });
    mockUseDatabase.mockReturnValue(makeDatabase([queuedRow, failedRow]));

    const { getByText } = render(<SyncStatus />, { wrapper });

    expect(getByText('1')).toBeTruthy(); // queued count
    expect(getByText('Failed changes')).toBeTruthy();
    expect(getByText(failedRow.kind)).toBeTruthy();
  });

  it('retry resets state, attempts, nextAttemptAt and lastError through safeWrite', async () => {
    const failedRow = fakeEntry();
    mockUseDatabase.mockReturnValue(makeDatabase([failedRow]));
    const database = mockUseDatabase();

    const { getByText } = render(<SyncStatus />, { wrapper });
    await act(async () => {
      fireEvent.press(getByText('Retry'));
    });

    expect(mockSafeWrite).toHaveBeenCalledWith(
      database,
      expect.any(Function),
      10000,
      'syncStatus:retry',
    );
    expect(failedRow.update).toHaveBeenCalledTimes(1);
    expect(failedRow.state).toBe(OUTBOX_QUEUED);
    expect(failedRow.attempts).toBe(0);
    expect(failedRow.nextAttemptAt).toBe(0);
    expect(failedRow.lastError).toBeUndefined();
  });

  it('discard asks for confirmation instead of destroying the entry immediately', () => {
    const failedRow = fakeEntry();
    mockUseDatabase.mockReturnValue(makeDatabase([failedRow]));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const { getByText } = render(<SyncStatus />, { wrapper });
    fireEvent.press(getByText('Discard'));

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][0]).toBe('Discard Change?');
    expect(failedRow.destroyPermanently).not.toHaveBeenCalled();
    expect(mockSafeWrite).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it('destroys the entry through safeWrite once the destructive confirmation button is pressed', async () => {
    const failedRow = fakeEntry();
    mockUseDatabase.mockReturnValue(makeDatabase([failedRow]));
    const database = mockUseDatabase();
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons?: any[]) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });

    const { getByText } = render(<SyncStatus />, { wrapper });
    await act(async () => {
      fireEvent.press(getByText('Discard'));
    });

    expect(mockSafeWrite).toHaveBeenCalledWith(
      database,
      expect.any(Function),
      10000,
      'syncStatus:discard',
    );
    expect(failedRow.destroyPermanently).toHaveBeenCalledTimes(1);
  });

  it('leaves the entry alone when the confirmation is cancelled', async () => {
    const failedRow = fakeEntry();
    mockUseDatabase.mockReturnValue(makeDatabase([failedRow]));
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons?: any[]) => {
      buttons?.find((b) => b.style === 'cancel')?.onPress?.();
    });

    const { getByText } = render(<SyncStatus />, { wrapper });
    await act(async () => {
      fireEvent.press(getByText('Discard'));
    });

    expect(failedRow.destroyPermanently).not.toHaveBeenCalled();
    expect(mockSafeWrite).not.toHaveBeenCalled();
  });

  it('shows a conflict reported for the active account, and clears it on dismiss', () => {
    act(() => {
      useUiStore.getState().reportConflict({ accountId: 'acc-1', cardId: 'card-1', fields: ['title'] });
    });

    const { getByText } = render(<SyncStatus />, { wrapper });

    expect(getByText('Conflicts')).toBeTruthy();
    expect(getByText('title')).toBeTruthy();

    fireEvent.press(getByText('Dismiss'));

    expect(useUiStore.getState().conflicts).toEqual([]);
  });

  it('ignores a conflict reported for a different account', () => {
    act(() => {
      useUiStore.getState().reportConflict({ accountId: 'acc-2', cardId: 'card-1', fields: ['title'] });
    });

    const { getByText, queryByText } = render(<SyncStatus />, { wrapper });

    expect(queryByText('Conflicts')).toBeNull();
    expect(getByText('Everything is in sync.')).toBeTruthy();
  });
});
