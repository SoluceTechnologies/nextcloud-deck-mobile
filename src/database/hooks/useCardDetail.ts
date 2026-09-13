import { Q } from '@nozbe/watermelondb';
import { useEffect, useState } from 'react';

import { useDatabase } from '@/database/DatabaseProvider';
import type Attachment from '@/database/models/Attachment';
import type Comment from '@/database/models/Comment';

/** A card's comments, oldest first — the natural reading order for a thread. */
export function useCardComments(accountId: string | null, cardLocalId: string | null): Comment[] {
  const database = useDatabase();
  const [comments, setComments] = useState<Comment[]>([]);

  useEffect(() => {
    if (!accountId || !cardLocalId) {
      setComments([]);
      return;
    }
    const subscription = database
      .get<Comment>('comments')
      .query(Q.where('account_id', accountId), Q.where('card_id', cardLocalId))
      .observeWithColumns(['message', 'remote_id', 'created_at', 'actor_display_name'])
      .subscribe((rows) => setComments([...rows].sort((a, b) => a.createdAt - b.createdAt)));
    return () => subscription.unsubscribe();
  }, [accountId, cardLocalId, database]);

  return comments;
}

/** A card's attachments, oldest first. */
export function useCardAttachments(accountId: string | null, cardLocalId: string | null): Attachment[] {
  const database = useDatabase();
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  useEffect(() => {
    if (!accountId || !cardLocalId) {
      setAttachments([]);
      return;
    }
    const subscription = database
      .get<Attachment>('attachments')
      .query(Q.where('account_id', accountId), Q.where('card_id', cardLocalId))
      .observeWithColumns(['file_name', 'mime', 'size', 'remote_id'])
      .subscribe((rows) => setAttachments([...rows].sort((a, b) => a.createdAt - b.createdAt)));
    return () => subscription.unsubscribe();
  }, [accountId, cardLocalId, database]);

  return attachments;
}
