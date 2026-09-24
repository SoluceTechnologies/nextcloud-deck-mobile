import type Board from '@/database/models/Board';
import type Card from '@/database/models/Card';

export type BoardSort = 'title' | 'lastModified';

export type BoardSummary = {
  board: Board;
  doneCount: number;
  totalCount: number;
  shared: boolean;
};

export function summarizeBoards(boards: Board[], cards: Card[]): BoardSummary[] {
  const done = new Map<string, number>();
  const total = new Map<string, number>();

  for (const card of cards) {
    if (card.archived) continue;
    total.set(card.boardId, (total.get(card.boardId) ?? 0) + 1);
    if (card.doneAt) done.set(card.boardId, (done.get(card.boardId) ?? 0) + 1);
  }

  return boards.map((board) => ({
    board,
    doneCount: done.get(board.id) ?? 0,
    totalCount: total.get(board.id) ?? 0,
    shared: board.shared,
  }));
}

export function filterBoards(rows: BoardSummary[], query: string): BoardSummary[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return rows;
  return rows.filter((r) => r.board.title.toLocaleLowerCase().includes(needle));
}

export function sortBoards(rows: BoardSummary[], by: BoardSort): BoardSummary[] {
  return [...rows].sort((a, b) =>
    by === 'title'
      ? a.board.title.localeCompare(b.board.title)
      : b.board.lastModified - a.board.lastModified,
  );
}
