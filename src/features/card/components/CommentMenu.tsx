import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import type Comment from '@/database/models/Comment';
import { Pencil, Reply, Trash2 } from 'lucide-react-native';

import { ActionList, Sheet, type SheetAction } from '@/ui/components';

export interface CommentMenuProps {
  visible: boolean;
  comment: Comment | null;
  mine: boolean;
  onClose: () => void;
  onEdit: () => void;
  onReply: () => void;
  onDelete: () => void;
}

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

  const canReply = comment !== null && comment.remoteId !== '';

  const actions: SheetAction[] = [
    ...(mine
      ? [
          {
            key: 'edit',
            testID: 'comment-action-edit',
            title: t('card.comment.edit'),
            icon: <Pencil />,
            onPress: run(onEdit),
          },
        ]
      : []),
    ...(canReply
      ? [
          {
            key: 'reply',
            testID: 'comment-action-reply',
            title: t('card.comment.reply'),
            icon: <Reply />,
            onPress: run(onReply),
          },
        ]
      : []),
    ...(mine
      ? [
          {
            key: 'delete',
            testID: 'comment-action-delete',
            title: t('card.comment.delete'),
            icon: <Trash2 />,
            destructive: true,
            onPress: handleDelete,
          },
        ]
      : []),
  ];

  return (
    <Sheet visible={visible} onClose={onClose} title={t('card.comment.actions')}>
      <ActionList actions={actions} />
    </Sheet>
  );
}
