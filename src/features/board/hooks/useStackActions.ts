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
  remove(stack: Stack): Promise<void>;
};

/**
 * Every stack (list) write the board view needs, in one place, mirroring
 * useCardActions/useBoardActions. Each action is a no-op without an account or a
 * board — there is nowhere to file the intent, and enqueuing one anyway would
 * orphan it.
 */
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

      // Synchronous: WatermelonDB assigns the row's id before prepareCreate returns,
      // which is why the intent below can carry it immediately.
      const row = db.get<Stack>('stacks').prepareCreate((r) => {
        r.accountId = accountId;
        r.boardId = boardLocalId;
        r.remoteId = ''; // Findable offline, before the server has assigned one.
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

    const remove: StackActions['remove'] = async (stack) => {
      if (!accountId) return;

      // The local row is about to be destroyed, so the delete intent must carry the
      // board's remote id itself — read before mutate, since prepareMarkAsDeleted is
      // the only call that may run inside applyLocal.
      const board = await db.get<Board>('boards').find(stack.boardId);

      await mutate({
        db,
        accountId,
        // Enqueued even when remoteId is '' (never synced) — coalescing collapses
        // a create+delete pair for a row that never reached the server.
        intent: {
          kind: 'deleteStack',
          stackId: stack.id,
          boardRemoteId: board.remoteId,
          stackRemoteId: stack.remoteId,
        },
        // The stack's cards go with it in the same batch, or they would linger as
        // rows pointing at a destroyed stack — surfacing in Today and Search
        // (both filter orphans by board, not stack) with a blank stack name,
        // and inflating the board's done/total count — until a sync noticed.
        // Mirrors useBoardActions.remove one scope down. A card already moved
        // to another stack is not among them and keeps its intents.
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

    return { create, rename, remove };
  }, [db, accountId, boardLocalId]);
}
