import {
  writeCardRow,
  cardUnchanged,
  writeBoardRow,
  boardUnchanged,
  writeStackRow,
  stackUnchanged,
  writeCommentRow,
  commentUnchanged,
  writeAttachmentRow,
  attachmentUnchanged,
  serverValuesOf,
  CARD_FIELD_NAMES,
} from '../../src/database/writers';
import type { DeckAttachment, DeckBoard, DeckCard, DeckComment, DeckStack } from '../../src/services/deck/types';

function remoteCard(overrides: Partial<DeckCard> = {}): DeckCard {
  return {
    remoteId: '42',
    boardRemoteId: '7',
    stackRemoteId: '5',
    title: 'Pay the rent',
    description: 'body',
    type: 'plain',
    order: 2,
    owner: 'john',
    color: '#ff0000',
    archived: false,
    doneAt: null,
    duedate: 1000,
    startdate: null,
    createdAt: 10,
    lastModified: 20,
    attachmentCount: 1,
    commentsCount: 3,
    dependentCardIds: ['43'],
    labels: [],
    assignees: [],
    ...overrides,
  };
}

const ctx = { accountId: 'acc-1', boardLocalId: 'b-local', stackLocalId: 's-local' };

describe('writeCardRow', () => {
  it('maps every column', () => {
    const row: any = {};
    writeCardRow(row, remoteCard(), ctx);

    expect(row).toEqual({
      accountId: 'acc-1',
      boardId: 'b-local',
      stackId: 's-local',
      remoteId: '42',
      title: 'Pay the rent',
      description: 'body',
      type: 'plain',
      order: 2,
      owner: 'john',
      color: '#ff0000',
      archived: false,
      doneAt: null,
      duedate: 1000,
      startdate: null,
      createdAt: 10,
      lastModified: 20,
      attachmentCount: 1,
      commentsCount: 3,
      dependentCardsJson: '["43"]',
      pending: false,
    });
  });

  it('leaves protected fields untouched but still advances last_modified', () => {
    const row: any = { title: 'my local edit', duedate: 999 };
    writeCardRow(row, remoteCard({ title: 'server title', duedate: 1000 }), {
      ...ctx,
      protectedFields: new Set(['title']),
    });

    expect(row.title).toBe('my local edit');
    expect(row.duedate).toBe(1000);
    expect(row.lastModified).toBe(20);
  });

  it('protects the stack and the order together when a move is queued', () => {
    const row: any = { stackId: 'other-stack', order: 0 };
    writeCardRow(row, remoteCard(), { ...ctx, protectedFields: new Set(['stackId', 'order']) });

    expect(row.stackId).toBe('other-stack');
    expect(row.order).toBe(0);
  });

  it('protects description while applying other server changes', () => {
    const row: any = { description: 'my local text', color: '#000000' };
    writeCardRow(row, remoteCard({ description: 'server text', color: '#ff0000' }), {
      ...ctx,
      protectedFields: new Set(['description']),
    });

    expect(row.description).toBe('my local text');
    expect(row.color).toBe('#ff0000');
  });

  it('protects color while applying other server changes', () => {
    const row: any = { color: '#000000', title: 'local title' };
    writeCardRow(row, remoteCard({ color: '#ff0000', title: 'server title' }), {
      ...ctx,
      protectedFields: new Set(['color']),
    });

    expect(row.color).toBe('#000000');
    expect(row.title).toBe('server title');
  });

  it('protects archived while applying other server changes', () => {
    const row: any = { archived: true, description: 'local desc' };
    writeCardRow(row, remoteCard({ archived: false, description: 'server desc' }), {
      ...ctx,
      protectedFields: new Set(['archived']),
    });

    expect(row.archived).toBe(true);
    expect(row.description).toBe('server desc');
  });

  it('protects doneAt while applying other server changes', () => {
    const row: any = { doneAt: 100, color: '#000000' };
    writeCardRow(row, remoteCard({ doneAt: 200, color: '#ff0000' }), {
      ...ctx,
      protectedFields: new Set(['doneAt']),
    });

    expect(row.doneAt).toBe(100);
    expect(row.color).toBe('#ff0000');
  });

  it('protects startdate while applying other server changes', () => {
    const row: any = { startdate: 500, title: 'local title' };
    writeCardRow(row, remoteCard({ startdate: 600, title: 'server title' }), {
      ...ctx,
      protectedFields: new Set(['startdate']),
    });

    expect(row.startdate).toBe(500);
    expect(row.title).toBe('server title');
  });
});

describe('cardUnchanged', () => {
  it('is true when every column already matches', () => {
    const row: any = {};
    writeCardRow(row, remoteCard(), ctx);
    expect(cardUnchanged(row, remoteCard(), ctx)).toBe(true);
  });

  it('is false when a single column differs', () => {
    const row: any = {};
    writeCardRow(row, remoteCard(), ctx);
    expect(cardUnchanged(row, remoteCard({ title: 'other' }), ctx)).toBe(false);
  });

  it('ignores protected fields when comparing', () => {
    const row: any = {};
    writeCardRow(row, remoteCard(), ctx);
    row.title = 'my local edit';
    expect(
      cardUnchanged(row, remoteCard(), { ...ctx, protectedFields: new Set(['title']) }),
    ).toBe(true);
  });
});

