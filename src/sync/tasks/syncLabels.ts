import type { Database } from '@nozbe/watermelondb';

import type Label from '@/database/models/Label';
import type { DeckLabel } from '@/services/deck/types';
import { reconcile } from '@/sync/reconcile';

export function labelUnchanged(row: Label, remote: DeckLabel): boolean {
  return row.title === remote.title && (row.color ?? null) === remote.color;
}

function writeLabelRow(
  row: Label,
  remote: DeckLabel,
  ctx: { accountId: string; boardLocalId: string },
): void {
  row.accountId = ctx.accountId;
  row.boardId = ctx.boardLocalId;
  row.remoteId = remote.remoteId;
  row.title = remote.title;
  row.color = remote.color ?? undefined;
}

export type BuildLabelOpsParams = {
  db: Database;
  accountId: string;
  boardLocalId: string;
  remote: DeckLabel[];
  rows: Label[];
};

/**
 * Labels always arrive as the board's complete set, so the pass is always
 * authoritative — a label missing from the payload really was deleted.
 */
export function buildLabelOps({
  db,
  accountId,
  boardLocalId,
  remote,
  rows,
}: BuildLabelOpsParams): unknown[] {
  const labels = db.get<Label>('labels');
  const ctx = { accountId, boardLocalId };

  // Filter out labels awaiting their first push: they carry remoteId = '' until the create
  // flushes to the server, but they cannot match any remote label and are already protected
  // by the outbox. Passing them to reconcile would risk marking them deleted if another
  // offline label collides on that empty key.
  const synced = rows.filter((r) => r.remoteId);

  const plan = reconcile({
    remote,
    rows: synced,
    remoteKey: (l) => l.remoteId,
    rowKey: (r) => r.remoteId,
    unchanged: labelUnchanged,
    deleteMissing: true,
  });

  return [
    ...plan.create.map((l) => labels.prepareCreate((r: Label) => writeLabelRow(r, l, ctx))),
    ...plan.update.map(({ row, remote: l }) =>
      row.prepareUpdate((r: Label) => writeLabelRow(r, l, ctx)),
    ),
    ...plan.remove.map((row) => row.prepareMarkAsDeleted()),
  ];
}
