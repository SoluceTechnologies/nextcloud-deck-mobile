import { Q } from '@nozbe/watermelondb';
import { useMemo } from 'react';

import { useDatabase } from '@/database/DatabaseProvider';
import type Board from '@/database/models/Board';
import type Card from '@/database/models/Card';
import type OutboxEntry from '@/database/models/OutboxEntry';
import type Stack from '@/database/models/Stack';
import { mutate, OUTBOX_QUEUED } from '@/sync/outbox/enqueue';

export type StackActions = {
  create(title: string): Promise<void>;
  rename(stack: Stack, title: string): Promise<void>;
  move(stack: Stack, toIndex: number): Promise<void>;
  remove(stack: Stack): Promise<void>;
};

export function useStackActions(accountId: string | null, boardLocalId: string | null): StackActions {
  const db = useDatabase();

  return useMemo<StackActions>(() => {
    const create: StackActions['create'] = async (title) => {
      if (!accountId || !boardLocalId) return;

      const siblings = await db
        .get<Stack>('stacks')
        .query(Q.where('account_id', accountId), Q.where('board_id', boardLocalId))
        .fetch();
      const order = siblings.reduce((max, row) => Math.max(max, row.order), -1) + 1;

      const row = db.get<Stack>('stacks').prepareCreate((r) => {
        r.accountId = accountId;
        r.boardId = boardLocalId;
        r.remoteId = '';
        r.title = title;
        r.order = order;
        r.lastModified = 0;
      });

      await mutate({
        db,
        accountId,
        intent: { kind: 'createStack', stackId: row.id },
        applyLocal: () => row,
      });
    };

    const rename: StackActions['rename'] = async (stack, title) => {
      if (!accountId) return;
      await mutate({
        db,
        accountId,
        intent: { kind: 'updateStack', stackId: stack.id, title, order: stack.order },
        applyLocal: () =>
          stack.prepareUpdate((r: Stack) => {
            r.title = title;
          }),
      });
    };

    const move: StackActions['move'] = async (stack, toIndex) => {
      if (!accountId || !boardLocalId) return;

      const siblings = (
        await db
          .get<Stack>('stacks')
          .query(Q.where('account_id', accountId), Q.where('board_id', boardLocalId))
          .fetch()
      ).sort((a, b) => a.order - b.order);
      const from = siblings.findIndex((row) => row.id === stack.id);
      if (from === -1 || from === toIndex) return;

      const [moved] = siblings.splice(from, 1);
      siblings.splice(toIndex, 0, moved);
      const changed = siblings
        .map((row, order) => ({ row, order }))
        .filter(({ row, order }) => row.order !== order);

      for (const [i, { row, order }] of changed.entries()) {
        await mutate({
          db,
          accountId,
          intent: { kind: 'updateStack', stackId: row.id, title: row.title, order },
          applyLocal: () =>
            i > 0
              ? []
              : changed.map((c) =>
                  c.row.prepareUpdate((r: Stack) => {
                    r.order = c.order;
                  }),
                ),
        });
      }
    };

    const remove: StackActions['remove'] = async (stack) => {
      if (!accountId) return;

      const board = await db.get<Board>('boards').find(stack.boardId);

      await mutate({
        db,
        accountId,
        intent: {
          kind: 'deleteStack',
          stackId: stack.id,
          boardRemoteId: board.remoteId,
          stackRemoteId: stack.remoteId,
        },
        applyLocal: async () => {
          const cards = await db
            .get<Card>('cards')
            .query(Q.where('account_id', accountId), Q.where('stack_id', stack.id))
            .fetch();
          const cardIds = cards.map((r) => r.id);
          const cardIntents =
            cardIds.length === 0
              ? []
              : await db
                  .get<OutboxEntry>('outbox')
                  .query(
                    Q.where('account_id', accountId),
                    Q.where('state', OUTBOX_QUEUED),
                    Q.where('entity_id', Q.oneOf(cardIds)),
                  )
                  .fetch();
          return [
            stack.prepareMarkAsDeleted(),
            ...cards.map((r) => r.prepareMarkAsDeleted()),
            ...cardIntents.map((r) => r.prepareDestroyPermanently()),
          ];
        },
      });
    };

    return { create, rename, move, remove };
  }, [db, accountId, boardLocalId]);
}
