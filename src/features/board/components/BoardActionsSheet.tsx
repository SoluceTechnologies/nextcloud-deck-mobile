import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  Archive, ArchiveRestore, Palette, Pencil, SquareArrowOutUpRight, Trash2,
} from 'lucide-react-native';

import type { BoardSummary } from '@/features/board/boardFilter';
import { ActionList, Sheet, type SheetAction } from '@/ui/components';

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

  const actions: SheetAction[] = [
    {
      key: 'open',
      title: t('boards.actions.open'),
      icon: <SquareArrowOutUpRight />,
      onPress: run(onOpen),
    },
    ...(board.canManage
      ? [
          {
            key: 'rename',
            title: t('boards.actions.rename'),
            icon: <Pencil />,
            onPress: run(onRename),
          },
          {
            key: 'color',
            title: t('boards.actions.color'),
            icon: <Palette />,
            onPress: run(onRecolor),
          },
          {
            key: 'archive',
            title: board.archived ? t('boards.actions.unarchive') : t('boards.actions.archive'),
            icon: board.archived ? <ArchiveRestore /> : <Archive />,
            onPress: run(onArchive),
          },
          {
            key: 'delete',
            title: t('boards.actions.delete'),
            icon: <Trash2 />,
            destructive: true,
            onPress: handleDelete,
          },
        ]
      : []),
  ];

  return (
    <Sheet visible={visible} onClose={onClose} title={board.title}>
      <ActionList actions={actions} />
    </Sheet>
  );
}
