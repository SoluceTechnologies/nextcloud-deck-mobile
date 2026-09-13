import { Q } from '@nozbe/watermelondb';
import { useMemo } from 'react';

import { useDatabase } from '@/database/DatabaseProvider';
import type Board from '@/database/models/Board';
import type Card from '@/database/models/Card';
import type Label from '@/database/models/Label';
import type OutboxEntry from '@/database/models/OutboxEntry';
import type Stack from '@/database/models/Stack';
import { mutate, OUTBOX_QUEUED } from '@/sync/outbox/enqueue';

export type BoardActions = {
  create(input: { title: string; color: string | null }): Promise<void>;
  update(board: Board, changes: { title?: string; color?: string | null }): Promise<void>;
  rename(board: Board, title: string): Promise<void>;
  recolor(board: Board, color: string | null): Promise<void>;
  setArchived(board: Board, archived: boolean): Promise<void>;
  remove(board: Board): Promise<void>;
};

/**
 * Every board write the Boards tab needs, in one place, so screens stay declarative
 * and every mutation goes through the outbox the same way. Each action is a no-op
 * without an account — there is nowhere to file the intent, and enqueuing one anyway
 * would orphan it.
 */
export function useBoardActions(accountId: string | null): BoardActions {
  const db = useDatabase();

  return useMemo<BoardActions>(() => {
    const create: BoardActions['create'] = async ({ title, color }) => {
      if (!accountId) return;

      // Synchronous: WatermelonDB assigns the row's id before prepareCreate returns,
      // which is why the intent below can carry it immediately.
      const row = db.get<Board>('boards').prepareCreate((r) => {
        r.accountId = accountId;
        r.remoteId = ''; // Findable offline, before the server has assigned one.
        r.title = title;
        r.color = color ?? undefined;
        r.archived = false;
        r.owner = '';
        r.shared = false;
        r.canEdit = true;
        r.canManage = true;
        r.canShare = true;
        r.lastModified = Date.now();
        r.aclJson = '[]';
        r.usersJson = '[]';
      });

      await mutate({
        db,
        accountId,
        intent: { kind: 'createBoard', boardId: row.id },
        applyLocal: () => row,
      });
    };

    // Rename and recolour go through here together so a submit that changes both fields
    // enqueues one updateBoard intent instead of two independent, un-sequenced ones — two
    // intents built from stale sibling-field snapshots can race and silently drop one edit.
    const update: BoardActions['update'] = async (board, changes) => {
      if (!accountId) return;
      await mutate({
        db,
        accountId,
        intent: {
          kind: 'updateBoard',
          boardId: board.id,
          title: changes.title ?? board.title,
          color: changes.color !== undefined ? changes.color : (board.color ?? null),
          archived: board.archived,
        },
        applyLocal: () =>
          board.prepareUpdate((r) => {
            if (changes.title !== undefined) r.title = changes.title;
            if (changes.color !== undefined) r.color = changes.color ?? undefined;
          }),
      });
    };

    const rename: BoardActions['rename'] = (board, title) => update(board, { title });
    const recolor: BoardActions['recolor'] = (board, color) => update(board, { color });

    const setArchived: BoardActions['setArchived'] = async (board, archived) => {
      if (!accountId) return;
      await mutate({
        db,
        accountId,
        intent: {
          kind: 'updateBoard',
          boardId: board.id,
          title: board.title,
          color: board.color ?? null,
          archived,
        },
        applyLocal: () =>
          board.prepareUpdate((r) => {
            r.archived = archived;
          }),
      });
    };

    const remove: BoardActions['remove'] = async (board) => {
      if (!accountId) return;
      await mutate({
        db,
        accountId,
        // Enqueued even when remoteId is '' (never synced) — coalescing collapses
        // a create+delete pair for a row that never reached the server.
        intent: { kind: 'deleteBoard', boardId: board.id, boardRemoteId: board.remoteId },
        // The board's stacks, cards and labels go with it in the same batch, or
        // they would linger as orphans (the dependencies picker, fed by the
        // account-wide card list, still offering its cards) until a sync
        // noticed. Card join rows (card_labels, card_assignees) are left alone:
        // keyed by card id, they display nothing once the card row is gone, and
        // the sync path owns their cleanup.
        applyLocal: async () => {
          const scope = [Q.where('account_id', accountId), Q.where('board_id', board.id)];
          const [stacks, cards, labels] = await Promise.all([
            db.get<Stack>('stacks').query(...scope).fetch(),
            db.get<Card>('cards').query(...scope).fetch(),
            db.get<Label>('labels').query(...scope).fetch(),
          ]);
          // Every intent on a board's children is moot once the board's own
          // delete goes out — and a queued create's write-back on a row this
          // batch soft-deletes would throw, a failure the drain counts as
          // transient, wedging the account's queue for every backoff round. A
          // card already moved to another board is not among the children and
          // keeps its intents.
          const childIds = [...stacks, ...cards, ...labels].map((r) => r.id);
          const childIntents =
            childIds.length === 0
              ? []
              : await db
                  .get<OutboxEntry>('outbox')
                  .query(
                    Q.where('account_id', accountId),
                    Q.where('state', OUTBOX_QUEUED),
                    Q.where('entity_id', Q.oneOf(childIds)),
                  )
                  .fetch();
          return [
            board.prepareMarkAsDeleted(),
            ...stacks.map((r) => r.prepareMarkAsDeleted()),
            ...cards.map((r) => r.prepareMarkAsDeleted()),
            ...labels.map((r) => r.prepareMarkAsDeleted()),
            ...childIntents.map((r) => r.prepareDestroyPermanently()),
          ];
        },
      });
    };

    return { create, update, rename, recolor, setArchived, remove };
  }, [db, accountId]);
}
