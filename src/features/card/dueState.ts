export type DueState =
  | { kind: 'none' }
  | { kind: 'overdue'; days: number }
  | { kind: 'today' }
  | { kind: 'tomorrow' }
  | { kind: 'upcoming'; at: number };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local midnight for a timestamp, so day counts match the user's own clock, not UTC. */
function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Compares calendar days, not elapsed milliseconds: a due date earlier today
 * reads as `today` rather than `overdue`. `Math.round` (not a plain integer
 * divide) absorbs the one-hour DST days a naive /DAY_MS would misround.
 */
export function dueStateOf(duedate: number | null, doneAt: number | null, now: number): DueState {
  if (duedate == null || doneAt != null) return { kind: 'none' };

  const daysUntilDue = Math.round((startOfLocalDay(duedate) - startOfLocalDay(now)) / DAY_MS);

  if (daysUntilDue < 0) return { kind: 'overdue', days: -daysUntilDue };
  if (daysUntilDue === 0) return { kind: 'today' };
  if (daysUntilDue === 1) return { kind: 'tomorrow' };
  return { kind: 'upcoming', at: duedate };
}
