import { Q } from '@nozbe/watermelondb';
import { useEffect, useMemo, useState } from 'react';

import { useDatabase } from '@/database/DatabaseProvider';
import type CardAssignee from '@/database/models/CardAssignee';
import type CardLabel from '@/database/models/CardLabel';
import type Label from '@/database/models/Label';

export function useBoardLabels(accountId: string | null, boardLocalId: string | null): Label[] {
  const database = useDatabase();
  const [labels, setLabels] = useState<Label[]>([]);

  useEffect(() => {
    if (!accountId || !boardLocalId) {
      setLabels([]);
      return;
    }
    const subscription = database
      .get<Label>('labels')
      .query(Q.where('account_id', accountId), Q.where('board_id', boardLocalId))
      .observeWithColumns(['title', 'color'])
      .subscribe((rows) => setLabels([...rows].sort((a, b) => a.title.localeCompare(b.title))));
    return () => subscription.unsubscribe();
  }, [accountId, boardLocalId, database]);

  return labels;
}

export function useCardLabels(accountId: string | null, cardLocalId: string | null): Label[] {
  const database = useDatabase();
  const [cardLabels, setCardLabels] = useState<CardLabel[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);

  useEffect(() => {
    if (!accountId || !cardLocalId) {
      setCardLabels([]);
      setLabels([]);
      return;
    }

    const cardLabelsSub = database
      .get<CardLabel>('card_labels')
      .query(Q.where('account_id', accountId), Q.where('card_id', cardLocalId))
      .observeWithColumns(['label_id'])
      .subscribe((rows) => setCardLabels([...rows]));

    const labelsSub = database
      .get<Label>('labels')
      .query(Q.where('account_id', accountId))
      .observeWithColumns(['title', 'color'])
      .subscribe((rows) => setLabels([...rows]));

    return () => {
      cardLabelsSub.unsubscribe();
      labelsSub.unsubscribe();
    };
  }, [accountId, cardLocalId, database]);

  return useMemo(() => {
    const labelById = new Map(labels.map((label) => [label.id, label]));
    const joined: Label[] = [];
    for (const join of cardLabels) {
      const label = labelById.get(join.labelId);
      if (label) joined.push(label);
    }
    return joined;
  }, [cardLabels, labels]);
}

export function useCardAssignees(accountId: string | null, cardLocalId: string | null): CardAssignee[] {
  const database = useDatabase();
  const [assignees, setAssignees] = useState<CardAssignee[]>([]);

  useEffect(() => {
    if (!accountId || !cardLocalId) {
      setAssignees([]);
      return;
    }
    const subscription = database
      .get<CardAssignee>('card_assignees')
      .query(Q.where('account_id', accountId), Q.where('card_id', cardLocalId))
      .observeWithColumns(['participant', 'assignee_type', 'display_name'])
      .subscribe((rows) => setAssignees([...rows]));
    return () => subscription.unsubscribe();
  }, [accountId, cardLocalId, database]);

  return assignees;
}
