import type { DeckAttachment, DeckBoard, DeckCard, DeckComment, DeckStack } from '@/services/deck/types';

export type CardFieldName =
  | 'title'
  | 'description'
  | 'duedate'
  | 'startdate'
  | 'doneAt'
  | 'color'
  | 'stackId'
  | 'order'
  | 'archived';

export const CARD_FIELD_NAMES: readonly CardFieldName[] = [
  'title',
  'description',
  'duedate',
  'startdate',
  'doneAt',
  'color',
  'stackId',
  'order',
  'archived',
];

export type CardWriteContext = {
  accountId: string;
  boardLocalId: string;
  stackLocalId: string;
  protectedFields?: ReadonlySet<CardFieldName>;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = any;

export function writeBoardRow(row: Row, remote: DeckBoard, accountId: string): void {
  row.accountId = accountId;
  row.remoteId = remote.remoteId;
  row.title = remote.title;
  row.color = remote.color ?? undefined;
  row.archived = remote.archived;
  row.owner = remote.owner;
  row.shared = remote.shared;
  row.canEdit = remote.canEdit;
  row.canManage = remote.canManage;
  row.canShare = remote.canShare;
  row.lastModified = remote.lastModified;
  row.etag = remote.etag ?? undefined;
  row.aclJson = JSON.stringify(remote.acl);
  row.usersJson = JSON.stringify(remote.users);
}

export function boardUnchanged(row: Row, remote: DeckBoard): boolean {
  return (
    row.title === remote.title &&
    (row.color ?? null) === remote.color &&
    row.archived === remote.archived &&
    row.owner === remote.owner &&
    row.shared === remote.shared &&
    row.canEdit === remote.canEdit &&
    row.canManage === remote.canManage &&
    row.canShare === remote.canShare &&
    row.lastModified === remote.lastModified &&
    (row.etag ?? null) === remote.etag &&
    row.aclJson === JSON.stringify(remote.acl) &&
    row.usersJson === JSON.stringify(remote.users)
  );
}

export function writeStackRow(
  row: Row,
  remote: DeckStack,
  ctx: { accountId: string; boardLocalId: string },
): void {
  row.accountId = ctx.accountId;
  row.boardId = ctx.boardLocalId;
  row.remoteId = remote.remoteId;
  row.title = remote.title;
  row.order = remote.order;
  row.lastModified = remote.lastModified;
}

export function stackUnchanged(row: Row, remote: DeckStack, boardLocalId: string): boolean {
  return (
    row.boardId === boardLocalId &&
    row.title === remote.title &&
    row.order === remote.order &&
    row.lastModified === remote.lastModified
  );
}

function isProtected(ctx: CardWriteContext, field: CardFieldName): boolean {
  return ctx.protectedFields?.has(field) === true;
}

export function writeCardRow(row: Row, remote: DeckCard, ctx: CardWriteContext): void {
  row.accountId = ctx.accountId;
  row.boardId = ctx.boardLocalId;
  row.remoteId = remote.remoteId;
  row.type = remote.type;
  row.owner = remote.owner;
  row.createdAt = remote.createdAt;
  row.attachmentCount = remote.attachmentCount;
  row.commentsCount = remote.commentsCount;
  row.dependentCardsJson = JSON.stringify(remote.dependentCardIds);
  row.pending = false;
  row.lastModified = remote.lastModified;

  if (!isProtected(ctx, 'stackId')) row.stackId = ctx.stackLocalId;
  if (!isProtected(ctx, 'order')) row.order = remote.order;
  if (!isProtected(ctx, 'title')) row.title = remote.title;
  if (!isProtected(ctx, 'description')) row.description = remote.description;
  if (!isProtected(ctx, 'color')) row.color = remote.color;
  if (!isProtected(ctx, 'archived')) row.archived = remote.archived;
  if (!isProtected(ctx, 'doneAt')) row.doneAt = remote.doneAt;
  if (!isProtected(ctx, 'duedate')) row.duedate = remote.duedate;
  if (!isProtected(ctx, 'startdate')) row.startdate = remote.startdate;
}

export function cardUnchanged(row: Row, remote: DeckCard, ctx: CardWriteContext): boolean {
  const same = (field: CardFieldName, a: unknown, b: unknown): boolean =>
    isProtected(ctx, field) || a === b;

  return (
    row.boardId === ctx.boardLocalId &&
    row.remoteId === remote.remoteId &&
    row.type === remote.type &&
    row.owner === remote.owner &&
    row.createdAt === remote.createdAt &&
    row.lastModified === remote.lastModified &&
    row.attachmentCount === remote.attachmentCount &&
    row.commentsCount === remote.commentsCount &&
    row.dependentCardsJson === JSON.stringify(remote.dependentCardIds) &&
    row.pending === false &&
    same('stackId', row.stackId, ctx.stackLocalId) &&
    same('order', row.order, remote.order) &&
    same('title', row.title, remote.title) &&
    same('description', row.description, remote.description) &&
    same('color', row.color, remote.color) &&
    same('archived', row.archived, remote.archived) &&
    same('doneAt', row.doneAt, remote.doneAt) &&
    same('duedate', row.duedate, remote.duedate) &&
    same('startdate', row.startdate, remote.startdate)
  );
}

export function writeCommentRow(
  row: Row,
  remote: DeckComment,
  ctx: { accountId: string; cardLocalId: string },
): void {
  row.accountId = ctx.accountId;
  row.cardId = ctx.cardLocalId;
  row.remoteId = remote.remoteId;
  row.message = remote.message;
  row.actorId = remote.actorId;
  row.actorDisplayName = remote.actorDisplayName;
  row.createdAt = remote.createdAt;
  row.parentId = remote.parentId ?? undefined;
}

export function commentUnchanged(row: Row, remote: DeckComment): boolean {
  return (
    row.message === remote.message &&
    row.actorId === remote.actorId &&
    row.actorDisplayName === remote.actorDisplayName &&
    row.createdAt === remote.createdAt &&
    (row.parentId ?? null) === remote.parentId
  );
}

export function writeAttachmentRow(
  row: Row,
  remote: DeckAttachment,
  ctx: { accountId: string; cardLocalId: string },
): void {
  row.accountId = ctx.accountId;
  row.cardId = ctx.cardLocalId;
  row.remoteId = remote.remoteId;
  row.attachmentType = remote.attachmentType;
  row.fileName = remote.fileName;
  row.mime = remote.mime;
  row.size = remote.size;
  row.createdAt = remote.createdAt;
  row.createdBy = remote.createdBy;
}

export function attachmentUnchanged(row: Row, remote: DeckAttachment): boolean {
  return (
    row.attachmentType === remote.attachmentType &&
    row.fileName === remote.fileName &&
    row.mime === remote.mime &&
    row.size === remote.size &&
    row.createdAt === remote.createdAt &&
    row.createdBy === remote.createdBy
  );
}

export function serverValuesOf(
  remote: DeckCard,
  fields: readonly CardFieldName[],
): Record<string, unknown> {
  const all: Record<CardFieldName, unknown> = {
    title: remote.title,
    description: remote.description,
    duedate: remote.duedate,
    startdate: remote.startdate,
    doneAt: remote.doneAt,
    color: remote.color,
    stackId: remote.stackRemoteId,
    order: remote.order,
    archived: remote.archived,
  };

  const picked: Record<string, unknown> = {};
  for (const field of fields) picked[field] = all[field];
  return picked;
}
