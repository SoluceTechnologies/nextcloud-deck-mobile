import { deckRequest, type DeckAccount } from './client';
import { normalizeComment } from './normalize';
import type { DeckComment } from './types';

export { normalizeComment };

export async function fetchComments(
  account: DeckAccount,
  cardRemoteId: string,
  opts?: { limit?: number; offset?: number },
): Promise<DeckComment[] | null> {
  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;
  const result = await deckRequest<Record<string, any>[]>(account, {
    path: `/cards/${cardRemoteId}/comments?limit=${limit}&offset=${offset}`,
    api: 'ocs',
    context: 'fetchComments',
  });
  if (result.notModified || result.data === null) return null;
  return result.data.map(normalizeComment);
}

export async function postComment(
  account: DeckAccount,
  cardRemoteId: string,
  message: string,
  parentRemoteId?: string | null,
): Promise<DeckComment> {
  const result = await deckRequest<Record<string, any>>(account, {
    path: `/cards/${cardRemoteId}/comments`,
    api: 'ocs',
    method: 'POST',
    body: parentRemoteId ? { message, parentId: parentRemoteId } : { message },
    context: 'postComment',
  });
  if (result.data === null) throw new Error('postComment: empty response body');
  return normalizeComment(result.data);
}

export async function updateComment(
  account: DeckAccount,
  cardRemoteId: string,
  commentRemoteId: string,
  message: string,
): Promise<DeckComment | null> {
  const result = await deckRequest<Record<string, any>>(account, {
    path: `/cards/${cardRemoteId}/comments/${commentRemoteId}`,
    api: 'ocs',
    method: 'PUT',
    body: { message },
    context: 'updateComment',
  });
  return result.data === null ? null : normalizeComment(result.data);
}

export async function deleteComment(
  account: DeckAccount,
  cardRemoteId: string,
  commentRemoteId: string,
): Promise<void> {
  await deckRequest<unknown>(account, {
    path: `/cards/${cardRemoteId}/comments/${commentRemoteId}`,
    api: 'ocs',
    method: 'DELETE',
    context: 'deleteComment',
  });
}
