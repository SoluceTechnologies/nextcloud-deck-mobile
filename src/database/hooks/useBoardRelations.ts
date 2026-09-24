import { Q } from '@nozbe/watermelondb';
import { useEffect, useMemo, useState } from 'react';

import { useDatabase } from '@/database/DatabaseProvider';
import { groupRelations } from '@/database/hooks/groupRelations';
import type CardAssignee from '@/database/models/CardAssignee';
import type CardLabel from '@/database/models/CardLabel';
import type Label from '@/database/models/Label';

export type BoardCardRelations = ReturnType<typeof groupRelations>;

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

  return useMemo(
    () => groupRelations(cardLabels, labels, assignees),
    [cardLabels, labels, assignees],
  );
}
