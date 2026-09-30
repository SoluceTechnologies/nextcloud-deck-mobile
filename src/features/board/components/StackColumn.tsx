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
import { Ellipsis, Plus } from 'lucide-react-native';
import Reanimated, { useAnimatedStyle } from 'react-native-reanimated';

import type Stack from '@/database/models/Stack';
import { Button, Divider, IconButton, Typography } from '@/ui/components';
import { CardTile, type CardTileData } from './CardTile';
import { DraggableCard } from '../dnd/DraggableCard';
import { useOptionalDrag } from '../dnd/DragContext';
import { stackTileLayouts } from '../dnd/dropTarget';

const LIST_PADDING = 8;
const LIST_GAP = 8;

export interface StackColumnProps {
  stack: Pick<Stack, 'id' | 'title'>;
  cards: CardTileData[];
  width: number;
  onCardPress: (cardId: string) => void;
  onAddCard: (stackId: string) => void;
  draggable?: boolean;
  reorderable?: boolean;
  onOpenMenu?: (stackId: string) => void;
}

function StackColumnImpl({
  stack,
  cards,
  width,
  onCardPress,
  onAddCard,
  draggable,
  reorderable,
  onOpenMenu,
}: StackColumnProps) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const dragCtx = useOptionalDrag();

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

  const draggableRef = useRef(draggable);
  draggableRef.current = draggable;
  const stackIdRef = useRef(stack.id);
  stackIdRef.current = stack.id;
  const dragCtxRef = useRef(dragCtx);
  dragCtxRef.current = dragCtx;

  const tileHeights = useRef(new Map<string, number>());
  for (const id of tileHeights.current.keys()) {
    if (!liveIds.has(id)) tileHeights.current.delete(id);
  }
  const cardIdsRef = useRef<string[]>([]);
  cardIdsRef.current = cards.map((data) => data.card.id);
  const scrollYRef = useRef(0);
  const listRef = useRef<FlatList<CardTileData>>(null);
  const listContainerRef = useRef<View>(null);

  const pushColumnState = useCallback(() => {
    const ctx = dragCtxRef.current;
    if (!ctx) return;
    ctx.reportColumn(stackIdRef.current, {
      scrollY: scrollYRef.current,
      tiles: stackTileLayouts(cardIdsRef.current, tileHeights.current, LIST_PADDING, LIST_GAP),
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
            tileHeights.current.set(item.card.id, e.nativeEvent.layout.height);
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
  const handleOpenMenu = useCallback(() => onOpenMenu?.(stack.id), [onOpenMenu, stack.id]);

  const activeId = dragCtx?.activeId;
  const stackId = stack.id;
  const liftedStyle = useAnimatedStyle(() => ({
    opacity: reorderable && activeId?.value === stackId ? 0 : 1,
  }));
  const slotStyle = useAnimatedStyle(() => ({
    opacity: reorderable && activeId?.value === stackId ? 1 : 0,
  }));

  const emptyComponent = (
    <Typography color="secondary" align="center" style={styles.empty}>
      {t('board.emptyList')}
    </Typography>
  );

  return (
    <View style={[styles.root, { width }]}>
      <Reanimated.View
        testID="stack-column"
        style={[styles.root, { width, backgroundColor: colors.surface, borderRadius: radius.lg }, liftedStyle]}
      >
        <View style={styles.header}>
          <Typography variant="title" numberOfLines={1} style={styles.headerTitle}>
            {stack.title}
          </Typography>
          <Typography variant="caption" color="secondary" nowrap>
            {t('board.cardCount', { count: cards.length })}
          </Typography>
          {onOpenMenu ? (
            <IconButton size={32} accessibilityLabel={t('board.actions.menu')} onPress={handleOpenMenu}>
              <Ellipsis size={18} color={colors.textSecondary} />
            </IconButton>
          ) : null}
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
          <Button
            variant="secondary"
            icon={<Plus size={18} color={colors.primary} />}
            title={t('board.addCard')}
            onPress={handleAddCard}
          />
        </View>
      </Reanimated.View>
      {reorderable ? (
        <Reanimated.View
          testID="stack-drop-slot"
          pointerEvents="none"
          style={[
            styles.slot,
            { borderRadius: radius.lg, borderColor: colors.primary, backgroundColor: `${colors.primary}14` },
            slotStyle,
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { height: '100%' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  headerTitle: { flex: 1 },
  list: { flex: 1 },
  listInner: { flex: 1 },
  listContent: { padding: LIST_PADDING, gap: LIST_GAP },
  empty: { padding: 16 },
  footer: { padding: 8 },
  slot: { position: 'absolute', inset: 0, borderWidth: 3, borderStyle: 'dashed' },
});

export const StackColumn = React.memo(StackColumnImpl);
