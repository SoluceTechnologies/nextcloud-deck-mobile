import { deckRequest, type DeckAccount } from './client';
import { denormalizeColor, normalizeBoard, normalizeStack } from './normalize';
import type { DeckBoard, DeckStack } from './types';

/** Deck rejects an empty colour on create; this is the Nextcloud default blue. */
const DEFAULT_BOARD_COLOR = '0082c9';

export async function fetchBoards(account: DeckAccount, sinceMs?: number): Promise<DeckBoard[]> {
  const result = await deckRequest<Record<string, any>[]>(account, {
    path: '/boards?details=true',
    sinceMs,
    context: 'fetchBoards',
  });
  return (result.data ?? []).map(normalizeBoard);
}

export async function fetchStacks(
  account: DeckAccount,
  boardRemoteId: string,
  sinceMs?: number,
): Promise<DeckStack[]> {
  const result = await deckRequest<Record<string, any>[]>(account, {
    path: `/boards/${boardRemoteId}/stacks`,
    sinceMs,
    context: 'fetchStacks',
  });
  return (result.data ?? []).map((raw) => normalizeStack(raw, boardRemoteId));
}

export async function createBoard(
  account: DeckAccount,
  input: { title: string; color: string | null },
): Promise<DeckBoard> {
  const result = await deckRequest<Record<string, any>>(account, {
    path: '/boards',
    method: 'POST',
    body: { title: input.title, color: denormalizeColor(input.color) ?? DEFAULT_BOARD_COLOR },
    context: 'createBoard',
  });
  return normalizeBoard(result.data ?? {});
}

export async function updateBoard(
  account: DeckAccount,
  boardRemoteId: string,
  input: { title: string; color: string | null; archived: boolean },
): Promise<DeckBoard> {
  const result = await deckRequest<Record<string, any>>(account, {
    path: `/boards/${boardRemoteId}`,
    method: 'PUT',
    body: {
      title: input.title,
      color: denormalizeColor(input.color) ?? DEFAULT_BOARD_COLOR,
      archived: input.archived,
    },
    context: 'updateBoard',
  });
  return normalizeBoard(result.data ?? {});
}

export async function deleteBoard(account: DeckAccount, boardRemoteId: string): Promise<void> {
  await deckRequest(account, {
    path: `/boards/${boardRemoteId}`,
    method: 'DELETE',
    context: 'deleteBoard',
  });
}

export async function createStack(
  account: DeckAccount,
  boardRemoteId: string,
  input: { title: string; order: number },
): Promise<DeckStack> {
  const result = await deckRequest<Record<string, any>>(account, {
    path: `/boards/${boardRemoteId}/stacks`,
    method: 'POST',
    body: { title: input.title, order: input.order },
    context: 'createStack',
  });
  return normalizeStack(result.data ?? {}, boardRemoteId);
}

export async function updateStack(
  account: DeckAccount,
  boardRemoteId: string,
  stackRemoteId: string,
  input: { title: string; order: number },
): Promise<DeckStack> {
  const result = await deckRequest<Record<string, any>>(account, {
    path: `/boards/${boardRemoteId}/stacks/${stackRemoteId}`,
    method: 'PUT',
    body: { title: input.title, order: input.order },
    context: 'updateStack',
  });
  return normalizeStack(result.data ?? {}, boardRemoteId);
}

export async function deleteStack(
  account: DeckAccount,
  boardRemoteId: string,
  stackRemoteId: string,
): Promise<void> {
  await deckRequest(account, {
    path: `/boards/${boardRemoteId}/stacks/${stackRemoteId}`,
    method: 'DELETE',
    context: 'deleteStack',
  });
}
