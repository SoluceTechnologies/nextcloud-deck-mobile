import {
  buildCardPutBody,
  createCard,
  updateCard,
  deleteCard,
  reorderCard,
  setCardArchived,
  assignLabelToCard,
  removeLabelFromCard,
  assignUserToCard,
  unassignUserFromCard,
  addDependentCard,
  removeDependentCard,
  cloneCard,
  createLabel,
  type CardWriteState,
} from '../../../src/services/deck/cards';

const account = {
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'secret',
};

const ref = { boardRemoteId: '7', stackRemoteId: '5', cardRemoteId: '42' };

const state: CardWriteState = {
  title: 'Pay the rent',
  description: '- [ ] transfer',
  type: 'plain',
  owner: 'john',
  order: 2,
  duedate: Date.UTC(2026, 8, 8, 8, 0, 0),
  startdate: null,
  doneAt: null,
  color: '#ff0000',
  archived: false,
};

const mockFetch = jest.fn();
(globalThis as any).fetch = mockFetch;

function ok(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  };
}

beforeEach(() => jest.clearAllMocks());

describe('buildCardPutBody', () => {
  it('carries every writable field, because the endpoint replaces the card', () => {
    expect(buildCardPutBody(state)).toEqual({
      title: 'Pay the rent',
      description: '- [ ] transfer',
      type: 'plain',
      owner: 'john',
      order: 2,
      duedate: '2026-09-08T08:00:00.000Z',
      startdate: null,
      done: null,
      color: 'ff0000',
      archived: false,
    });
  });

  it('never omits a field when the value is null', () => {
    const body = buildCardPutBody({ ...state, duedate: null, color: null });
    expect(Object.keys(body).sort()).toEqual(
      ['archived', 'color', 'description', 'done', 'duedate', 'order', 'owner', 'startdate', 'title', 'type'],
    );
    expect(body.duedate).toBeNull();
    expect(body.color).toBeNull();
  });
});

describe('createCard', () => {
  it('posts to the stack card collection', async () => {
    mockFetch.mockResolvedValue(ok({ id: 42, title: 'Pay', stackId: 5, order: 0, lastModified: 1, createdAt: 1 }));

    const card = await createCard(account, { boardRemoteId: '7', stackRemoteId: '5' }, {
      title: 'Pay',
      description: '',
      order: 0,
      duedate: null,
      startdate: null,
    });

    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://cloud.example.com/index.php/apps/deck/api/v1.1/boards/7/stacks/5/cards',
    );
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      title: 'Pay',
      type: 'plain',
      order: 0,
      description: '',
      duedate: null,
      startdate: null,
    });
    expect(card.remoteId).toBe('42');
    expect(card.boardRemoteId).toBe('7');
  });
});

describe('updateCard', () => {
  it('PUTs the full body to the card', async () => {
    mockFetch.mockResolvedValue(ok({ id: 42, title: 'Pay the rent', stackId: 5, order: 2, lastModified: 9, createdAt: 1 }));

    await updateCard(account, ref, state);

    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://cloud.example.com/index.php/apps/deck/api/v1.1/boards/7/stacks/5/cards/42',
    );
    expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).title).toBe('Pay the rent');
  });
});

describe('reorderCard', () => {
  it('sends the destination stack and the position', async () => {
    mockFetch.mockResolvedValue(ok({}));

    await reorderCard(account, ref, { order: 3, toStackRemoteId: '6' });

    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://cloud.example.com/index.php/apps/deck/api/v1.1/boards/7/stacks/5/cards/42/reorder',
    );
    expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ order: 3, stackId: 6 });
  });
});

describe('setCardArchived', () => {
  it('hits archive when archiving', async () => {
    mockFetch.mockResolvedValue(ok({}));
    await setCardArchived(account, ref, true);
    expect(mockFetch.mock.calls[0][0]).toMatch(/\/cards\/42\/archive$/);
  });

  it('hits unarchive when restoring', async () => {
    mockFetch.mockResolvedValue(ok({}));
    await setCardArchived(account, ref, false);
    expect(mockFetch.mock.calls[0][0]).toMatch(/\/cards\/42\/unarchive$/);
  });
});

