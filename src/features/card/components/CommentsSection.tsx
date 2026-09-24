import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ellipsis, MessageSquare, Send, X } from 'lucide-react-native';

import type Comment from '@/database/models/Comment';
import { formatRelative } from '@/utils/relativeTime';
import { Avatar, Button, EmptyState, IconButton, TextField, Typography } from '@/ui/components';
import { SectionCard } from './SectionCard';
import { CommentMenu } from './CommentMenu';

export interface CommentsSectionProps {
  comments: Comment[];
  hasMore: boolean;
  loading?: boolean;
  expectedCount?: number;
  me: string;
  onLoadMore: () => void;
  onSubmit: (message: string, parentRemoteId: string | null) => void;
  onEdit: (comment: Comment, message: string) => void;
  onDelete: (comment: Comment) => void;
}

type Composing =
  | { mode: 'new' }
  | { mode: 'reply'; parent: Comment }
  | { mode: 'edit'; comment: Comment };

export function replyTargetOf(comment: Comment): string {
  return comment.parentId || comment.remoteId;
}

export function CommentsSection({
  comments,
  hasMore,
  loading,
  expectedCount = 0,
  me,
  onLoadMore,
  onSubmit,
  onEdit,
  onDelete,
}: CommentsSectionProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [draft, setDraft] = useState('');
  const [composing, setComposing] = useState<Composing>({ mode: 'new' });
  const [menuFor, setMenuFor] = useState<Comment | null>(null);

  const isMine = (comment: Comment): boolean =>
    comment.remoteId === '' ? comment.actorId === '' : me !== '' && comment.actorId === me;

  const displayNameOf = (comment: Comment): string =>
    comment.actorDisplayName || (isMine(comment) ? t('card.you') : '');

  const { roots, repliesByParent } = useMemo(() => {
    const byRemoteId = new Set(comments.map((c) => c.remoteId).filter(Boolean));
    const replies = new Map<string, Comment[]>();
    const tops: Comment[] = [];

    for (const comment of comments) {
      const parentId = comment.parentId;
      if (parentId && byRemoteId.has(parentId)) {
        const bucket = replies.get(parentId);
        if (bucket) bucket.push(comment);
        else replies.set(parentId, [comment]);
      } else {
        tops.push(comment);
      }
    }
    return { roots: tops, repliesByParent: replies };
  }, [comments]);

  const reset = () => {
    setComposing({ mode: 'new' });
    setDraft('');
  };

  const startEdit = (comment: Comment) => {
    setComposing({ mode: 'edit', comment });
    setDraft(comment.message);
  };

  const startReply = (comment: Comment) => {
    setComposing({ mode: 'reply', parent: comment });
    setDraft('');
  };

  const submit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (composing.mode === 'edit') onEdit(composing.comment, trimmed);
    else onSubmit(trimmed, composing.mode === 'reply' ? replyTargetOf(composing.parent) : null);
    reset();
  };

  const renderComment = (comment: Comment, reply: boolean) => {
    const pending = comment.remoteId === '';
    const author = displayNameOf(comment);

    return (
      <View
        key={comment.id}
        testID={`comment-${comment.id}`}
        style={[styles.row, reply && styles.reply]}
      >
        <Avatar name={author || '?'} size={reply ? 26 : 32} />
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
        <IconButton
          testID={`comment-menu-${comment.id}`}
          accessibilityLabel={t('card.comment.actions')}
          size={32}
          onPress={() => setMenuFor(comment)}
        >
          <Ellipsis size={18} color={colors.textTertiary} />
        </IconButton>
      </View>
    );
  };

  const placeholder =
    composing.mode === 'edit'
      ? t('card.comment.editPlaceholder')
      : composing.mode === 'reply'
        ? t('card.comment.replyPlaceholder')
        : t('card.writeComment');

  return (
    <SectionCard icon={<MessageSquare />} title={t('card.comments')}>
      {comments.length === 0 ? (
        <EmptyState
          testID="comments-empty"
          loading={Boolean(loading) && expectedCount > 0}
          icon={<MessageSquare />}
          title={t('card.noComments')}
          description={t('card.noCommentsHint')}
        />
      ) : (
        roots.map((root) => (
          <View key={root.id}>
            {renderComment(root, false)}
            {(repliesByParent.get(root.remoteId) ?? []).map((child) => renderComment(child, true))}
          </View>
        ))
      )}
      {hasMore ? (
        <Button variant="ghost" size="small" title={t('card.loadMore')} onPress={onLoadMore} />
      ) : null}

      <View style={styles.composer}>
        {composing.mode !== 'new' ? (
          <View style={[styles.contextBar, { backgroundColor: colors.surface }]}>
            <Typography testID="comment-composer-context" variant="caption" color="secondary">
              {composing.mode === 'edit'
                ? t('card.comment.editing')
                : t('card.comment.replyingTo', { name: displayNameOf(composing.parent) })}
            </Typography>
            <IconButton
              testID="comment-composer-cancel"
              accessibilityLabel={t('card.comment.cancel')}
              size={28}
              onPress={reset}
            >
              <X size={16} color={colors.textTertiary} />
            </IconButton>
          </View>
        ) : null}
        <TextField
          testID="comment-input"
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          right={
            <IconButton testID="comment-send" accessibilityLabel={t('card.send')} size={36} onPress={submit}>
              <Send size={18} color={colors.primary} />
            </IconButton>
          }
        />
      </View>

      <CommentMenu
        visible={menuFor !== null}
        comment={menuFor}
        mine={menuFor !== null && isMine(menuFor)}
        onClose={() => setMenuFor(null)}
        onEdit={() => menuFor && startEdit(menuFor)}
        onReply={() => menuFor && startReply(menuFor)}
        onDelete={() => {
          if (!menuFor) return;
          if (composing.mode === 'edit' && composing.comment.id === menuFor.id) reset();
          onDelete(menuFor);
        }}
      />
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, paddingVertical: 12, paddingHorizontal: 4 },
  reply: { paddingLeft: 32 },
  composer: { marginTop: 12 },
  contextBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  body: { flex: 1, gap: 2 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
