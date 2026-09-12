import React, { useCallback, useRef } from 'react';
import { FlatList, ListRenderItemInfo, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';

import type Stack from '@/database/models/Stack';
import { Button, Divider, Typography } from '@/ui/components';
import { CardTile, type CardTileData } from './CardTile';

export interface StackColumnProps {
  stack: Pick<Stack, 'id' | 'title'>;
  cards: CardTileData[];
  width: number;
  onCardPress: (cardId: string) => void;
  onAddCard: (stackId: string) => void;
}

function StackColumnImpl({ stack, cards, width, onCardPress, onAddCard }: StackColumnProps) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();

  // CardTile is memoized by value and only bails when `onPress` is also
  // referentially stable (see its `areEqual` comparator) — a fresh
  // `() => onCardPress(id)` closure per renderItem call would defeat that
  // memo on every StackColumn re-render. Cache one closure per card id
  // instead, pruned to the ids currently in the list, and read `onCardPress`
  // through a ref so a cached closure always calls the latest callback even
  // though its own identity never changes.
  const onCardPressRef = useRef(onCardPress);
  onCardPressRef.current = onCardPress;
  const pressHandlers = useRef(new Map<string, () => void>());
  const liveIds = new Set(cards.map((data) => data.card.id));
  for (const id of pressHandlers.current.keys()) {
    if (!liveIds.has(id)) pressHandlers.current.delete(id);
  }
  for (const id of liveIds) {
    if (!pressHandlers.current.has(id)) {
      pressHandlers.current.set(id, () => onCardPressRef.current(id));
    }
  }

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<CardTileData>) => (
      <CardTile data={item} onPress={pressHandlers.current.get(item.card.id)!} />
    ),
    [],
  );
  const keyExtractor = useCallback((item: CardTileData) => item.card.id, []);
  const handleAddCard = useCallback(() => onAddCard(stack.id), [onAddCard, stack.id]);

  return (
    <View testID="stack-column" style={[styles.root, { width, backgroundColor: colors.surface, borderRadius: radius.lg }]}>
      <View style={styles.header}>
        <Typography variant="title" numberOfLines={1} style={styles.headerTitle}>
          {stack.title}
        </Typography>
        <Typography variant="caption" color="secondary" nowrap>
          {t('board.cardCount', { count: cards.length })}
        </Typography>
      </View>
      <Divider />

      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={cards}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        removeClippedSubviews
        ListEmptyComponent={
          <Typography color="secondary" align="center" style={styles.empty}>
            {t('board.emptyList')}
          </Typography>
        }
      />

      <View style={styles.footer}>
        <Button variant="ghost" size="small" alignment="start" title={t('board.addCard')} onPress={handleAddCard} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { height: '100%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
  headerTitle: { flex: 1, marginRight: 8 },
  list: { flex: 1 },
  listContent: { padding: 8, gap: 8 },
  empty: { padding: 16 },
  footer: { padding: 8 },
});

export const StackColumn = React.memo(StackColumnImpl);