describe('label and user assignment', () => {
  it('assigns a label by id', async () => {
    mockFetch.mockResolvedValue(ok({}));
    await assignLabelToCard(account, ref, '3');
    expect(mockFetch.mock.calls[0][0]).toMatch(/\/cards\/42\/assignLabel$/);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ labelId: 3 });
  });

  it('assigns a user with its participant type', async () => {
    mockFetch.mockResolvedValue(ok({}));
    await assignUserToCard(account, ref, { participant: 'jane', assigneeType: 0 });
    expect(mockFetch.mock.calls[0][0]).toMatch(/\/cards\/42\/assignUser$/);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ userId: 'jane', type: 0 });
  });
});

describe('dependencies and clone use the OCS API', () => {
  it('adds a dependent card', async () => {
    mockFetch.mockResolvedValue(ok({}));
    await addDependentCard(account, '42', '43');
    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://cloud.example.com/ocs/v2.php/apps/deck/api/v1.1/cards/42/dependentCards/43',
    );
    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
  });

  it('clones a card', async () => {
    mockFetch.mockResolvedValue(ok({ ocs: { data: {} } }));
    await cloneCard(account, '42');
    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://cloud.example.com/ocs/v2.php/apps/deck/api/v1.1/cards/42/clone',
    );
  });
});

describe('deleteCard', () => {
  it('sends a DELETE request to the card', async () => {
    mockFetch.mockResolvedValue(ok({}));

    await deleteCard(account, ref);

    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://cloud.example.com/index.php/apps/deck/api/v1.1/boards/7/stacks/5/cards/42',
    );
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
  });
});

describe('removeLabelFromCard', () => {
  it('removes a label by id with the correct endpoint', async () => {
    mockFetch.mockResolvedValue(ok({}));

    await removeLabelFromCard(account, ref, '3');

    expect(mockFetch.mock.calls[0][0]).toMatch(/\/cards\/42\/removeLabel$/);
    expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ labelId: 3 });
  });
});

describe('unassignUserFromCard', () => {
  it('unassigns a user with its participant type', async () => {
    mockFetch.mockResolvedValue(ok({}));

    await unassignUserFromCard(account, ref, { participant: 'jane', assigneeType: 1 });

    expect(mockFetch.mock.calls[0][0]).toMatch(/\/cards\/42\/unassignUser$/);
    expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ userId: 'jane', type: 1 });
  });
});

describe('removeDependentCard', () => {
  it('sends a DELETE request to the OCS API', async () => {
    mockFetch.mockResolvedValue(ok({}));

    await removeDependentCard(account, '42', '43');

    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://cloud.example.com/ocs/v2.php/apps/deck/api/v1.1/cards/42/dependentCards/43',
    );
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
  });
});

describe('createLabel', () => {
  it('posts the title and the wire-format colour', async () => {
    mockFetch.mockResolvedValue(ok({ id: 8, title: 'Urgent', color: 'ff0000' }));

    const label = await createLabel(account, '7', { title: 'Urgent', color: '#ff0000' });

    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://cloud.example.com/index.php/apps/deck/api/v1.1/boards/7/labels',
    );
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ title: 'Urgent', color: 'ff0000' });
    expect(label).toEqual({ remoteId: '8', title: 'Urgent', color: '#ff0000' });
  });

  it('uses the default label colour when colour is null', async () => {
    mockFetch.mockResolvedValue(ok({ id: 9, title: 'Default', color: '31cc7c' }));

    const label = await createLabel(account, '7', { title: 'Default', color: null });

    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://cloud.example.com/index.php/apps/deck/api/v1.1/boards/7/labels',
    );
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ title: 'Default', color: '31cc7c' });
    expect(label).toEqual({ remoteId: '9', title: 'Default', color: '#31cc7c' });
  });
});
