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
 * `board.usersJson`/`aclJson` came off the wire and can be anything after a bad
 * response — a malformed column must contribute nothing rather than take the
 * whole read down with it (spec §7.5.5's local search has no server to retry).
 */
function parseArray<T>(json: string): T[] {
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
