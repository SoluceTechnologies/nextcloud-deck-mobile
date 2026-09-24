import { useMemo } from 'react';

import { useAccountCardRelations, useAccountStacks } from '@/database/hooks/useAccountRelations';
import { useAccountCards, useBoards } from '@/database/hooks/useBoards';
import type Board from '@/database/models/Board';

import { matchesBoardTitle, matchesQuery } from './matchCard';
import type { SearchableCard } from './matchCard';
import { isEmptyQuery, parseQuery } from './parseQuery';
import type { SearchQuery } from './parseQuery';

export type LocalSearchGroup = { boardId: string; boardTitle: string; cards: SearchableCard[] };
export type LocalSearchResult = {
  query: SearchQuery;
  isEmpty: boolean;
  groups: LocalSearchGroup[];
  boards: Board[];
  remoteIds: Set<string>;
};

export function useLocalSearch(accountId: string | null, input: string): LocalSearchResult {
  const query = useMemo(() => parseQuery(input), [input]);
  const isEmpty = isEmptyQuery(query);

  const boards = useBoards(accountId);
  const cards = useAccountCards(accountId);
  const stacks = useAccountStacks(accountId);
  const { labelsByCard, assigneesByCard } = useAccountCardRelations(accountId);

  const remoteIds = useMemo(() => new Set(cards.map((c) => c.remoteId)), [cards]);

  const searchableCards = useMemo(() => {
    const boardTitleById = new Map(boards.map((b) => [b.id, b.title]));
    const stackTitleById = new Map(stacks.map((s) => [s.id, s.title]));
    const result: SearchableCard[] = [];
    for (const card of cards) {
      if (card.archived) continue;
      const boardTitle = boardTitleById.get(card.boardId);
      if (boardTitle === undefined) continue; // archived board, not in useBoards
      const labels = (labelsByCard.get(card.id) ?? []).map((l) => l.title);
      const assignees = (assigneesByCard.get(card.id) ?? []).flatMap((a) => [a.displayName, a.participant]);
      result.push({
        id: card.id,
        boardId: card.boardId,
        title: card.title,
        description: card.description,
        duedate: card.duedate ?? null,
        stackTitle: stackTitleById.get(card.stackId) ?? '',
        boardTitle,
        labels,
        assignees,
      });
    }
    return result;
  }, [cards, boards, stacks, labelsByCard, assigneesByCard]);

  const groups = useMemo<LocalSearchGroup[]>(() => {
    if (isEmpty) return [];
    const now = Date.now();
    const byBoard = new Map<string, LocalSearchGroup>();
    for (const card of searchableCards) {
      if (!matchesQuery(card, query, now)) continue;
      let group = byBoard.get(card.boardId);
      if (!group) {
        group = { boardId: card.boardId, boardTitle: card.boardTitle, cards: [] };
        byBoard.set(card.boardId, group);
      }
      group.cards.push(card);
    }
    const result = [...byBoard.values()].sort((a, b) => a.boardTitle.localeCompare(b.boardTitle));
    for (const group of result) group.cards.sort((a, b) => a.title.localeCompare(b.title));
    return result;
  }, [searchableCards, query, isEmpty]);

  const matchingBoards = useMemo(
    () => boards.filter((b) => matchesBoardTitle(b.title, query)),
    [boards, query],
  );

  return { query, isEmpty, groups, boards: matchingBoards, remoteIds };
}
