import type { CardRemoteRef } from '@/sync/outbox/types';
import { deckRequest, deckRestUrl, type DeckAccount } from './client';
import { normalizeAttachment } from './normalize';
import type { DeckAttachment } from './types';

export { normalizeAttachment };

function attachmentsPath(ref: CardRemoteRef): string {
  return `/boards/${ref.boardRemoteId}/stacks/${ref.stackRemoteId}/cards/${ref.cardRemoteId}/attachments`;
}

/**
 * `null` on 304 or a body-less 200, for the reason given on `fetchBoards` in
 * `boards.ts`: collapsing "nothing changed" into `[]` deletes every
 * attachment from an authoritative reconcile.
 */
export async function fetchAttachments(
  account: DeckAccount,
  ref: CardRemoteRef,
): Promise<DeckAttachment[] | null> {
  const result = await deckRequest<Record<string, any>[]>(account, {
    path: attachmentsPath(ref),
    context: 'fetchAttachments',
  });
  if (result.notModified || result.data === null) return null;
  return result.data.map(normalizeAttachment);
}

/**
 * The `{type}` segment before the attachment id is item 2 of
 * `docs/v0/api-verification.md` — unverified against a live server.
 */
export function attachmentDownloadUrl(
  account: DeckAccount,
  ref: CardRemoteRef,
  a: DeckAttachment,
): string {
  return deckRestUrl(account.baseUrl, `${attachmentsPath(ref)}/${a.attachmentType}/${a.remoteId}`);
}
