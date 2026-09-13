import { Q } from '@nozbe/watermelondb';
import { useMemo } from 'react';

import { useDatabase } from '@/database/DatabaseProvider';
import type Board from '@/database/models/Board';
import type Card from '@/database/models/Card';
import type CardAssignee from '@/database/models/CardAssignee';
import type CardLabel from '@/database/models/CardLabel';
import type Comment from '@/database/models/Comment';
import type Label from '@/database/models/Label';
import type Stack from '@/database/models/Stack';
import type { CardFieldName } from '@/database/writers';
import { parseArray, type Participant } from '@/features/card/participants';
import { mutate } from '@/sync/outbox/enqueue';

export type CardPatch = {
  title: string;
  description: string;
  duedate: number | null;
  startdate: number | null;
  doneAt: number | null;
  color: string | null;
};

export type CardActions = {
  create(input: { boardLocalId: string; stackLocalId: string; title: string }): Promise<void>;
  setDone(card: Card, done: boolean): Promise<void>;
  patch(card: Card, fields: Partial<CardPatch>): Promise<void>;
  setArchived(card: Card, archived: boolean): Promise<void>;
  remove(card: Card): Promise<void>;
  move(card: Card, toStackLocalId: string, order?: number): Promise<void>;
  clone(card: Card): Promise<void>;
  addLabel(card: Card, labelLocalId: string): Promise<void>;
  removeLabel(card: Card, labelLocalId: string): Promise<void>;
  createLabel(boardLocalId: string, input: { title: string; color: string | null }): Promise<string | null>;
  assignUser(card: Card, participant: Participant): Promise<void>;
  unassignUser(card: Card, participant: Participant): Promise<void>;
  addDependency(card: Card, dependentCardRemoteId: string): Promise<void>;
  removeDependency(card: Card, dependentCardRemoteId: string): Promise<void>;
  addComment(card: Card, message: string): Promise<void>;
};

/**
 * The single card write surface for the whole app: every screen that changes a card
 * goes through here, so every mutation reaches the outbox the same way and
 * `protectedFieldsOf` (src/sync/outbox/enqueue.ts) always sees an accurate `fields`
 * list. Each action is a no-op without an account — there is nowhere to file the
 * intent, and enqueuing one anyway would orphan it.
 */
