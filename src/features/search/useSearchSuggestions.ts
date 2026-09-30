import { useMemo } from 'react';

import { useAccountCardRelations, useAccountLabels, useAccountStacks } from '@/database/hooks/useAccountRelations';
import { useBoards } from '@/database/hooks/useBoards';

import type { SuggestionData } from './suggestions';

export function useSearchSuggestions(accountId: string | null): SuggestionData {
  const boards = useBoards(accountId);
  const labels = useAccountLabels(accountId);
  const stacks = useAccountStacks(accountId);
  const { assigneesByCard } = useAccountCardRelations(accountId);

  return useMemo(
    () => ({
      boards: boards.map((board) => ({ id: board.id, title: board.title, color: board.color })),
      labels: labels.map((label) => ({ boardId: label.boardId, title: label.title, color: label.color })),
      stacks: stacks.map((stack) => ({ boardId: stack.boardId, title: stack.title })),
      people: [...assigneesByCard.values()]
        .flat()
        .map((assignee) => ({ participant: assignee.participant, displayName: assignee.displayName })),
    }),
    [boards, labels, stacks, assigneesByCard],
  );
}
