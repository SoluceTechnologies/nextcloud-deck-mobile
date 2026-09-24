import type Board from '@/database/models/Board';

export type Participant = { participant: string; displayName: string; assigneeType: number };

type StoredUser = { uid: string; displayName: string };
type StoredAclEntry = { uid: string; displayName: string; type: number };

export function participantKey(p: Participant): string {
  return `${p.participant}:${p.assigneeType}`;
}

export function parseArray<T>(json: string): T[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

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

export function filterParticipants(all: Participant[], query: string): Participant[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length < 2) return [];
  return all.filter(
    (p) => p.displayName.toLowerCase().includes(trimmed) || p.participant.toLowerCase().includes(trimmed),
  );
}

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
