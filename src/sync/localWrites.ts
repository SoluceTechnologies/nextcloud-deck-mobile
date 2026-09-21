let epoch = 0;
const listeners = new Set<() => void>();

export function markLocalWrite(): void {
  epoch += 1;
  for (const fn of listeners) fn();
}

export function bumpWriteEpoch(): void {
  epoch += 1;
}

export function localWriteEpoch(): number {
  return epoch;
}

export function onLocalWrite(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
