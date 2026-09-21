import { deckRequest, type DeckAccount } from './client';
import { normalizeComment } from './normalize';
import type { DeckComment } from './types';

export { normalizeComment };

/**
 * `null` means the server answered 304, or a 200 with no body: neither is the
 * same answer as `[]`, which means the card really has no comments — see the
 * doc comment on `fetchBoards` in `boards.ts` for why the two must never
 * collapse into one another.
 */
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
  /** The comment this one answers. Deck threads one level deep — see `replyTargetOf`. */
  parentRemoteId?: string | null,
): Promise<DeckComment> {
  const result = await deckRequest<Record<string, any>>(account, {
    path: `/cards/${cardRemoteId}/comments`,
    api: 'ocs',
    method: 'POST',
    body: parentRemoteId ? { message, parentId: parentRemoteId } : { message },
    context: 'postComment',
  });
  // A create must return its row: a body-less answer here is not "nothing to
  // report", it is a response the caller cannot trust to carry the new id.
  if (result.data === null) throw new Error('postComment: empty response body');
  return normalizeComment(result.data);
}

/**
 * Edits an existing comment. Deck only lets a comment's own author edit it and
 * answers 403 otherwise, which the drain treats as permanent — so the UI must
 * not offer this on someone else's comment in the first place.
 */
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
  // Unlike a create, an empty body here is not a problem: the caller already
  // knows the id and the message it just sent.
  return result.data === null ? null : normalizeComment(result.data);
}

/** Author-only, same as `updateComment`. */
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
