import type { Database } from '@nozbe/watermelondb';

import type Board from '@/database/models/Board';
import type Card from '@/database/models/Card';
import type Label from '@/database/models/Label';
import type Stack from '@/database/models/Stack';
import { safeWrite } from '@/database/utils/safeTransaction';
import { createBoard, createStack, deleteStack, updateBoard, updateStack } from '@/services/deck/boards';
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

/** A prerequisite create has not flushed yet; retry after it does. */
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

async function cardRefOf(ctx: HandlerContext, cardLocalId: string): Promise<{ ref: CardRef; card: Card }> {
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

/** The card as the server must see it: complete, and read now, not at enqueue time. */
function writeStateOf(card: Card): CardWriteState {
  return {
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
}

export async function executeIntent(ctx: HandlerContext, intent: Intent): Promise<void> {
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
      await updateCard(account, ref, writeStateOf(card));
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
      // The local row is already destroyed, so the payload carries the coordinates.
      await deleteCard(account, intent.ref);
      return;

    case 'cloneCard':
      await cloneCard(account, intent.cardRemoteId);
      return;

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
  }
}
