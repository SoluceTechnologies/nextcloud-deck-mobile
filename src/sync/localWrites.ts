let epoch = 0;
const listeners = new Set<() => void>();

/** Called by every optimistic write so a sync in flight can detect it lost the race. */
export function markLocalWrite(): void {
  epoch += 1;
  for (const fn of listeners) fn();
}

export function localWriteEpoch(): number {
  return epoch;
}

/** Subscribes to every local write; returns the unsubscribe. */
export function onLocalWrite(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
