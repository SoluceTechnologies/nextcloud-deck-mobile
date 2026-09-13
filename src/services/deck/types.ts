export type DeckBoardUser = { uid: string; displayName: string };
export type DeckAclEntry = { uid: string; displayName: string; type: number };

export type DeckLabel = {
  remoteId: string;
  title: string;
  color: string | null;
};

export type DeckAssignee = {
  participant: string;
  displayName: string;
  /** 0 user, 1 group, 7 circle/team. */
  assigneeType: number;
};

export type DeckBoard = {
  remoteId: string;
  title: string;
  color: string | null;
  archived: boolean;
  owner: string;
  shared: boolean;
  canEdit: boolean;
  canManage: boolean;
  canShare: boolean;
  lastModified: number;
  etag: string | null;
  users: DeckBoardUser[];
  acl: DeckAclEntry[];
  labels: DeckLabel[];
};

export type DeckCard = {
  remoteId: string;
  boardRemoteId: string;
  stackRemoteId: string;
  title: string;
  description: string;
  type: string;
  order: number;
  owner: string;
  color: string | null;
  archived: boolean;
  doneAt: number | null;
  duedate: number | null;
  startdate: number | null;
  createdAt: number;
  lastModified: number;
  attachmentCount: number;
  commentsCount: number;
  dependentCardIds: string[];
  labels: DeckLabel[];
  assignees: DeckAssignee[];
};

export type DeckStack = {
  remoteId: string;
  boardRemoteId: string;
  title: string;
  order: number;
  lastModified: number;
  cards: DeckCard[];
};

/** The six groups `GET /overview/upcoming` returns. */
export type DeckUpcoming = Record<
  'overdue' | 'today' | 'tomorrow' | 'nextSevenDays' | 'later' | 'nodue',
  DeckCard[]
>;

export type DeckComment = {
  remoteId: string;
  message: string;
  actorId: string;
  actorDisplayName: string;
  createdAt: number;
  parentId: string | null;
};
