import {
  normalizeColor,
  denormalizeColor,
  parseDeckDate,
  toDeckDate,
  normalizeBoard,
  normalizeCard,
} from '../../../src/services/deck/normalize';

describe('normalizeColor', () => {
  it('adds the missing hash and lowercases', () => {
    expect(normalizeColor('0082C9')).toBe('#0082c9');
  });

  it('keeps an already prefixed colour', () => {
    expect(normalizeColor('#FF0000')).toBe('#ff0000');
  });

  it('expands a three-digit colour', () => {
    expect(normalizeColor('f00')).toBe('#ff0000');
  });

  it('returns null for empty or malformed input', () => {
    expect(normalizeColor('')).toBeNull();
    expect(normalizeColor(null)).toBeNull();
    expect(normalizeColor('not-a-colour')).toBeNull();
  });
});

describe('denormalizeColor', () => {
  it('strips the hash for the wire format', () => {
    expect(denormalizeColor('#0082c9')).toBe('0082c9');
  });

  it('passes null through', () => {
    expect(denormalizeColor(null)).toBeNull();
  });
});

describe('date conversion', () => {
  it('parses an ISO-8601 duedate with an offset', () => {
    expect(parseDeckDate('2020-01-20T09:52:43+00:00')).toBe(Date.UTC(2020, 0, 20, 9, 52, 43));
  });

  it('returns null for null and for an unparsable value', () => {
    expect(parseDeckDate(null)).toBeNull();
    expect(parseDeckDate('soon')).toBeNull();
  });

  it('serialises back to an ISO-8601 UTC string', () => {
    expect(toDeckDate(Date.UTC(2020, 0, 20, 9, 52, 43))).toBe('2020-01-20T09:52:43.000Z');
    expect(toDeckDate(null)).toBeNull();
  });
});

describe('normalizeBoard', () => {
  it('maps the wire shape onto the domain type', () => {
    const board = normalizeBoard({
      id: 7,
      title: 'Ops',
      color: '0082C9',
      archived: false,
      owner: { uid: 'john', displayname: 'John Doe' },
      lastModified: 1579513963,
      acl: [{ participant: { uid: 'jane', displayname: 'Jane' }, type: 0 }],
      permissions: { PERMISSION_READ: true, PERMISSION_EDIT: true, PERMISSION_MANAGE: false, PERMISSION_SHARE: false },
      users: [{ uid: 'john', displayname: 'John Doe' }],
      labels: [{ id: 3, title: 'Urgent', color: 'FF0000' }],
      ETag: 'e1',
    });

    expect(board).toEqual({
      remoteId: '7',
      title: 'Ops',
      color: '#0082c9',
      archived: false,
      owner: 'john',
      shared: true,
      canEdit: true,
      canManage: false,
      canShare: false,
      lastModified: 1579513963000,
      etag: 'e1',
      users: [{ uid: 'john', displayName: 'John Doe' }],
      acl: [{ uid: 'jane', displayName: 'Jane', type: 0 }],
      labels: [{ remoteId: '3', title: 'Urgent', color: '#ff0000' }],
    });
  });

  it('treats a board with an empty acl as not shared', () => {
    const board = normalizeBoard({ id: 1, title: 'Solo', color: '', acl: [], permissions: {}, lastModified: 0 });
    expect(board.shared).toBe(false);
    expect(board.color).toBeNull();
  });
});

describe('normalizeCard', () => {
  it('maps every card field, including done and the dependent cards', () => {
    const card = normalizeCard(
      {
        id: 42,
        title: 'Pay the rent',
        description: '- [ ] transfer',
        stackId: 5,
        type: 'plain',
        order: 2,
        owner: 'john',
        color: null,
        archived: false,
        done: '2026-09-01T08:00:00+00:00',
        duedate: '2026-09-08T08:00:00+00:00',
        startdate: null,
        createdAt: 1756000000,
        lastModified: 1757000000,
        attachmentCount: 1,
        commentsCount: 3,
        dependentCards: [{ id: 43 }, { id: 44 }],
        labels: [{ id: 3, title: 'Urgent', color: 'FF0000' }],
        assignedUsers: [
          { participant: { uid: 'jane', displayname: 'Jane' }, type: 0 },
        ],
      },
      '7',
    );

    expect(card).toEqual({
      remoteId: '42',
      boardRemoteId: '7',
      stackRemoteId: '5',
      title: 'Pay the rent',
      description: '- [ ] transfer',
      type: 'plain',
      order: 2,
      owner: 'john',
      color: null,
      archived: false,
      doneAt: Date.UTC(2026, 8, 1, 8, 0, 0),
      duedate: Date.UTC(2026, 8, 8, 8, 0, 0),
      startdate: null,
      createdAt: 1756000000000,
      lastModified: 1757000000000,
      attachmentCount: 1,
      commentsCount: 3,
      dependentCardIds: ['43', '44'],
      labels: [{ remoteId: '3', title: 'Urgent', color: '#ff0000' }],
      assignees: [{ participant: 'jane', displayName: 'Jane', assigneeType: 0 }],
    });
  });

  it('defaults the optional collections to empty', () => {
    const card = normalizeCard(
      { id: 1, title: 'x', stackId: 2, order: 0, lastModified: 0, createdAt: 0 },
      '7',
    );
    expect(card.labels).toEqual([]);
    expect(card.assignees).toEqual([]);
    expect(card.dependentCardIds).toEqual([]);
    expect(card.description).toBe('');
    expect(card.type).toBe('plain');
    expect(card.doneAt).toBeNull();
  });
});
