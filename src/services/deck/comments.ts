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
): Promise<DeckComment> {
  const result = await deckRequest<Record<string, any>>(account, {
    path: `/cards/${cardRemoteId}/comments`,
    api: 'ocs',
    method: 'POST',
    body: { message },
    context: 'postComment',
  });
  return normalizeComment(result.data ?? {});
}