export function useCardActions(accountId: string | null): CardActions {
  const db = useDatabase();

  return useMemo<CardActions>(() => {
    const create: CardActions['create'] = async ({ boardLocalId, stackLocalId, title }) => {
      if (!accountId) return;

      const siblings = await db
        .get<Card>('cards')
        .query(Q.where('account_id', accountId), Q.where('stack_id', stackLocalId))
        .fetch();
      const order = siblings.reduce((max, row) => Math.max(max, row.order), -1) + 1;

      // Synchronous: WatermelonDB assigns the row's id before prepareCreate returns,
      // which is why the intent below can carry it immediately.
      const row = db.get<Card>('cards').prepareCreate((r) => {
        r.accountId = accountId;
        r.boardId = boardLocalId;
        r.stackId = stackLocalId;
        r.remoteId = ''; // Findable offline, before the server has assigned one.
        r.title = title;
        r.description = '';
        r.type = 'plain';
        r.order = order;
        r.owner = '';
        r.archived = false;
        r.createdAt = Date.now();
        r.lastModified = 0;
        r.attachmentCount = 0;
        r.commentsCount = 0;
        r.dependentCardsJson = '[]';
        r.pending = true; // Not yet synced — the board shows it as such.
      });

      await mutate({
        db,
        accountId,
        intent: { kind: 'createCard', cardId: row.id },
        applyLocal: () => row,
      });
    };

    // The single patch path every field-level edit funnels through: `fields` becomes
    // `intent.fields`, which is what protects these exact columns from a sync overwrite
    // (protectedFieldsOf) and what the conflict check compares against `intent.base`. So
    // `base` must be read here, before `prepareUpdate` changes the row, in the same
    // representation `serverValuesOf` uses (`null` for absent, never `undefined`).
    const patch: CardActions['patch'] = async (card, fields) => {
      if (!accountId) return;

      // An explicit `undefined` is "not patched", not "cleared" (clearing is `null`);
      // letting it through would protect and conflict-check a field nobody changed.
      const keys = (Object.keys(fields) as (keyof CardPatch)[]).filter(
        (k) => fields[k] !== undefined,
      );
      if (keys.length === 0) return;
      const base: Record<string, unknown> = {};
      for (const key of keys) base[key] = card[key] ?? null;

      await mutate({
        db,
        accountId,
        intent: { kind: 'patchCard', cardId: card.id, fields: keys as CardFieldName[], base },
        applyLocal: () =>
          card.prepareUpdate((r: Card) => {
            // Nullable columns are optional (`number | undefined`), so a patch clearing
            // one writes `undefined`, not `null` — matches writeCardRow's convention.
            // A generic key can't type-check as an assignment target field-by-field
            // (TS can't prove the value matches every possible branch), same reason
            // writers.ts reads/writes rows through an untyped `Row`.
            const row = r as unknown as Record<string, unknown>;
            for (const key of keys) row[key] = fields[key] ?? undefined;
          }),
      });
    };

    // doneAt is a timestamp, not a boolean — the column records *when*, not just *whether*.
    // Deck stores `done` at second precision and echoes it without milliseconds; a
    // ms-precise base would differ from the echoed value and read as a conflict.
    const setDone: CardActions['setDone'] = (card, done) =>
      patch(card, { doneAt: done ? Math.floor(Date.now() / 1000) * 1000 : null });

    const setArchived: CardActions['setArchived'] = async (card, archived) => {
      if (!accountId) return;
      await mutate({
        db,
        accountId,
        intent: { kind: 'setCardArchived', cardId: card.id, archived },
        applyLocal: () =>
          card.prepareUpdate((r: Card) => {
            r.archived = archived;
          }),
      });
    };

    const move: CardActions['move'] = async (card, toStackLocalId, order) => {
      if (!accountId) return;

      // A move can land on another board's list — the local row must follow, or the
      // card would show under its old board until the next full sync.
      const stack = await db.get<Stack>('stacks').find(toStackLocalId);

      let resolvedOrder = order;
      if (resolvedOrder === undefined) {
        const siblings = await db
          .get<Card>('cards')
          .query(Q.where('account_id', accountId), Q.where('stack_id', toStackLocalId))
          .fetch();
        resolvedOrder = siblings.reduce((max, row) => Math.max(max, row.order), -1) + 1;
      }

      await mutate({
        db,
        accountId,
        intent: { kind: 'moveCard', cardId: card.id, toStackId: toStackLocalId, order: resolvedOrder },
        applyLocal: () =>
          card.prepareUpdate((r: Card) => {
            r.boardId = stack.boardId;
            r.stackId = toStackLocalId;
            r.order = resolvedOrder;
          }),
      });
    };

    const remove: CardActions['remove'] = async (card) => {
      if (!accountId) return;

      // The local row is about to be destroyed, so the delete intent must carry the
      // remote coordinates itself — read before mutate, since prepareMarkAsDeleted is
      // the only call that may run inside applyLocal.
      const [board, stack] = await Promise.all([
        db.get<Board>('boards').find(card.boardId),
        db.get<Stack>('stacks').find(card.stackId),
      ]);

      await mutate({
        db,
        accountId,
        // Enqueued even when remoteId is '' (never synced) — coalescing collapses
        // a create+delete pair for a row that never reached the server.
        intent: {
          kind: 'deleteCard',
          cardId: card.id,
          ref: {
            boardRemoteId: board.remoteId,
            stackRemoteId: stack.remoteId,
            cardRemoteId: card.remoteId,
          },
        },
        applyLocal: () => card.prepareMarkAsDeleted(),
      });
    };

    const clone: CardActions['clone'] = async (card) => {
      if (!accountId) return;
      // The copy is server-only (spec §9) — a card that never synced has nothing to
      // clone, and the menu that offers this action already hides it in that case.
      if (!card.remoteId) return;

      await mutate({
        db,
        accountId,
        intent: { kind: 'cloneCard', cardId: card.id, cardRemoteId: card.remoteId },
        applyLocal: () => [],
      });
    };

    const addLabel: CardActions['addLabel'] = async (card, labelLocalId) => {
      if (!accountId) return;

      const [existing] = await db
        .get<CardLabel>('card_labels')
        .query(
          Q.where('account_id', accountId),
          Q.where('card_id', card.id),
          Q.where('label_id', labelLocalId),
        )
        .fetch();
      if (existing) return;

      await mutate({
        db,
        accountId,
        intent: { kind: 'assignLabel', cardId: card.id, labelId: labelLocalId },
        applyLocal: () =>
          db.get<CardLabel>('card_labels').prepareCreate((r: CardLabel) => {
            r.accountId = accountId;
            r.cardId = card.id;
            r.labelId = labelLocalId;
          }),
      });
    };

    const removeLabel: CardActions['removeLabel'] = async (card, labelLocalId) => {
      if (!accountId) return;

      // The join rows carry no ids the intent can reuse — find them before mutate,
      // since prepareMarkAsDeleted is the only call that may run inside applyLocal.
      // Nothing to un-assign locally means nothing to tell the server either.
      const joins = await db
        .get<CardLabel>('card_labels')
        .query(
          Q.where('account_id', accountId),
          Q.where('card_id', card.id),
          Q.where('label_id', labelLocalId),
        )
        .fetch();
      if (!joins.length) return;

      await mutate({
        db,
        accountId,
        intent: { kind: 'removeLabel', cardId: card.id, labelId: labelLocalId },
        applyLocal: () => joins.map((j) => j.prepareMarkAsDeleted()),
      });
    };

    const createLabel: CardActions['createLabel'] = async (boardLocalId, input) => {
      if (!accountId) return null;

      // Synchronous, like create(): WatermelonDB assigns the row's id before
      // prepareCreate returns, so both the intent and the caller's addLabel
      // follow-up (to join it to a card) can use it immediately.
      const row = db.get<Label>('labels').prepareCreate((r: Label) => {
        r.accountId = accountId;
        r.boardId = boardLocalId;
        r.remoteId = ''; // Findable offline, before the server has assigned one.
        r.title = input.title;
        r.color = input.color ?? undefined;
      });

      await mutate({
        db,
        accountId,
        intent: { kind: 'createLabel', labelId: row.id, boardId: boardLocalId },
        applyLocal: () => row,
      });

      return row.id;
    };

    // A user and a group can share the same participant id — the check (and the
    // row it creates) must key on id *and* type, same as participantsOf's dedup.
    const assignUser: CardActions['assignUser'] = async (card, p) => {
      if (!accountId) return;

      const [existing] = await db
        .get<CardAssignee>('card_assignees')
        .query(
          Q.where('account_id', accountId),
          Q.where('card_id', card.id),
          Q.where('participant', p.participant),
          Q.where('assignee_type', p.assigneeType),
        )
        .fetch();
      if (existing) return;

      await mutate({
        db,
        accountId,
        intent: { kind: 'assignUser', cardId: card.id, participant: p.participant, assigneeType: p.assigneeType },
        applyLocal: () =>
          db.get<CardAssignee>('card_assignees').prepareCreate((r: CardAssignee) => {
            r.accountId = accountId;
            r.cardId = card.id;
            r.participant = p.participant;
            r.assigneeType = p.assigneeType;
            r.displayName = p.displayName;
          }),
      });
    };

    const unassignUser: CardActions['unassignUser'] = async (card, p) => {
      if (!accountId) return;

      // The join rows carry no ids the intent can reuse — find them before mutate,
      // since prepareMarkAsDeleted is the only call that may run inside applyLocal.
      // Nothing to un-assign locally means nothing to tell the server either.
      const joins = await db
        .get<CardAssignee>('card_assignees')
        .query(
          Q.where('account_id', accountId),
          Q.where('card_id', card.id),
          Q.where('participant', p.participant),
          Q.where('assignee_type', p.assigneeType),
        )
        .fetch();
      if (!joins.length) return;

      await mutate({
        db,
        accountId,
        intent: { kind: 'unassignUser', cardId: card.id, participant: p.participant, assigneeType: p.assigneeType },
        applyLocal: () => joins.map((j) => j.prepareMarkAsDeleted()),
      });
    };

    // dependentCardsJson is a plain string column, not a CardFieldName — it is
    // never in protectedFieldsOf's switch, so this optimistic write is
    // unprotected by design: a delta pass landing before the outbox drains
    // this intent may briefly revert it. Accepted (R38).
    const addDependency: CardActions['addDependency'] = async (card, dependentCardRemoteId) => {
      if (!accountId) return;

      const ids = parseArray<string>(card.dependentCardsJson);
      if (ids.includes(dependentCardRemoteId)) return;

      await mutate({
        db,
        accountId,
        intent: { kind: 'addDependency', cardId: card.id, dependentCardRemoteId },
        applyLocal: () =>
          card.prepareUpdate((r: Card) => {
            r.dependentCardsJson = JSON.stringify([...ids, dependentCardRemoteId]);
          }),
      });
    };

    const removeDependency: CardActions['removeDependency'] = async (card, dependentCardRemoteId) => {
      if (!accountId) return;

      const ids = parseArray<string>(card.dependentCardsJson);
      if (!ids.includes(dependentCardRemoteId)) return;

      await mutate({
        db,
        accountId,
        intent: { kind: 'removeDependency', cardId: card.id, dependentCardRemoteId },
        applyLocal: () =>
          card.prepareUpdate((r: Card) => {
            r.dependentCardsJson = JSON.stringify(ids.filter((id) => id !== dependentCardRemoteId));
          }),
      });
    };

    // A comment written offline must appear right away: the row is prepared
    // (remoteId '', no actor yet — CommentsSection renders that as pending/"You")
    // before mutate, same as create()/createLabel(), and the drain fills in the
    // real remote id and author once it reaches the server.
    const addComment: CardActions['addComment'] = async (card, message) => {
      if (!accountId) return;

      const trimmed = message.trim();
      if (!trimmed) return;

      const row = db.get<Comment>('comments').prepareCreate((r: Comment) => {
        r.accountId = accountId;
        r.cardId = card.id;
        r.remoteId = '';
        r.message = trimmed;
        r.actorId = '';
        r.actorDisplayName = '';
        r.createdAt = Date.now();
        r.parentId = undefined;
      });

      await mutate({
        db,
        accountId,
        intent: { kind: 'createComment', commentId: row.id, cardId: card.id, message: trimmed },
        applyLocal: () => row,
      });
    };

    return {
      create,
      setDone,
      patch,
      setArchived,
      remove,
      move,
      clone,
      addLabel,
      removeLabel,
      createLabel,
      assignUser,
      unassignUser,
      addDependency,
      removeDependency,
      addComment,
    };
  }, [db, accountId]);
}
