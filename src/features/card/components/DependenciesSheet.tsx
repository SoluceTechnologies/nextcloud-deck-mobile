import { useState } from 'react';
import { View } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Link2, Plus, X } from 'lucide-react-native';

import { useAccountCards } from '@/database/hooks/useBoards';
import { CardPickerSheet, type CardPickerResult } from './CardPickerSheet';
import { EmptyState, IconButton, IconTile, Item, List, Sheet, Typography } from '@/ui/components';

export type Dependency = { remoteId: string; title: string };

export interface DependenciesSheetProps {
  visible: boolean;
  accountId: string | null;
  cardId: string;
  dependencies: Dependency[];
  onClose: () => void;
  onAdd: (remoteId: string) => void;
  onRemove: (remoteId: string) => void;
}

/**
 * The card's dependent-card list, plus an "add" row that drills into
 * CardPickerSheet (mode="card") to point at another card of the account.
 * The addDependency/removeDependency intents carry a *remote* id (R38): the
 * picker itself knows nothing about sync state, so a pick is screened here
 * after the fact — a self-reference is silently dropped, and a card that has
 * never synced (remoteId === '') gets an explanation instead of an intent
 * that could never resolve on the server.
 */
export function DependenciesSheet({
  visible,
  accountId,
  cardId,
  dependencies,
  onClose,
  onAdd,
  onRemove,
}: DependenciesSheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [pickerVisible, setPickerVisible] = useState(false);
  const [needsSyncNotice, setNeedsSyncNotice] = useState(false);
  const cards = useAccountCards(accountId);

  const close = () => {
    setPickerVisible(false);
    setNeedsSyncNotice(false);
    onClose();
  };

  const pick = ({ cardLocalId }: CardPickerResult) => {
    const row = cards.find((c) => c.id === cardLocalId);
    if (!row || row.id === cardId) return;
    if (!row.remoteId) {
      setNeedsSyncNotice(true);
      return;
    }
    setNeedsSyncNotice(false);
    onAdd(row.remoteId);
  };

  return (
    <Sheet visible={visible} onClose={close} title={t('card.dependencies')}>
      {dependencies.length > 0 ? (
        <List>
          {dependencies.map((dep) => (
            <View key={dep.remoteId} testID={`dependency-row-${dep.remoteId}`}>
              <Item
                title={dep.title}
                leading={<IconTile><Link2 /></IconTile>}
                trailing={
                  <IconButton
                    testID={`dependency-remove-${dep.remoteId}`}
                    variant="ghost"
                    round
                    size={36}
                    accessibilityLabel={t('common.remove')}
                    onPress={() => onRemove(dep.remoteId)}
                  >
                    <X size={18} color={colors.text} />
                  </IconButton>
                }
              />
            </View>
          ))}
        </List>
      ) : (
        <EmptyState
          testID="dependencies-empty"
          icon={<Link2 />}
          title={t('card.noDependencies')}
          description={t('card.noDependenciesHint')}
        />
      )}

      {needsSyncNotice ? (
        <Typography testID="dependency-notice" color="secondary" align="center">
          {t('card.dependencyNeedsSync')}
        </Typography>
      ) : null}

      <List>
        <Item
          title={t('card.addDependency')}
          leading={<IconTile tint="primary"><Plus /></IconTile>}
          onPress={() => setPickerVisible(true)}
        />
      </List>

      <CardPickerSheet
        visible={pickerVisible}
        accountId={accountId}
        mode="card"
        onClose={() => setPickerVisible(false)}
        onPick={pick}
      />
    </Sheet>
  );
}
