import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import type Card from '@/database/models/Card';
import { useIsOnline } from '@/services/shared/network';
import { Item, Sheet } from '@/ui/components';

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

  // Non-destructive actions run then dismiss the sheet immediately.
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

  // The copy is server-only (spec §9): hidden, not disabled, until the card has
  // synced at least once, and while there is no connection to reach the server.
  const canCopy = card.remoteId !== '' && online;

  // Computed up front so a hidden action leaves no trace in the rendered tree.
  const actions = [
    { key: 'move', title: t('card.menu.move'), onPress: run(onMove) },
    ...(canCopy ? [{ key: 'copy', title: t('card.menu.copy'), onPress: run(onCopy) }] : []),
    {
      key: 'archive',
      title: t(card.archived ? 'card.menu.unarchive' : 'card.menu.archive'),
      onPress: run(onArchive),
    },
    { key: 'delete', title: t('card.menu.delete'), onPress: handleDelete },
  ];

  return (
    <Sheet visible={visible} onClose={onClose} title={card.title}>
      {actions.map((action) => (
        <Item key={action.key} title={action.title} onPress={action.onPress} />
      ))}
    </Sheet>
  );
}
