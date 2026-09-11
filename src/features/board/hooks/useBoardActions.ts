import { useMemo } from 'react';

import { useDatabase } from '@/database/DatabaseProvider';
import type Board from '@/database/models/Board';
import { mutate } from '@/sync/outbox/enqueue';

export type BoardActions = {
  create(input: { title: string; color: string | null }): Promise<void>;
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

    const rename: BoardActions['rename'] = async (board, title) => {
      if (!accountId) return;
      await mutate({
        db,
        accountId,
        intent: {
          kind: 'updateBoard',
          boardId: board.id,
          title,
          color: board.color ?? null,
          archived: board.archived,
        },
        applyLocal: () =>
          board.prepareUpdate((r) => {
            r.title = title;
          }),
      });
    };

    const recolor: BoardActions['recolor'] = async (board, color) => {
      if (!accountId) return;
      await mutate({
        db,
        accountId,
        intent: {
          kind: 'updateBoard',
          boardId: board.id,
          title: board.title,
          color,
          archived: board.archived,
        },
        applyLocal: () =>
          board.prepareUpdate((r) => {
            r.color = color ?? undefined;
          }),
      });
    };

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

    return { create, rename, recolor, setArchived, remove };
  }, [db, accountId]);
}
