import type { CardFieldName } from '@/database/writers';

/** Remote coordinates kept in the payload when the local row will be destroyed. */
export type CardRemoteRef = {
  boardRemoteId: string;
  stackRemoteId: string;
  cardRemoteId: string;
};

export type Intent =
  | { kind: 'createCard'; cardId: string }
  | {
      kind: 'patchCard';
      cardId: string;
      fields: CardFieldName[];
      /** Values as the server last reported them, captured at enqueue time. */
      base: Record<string, unknown>;
    }
  | { kind: 'moveCard'; cardId: string; toStackId: string; order: number }
  | { kind: 'setCardArchived'; cardId: string; archived: boolean }
  | { kind: 'deleteCard'; cardId: string; ref: CardRemoteRef }
  | { kind: 'cloneCard'; cardId: string; cardRemoteId: string }
  | { kind: 'assignLabel'; cardId: string; labelId: string }
  | { kind: 'removeLabel'; cardId: string; labelId: string }
  | { kind: 'assignUser'; cardId: string; participant: string; assigneeType: number }
  | { kind: 'unassignUser'; cardId: string; participant: string; assigneeType: number }
  | { kind: 'addDependency'; cardId: string; dependentCardRemoteId: string }
  | { kind: 'removeDependency'; cardId: string; dependentCardRemoteId: string }
  | { kind: 'createLabel'; labelId: string; boardId: string }
  | { kind: 'createStack'; stackId: string }
  | { kind: 'updateStack'; stackId: string; title: string; order: number }
  | { kind: 'deleteStack'; stackId: string; boardRemoteId: string; stackRemoteId: string }
  | { kind: 'createBoard'; boardId: string }
  | {
      kind: 'updateBoard';
      boardId: string;
      title: string;
      color: string | null;
      archived: boolean;
    };

export type IntentKind = Intent['kind'];
