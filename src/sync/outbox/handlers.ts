import { Q, type Database } from '@nozbe/watermelondb';

import type Board from '@/database/models/Board';
import type Card from '@/database/models/Card';
import type Comment from '@/database/models/Comment';
import type Label from '@/database/models/Label';
import type Stack from '@/database/models/Stack';
import { safeWrite } from '@/database/utils/safeTransaction';
import { writeCardRow } from '@/database/writers';
import {
  createBoard,
  createStack,
  deleteBoard,
  deleteStack,
  updateBoard,
  updateStack,
} from '@/services/deck/boards';
import { deleteComment, postComment, updateComment } from '@/services/deck/comments';
import {
  addDependentCard,
  assignLabelToCard,
  assignUserToCard,
  cloneCard,
  createCard,
  createLabel,
  deleteCard,
  removeDependentCard,
  removeLabelFromCard,
  reorderCard,
  setCardArchived,
  unassignUserFromCard,
  updateCard,
  type CardRef,
  type CardWriteState,
} from '@/services/deck/cards';
import type { Account } from '@/types';

import type { Intent } from './types';

export type HandlerContext = { db: Database; account: Account };

export class DeferredIntentError extends Error {
  constructor(what: string) {
    super(`Deferred: ${what} has no remote id yet`);
    this.name = 'DeferredIntentError';
  }
}

async function requireRemoteId(row: { remoteId: string }, what: string): Promise<string> {
  if (!row.remoteId) throw new DeferredIntentError(what);
  return row.remoteId;
}

export async function cardRefOf(
  ctx: HandlerContext,
  cardLocalId: string,
): Promise<{ ref: CardRef; card: Card }> {
  const card = await ctx.db.get<Card>('cards').find(cardLocalId);
  const stack = await ctx.db.get<Stack>('stacks').find(card.stackId);
  const board = await ctx.db.get<Board>('boards').find(card.boardId);

  return {
    card,
    ref: {
      boardRemoteId: await requireRemoteId(board, 'board'),
      stackRemoteId: await requireRemoteId(stack, 'stack'),
      cardRemoteId: await requireRemoteId(card, 'card'),
    },
  };
}

function writeStateOf(card: Card, serverOverrides: Record<string, unknown>): CardWriteState {
  const state: Record<string, unknown> = {
    title: card.title,
    description: card.description,
    type: card.type,
    owner: card.owner,
    order: card.order,
    duedate: card.duedate ?? null,
    startdate: card.startdate ?? null,
    doneAt: card.doneAt ?? null,
    color: card.color ?? null,
    archived: card.archived,
  };

  for (const field of Object.keys(state)) {
    if (field in serverOverrides) state[field] = serverOverrides[field];
  }

  return state as CardWriteState;
}