describe('serverValuesOf', () => {
  it('extracts only the requested fields, in the local column vocabulary', () => {
    expect(serverValuesOf(remoteCard(), ['title', 'duedate'])).toEqual({
      title: 'Pay the rent',
      duedate: 1000,
    });
  });

  it('reports the stack as its remote id, since local ids are meaningless server-side', () => {
    expect(serverValuesOf(remoteCard(), ['stackId'])).toEqual({ stackId: '5' });
  });

  it('covers every declared card field', () => {
    const values = serverValuesOf(remoteCard(), CARD_FIELD_NAMES);
    expect(Object.keys(values).sort()).toEqual([...CARD_FIELD_NAMES].sort());
  });
});

describe('board writers', () => {
  const remoteBoard: DeckBoard = {
    remoteId: '7',
    title: 'Ops',
    color: '#0082c9',
    archived: false,
    owner: 'john',
    shared: true,
    canEdit: true,
    canManage: false,
    canShare: false,
    lastModified: 100,
    etag: 'e1',
    users: [{ uid: 'john', displayName: 'John' }],
    acl: [{ uid: 'jane', displayName: 'Jane', type: 0 }],
    labels: [],
  };

  it('serialises the acl and the user list as JSON', () => {
    const row: any = {};
    writeBoardRow(row, remoteBoard, 'acc-1');
    expect(JSON.parse(row.usersJson)).toEqual([{ uid: 'john', displayName: 'John' }]);
    expect(JSON.parse(row.aclJson)).toEqual([{ uid: 'jane', displayName: 'Jane', type: 0 }]);
  });

  it('detects an unchanged board', () => {
    const row: any = {};
    writeBoardRow(row, remoteBoard, 'acc-1');
    expect(boardUnchanged(row, remoteBoard)).toBe(true);
    expect(boardUnchanged(row, { ...remoteBoard, title: 'Ops 2' })).toBe(false);
  });

  it('detects when only etag differs', () => {
    const row: any = {};
    writeBoardRow(row, remoteBoard, 'acc-1');
    expect(boardUnchanged(row, { ...remoteBoard, etag: 'e2' })).toBe(false);
  });
});

describe('stack writers', () => {
  const remoteStack: DeckStack = {
    remoteId: '5',
    boardRemoteId: '7',
    title: 'Todo',
    order: 1,
    lastModified: 50,
    cards: [],
  };

  it('maps all stack columns', () => {
    const row: any = {};
    writeStackRow(row, remoteStack, { accountId: 'acc-1', boardLocalId: 'b-local' });

    expect(row).toEqual({
      accountId: 'acc-1',
      boardId: 'b-local',
      remoteId: '5',
      title: 'Todo',
      order: 1,
      lastModified: 50,
    });
  });

  it('detects an unchanged stack', () => {
    const row: any = {};
    writeStackRow(row, remoteStack, { accountId: 'acc-1', boardLocalId: 'b-local' });
    expect(stackUnchanged(row, remoteStack, 'b-local')).toBe(true);
    expect(stackUnchanged(row, { ...remoteStack, title: 'In Progress' }, 'b-local')).toBe(false);
    expect(stackUnchanged(row, remoteStack, 'other-board')).toBe(false);
  });
});

describe('comment writers', () => {
  const remoteComment: DeckComment = {
    remoteId: '9',
    message: 'hello',
    actorId: 'alice',
    actorDisplayName: 'Alice',
    createdAt: 1000,
    parentId: null,
  };

  it('maps all comment columns', () => {
    const row: any = {};
    writeCommentRow(row, remoteComment, { accountId: 'acc-1', cardLocalId: 'card-local' });

    expect(row).toEqual({
      accountId: 'acc-1',
      cardId: 'card-local',
      remoteId: '9',
      message: 'hello',
      actorId: 'alice',
      actorDisplayName: 'Alice',
      createdAt: 1000,
      parentId: undefined,
    });
  });

  it('detects an unchanged comment', () => {
    const row: any = {};
    writeCommentRow(row, remoteComment, { accountId: 'acc-1', cardLocalId: 'card-local' });
    expect(commentUnchanged(row, remoteComment)).toBe(true);
    expect(commentUnchanged(row, { ...remoteComment, message: 'edited' })).toBe(false);
  });
});

describe('attachment writers', () => {
  const remoteAttachment: DeckAttachment = {
    remoteId: '3',
    attachmentType: 'deck_file',
    fileName: 'contract.pdf',
    mime: 'application/pdf',
    size: 2048,
    createdAt: 5000,
    createdBy: 'alice',
  };

  it('maps all attachment columns', () => {
    const row: any = {};
    writeAttachmentRow(row, remoteAttachment, { accountId: 'acc-1', cardLocalId: 'card-local' });

    expect(row).toEqual({
      accountId: 'acc-1',
      cardId: 'card-local',
      remoteId: '3',
      attachmentType: 'deck_file',
      fileName: 'contract.pdf',
      mime: 'application/pdf',
      size: 2048,
      createdAt: 5000,
      createdBy: 'alice',
    });
  });

  it('detects an unchanged attachment', () => {
    const row: any = {};
    writeAttachmentRow(row, remoteAttachment, { accountId: 'acc-1', cardLocalId: 'card-local' });
    expect(attachmentUnchanged(row, remoteAttachment)).toBe(true);
    expect(attachmentUnchanged(row, { ...remoteAttachment, fileName: 'other.pdf' })).toBe(false);
  });
});
