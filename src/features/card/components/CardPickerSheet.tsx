import { useState } from 'react';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react-native';

import { useBoardCards, useBoards } from '@/database/hooks/useBoards';
import { useBoardStacks } from '@/database/hooks/useBoardContent';
import { IconButton, Item, List, Sheet, Typography } from '@/ui/components';

export type CardPickerMode = 'stack' | 'card';
export type CardPickerResult = { boardLocalId: string; stackLocalId: string; cardLocalId?: string };

export interface CardPickerSheetProps {
  visible: boolean;
  accountId: string | null;
  mode: CardPickerMode;
  onClose: () => void;
  onPick: (result: CardPickerResult) => void;
}

export function CardPickerSheet({ visible, accountId, mode, onClose, onPick }: CardPickerSheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [boardLocalId, setBoardLocalId] = useState<string | null>(null);
  const [stackLocalId, setStackLocalId] = useState<string | null>(null);

  const boards = useBoards(accountId);
  const stacks = useBoardStacks(accountId, boardLocalId);
  const cards = useBoardCards(accountId, boardLocalId).filter((c) => c.stackId === stackLocalId);

  const level = stackLocalId ? 2 : boardLocalId ? 1 : 0;

  const reset = () => {
    setBoardLocalId(null);
    setStackLocalId(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const back = () => {
    if (stackLocalId) setStackLocalId(null);
    else setBoardLocalId(null);
  };

  const pick = (result: CardPickerResult) => {
    onPick(result);
    reset();
    onClose();
  };

  const title =
    level === 2 ? t('card.picker.chooseCard')
    : level === 1 ? t('card.picker.chooseList')
    : t('card.picker.chooseBoard');

  const rows =
    level === 2
      ? cards.map((c) => ({
          key: c.id,
          title: c.title,
          onPress: () => pick({ boardLocalId: boardLocalId!, stackLocalId: stackLocalId!, cardLocalId: c.id }),
        }))
      : level === 1
        ? stacks.map((s) => ({
            key: s.id,
            title: s.title,
            onPress: () =>
              mode === 'stack'
                ? pick({ boardLocalId: boardLocalId!, stackLocalId: s.id })
                : setStackLocalId(s.id),
          }))
        : boards.map((b) => ({ key: b.id, title: b.title, onPress: () => setBoardLocalId(b.id) }));

  return (
    <Sheet visible={visible} onClose={close} title={title}>
      {level > 0 && (
        <IconButton
          testID="picker-back"
          variant="ghost"
          round
          size={40}
          accessibilityLabel={t('common.back')}
          onPress={back}
        >
          <ChevronLeft size={22} color={colors.text} />
        </IconButton>
      )}
      {rows.length > 0 ? (
        <List>
          {rows.map((row) => (
            <Item key={row.key} title={row.title} onPress={row.onPress} />
          ))}
        </List>
      ) : (
        <Typography color="secondary" align="center">
          {t('card.picker.empty')}
        </Typography>
      )}
    </Sheet>
  );
}
