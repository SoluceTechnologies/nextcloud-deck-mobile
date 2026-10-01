import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Archive, CheckCheck, Pencil, Trash2 } from 'lucide-react-native';

import { ActionList, Sheet, type SheetAction } from '@/ui/components';

export interface StackActionsSheetProps {
  title: string;
  cardCount: number;
  canManage: boolean;
  visible: boolean;
  onClose: () => void;
  onRename: () => void;
  onMarkAllDone: () => void;
  onArchiveAll: () => void;
  onDelete: () => void;
}

export function StackActionsSheet({
  title,
  cardCount,
  canManage,
  visible,
  onClose,
  onRename,
  onMarkAllDone,
  onArchiveAll,
  onDelete,
}: StackActionsSheetProps) {
  const { t } = useTranslation();

  const run = (action: () => void) => () => {
    action();
    onClose();
  };

  const confirm = (heading: string, message: string, button: string, action: () => void) => () => {
    Alert.alert(heading, message, [
      { text: t('board.actions.cancel'), style: 'cancel' },
      {
        text: button,
        style: 'destructive',
        onPress: () => {
          action();
          onClose();
        },
      },
    ]);
  };

  const actions: SheetAction[] = [
    ...(canManage
      ? [{ key: 'rename', title: t('board.actions.rename'), icon: <Pencil />, onPress: run(onRename) }]
      : []),
    ...(cardCount > 0
      ? [
          {
            key: 'markAllDone',
            title: t('board.actions.markAllDone'),
            icon: <CheckCheck />,
            onPress: run(onMarkAllDone),
          },
          {
            key: 'archiveAll',
            title: t('board.actions.archiveAll'),
            icon: <Archive />,
            // The app has no archived-cards view to undo this from, hence the confirm.
            onPress: confirm(
              t('board.actions.archiveAllTitle'),
              t('board.actions.archiveAllMessage', { title }),
              t('board.actions.archive'),
              onArchiveAll,
            ),
          },
        ]
      : []),
    ...(canManage
      ? [
          {
            key: 'delete',
            title: t('board.actions.delete'),
            icon: <Trash2 />,
            destructive: true,
            onPress: confirm(
              t('board.actions.deleteTitle'),
              t('board.actions.deleteMessage', { title }),
              t('board.actions.delete'),
              onDelete,
            ),
          },
        ]
      : []),
  ];

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <ActionList actions={actions} />
    </Sheet>
  );
}
