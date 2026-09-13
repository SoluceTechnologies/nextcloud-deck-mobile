import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Send } from 'lucide-react-native';

import type Comment from '@/database/models/Comment';
import { formatRelative } from '@/utils/relativeTime';
import { Avatar, Button, IconButton, SectionHeader, TextField, Typography } from '@/ui/components';

export interface CommentsSectionProps {
  comments: Comment[];
  hasMore: boolean;
  onLoadMore: () => void;
  onSubmit: (message: string) => void;
}

/**
 * The card detail's comment thread: oldest first (the `comments` prop already
 * arrives sorted — see useCardComments), a load-more affordance only while the
 * server has further pages, and an always-present composer at the bottom. A row
 * whose remoteId is still '' was written offline and hasn't reached the drain
 * yet, so it carries a "pending" line instead of waiting silently.
 */
export function CommentsSection({ comments, hasMore, onLoadMore, onSubmit }: CommentsSectionProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [draft, setDraft] = useState('');

  const submit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setDraft('');
  };

  return (
    <View>
      <SectionHeader title={t('card.comments')} />
      {comments.length === 0 ? (
        <Typography color="secondary" align="center">
          {t('card.noComments')}
        </Typography>
      ) : (
        comments.map((comment) => {
          const pending = comment.remoteId === '';
          const isMe = pending && comment.actorId === '';
          const author = comment.actorDisplayName || (isMe ? t('card.you') : '');

          return (
            <View key={comment.id} testID={`comment-${comment.id}`} style={styles.row}>
              <Avatar name={comment.actorDisplayName || '?'} size={32} />
              <View style={styles.body}>
                <View style={styles.headerRow}>
                  <Typography variant="body2">{author}</Typography>
                  <Typography variant="caption" color="secondary">
                    {formatRelative(comment.createdAt)}
                  </Typography>
                </View>
                <Typography>{comment.message}</Typography>
                {pending ? (
                  <Typography testID={`comment-pending-${comment.id}`} variant="caption" color="secondary">
                    {t('card.commentPending')}
                  </Typography>
                ) : null}
              </View>
            </View>
          );
        })
      )}
      {hasMore ? (
        <Button variant="ghost" size="small" title={t('card.loadMore')} onPress={onLoadMore} />
      ) : null}
      <TextField
        testID="comment-input"
        value={draft}
        onChangeText={setDraft}
        placeholder={t('card.writeComment')}
        right={
          <IconButton testID="comment-send" accessibilityLabel={t('card.send')} size={36} onPress={submit}>
            <Send size={18} color={colors.primary} />
          </IconButton>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, paddingVertical: 10, paddingHorizontal: 6 },
  body: { flex: 1, gap: 2 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
