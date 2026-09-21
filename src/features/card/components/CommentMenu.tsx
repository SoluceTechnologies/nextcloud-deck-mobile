import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import type Comment from '@/database/models/Comment';
import { Item, Sheet } from '@/ui/components';

export interface CommentMenuProps {
  visible: boolean;
  comment: Comment | null;
  /** Deck only lets the author edit or delete, so the two actions are hidden otherwise. */
  mine: boolean;
  onClose: () => void;
  onEdit: () => void;
  onReply: () => void;
  onDelete: () => void;
}

/**
 * The per-comment action sheet, same shape as CardMenu: non-destructive
 * actions run and dismiss, the delete asks first.
 */
export function CommentMenu({ visible, comment, mine, onClose, onEdit, onReply, onDelete }: CommentMenuProps) {
  const { t } = useTranslation();

  const run = (action: () => void) => () => {
    action();
    onClose();
  };

  const handleDelete = () => {
    Alert.alert(t('card.comment.deleteTitle'), t('card.comment.deleteMessage'), [
      { text: t('card.comment.cancel'), style: 'cancel' },
      {
        text: t('card.comment.delete'),
        style: 'destructive',
        onPress: () => {
          onDelete();
          onClose();
        },
      },
    ]);
  };

  // A comment still on its way to the server has no remote id, and a reply has
  // to name its parent by that id — so replying waits until it has one.
  const canReply = comment !== null && comment.remoteId !== '';

  const actions = [
    ...(mine ? [{ key: 'edit', title: t('card.comment.edit'), onPress: run(onEdit) }] : []),
    ...(canReply ? [{ key: 'reply', title: t('card.comment.reply'), onPress: run(onReply) }] : []),
    ...(mine ? [{ key: 'delete', title: t('card.comment.delete'), onPress: handleDelete }] : []),
  ];

  return (
    <Sheet visible={visible} onClose={onClose} title={t('card.comment.actions')}>
      {actions.map((action) => (
        <Item key={action.key} testID={`comment-action-${action.key}`} title={action.title} onPress={action.onPress} />
      ))}
    </Sheet>
  );
}
