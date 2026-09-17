import React, { useCallback, useEffect, useRef } from 'react';
import {
  FlatList,
  LayoutChangeEvent,
  ListRenderItemInfo,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';

import type Stack from '@/database/models/Stack';
import { Button, Divider, Typography } from '@/ui/components';
import { CardTile, type CardTileData } from './CardTile';
import { DraggableCard } from '../dnd/DraggableCard';
import { useOptionalDrag } from '../dnd/DragContext';
import type { TileLayout } from '../dnd/dropTarget';

export interface StackColumnProps {
  stack: Pick<Stack, 'id' | 'title'>;
  cards: CardTileData[];
  width: number;
  onCardPress: (cardId: string) => void;
  onAddCard: (stackId: string) => void;
  draggable?: boolean;
}

function StackColumnImpl({ stack, cards, width, onCardPress, onAddCard, draggable }: StackColumnProps) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const dragCtx = useOptionalDrag();

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

  // renderItem below is frozen (deps []) for the reason explained above, so
  // anything it reads that can change over time — whether this column is
  // draggable, its own stack id, the drag context — has to come through a
  // ref synced every render rather than through closure, the same way
  // onCardPress does.
  const draggableRef = useRef(draggable);
  draggableRef.current = draggable;
  const stackIdRef = useRef(stack.id);
  stackIdRef.current = stack.id;
  const dragCtxRef = useRef(dragCtx);
  dragCtxRef.current = dragCtx;

  // Draggable-only bookkeeping: each rendered tile reports its own layout
  // (from the FlatList cell wrapper, so it's already in list-content
  // coordinates) into this map; scroll position is tracked alongside it.
  // Both feed the shared DragFrame on every layout or scroll change so a
  // drag's target computation (dragController.targetAt, run on the UI
  // thread) never needs a JS round trip mid-gesture.
  const tileLayouts = useRef(new Map<string, TileLayout>());
  for (const id of tileLayouts.current.keys()) {
    if (!liveIds.has(id)) tileLayouts.current.delete(id);
  }
  const scrollYRef = useRef(0);
  const listRef = useRef<FlatList<CardTileData>>(null);
  const listContainerRef = useRef<View>(null);

  const pushColumnState = useCallback(() => {
    const ctx = dragCtxRef.current;
    if (!ctx) return;
    ctx.reportColumn(stackIdRef.current, {
      scrollY: scrollYRef.current,
      tiles: Array.from(tileLayouts.current.values()),
    });
  }, []);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollYRef.current = e.nativeEvent.contentOffset.y;
      pushColumnState();
    },
    [pushColumnState],
  );

  const handleListContainerLayout = useCallback(() => {
    listContainerRef.current?.measureInWindow?.((_x, winY) => {
      dragCtxRef.current?.reportListTop(winY);
    });
  }, []);

  useEffect(() => {
    if (!draggable || !dragCtx) return undefined;
    return dragCtx.registerScroller(stack.id, (dy) => {
      const next = Math.max(0, scrollYRef.current + dy);
      listRef.current?.scrollToOffset({ offset: next, animated: true });
    });
  }, [draggable, dragCtx, stack.id]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<CardTileData>) => {
      const onPress = pressHandlers.current.get(item.card.id)!;
      if (!draggableRef.current) {
        return <CardTile data={item} onPress={onPress} />;
      }
      return (
        <View
          onLayout={(e: LayoutChangeEvent) => {
            const { y, height } = e.nativeEvent.layout;
            tileLayouts.current.set(item.card.id, { cardId: item.card.id, y, height });
            pushColumnState();
          }}
        >
          <DraggableCard data={item} stackId={stackIdRef.current} onPress={onPress} />
        </View>
      );
    },
    [pushColumnState],
  );
  const keyExtractor = useCallback((item: CardTileData) => item.card.id, []);
  const handleAddCard = useCallback(() => onAddCard(stack.id), [onAddCard, stack.id]);

  const emptyComponent = (
    <Typography color="secondary" align="center" style={styles.empty}>
      {t('board.emptyList')}
    </Typography>
  );

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

      {draggable ? (
        <View ref={listContainerRef} style={styles.list} onLayout={handleListContainerLayout}>
          <FlatList
            ref={listRef}
            style={styles.listInner}
            contentContainerStyle={styles.listContent}
            data={cards}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            removeClippedSubviews
            onScroll={handleScroll}
            scrollEventThrottle={16}
            ListEmptyComponent={emptyComponent}
          />
        </View>
      ) : (
        <FlatList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          data={cards}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          removeClippedSubviews
          ListEmptyComponent={emptyComponent}
        />
      )}

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
  listInner: { flex: 1 },
  listContent: { padding: 8, gap: 8 },
  empty: { padding: 16 },
  footer: { padding: 8 },
});

export const StackColumn = React.memo(StackColumnImpl);
