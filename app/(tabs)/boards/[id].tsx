import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, type ListRenderItemInfo, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useAccountStore } from '@/stores/accountStore';
import { useUiStore } from '@/stores/uiStore';
import { useBoardCards, useBoards } from '@/database/hooks/useBoards';
import { useBoardStacks } from '@/database/hooks/useBoardContent';
import { useBoardCardRelations } from '@/database/hooks/useBoardRelations';
import type Stack from '@/database/models/Stack';
import { useStackActions } from '@/features/board/hooks/useStackActions';
import { useCardActions } from '@/features/board/hooks/useCardActions';
import { StackColumn } from '@/features/board/components/StackColumn';
import { StackFormSheet } from '@/features/board/components/StackFormSheet';
import { toCardTileCard, type CardTileData } from '@/features/board/components/CardTile';
import { requestBoardSnapshot } from '@/sync/scheduler';
import { Button, ScreenHeader, ViewContainer } from '@/ui/components';

// Screen width minus this margin leaves the next column's edge visible, so a
// swipe reads as "there's more" rather than landing on a dead end.
const PEEK = 40;
const GAP = 12;

type AddTarget = { kind: 'list' } | { kind: 'card'; stackId: string };

export default function BoardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const accountId = useAccountStore((s) => s.activeAccountId);

  const board = useBoards(accountId).find((b) => b.id === id);
  const boardLocalId = board?.id ?? null;

  const stacks = useBoardStacks(accountId, boardLocalId);
  const cards = useBoardCards(accountId, boardLocalId);
  const { labelsByCard, assigneesByCard } = useBoardCardRelations(accountId, boardLocalId);
  const stackActions = useStackActions(accountId, boardLocalId);
  const cardActions = useCardActions(accountId);

  // Which sheet is open, if any: this one sheet is reused for both "add a
  // list" and "add a card to stack X" (see StackFormSheet's heading/placeholder).
  const [addTarget, setAddTarget] = useState<AddTarget | null>(null);

  const boardRemoteId = board?.remoteId ?? '';
  useEffect(() => {
    // A board created offline has no remote id yet — nothing to fetch.
    if (!accountId || !boardRemoteId) return;
    requestBoardSnapshot(accountId, boardRemoteId);
    return () => useUiStore.getState().setActiveBoardRemoteId(null);
  }, [accountId, boardRemoteId]);

  // Grouped once per data change, not per render of each column: a fresh
  // CardTileData snapshot per card (see toCardTileCard) so a column never
  // holds a live, in-place-mutable model reference.
  const cardTilesByStack = useMemo(() => {
    const map = new Map<string, CardTileData[]>();
    for (const card of cards) {
      const data: CardTileData = {
        card: toCardTileCard(card),
        labels: (labelsByCard.get(card.id) ?? []).map((label) => ({
          id: label.id,
          title: label.title,
          color: label.color ?? null,
        })),
        assignees: (assigneesByCard.get(card.id) ?? []).map((assignee) => ({
          participant: assignee.participant,
          displayName: assignee.displayName,
        })),
      };
      const list = map.get(card.stackId);
      if (list) list.push(data);
      else map.set(card.stackId, [data]);
    }
    return map;
  }, [cards, labelsByCard, assigneesByCard]);

  // Stable references across renders so StackColumn's memoization actually
  // bails instead of re-rendering every column on every screen render.
  const handleCardPress = useCallback((cardId: string) => router.push(`/card/${cardId}`), [router]);
  const handleAddCard = useCallback((stackId: string) => setAddTarget({ kind: 'card', stackId }), []);

  const columnWidth = windowWidth - PEEK;

  const renderStack = useCallback(
    ({ item }: ListRenderItemInfo<Stack>) => (
      <StackColumn
        stack={item}
        cards={cardTilesByStack.get(item.id) ?? []}
        width={columnWidth}
        onCardPress={handleCardPress}
        onAddCard={handleAddCard}
      />
    ),
    [cardTilesByStack, columnWidth, handleCardPress, handleAddCard],
  );

  if (!board) return null;

  return (
    <ViewContainer>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScreenHeader title={board.title} onBack={() => router.back()} />

        <FlatList
          horizontal
          data={stacks}
          keyExtractor={(item) => item.id}
          renderItem={renderStack}
          contentContainerStyle={styles.listContent}
          snapToInterval={columnWidth + GAP}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          showsHorizontalScrollIndicator={false}
          initialNumToRender={3}
          ListFooterComponent={
            <View style={{ width: columnWidth }}>
              <Button
                variant="secondary"
                title={t('board.addList')}
                onPress={() => setAddTarget({ kind: 'list' })}
              />
            </View>
          }
        />
      </SafeAreaView>

      <StackFormSheet
        visible={addTarget !== null}
        heading={addTarget?.kind === 'card' ? t('board.form.newCard') : undefined}
        placeholder={addTarget?.kind === 'card' ? t('board.cardTitle') : undefined}
        onClose={() => setAddTarget(null)}
        onSubmit={({ title }) => {
          if (addTarget?.kind === 'card') {
            void cardActions
              .create({ boardLocalId: board.id, stackLocalId: addTarget.stackId, title })
              .catch(() => undefined);
          } else {
            void stackActions.create(title).catch(() => undefined);
          }
        }}
      />
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listContent: { paddingHorizontal: GAP, paddingBottom: 12, gap: GAP },
});
