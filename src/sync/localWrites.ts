let epoch = 0;

/** Called by every optimistic write so a sync in flight can detect it lost the race. */
export function markLocalWrite(): void {
  epoch += 1;
}

export function localWriteEpoch(): number {
  return epoch;
}
