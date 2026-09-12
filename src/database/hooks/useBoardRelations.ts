import { Q } from '@nozbe/watermelondb';
import { useEffect, useMemo, useState } from 'react';

import { useDatabase } from '@/database/DatabaseProvider';
import type CardAssignee from '@/database/models/CardAssignee';
import type CardLabel from '@/database/models/CardLabel';
import type Label from '@/database/models/Label';

export type BoardCardRelations = {
  labelsByCard: Map<string, Label[]>;
  assigneesByCard: Map<string, CardAssignee[]>;
};

/**
 * One observation per table for the whole board — never one per card, which
 * would open two subscriptions per tile (a 200-card board would open 400).
 * `card_labels`/`card_assignees` carry no board_id, so they're observed on
 * account_id alone and grouped in memory here; a join whose label isn't in
 * the board-scoped `labels` query (i.e. belongs to another board) is simply
 * dropped, which is what keeps labelsByCard scoped to this board despite the
 * account-wide card_labels query. See spec §10.
 */
export function useBoardCardRelations(
  accountId: string | null,
  boardLocalId: string | null,
): BoardCardRelations {
  const database = useDatabase();
  const [cardLabels, setCardLabels] = useState<CardLabel[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [assignees, setAssignees] = useState<CardAssignee[]>([]);

  useEffect(() => {
    if (!accountId || !boardLocalId) {
      setCardLabels([]);
      setLabels([]);
      setAssignees([]);
      return;
    }

    const cardLabelsSub = database
      .get<CardLabel>('card_labels')
      .query(Q.where('account_id', accountId))
      .observeWithColumns(['card_id', 'label_id'])
      .subscribe((rows) => setCardLabels([...rows]));

    const labelsSub = database
      .get<Label>('labels')
      .query(Q.where('account_id', accountId), Q.where('board_id', boardLocalId))
      .observeWithColumns(['title', 'color'])
      .subscribe((rows) => setLabels([...rows]));

    const assigneesSub = database
      .get<CardAssignee>('card_assignees')
      .query(Q.where('account_id', accountId))
      .observeWithColumns(['card_id', 'participant', 'assignee_type', 'display_name'])
      .subscribe((rows) => setAssignees([...rows]));

    return () => {
      cardLabelsSub.unsubscribe();
      labelsSub.unsubscribe();
      assigneesSub.unsubscribe();
    };
  }, [accountId, boardLocalId, database]);

  const labelsByCard = useMemo(() => {
    const labelById = new Map(labels.map((label) => [label.id, label]));
    const map = new Map<string, Label[]>();
    for (const join of cardLabels) {
      const label = labelById.get(join.labelId);
      if (!label) continue;
      const list = map.get(join.cardId);
      if (list) list.push(label);
      else map.set(join.cardId, [label]);
    }
    return map;
  }, [cardLabels, labels]);

  const assigneesByCard = useMemo(() => {
    const map = new Map<string, CardAssignee[]>();
    for (const assignee of assignees) {
      const list = map.get(assignee.cardId);
      if (list) list.push(assignee);
      else map.set(assignee.cardId, [assignee]);
    }
    return map;
  }, [assignees]);

  return { labelsByCard, assigneesByCard };
}
