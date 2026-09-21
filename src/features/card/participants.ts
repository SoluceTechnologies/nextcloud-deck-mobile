import type Board from '@/database/models/Board';

export type Participant = { participant: string; displayName: string; assigneeType: number };

type StoredUser = { uid: string; displayName: string };
type StoredAclEntry = { uid: string; displayName: string; type: number };

/** `${participant}:${assigneeType}` — a user and a group can share an id, so
 * the id alone is not a unique key. Exported so callers (React list keys,
 * dedup) use the same identity `participantsOf` dedups by. */
export function participantKey(p: Participant): string {
  return `${p.participant}:${p.assigneeType}`;
}

/**
 * A JSON column can be anything after a bad response — a malformed value must
 * contribute nothing rather than take the whole read down with it. Shared by
 * every caller storing a JSON array in a WatermelonDB column: board
 * `usersJson`/`aclJson` here (spec §7.5.5's local search has no server to
 * retry) and a card's `dependentCardsJson` (useCardActions, card/[id].tsx).
 */
export function parseArray<T>(json: string): T[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/**
 * The board's users and ACL entries, merged into one local search list
 * (spec §7.5.5). `usersJson` holds `DeckBoardUser[]` ({ uid, displayName }, all
 * type 0); `aclJson` holds `DeckAclEntry[]` ({ uid, displayName, type }) — the
 * shapes `writeBoardRow` stores, not the raw wire shapes. The two columns can
 * name the same person; a user and a group can also share an id without being
 * the same participant, so dedup keys on id *and* type.
 */
export function participantsOf(board: Board): Participant[] {
  const users: Participant[] = parseArray<StoredUser>(board.usersJson).map((u) => ({
    participant: u.uid,
    displayName: u.displayName,
    assigneeType: 0,
  }));
  const acl: Participant[] = parseArray<StoredAclEntry>(board.aclJson).map((e) => ({
    participant: e.uid,
    displayName: e.displayName,
    assigneeType: e.type,
  }));

  const seen = new Set<string>();
  const result: Participant[] = [];
  for (const p of [...users, ...acl]) {
    const key = participantKey(p);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(p);
  }
  return result;
}

/**
 * Local, case-insensitive substring match on name or id — never a network call.
 * Below two characters returns nothing: the threshold that keeps a large board
 * from rendering its full people list on the first keystroke.
 */
export function filterParticipants(all: Participant[], query: string): Participant[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length < 2) return [];
  return all.filter(
    (p) => p.displayName.toLowerCase().includes(trimmed) || p.participant.toLowerCase().includes(trimmed),
  );
}

/**
 * A person's name for display, from an id. Deck reports a card's owner as a
 * bare uid — on an SSO server that is an opaque UUID, which is unreadable — so
 * it is resolved against the people the board already lists.
 *
 * Falls back to the signed-in account when the board does not list them (a
 * card whose owner has since left the board still names its owner), and to the
 * raw id last, which is at least a stable identifier rather than a blank.
 */
export function participantName(
  participants: Participant[],
  uid: string,
  self?: { davUserId: string; displayName: string } | null,
): string {
  if (!uid) return '';
  const match = participants.find((p) => p.participant === uid);
  if (match?.displayName) return match.displayName;
  if (self && self.davUserId === uid && self.displayName) return self.displayName;
  return uid;
}
