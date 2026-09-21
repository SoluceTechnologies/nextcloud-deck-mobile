import { Q } from '@nozbe/watermelondb';
import { useEffect, useMemo, useState } from 'react';

import { useDatabase } from '@/database/DatabaseProvider';
import { groupRelations } from '@/database/hooks/groupRelations';
import type CardAssignee from '@/database/models/CardAssignee';
import type CardLabel from '@/database/models/CardLabel';
import type Label from '@/database/models/Label';
import type Stack from '@/database/models/Stack';
import { STACK_OBSERVED_COLUMNS } from '@/database/observedColumns';

export function useAccountStacks(accountId: string | null): Stack[] {
  const database = useDatabase();
  const [stacks, setStacks] = useState<Stack[]>([]);

  useEffect(() => {
    if (!accountId) {
      setStacks([]);
      return;
    }
    const subscription = database
      .get<Stack>('stacks')
      .query(Q.where('account_id', accountId))
      .observeWithColumns(STACK_OBSERVED_COLUMNS)
      .subscribe((rows) => setStacks([...rows].sort((a, b) => a.order - b.order)));
    return () => subscription.unsubscribe();
  }, [accountId, database]);

  return stacks;
}

export function useAccountLabels(accountId: string | null): Label[] {
  const database = useDatabase();
  const [labels, setLabels] = useState<Label[]>([]);

  useEffect(() => {
    if (!accountId) {
      setLabels([]);
      return;
    }
    const subscription = database
      .get<Label>('labels')
      .query(Q.where('account_id', accountId))
      .observeWithColumns(['title', 'color'])
      .subscribe((rows) => setLabels([...rows]));
    return () => subscription.unsubscribe();
  }, [accountId, database]);

  return labels;
}

export function useAccountCardRelations(
  accountId: string | null,
): ReturnType<typeof groupRelations> {
  const database = useDatabase();
  const [cardLabels, setCardLabels] = useState<CardLabel[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [assignees, setAssignees] = useState<CardAssignee[]>([]);

  useEffect(() => {
    if (!accountId) {
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
      .query(Q.where('account_id', accountId))
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
  }, [accountId, database]);

  return useMemo(
    () => groupRelations(cardLabels, labels, assignees),
    [cardLabels, labels, assignees],
  );
}
