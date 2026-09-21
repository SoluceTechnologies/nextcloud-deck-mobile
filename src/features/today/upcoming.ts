import type Card from '@/database/models/Card';
import type CardAssignee from '@/database/models/CardAssignee';
import { dueStateOf } from '@/features/card/dueState';

export type UpcomingBucket = 'overdue' | 'today' | 'tomorrow' | 'week';
export const UPCOMING_BUCKETS: readonly UpcomingBucket[] = ['overdue', 'today', 'tomorrow', 'week'];
export type UpcomingGroups = Record<UpcomingBucket, Card[]>;

const WEEK_DAYS = 7;

function dayIndex(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return Math.round(d.getTime() / 86_400_000);
}

function concernsMe(assignees: CardAssignee[] | undefined, me: string): boolean {
  if (!assignees || assignees.length === 0) return true;
  return assignees.some((a) => a.assigneeType === 0 && a.participant === me);
}

function bucketOf(duedate: number, now: number): UpcomingBucket | null {
  const state = dueStateOf(duedate, null, now);
  switch (state.kind) {
    case 'overdue': return 'overdue';
    case 'today': return 'today';
    case 'tomorrow': return 'tomorrow';
    case 'upcoming': return dayIndex(state.at) <= dayIndex(now) + WEEK_DAYS ? 'week' : null;
    default: return null;
  }
}

export function groupUpcoming(
  cards: Card[],
  assigneesByCard: Map<string, CardAssignee[]>,
  me: string,
  now: number,
): UpcomingGroups {
  const groups: UpcomingGroups = { overdue: [], today: [], tomorrow: [], week: [] };

  for (const card of cards) {
    if (card.archived || card.doneAt || card.duedate == null) continue;
    if (!concernsMe(assigneesByCard.get(card.id), me)) continue;
    const bucket = bucketOf(card.duedate, now);
    if (bucket) groups[bucket].push(card);
  }

  for (const bucket of UPCOMING_BUCKETS) {
    groups[bucket].sort((a, b) => (a.duedate ?? 0) - (b.duedate ?? 0) || a.title.localeCompare(b.title));
  }
  return groups;
}
