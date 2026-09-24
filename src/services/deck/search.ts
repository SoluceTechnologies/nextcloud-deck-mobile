import { deckRequest, type DeckAccount } from './client';
import { normalizeCard } from './normalize';
import type { DeckCard } from './types';

export type DeckSearchHit = { card: DeckCard; boardTitle: string; stackTitle: string };
export type DeckSearchPage = { hits: DeckSearchHit[]; cursor: string | null };

type Raw = Record<string, any>;

const DEFAULT_LIMIT = 30;

function toHit(raw: Raw): DeckSearchHit | null {
  const boardRemoteId = raw.relatedBoard?.id ?? raw.boardId;
  if (boardRemoteId == null) return null;
  return {
    card: normalizeCard(raw, String(boardRemoteId)),
    boardTitle: String(raw.relatedBoard?.title ?? ''),
    stackTitle: String(raw.relatedStack?.title ?? ''),
  };
}

export async function searchCards(
  account: DeckAccount,
  term: string,
  opts: { limit?: number; cursor?: string } = {},
): Promise<DeckSearchPage> {
  let path = `/search?term=${encodeURIComponent(term)}&limit=${opts.limit ?? DEFAULT_LIMIT}`;
  if (opts.cursor) path += `&cursor=${encodeURIComponent(opts.cursor)}`;

  const result = await deckRequest<Raw[] | Raw>(account, {
    path,
    api: 'ocs',
    context: 'searchCards',
  });

  const data = result.data;
  const rawHits: Raw[] = Array.isArray(data) ? data : Array.isArray(data?.cards) ? data.cards : [];
  const cursor = !Array.isArray(data) && typeof data?.cursor === 'string' ? data.cursor : null;

  return {
    hits: rawHits.map(toHit).filter((h): h is DeckSearchHit => h !== null),
    cursor,
  };
}
