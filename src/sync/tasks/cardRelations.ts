import type { Database, Model } from '@nozbe/watermelondb';

import type CardAssignee from '@/database/models/CardAssignee';
import type CardLabel from '@/database/models/CardLabel';
import type { DeckAssignee, DeckCard } from '@/services/deck/types';
import { reconcile } from '@/sync/reconcile';

/** A user and a group can share a name; the type is part of the identity. */
export function assigneeKey(participant: string, assigneeType: number): string {
  return `${participant}|${assigneeType}`;
}

export type BuildCardRelationOpsParams = {
  db: Database;
  accountId: string;
  cardLocalId: string;
  remote: DeckCard;
  /** Board label remote id → local row id, built once per board pass. */
  labelLocalIdByRemote: Map<string, string>;
  labelRows: CardLabel[];
  assigneeRows: CardAssignee[];
};

export function buildCardRelationOps({
  db,
  accountId,
  cardLocalId,
  remote,
  labelLocalIdByRemote,
  labelRows,
  assigneeRows,
}: BuildCardRelationOpsParams): Model[] {
  const cardLabels = db.get<CardLabel>('card_labels');
  const cardAssignees = db.get<CardAssignee>('card_assignees');
  const ops: Model[] = [];

  // A label the board pass has not cached yet cannot be linked; the next pass
  // will pick it up once the label row exists.
  const wantedLabelIds = remote.labels
    .map((l) => labelLocalIdByRemote.get(l.remoteId))
    .filter((id): id is string => id !== undefined);

  const labelPlan = reconcile({
    remote: wantedLabelIds,
    rows: labelRows,
    remoteKey: (id) => id,
    rowKey: (row) => row.labelId,
    unchanged: () => true,
    deleteMissing: true,
  });

  for (const labelId of labelPlan.create) {
    ops.push(
      cardLabels.prepareCreate((r: CardLabel) => {
        r.accountId = accountId;
        r.cardId = cardLocalId;
        r.labelId = labelId;
      }),
    );
  }
  for (const row of labelPlan.remove) ops.push(row.prepareMarkAsDeleted());

  const assigneePlan = reconcile({
    remote: remote.assignees,
    rows: assigneeRows,
    remoteKey: (a: DeckAssignee) => assigneeKey(a.participant, a.assigneeType),
    rowKey: (row) => assigneeKey(row.participant, row.assigneeType),
    unchanged: (row, a) => row.displayName === a.displayName,
    deleteMissing: true,
  });

  for (const a of assigneePlan.create) {
    ops.push(
      cardAssignees.prepareCreate((r: CardAssignee) => {
        r.accountId = accountId;
        r.cardId = cardLocalId;
        r.participant = a.participant;
        r.assigneeType = a.assigneeType;
        r.displayName = a.displayName;
      }),
    );
  }
  for (const { row, remote: a } of assigneePlan.update) {
    ops.push(row.prepareUpdate((r: CardAssignee) => (r.displayName = a.displayName)));
  }
  for (const row of assigneePlan.remove) ops.push(row.prepareMarkAsDeleted());

  return ops;
}
