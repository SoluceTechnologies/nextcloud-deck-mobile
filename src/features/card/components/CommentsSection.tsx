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
  /** The card's detail fetch is in flight — see useCardDetailSync. */
  loading?: boolean;
  /**
   * How many comments the server says this card has (`card.commentsCount`).
   * Zero means the empty state is already right, so no spinner flashes and
   * the block never changes height on its way there.
   */
  expectedCount?: number;
  /** The signed-in user's Nextcloud uid, matched against a comment's actorId. */
  me: string;
  onLoadMore: () => void;
  onSubmit: (message: string, parentRemoteId: string | null) => void;
  onEdit: (comment: Comment, message: string) => void;
  onDelete: (comment: Comment) => void;
}

/** What the composer at the bottom is currently doing. */
type Composing =
  | { mode: 'new' }
  | { mode: 'reply'; parent: Comment }
  | { mode: 'edit'; comment: Comment };

/**
 * Deck threads one level deep: answering a reply attaches to that reply's own
 * root, not to the reply. Anything deeper would be flattened server-side
 * anyway, so the thread is resolved here rather than rendering a nesting the
 * server will not keep.
 */
export function replyTargetOf(comment: Comment): string {
  return comment.parentId || comment.remoteId;
}

/**
 * The card detail's comment thread: roots oldest first, each with its replies
 * under it (the `comments` prop already arrives sorted — see useCardComments),
 * a load-more affordance only while the server has further pages, and one
 * composer at the bottom that writes, answers or edits depending on what the
 * user picked from a comment's menu. A row whose remoteId is still '' was
 * written offline and hasn't reached the drain yet, so it carries a "pending"
 * line instead of waiting silently.
 */
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

  // A comment written offline carries no actor yet, and the only comment this
  // device can have written offline is the user's own.
  const isMine = (comment: Comment): boolean =>
    comment.remoteId === '' ? comment.actorId === '' : me !== '' && comment.actorId === me;

  const displayNameOf = (comment: Comment): string =>
    comment.actorDisplayName || (isMine(comment) ? t('card.you') : '');

  // A reply whose parent is on another page renders as a root rather than
  // vanishing: the thread must show every comment it was handed.
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
        {/* `author`, not the raw field: a comment written offline has no actor
            yet, and falling back to '?' would label the user's own comment as
            a stranger's until the drain runs. */}
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
          // Same reasoning as the files section: only wait when the card
          // claims comments this device has not received yet.
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

      {/* TextField's own `style` lands on the inner TextInput, so the gap
          between the thread and the composer goes on a wrapper. */}
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
          // The row being edited is about to disappear; leaving the composer
          // pointed at it would save into a deleted comment.
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
