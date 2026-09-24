import { deckRequest, type DeckAccount } from './client';
import { denormalizeColor, normalizeCard, normalizeLabel, toDeckDate } from './normalize';
import type { DeckCard, DeckLabel } from './types';

const DEFAULT_LABEL_COLOR = '31cc7c';

export type CardRef = {
  boardRemoteId: string;
  stackRemoteId: string;
  cardRemoteId: string;
};

export type CardWriteState = {
  title: string;
  description: string;
  type: string;
  owner: string;
  order: number;
  duedate: number | null;
  startdate: number | null;
  doneAt: number | null;
  color: string | null;
  archived: boolean;
};

function cardPath(ref: CardRef, suffix = ''): string {
  return `/boards/${ref.boardRemoteId}/stacks/${ref.stackRemoteId}/cards/${ref.cardRemoteId}${suffix}`;
}

export function buildCardPutBody(state: CardWriteState): Record<string, unknown> {
  return {
    title: state.title,
    description: state.description,
    type: state.type,
    owner: state.owner,
    order: state.order,
    duedate: toDeckDate(state.duedate),
    startdate: toDeckDate(state.startdate),
    done: toDeckDate(state.doneAt),
    color: denormalizeColor(state.color),
    archived: state.archived,
  };
}

export async function createCard(
  account: DeckAccount,
  ref: { boardRemoteId: string; stackRemoteId: string },
  input: {
    title: string;
    description: string;
    order: number;
    duedate: number | null;
    startdate: number | null;
  },
): Promise<DeckCard> {
  const result = await deckRequest<Record<string, any>>(account, {
    path: `/boards/${ref.boardRemoteId}/stacks/${ref.stackRemoteId}/cards`,
    method: 'POST',
    body: {
      title: input.title,
      type: 'plain',
      order: input.order,
      description: input.description,
      duedate: toDeckDate(input.duedate),
      startdate: toDeckDate(input.startdate),
    },
    context: 'createCard',
  });
  return normalizeCard(result.data ?? {}, ref.boardRemoteId);
}

export async function updateCard(
  account: DeckAccount,
  ref: CardRef,
  state: CardWriteState,
): Promise<DeckCard> {
  const result = await deckRequest<Record<string, any>>(account, {
    path: cardPath(ref),
    method: 'PUT',
    body: buildCardPutBody(state),
    context: 'updateCard',
  });
  return normalizeCard(result.data ?? {}, ref.boardRemoteId);
}

export async function deleteCard(account: DeckAccount, ref: CardRef): Promise<void> {
  await deckRequest(account, { path: cardPath(ref), method: 'DELETE', context: 'deleteCard' });
}

export async function reorderCard(
  account: DeckAccount,
  ref: CardRef,
  input: { order: number; toStackRemoteId: string },
): Promise<void> {
  await deckRequest(account, {
    path: cardPath(ref, '/reorder'),
    method: 'PUT',
    body: { order: input.order, stackId: Number(input.toStackRemoteId) },
    context: 'reorderCard',
  });
}

export async function setCardArchived(
  account: DeckAccount,
  ref: CardRef,
  archived: boolean,
): Promise<void> {
  await deckRequest(account, {
    path: cardPath(ref, archived ? '/archive' : '/unarchive'),
    method: 'PUT',
    context: archived ? 'archiveCard' : 'unarchiveCard',
  });
}

export async function assignLabelToCard(
  account: DeckAccount,
  ref: CardRef,
  labelRemoteId: string,
): Promise<void> {
  await deckRequest(account, {
    path: cardPath(ref, '/assignLabel'),
    method: 'PUT',
    body: { labelId: Number(labelRemoteId) },
    context: 'assignLabelToCard',
  });
}

export async function removeLabelFromCard(
  account: DeckAccount,
  ref: CardRef,
  labelRemoteId: string,
): Promise<void> {
  await deckRequest(account, {
    path: cardPath(ref, '/removeLabel'),
    method: 'PUT',
    body: { labelId: Number(labelRemoteId) },
    context: 'removeLabelFromCard',
  });
}

export async function assignUserToCard(
  account: DeckAccount,
  ref: CardRef,
  input: { participant: string; assigneeType: number },
): Promise<void> {
  await deckRequest(account, {
    path: cardPath(ref, '/assignUser'),
    method: 'PUT',
    body: { userId: input.participant, type: input.assigneeType },
    context: 'assignUserToCard',
  });
}

export async function unassignUserFromCard(
  account: DeckAccount,
  ref: CardRef,
  input: { participant: string; assigneeType: number },
): Promise<void> {
  await deckRequest(account, {
    path: cardPath(ref, '/unassignUser'),
    method: 'PUT',
    body: { userId: input.participant, type: input.assigneeType },
    context: 'unassignUserFromCard',
  });
}

/** Dependencies and clone are only exposed on the OCS API. */
export async function addDependentCard(
  account: DeckAccount,
  cardRemoteId: string,
  dependentCardRemoteId: string,
): Promise<void> {
  await deckRequest(account, {
    path: `/cards/${cardRemoteId}/dependentCards/${dependentCardRemoteId}`,
    api: 'ocs',
    method: 'POST',
    context: 'addDependentCard',
  });
}

export async function removeDependentCard(
  account: DeckAccount,
  cardRemoteId: string,
  dependentCardRemoteId: string,
): Promise<void> {
  await deckRequest(account, {
    path: `/cards/${cardRemoteId}/dependentCards/${dependentCardRemoteId}`,
    api: 'ocs',
    method: 'DELETE',
    context: 'removeDependentCard',
  });
}

export async function cloneCard(
  account: DeckAccount,
  cardRemoteId: string,
  target?: { boardRemoteId: string; stackRemoteId: string },
): Promise<DeckCard> {
  const result = await deckRequest<Record<string, any>>(account, {
    path: `/cards/${cardRemoteId}/clone`,
    api: 'ocs',
    method: 'POST',
    body: target ? { targetStackId: Number(target.stackRemoteId) } : undefined,
    context: 'cloneCard',
  });
  return normalizeCard(result.data ?? {}, target?.boardRemoteId ?? '');
}

export async function createLabel(
  account: DeckAccount,
  boardRemoteId: string,
  input: { title: string; color: string | null },
): Promise<DeckLabel> {
  const result = await deckRequest<Record<string, any>>(account, {
    path: `/boards/${boardRemoteId}/labels`,
    method: 'POST',
    body: { title: input.title, color: denormalizeColor(input.color) ?? DEFAULT_LABEL_COLOR },
    context: 'createLabel',
  });
  return normalizeLabel(result.data ?? {});
}