export async function executeIntent(
  ctx: HandlerContext,
  intent: Intent,
  serverOverrides: Record<string, unknown> = {},
): Promise<void> {
  const { db, account } = ctx;

  switch (intent.kind) {
    case 'createCard': {
      const card = await db.get<Card>('cards').find(intent.cardId);
      const stack = await db.get<Stack>('stacks').find(card.stackId);
      const board = await db.get<Board>('boards').find(card.boardId);

      const created = await createCard(
        account,
        {
          boardRemoteId: await requireRemoteId(board, 'board'),
          stackRemoteId: await requireRemoteId(stack, 'stack'),
        },
        {
          title: card.title,
          description: card.description,
          order: card.order,
          duedate: card.duedate ?? null,
          startdate: card.startdate ?? null,
        },
      );

      await safeWrite(
        db,
        () =>
          card.update((r: Card) => {
            r.remoteId = created.remoteId;
            r.lastModified = created.lastModified;
            r.pending = false;
          }),
        10000,
        'createCard:writeback',
      );
      return;
    }

    case 'patchCard': {
      const { ref, card } = await cardRefOf(ctx, intent.cardId);
      await updateCard(account, ref, writeStateOf(card, serverOverrides));
      return;
    }

    case 'moveCard': {
      const { ref } = await cardRefOf(ctx, intent.cardId);
      const target = await db.get<Stack>('stacks').find(intent.toStackId);
      await reorderCard(account, ref, {
        order: intent.order,
        toStackRemoteId: await requireRemoteId(target, 'destination stack'),
      });
      return;
    }

    case 'setCardArchived': {
      const { ref } = await cardRefOf(ctx, intent.cardId);
      await setCardArchived(account, ref, intent.archived);
      return;
    }

    case 'deleteCard':
      await deleteCard(account, intent.ref);
      return;

    case 'cloneCard': {
      if (!intent.toStackId) {
        await cloneCard(account, intent.cardRemoteId);
        return;
      }
      const stack = await db.get<Stack>('stacks').find(intent.toStackId);
      const board = await db.get<Board>('boards').find(stack.boardId);
      const created = await cloneCard(account, intent.cardRemoteId, {
        boardRemoteId: await requireRemoteId(board, 'board'),
        stackRemoteId: await requireRemoteId(stack, 'stack'),
      });
      await safeWrite(
        db,
        async () => {
          const cards = db.get<Card>('cards');
          const existing = await cards
            .query(Q.where('account_id', account.id), Q.where('remote_id', created.remoteId))
            .fetch();
          if (existing.length > 0) return;
          await cards.create((r: Card) =>
            writeCardRow(r, created, { accountId: account.id, boardLocalId: board.id, stackLocalId: stack.id }),
          );
        },
        10000,
        'cloneCard:writeback',
      );
      return;
    }

    case 'assignLabel':
    case 'removeLabel': {
      const { ref } = await cardRefOf(ctx, intent.cardId);
      const label = await db.get<Label>('labels').find(intent.labelId);
      const labelRemoteId = await requireRemoteId(label, 'label');
      if (intent.kind === 'assignLabel') await assignLabelToCard(account, ref, labelRemoteId);
      else await removeLabelFromCard(account, ref, labelRemoteId);
      return;
    }

    case 'assignUser':
    case 'unassignUser': {
      const { ref } = await cardRefOf(ctx, intent.cardId);
      const payload = { participant: intent.participant, assigneeType: intent.assigneeType };
      if (intent.kind === 'assignUser') await assignUserToCard(account, ref, payload);
      else await unassignUserFromCard(account, ref, payload);
      return;
    }

    case 'addDependency':
    case 'removeDependency': {
      const { ref } = await cardRefOf(ctx, intent.cardId);
      if (intent.kind === 'addDependency') {
        await addDependentCard(account, ref.cardRemoteId, intent.dependentCardRemoteId);
      } else {
        await removeDependentCard(account, ref.cardRemoteId, intent.dependentCardRemoteId);
      }
      return;
    }

    case 'createLabel': {
      const label = await db.get<Label>('labels').find(intent.labelId);
      const board = await db.get<Board>('boards').find(intent.boardId);
      const created = await createLabel(account, await requireRemoteId(board, 'board'), {
        title: label.title,
        color: label.color ?? null,
      });
      await safeWrite(
        db,
        () => label.update((r: Label) => (r.remoteId = created.remoteId)),
        10000,
        'createLabel:writeback',
      );
      return;
    }

    case 'createStack': {
      const stack = await db.get<Stack>('stacks').find(intent.stackId);
      const board = await db.get<Board>('boards').find(stack.boardId);
      const created = await createStack(account, await requireRemoteId(board, 'board'), {
        title: stack.title,
        order: stack.order,
      });
      await safeWrite(
        db,
        () =>
          stack.update((r: Stack) => {
            r.remoteId = created.remoteId;
            r.lastModified = created.lastModified;
          }),
        10000,
        'createStack:writeback',
      );
      return;
    }

    case 'updateStack': {
      const stack = await db.get<Stack>('stacks').find(intent.stackId);
      const board = await db.get<Board>('boards').find(stack.boardId);
      await updateStack(
        account,
        await requireRemoteId(board, 'board'),
        await requireRemoteId(stack, 'stack'),
        { title: intent.title, order: intent.order },
      );
      return;
    }

    case 'deleteStack':
      await deleteStack(account, intent.boardRemoteId, intent.stackRemoteId);
      return;

    case 'createBoard': {
      const board = await db.get<Board>('boards').find(intent.boardId);
      const created = await createBoard(account, { title: board.title, color: board.color ?? null });
      await safeWrite(
        db,
        () =>
          board.update((r: Board) => {
            r.remoteId = created.remoteId;
            r.lastModified = created.lastModified;
          }),
        10000,
        'createBoard:writeback',
      );
      return;
    }

    case 'updateBoard': {
      const board = await db.get<Board>('boards').find(intent.boardId);
      await updateBoard(account, await requireRemoteId(board, 'board'), {
        title: intent.title,
        color: intent.color,
        archived: intent.archived,
      });
      return;
    }

    case 'deleteBoard':
      await deleteBoard(account, intent.boardRemoteId);
      return;

    case 'createComment': {
      const { ref } = await cardRefOf(ctx, intent.cardId);
      const created = await postComment(
        account,
        ref.cardRemoteId,
        intent.message,
        intent.parentRemoteId || null,
      );
      if (!created.remoteId || created.remoteId === 'undefined') {
        throw new Error('createComment: no id in the response');
      }

      const comment = await db.get<Comment>('comments').find(intent.commentId);
      await safeWrite(
        db,
        () =>
          comment.update((r: Comment) => {
            r.remoteId = created.remoteId;
            r.actorId = created.actorId;
            r.actorDisplayName = created.actorDisplayName;
            if (created.createdAt > 0) r.createdAt = created.createdAt;
          }),
        10000,
        'createComment:writeback',
      );
      return;
    }

    case 'updateComment': {
      const { ref } = await cardRefOf(ctx, intent.cardId);
      const comment = await db.get<Comment>('comments').find(intent.commentId);
      const commentRemoteId = await requireRemoteId(comment, 'comment');
      await updateComment(account, ref.cardRemoteId, commentRemoteId, intent.message);
      return;
    }

    case 'deleteComment': {
      const { ref } = await cardRefOf(ctx, intent.cardId);
      await deleteComment(account, ref.cardRemoteId, intent.commentRemoteId);
      return;
    }
  }
}
