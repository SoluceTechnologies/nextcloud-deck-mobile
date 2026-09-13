import type {
  DeckAclEntry,
  DeckAssignee,
  DeckAttachment,
  DeckBoard,
  DeckBoardUser,
  DeckCard,
  DeckComment,
  DeckLabel,
  DeckStack,
} from './types';

type Raw = Record<string, any>;

const HEX_LONG = /^#?([0-9a-f]{6})$/i;
const HEX_SHORT = /^#?([0-9a-f]{3})$/i;

/** Deck stores colours as bare hex; the app stores them as `#rrggbb` lowercase. */
export function normalizeColor(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  const long = value.match(HEX_LONG);
  if (long) return `#${long[1].toLowerCase()}`;
  const short = value.match(HEX_SHORT);
  if (short) {
    const [r, g, b] = short[1].toLowerCase().split('');
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return null;
}

export function denormalizeColor(color: string | null): string | null {
  return color === null ? null : color.replace(/^#/, '');
}

export function parseDeckDate(raw: unknown): number | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

export function toDeckDate(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString();
}

/** `lastModified` and `createdAt` are unix seconds on the wire. */
export function secondsToMs(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n * 1000 : 0;
}

function uidOf(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') return String((raw as Raw).uid ?? (raw as Raw).primaryKey ?? '');
  return '';
}

function displayNameOf(raw: unknown): string {
  if (raw && typeof raw === 'object') {
    const r = raw as Raw;
    return String(r.displayname ?? r.displayName ?? r.uid ?? '');
  }
  return typeof raw === 'string' ? raw : '';
}

export function normalizeLabel(raw: Raw): DeckLabel {
  return {
    remoteId: String(raw.id),
    title: String(raw.title ?? ''),
    color: normalizeColor(raw.color),
  };
}

export function normalizeAssignee(raw: Raw): DeckAssignee {
  return {
    participant: uidOf(raw.participant),
    displayName: displayNameOf(raw.participant),
    assigneeType: Number(raw.type ?? 0),
  };
}

function normalizeUser(raw: Raw): DeckBoardUser {
  return { uid: uidOf(raw), displayName: displayNameOf(raw) };
}

function normalizeAcl(raw: Raw): DeckAclEntry {
  return {
    uid: uidOf(raw.participant),
    displayName: displayNameOf(raw.participant),
    type: Number(raw.type ?? 0),
  };
}

export function normalizeBoard(raw: Raw): DeckBoard {
  const acl: Raw[] = Array.isArray(raw.acl) ? raw.acl : [];
  const permissions: Raw = raw.permissions ?? {};

  return {
    remoteId: String(raw.id),
    title: String(raw.title ?? ''),
    color: normalizeColor(raw.color),
    archived: raw.archived === true,
    owner: uidOf(raw.owner),
    shared: acl.length > 0,
    canEdit: permissions.PERMISSION_EDIT === true,
    canManage: permissions.PERMISSION_MANAGE === true,
    canShare: permissions.PERMISSION_SHARE === true,
    lastModified: secondsToMs(raw.lastModified),
    etag: typeof raw.ETag === 'string' ? raw.ETag : null,
    users: (Array.isArray(raw.users) ? raw.users : []).map(normalizeUser),
    acl: acl.map(normalizeAcl),
    labels: (Array.isArray(raw.labels) ? raw.labels : []).map(normalizeLabel),
  };
}

export function normalizeCard(raw: Raw, boardRemoteId: string): DeckCard {
  return {
    remoteId: String(raw.id),
    boardRemoteId,
    stackRemoteId: String(raw.stackId),
    title: String(raw.title ?? ''),
    description: typeof raw.description === 'string' ? raw.description : '',
    type: typeof raw.type === 'string' ? raw.type : 'plain',
    order: Number(raw.order ?? 0),
    owner: uidOf(raw.owner),
    color: normalizeColor(raw.color),
    archived: raw.archived === true,
    doneAt: parseDeckDate(raw.done),
    duedate: parseDeckDate(raw.duedate),
    startdate: parseDeckDate(raw.startdate),
    createdAt: secondsToMs(raw.createdAt),
    lastModified: secondsToMs(raw.lastModified),
    attachmentCount: Number(raw.attachmentCount ?? 0),
    commentsCount: Number(raw.commentsCount ?? 0),
    dependentCardIds: (Array.isArray(raw.dependentCards) ? raw.dependentCards : []).map(
      (c: Raw) => String(typeof c === 'object' ? c.id : c),
    ),
    labels: (Array.isArray(raw.labels) ? raw.labels : []).map(normalizeLabel),
    assignees: (Array.isArray(raw.assignedUsers) ? raw.assignedUsers : []).map(normalizeAssignee),
  };
}

export function normalizeComment(raw: Raw): DeckComment {
  return {
    remoteId: String(raw.id),
    message: String(raw.message ?? ''),
    actorId: String(raw.actorId ?? ''),
    actorDisplayName: String(raw.actorDisplayName ?? raw.actorId ?? ''),
    createdAt: parseDeckDate(raw.creationDateTime) ?? 0,
    parentId: raw.parentId == null ? null : String(raw.parentId),
  };
}

export function normalizeStack(raw: Raw, boardRemoteId: string): DeckStack {
  return {
    remoteId: String(raw.id),
    boardRemoteId,
    title: String(raw.title ?? ''),
    order: Number(raw.order ?? 0),
    lastModified: secondsToMs(raw.lastModified),
    cards: (Array.isArray(raw.cards) ? raw.cards : []).map((c: Raw) =>
      normalizeCard(c, boardRemoteId),
    ),
  };
}

export function normalizeAttachment(raw: Raw): DeckAttachment {
  return {
    remoteId: String(raw.id),
    attachmentType: String(raw.type ?? 'deck_file'),
    fileName: String(raw.data ?? ''),
    mime: String(raw.extendedData?.mimetype ?? 'application/octet-stream'),
    size: Number(raw.extendedData?.filesize ?? 0),
    createdAt: secondsToMs(raw.createdAt),
    createdBy: String(raw.createdBy ?? ''),
  };
}
