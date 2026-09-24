import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Archive, ArchiveRestore, Copy, MoveRight, Trash2 } from 'lucide-react-native';

import type Card from '@/database/models/Card';
import { useIsOnline } from '@/services/shared/network';
import { ActionList, Sheet, type SheetAction } from '@/ui/components';

export interface CardMenuProps {
  visible: boolean;
  card: Card;
  onClose: () => void;
  onMove: () => void;
  onCopy: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

export function CardMenu({ visible, card, onClose, onMove, onCopy, onArchive, onDelete }: CardMenuProps) {
  const { t } = useTranslation();
  const online = useIsOnline();

  const run = (action: () => void) => () => {
    action();
    onClose();
  };

  const handleDelete = () => {
    Alert.alert(
      t('card.menu.deleteTitle'),
      t('card.menu.deleteMessage', { title: card.title }),
      [
        { text: t('card.menu.cancel'), style: 'cancel' },
        {
          text: t('card.menu.delete'),
          style: 'destructive',
          onPress: () => {
            onDelete();
            onClose();
          },
        },
      ],
    );
  };

  const canCopy = card.remoteId !== '' && online;

  const actions: SheetAction[] = [
    { key: 'move', title: t('card.menu.move'), icon: <MoveRight />, onPress: run(onMove) },
    ...(canCopy
      ? [{ key: 'copy', title: t('card.menu.copy'), icon: <Copy />, onPress: run(onCopy) }]
      : []),
    {
      key: 'archive',
      title: t(card.archived ? 'card.menu.unarchive' : 'card.menu.archive'),
      icon: card.archived ? <ArchiveRestore /> : <Archive />,
      onPress: run(onArchive),
    },
    {
      key: 'delete',
      title: t('card.menu.delete'),
      icon: <Trash2 />,
      destructive: true,
      onPress: handleDelete,
    },
  ];

  return (
    <Sheet visible={visible} onClose={onClose} title={card.title}>
      <ActionList actions={actions} />
    </Sheet>
  );
}
