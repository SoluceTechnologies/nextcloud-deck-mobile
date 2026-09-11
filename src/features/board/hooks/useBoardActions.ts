import { useMemo } from 'react';

import { useDatabase } from '@/database/DatabaseProvider';
import type Board from '@/database/models/Board';
import { mutate } from '@/sync/outbox/enqueue';

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
        applyLocal: () => board.prepareMarkAsDeleted(),
      });
    };

    return { create, update, rename, recolor, setArchived, remove };
  }, [db, accountId]);
}
