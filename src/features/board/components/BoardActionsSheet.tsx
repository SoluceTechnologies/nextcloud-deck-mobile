import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { BoardSummary } from '@/features/board/boardFilter';
import { Item, Sheet } from '@/ui/components';

export interface BoardActionsSheetProps {
  summary: BoardSummary;
  visible: boolean;
  onClose: () => void;
  onOpen: () => void;
  onRename: () => void;
  onRecolor: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

export function BoardActionsSheet({
  summary,
  visible,
  onClose,
  onOpen,
  onRename,
  onRecolor,
  onArchive,
  onDelete,
}: BoardActionsSheetProps) {
  const { t } = useTranslation();
  const { board } = summary;

  // Non-destructive actions run then dismiss the sheet immediately.
  const run = (action: () => void) => () => {
    action();
    onClose();
  };

  const handleDelete = () => {
    Alert.alert(
      t('boards.actions.deleteTitle'),
      t('boards.actions.deleteMessage', { title: board.title }),
      [
        { text: t('boards.actions.cancel'), style: 'cancel' },
        {
          text: t('boards.actions.delete'),
          style: 'destructive',
          onPress: () => {
            onDelete();
            onClose();
          },
        },
      ],
    );
  };

  // Computed up front so a hidden action leaves no trace in the rendered tree.
  const actions = [
    { key: 'open', title: t('boards.actions.open'), onPress: run(onOpen) },
    ...(board.canManage
      ? [
          { key: 'rename', title: t('boards.actions.rename'), onPress: run(onRename) },
          { key: 'color', title: t('boards.actions.color'), onPress: run(onRecolor) },
          {
            key: 'archive',
            title: board.archived ? t('boards.actions.unarchive') : t('boards.actions.archive'),
            onPress: run(onArchive),
          },
          { key: 'delete', title: t('boards.actions.delete'), onPress: handleDelete },
        ]
      : []),
  ];

  return (
    <Sheet visible={visible} onClose={onClose} title={board.title}>
      {actions.map((action) => (
        <Item key={action.key} title={action.title} onPress={action.onPress} />
      ))}
    </Sheet>
  );
}
