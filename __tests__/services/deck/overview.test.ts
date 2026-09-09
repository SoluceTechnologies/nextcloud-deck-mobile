import { fetchUpcoming, flattenUpcoming } from '../../../src/services/deck/overview';

const account = {
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'secret',
};

const mockFetch = jest.fn();
(globalThis as any).fetch = mockFetch;

function ocs(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify({ ocs: { meta: {}, data: body } }),
  };
}

beforeEach(() => jest.clearAllMocks());

describe('fetchUpcoming', () => {
  it('calls the OCS overview endpoint and normalizes each group', async () => {
    mockFetch.mockResolvedValue(
      ocs({
        overdue: [
          { id: 42, title: 'Pay', stackId: 5, boardId: 7, order: 0, lastModified: 1, createdAt: 1 },
        ],
        today: [],
      }),
    );

    const upcoming = await fetchUpcoming(account);

    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://cloud.example.com/ocs/v2.php/apps/deck/api/v1.1/overview/upcoming',
    );
    expect(upcoming.overdue).toHaveLength(1);
    expect(upcoming.overdue[0].remoteId).toBe('42');
    expect(upcoming.overdue[0].boardRemoteId).toBe('7');
    expect(upcoming.today).toEqual([]);
  });

  it('fills every missing group with an empty array', async () => {
    mockFetch.mockResolvedValue(ocs({}));

    const upcoming = await fetchUpcoming(account);

    expect(Object.keys(upcoming).sort()).toEqual(
      ['later', 'nextSevenDays', 'nodue', 'overdue', 'today', 'tomorrow'],
    );
    expect(upcoming.later).toEqual([]);
  });

  it('skips a card that carries no board id, since it cannot be placed', async () => {
    mockFetch.mockResolvedValue(
      ocs({ overdue: [{ id: 1, title: 'orphan', stackId: 2, order: 0, lastModified: 1, createdAt: 1 }] }),
    );

    const upcoming = await fetchUpcoming(account);

    expect(upcoming.overdue).toEqual([]);
  });
});

describe('flattenUpcoming', () => {
  it('concatenates the groups and drops duplicates by remote id', () => {
    const card = (id: string) => ({ remoteId: id }) as any;
    const flat = flattenUpcoming({
      overdue: [card('1')],
      today: [card('1'), card('2')],
      tomorrow: [],
      nextSevenDays: [card('3')],
      later: [],
      nodue: [],
    });
    expect(flat.map((c) => c.remoteId)).toEqual(['1', '2', '3']);
  });
});
