export type Reconciliation<TRemote, TRow> = {
  create: TRemote[];
  update: { row: TRow; remote: TRemote }[];
  remove: TRow[];
};

export type ReconcileParams<TRemote, TRow> = {
  remote: TRemote[];
  rows: TRow[];
  remoteKey: (remote: TRemote) => string;
  rowKey: (row: TRow) => string;
  unchanged: (row: TRow, remote: TRemote) => boolean;
  deleteMissing: boolean;
  protectedRowIds?: ReadonlySet<string>;
};

export function reconcile<TRemote, TRow>(
  params: ReconcileParams<TRemote, TRow>,
): Reconciliation<TRemote, TRow> {
  const result: Reconciliation<TRemote, TRow> = { create: [], update: [], remove: [] };

  const byKey = new Map<string, TRow>();
  for (const row of params.rows) {
    const key = params.rowKey(row);
    if (byKey.has(key)) {
      if (!params.protectedRowIds?.has(key)) result.remove.push(row);
      continue;
    }
    byKey.set(key, row);
  }

  const seen = new Set<string>();
  for (const remote of params.remote) {
    const key = params.remoteKey(remote);
    if (seen.has(key)) continue;
    seen.add(key);

    const row = byKey.get(key);
    if (!row) {
      if (!params.protectedRowIds?.has(key)) result.create.push(remote);
      continue;
    }
    if (!params.unchanged(row, remote)) result.update.push({ row, remote });
  }

  if (params.deleteMissing) {
    for (const [key, row] of byKey) {
      if (seen.has(key)) continue;
      if (params.protectedRowIds?.has(key)) continue;
      result.remove.push(row);
    }
  }

  return result;
}
