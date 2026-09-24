import type { CardRemoteRef } from '@/sync/outbox/types';
import { deckRequest, deckRestUrl, type DeckAccount } from './client';
import { normalizeAttachment } from './normalize';
import type { DeckAttachment } from './types';

export { normalizeAttachment };

function attachmentsPath(ref: CardRemoteRef): string {
  return `/boards/${ref.boardRemoteId}/stacks/${ref.stackRemoteId}/cards/${ref.cardRemoteId}/attachments`;
}

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

export function attachmentDownloadUrl(
  account: DeckAccount,
  ref: CardRemoteRef,
  a: Pick<DeckAttachment, 'attachmentType' | 'remoteId'>,
): string {
  return deckRestUrl(account.baseUrl, `${attachmentsPath(ref)}/${a.attachmentType}/${a.remoteId}`);
}
