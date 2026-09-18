let epoch = 0;
const listeners = new Set<() => void>();

/** Called by every optimistic write so a sync in flight can detect it lost the race. */
export function markLocalWrite(): void {
  epoch += 1;
  for (const fn of listeners) fn();
}

/**
 * Same race guard as `markLocalWrite`, without the notification: the drain calls
 * this after a send lands, so a fetch already in flight aborts instead of
 * reverting the row the send just changed. Plain `markLocalWrite` would re-enter
 * `drainOutbox` through its own `onLocalWrite` listener — harmless, but an extra
 * no-op pass on every drain for no benefit, since the drain that just ran already
 * saw everything there was to send.
 */
export function bumpWriteEpoch(): void {
  epoch += 1;
}

export function localWriteEpoch(): number {
  return epoch;
}

/** Subscribes to every local write; returns the unsubscribe. */
export function onLocalWrite(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
