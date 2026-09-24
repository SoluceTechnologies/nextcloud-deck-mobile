import { useEffect, useState } from 'react';

import type Attachment from '@/database/models/Attachment';
import { attachmentDownloadUrl } from '@/services/deck/attachments';
import { trustedFetch } from '@/services/shared/trustedFetch';
import type { CardRemoteRef } from '@/sync/outbox/types';
import type { Account } from '@/types';

export const MAX_PREVIEW_BYTES = 15 * 1024 * 1024;

export type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; uri: string }
  /** A type this app cannot draw — a PDF, an archive, an office document. */
  | { status: 'unsupported' }
  | { status: 'tooLarge' }
  | { status: 'failed' };

export function isPreviewable(mime: string): boolean {
  return mime.startsWith('image/') && mime !== 'image/svg+xml';
}

function basicAuth(account: Pick<Account, 'username' | 'appPassword'>): string {
  return 'Basic ' + btoa(`${account.username}:${account.appPassword}`);
}

export function useAttachmentPreview(
  account: Account | null,
  ref: CardRemoteRef | null,
  attachment: Attachment | null,
): PreviewState {
  const [state, setState] = useState<PreviewState>({ status: 'idle' });

  useEffect(() => {
    if (!attachment || !account || !ref) {
      setState({ status: 'idle' });
      return;
    }
    if (!isPreviewable(attachment.mime)) {
      setState({ status: 'unsupported' });
      return;
    }
    if (attachment.size > MAX_PREVIEW_BYTES) {
      setState({ status: 'tooLarge' });
      return;
    }

    let active = true;
    setState({ status: 'loading' });

    (async () => {
      try {
        const url = attachmentDownloadUrl(account, ref, {
          remoteId: attachment.remoteId,
          attachmentType: attachment.attachmentType,
        });
        const res = await trustedFetch(url, { headers: { Authorization: basicAuth(account) } });
        if (!res.ok) {
          console.warn('[attachment] non-ok response', res.status, url);
          if (active) setState({ status: 'failed' });
          return;
        }
        const contentType = res.headers.get('content-type') || attachment.mime;
        const base64 = await res.base64();
        if (active) setState({ status: 'ready', uri: `data:${contentType};base64,${base64}` });
      } catch (e) {
        console.warn('[attachment] failed to load', attachment.fileName, e);
        if (active) setState({ status: 'failed' });
      }
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id, ref?.cardRemoteId, attachment?.id]);

  return state;
}
