// __tests__/sync/tasks/syncUpcoming.test.ts
import { syncUpcoming } from '../../../src/sync/tasks/syncUpcoming';
import { fetchUpcoming, flattenUpcoming } from '../../../src/services/deck/overview';
import type { Account } from '../../../src/types';
import type { DeckCard } from '../../../src/services/deck/types';

jest.mock('../../../src/services/deck/overview');
jest.mock('../../../src/database/utils/safeTransaction', () => ({
  safeWrite: (_db: unknown, fn: () => Promise<unknown>) => fn(),
}));

const mockFetchUpcoming = fetchUpcoming as jest.Mock;
const mockFlattenUpcoming = flattenUpcoming as jest.Mock;

const account: Account = {
  id: 'acc-1',
  displayName: 'Work',
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'x',
  davUserId: 'john',
};

function card(over: Partial<DeckCard> = {}): DeckCard {
  return {
    remoteId: '42',
    boardRemoteId: '7',
    stackRemoteId: '5',
    title: 'Pay',
    description: '',
    type: 'plain',
    order: 0,
    owner: 'john',
    color: null,
    archived: false,
    doneAt: null,
    duedate: 5000,
    startdate: null,
    createdAt: 0,
    lastModified: 5000,
    attachmentCount: 0,
    commentsCount: 0,
    dependentCardIds: [],
    labels: [],
    assignees: [],
    ...over,
  };
}

function groups(overdue: DeckCard[]) {
  return { overdue, today: [], tomorrow: [], nextSevenDays: [], later: [], nodue: [] };
}

function makeRow(tag: string, over: Record<string, unknown>) {
  return {
    _tag: tag,
    id: `${tag}-1`,
    prepareUpdate: jest.fn((writer: (r: any) => void) => {
      const r: any = { _op: 'update', _tag: tag };
      writer(r);
      return r;
    }),
    prepareMarkAsDeleted: jest.fn(() => ({ _op: 'delete', _tag: tag })),
    ...over,
  } as any;
}

function makeDb(tables: Record<string, any[]>) {
  const batch = jest.fn(async () => {});
  const collections: Record<string, any> = {};
  for (const name of ['boards', 'stacks', 'cards', 'outbox']) {
    collections[name] = {
      query: jest.fn(() => ({ fetch: jest.fn(async () => tables[name] ?? []) })),
      prepareCreate: jest.fn((writer: (r: any) => void) => {
        const r: any = { _op: 'create', id: `${name}-new`, _tag: name };
        writer(r);
        return r;
      }),
    };
  }
  return {
    db: {
      get: jest.fn((t: string) => collections[t]),
      batch,
      write: jest.fn(async (fn: any) => fn()),
    } as any,
    batch,
  };
}

const boardRow = makeRow('boards', { id: 'b-local', remoteId: '7' });
const stackRow = makeRow('stacks', { id: 's-local', boardId: 'b-local', remoteId: '5' });

beforeEach(() => {
  jest.clearAllMocks();
  // Default flatten behavior: return the overdue array
  mockFlattenUpcoming.mockImplementation((upcoming: any) => upcoming.overdue || []);
});

describe('syncUpcoming', () => {
  it('creates a card whose board and stack are cached', async () => {
    const testCard = card();
    mockFetchUpcoming.mockResolvedValue(groups([testCard]));
    mockFlattenUpcoming.mockImplementation((upcoming: any) => upcoming.overdue || []);
    const { db, batch } = makeDb({ boards: [boardRow], stacks: [stackRow] });

    await syncUpcoming({ db, account });

    const calls = (batch.mock.calls as any);
    expect(calls.length).toBeGreaterThan(0);
    const ops = calls[0][0];
    expect(ops[0]).toMatchObject({
      _tag: 'cards',
      remoteId: '42',
      boardId: 'b-local',
      stackId: 's-local',
    });
  });

  it('skips a card whose board is not cached', async () => {
    const testCard = card({ boardRemoteId: '99' });
    mockFetchUpcoming.mockResolvedValue(groups([testCard]));
    mockFlattenUpcoming.mockImplementation((upcoming: any) => upcoming.overdue || []);
    const { db, batch } = makeDb({ boards: [boardRow], stacks: [stackRow] });

    await syncUpcoming({ db, account });

    expect(batch).not.toHaveBeenCalled();
  });

  it('skips a card whose stack is not cached', async () => {
    const testCard = card({ stackRemoteId: '99' });
    mockFetchUpcoming.mockResolvedValue(groups([testCard]));
    mockFlattenUpcoming.mockImplementation((upcoming: any) => upcoming.overdue || []);
    const { db, batch } = makeDb({ boards: [boardRow], stacks: [stackRow] });

    await syncUpcoming({ db, account });

    expect(batch).not.toHaveBeenCalled();
  });

  it('never removes a local card, because the response is a filtered subset', async () => {
    mockFetchUpcoming.mockResolvedValue(groups([]));
    mockFlattenUpcoming.mockImplementation((upcoming: any) => []);
    const { db, batch } = makeDb({
      boards: [boardRow],
      stacks: [stackRow],
      cards: [makeRow('cards', { remoteId: '42', boardId: 'b-local' })],
    });

    await syncUpcoming({ db, account });

    expect(batch).not.toHaveBeenCalled();
  });

  it('respects the protected fields of a queued mutation', async () => {
    const testCard = card({ title: 'server title' });
    mockFetchUpcoming.mockResolvedValue(groups([testCard]));
    mockFlattenUpcoming.mockImplementation((upcoming: any) => upcoming.overdue || []);
    const { db, batch } = makeDb({
      boards: [boardRow],
      stacks: [stackRow],
      cards: [
        makeRow('cards', {
          id: 'cards-1',
          remoteId: '42',
          boardId: 'b-local',
          stackId: 's-local',
          title: 'my edit',
          lastModified: 1,
        }),
      ],
      outbox: [
        makeRow('outbox', {
          entityType: 'card',
          entityId: 'cards-1',
          state: 'queued',
          serverValuesJson: '{}',
          payloadJson: JSON.stringify({
            kind: 'patchCard',
            cardId: 'cards-1',
            fields: ['title'],
            base: { title: 'Pay' },
          }),
        }),
      ],
    });

    await syncUpcoming({ db, account });

    const calls = (batch.mock.calls as any);
    expect(calls.length).toBeGreaterThan(0);
    const ops = calls[0][0];
    const update = ops.find((o: any) => o._op === 'update' && o._tag === 'cards');
    expect(update.title).toBeUndefined();
  });

  it('does not remove offline-created cards with empty remoteId even when absent from server response', async () => {
    mockFetchUpcoming.mockResolvedValue(groups([]));
    mockFlattenUpcoming.mockImplementation((upcoming: any) => []);
    const { db, batch } = makeDb({
      boards: [boardRow],
      stacks: [stackRow],
      cards: [
        makeRow('cards', { id: 'card-offline-1', remoteId: '', boardId: 'b-local', stackId: 's-local' }),
        makeRow('cards', { id: 'card-offline-2', remoteId: '', boardId: 'b-local', stackId: 's-local' }),
      ],
    });

    await syncUpcoming({ db, account });

    // Without the filter, these cards would collide on the empty remoteId key
    // and reconcile would mark one as deleted. With the filter, batch should not be called.
    expect(batch).not.toHaveBeenCalled();
  });
});
