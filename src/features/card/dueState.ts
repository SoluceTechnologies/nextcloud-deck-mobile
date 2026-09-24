export type DueState =
  | { kind: 'none' }
  | { kind: 'overdue'; days: number }
  | { kind: 'today' }
  | { kind: 'tomorrow' }
  | { kind: 'upcoming'; at: number };

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function dueStateOf(duedate: number | null, doneAt: number | null, now: number): DueState {
  if (duedate == null || doneAt != null) return { kind: 'none' };

  const daysUntilDue = Math.round((startOfLocalDay(duedate) - startOfLocalDay(now)) / DAY_MS);

  if (daysUntilDue < 0) return { kind: 'overdue', days: -daysUntilDue };
  if (daysUntilDue === 0) return { kind: 'today' };
  if (daysUntilDue === 1) return { kind: 'tomorrow' };
  return { kind: 'upcoming', at: duedate };
}
