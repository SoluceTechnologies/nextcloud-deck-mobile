import type CardAssignee from '@/database/models/CardAssignee';
import type CardLabel from '@/database/models/CardLabel';
import type Label from '@/database/models/Label';

/**
 * Groups card_labels/card_assignees join rows by card id. A join whose label
 * row isn't in the caller's `labels` set — not yet synced, or (for a board-
 * scoped caller observing account-wide joins) belonging to another board —
 * is dropped rather than rendered as a blank chip. Extracted out of
 * useBoardCardRelations so the account-wide hooks can share the same
 * grouping. See spec §10.
 */
export function groupRelations(
  cardLabels: CardLabel[],
  labels: Label[],
  assignees: CardAssignee[],
): { labelsByCard: Map<string, Label[]>; assigneesByCard: Map<string, CardAssignee[]> } {
  const labelById = new Map(labels.map((label) => [label.id, label]));
  const labelsByCard = new Map<string, Label[]>();
  for (const join of cardLabels) {
    const label = labelById.get(join.labelId);
    if (!label) continue;
    const list = labelsByCard.get(join.cardId);
    if (list) list.push(label);
    else labelsByCard.set(join.cardId, [label]);
  }

  const assigneesByCard = new Map<string, CardAssignee[]>();
  for (const assignee of assignees) {
    const list = assigneesByCard.get(assignee.cardId);
    if (list) list.push(assignee);
    else assigneesByCard.set(assignee.cardId, [assignee]);
  }

  return { labelsByCard, assigneesByCard };
}
