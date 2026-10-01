import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  FlatList,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Reanimated, {
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';

import { useAccountStore } from '@/stores/accountStore';
import { boardContentKey, useUiStore } from '@/stores/uiStore';
import { useDatabase } from '@/database/DatabaseProvider';
import { useBoardCards, useBoards } from '@/database/hooks/useBoards';
import { useBoardStacks } from '@/database/hooks/useBoardContent';
import { useBoardCardRelations } from '@/database/hooks/useBoardRelations';
import type Board from '@/database/models/Board';
import type Stack from '@/database/models/Stack';
import { useStackActions } from '@/features/board/hooks/useStackActions';
import { useCardActions } from '@/features/board/hooks/useCardActions';
import { StackColumn } from '@/features/board/components/StackColumn';
import { StackFormSheet } from '@/features/board/components/StackFormSheet';
import { StackActionsSheet } from '@/features/board/components/StackActionsSheet';
import { toCardTileCard, type CardTileData } from '@/features/board/components/CardTile';
import { DragProvider, useDrag, useDragActiveData } from '@/features/board/dnd/DragContext';
import { DragOverlay } from '@/features/board/dnd/DragOverlay';
import { StackSlot } from '@/features/board/dnd/StackSlot';
import type { DropResult } from '@/features/board/dnd/dragController';
import { edgeDirection, orderFor } from '@/features/board/dnd/dropTarget';
import { useStackDragGesture, type StackDragSource } from '@/features/board/dnd/useStackDragGesture';
import { recordRecentBoard } from '@/features/today/recentBoards';
import { useIsOnline } from '@/services/shared/network';
import { requestBoardSnapshot } from '@/sync/scheduler';
import { nativeTabsEnabled } from '@/utils/nativeTabs';
import { Button, ScreenHeader, Spinner, ViewContainer } from '@/ui/components';

const PEEK = 40;
const GAP = 12;
const TABLET_MIN_WIDTH = 600;
const TABLET_VISIBLE_COLUMNS = 3;
const DRAG_ZOOM = 0.9;

function getColumnWidth(windowWidth: number): number {
  if (windowWidth < TABLET_MIN_WIDTH) return windowWidth - PEEK;
  const n = TABLET_VISIBLE_COLUMNS;
  return Math.floor((windowWidth - GAP * (n + 1)) / n);
}

type FormTarget = { kind: 'list' } | { kind: 'card'; stackId: string } | { kind: 'rename'; stack: Stack };

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

  const [formTarget, setFormTarget] = useState<FormTarget | null>(null);
  const [menuStackId, setMenuStackId] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [orderVersion, setOrderVersion] = useState(0);
  const anchors = useRef(new Map<string, number>()).current;
  stacks.forEach((stack, index) => {
    if (!anchors.has(stack.id)) anchors.set(stack.id, index);
  });

  const db = useDatabase();
  const boardRemoteId = board?.remoteId ?? '';
  useEffect(() => {
    if (accountId && board?.id) {
      void recordRecentBoard(db, accountId, board.id).catch(() => undefined);
    }
    if (!accountId || !boardRemoteId) return;
    requestBoardSnapshot(accountId, boardRemoteId);
    return () => useUiStore.getState().setActiveBoardRemoteId(null);
  }, [accountId, boardRemoteId, board?.id]);

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

  const handleCardPress = useCallback((cardId: string) => router.push(`/card/${cardId}`), [router]);
  const handleAddCard = useCallback((stackId: string) => setFormTarget({ kind: 'card', stackId }), []);
  const handleOpenMenu = useCallback((stackId: string) => {
    setMenuStackId(stackId);
    setMenuVisible(true);
  }, []);

  const columnWidth = getColumnWidth(windowWidth);

  const online = useIsOnline();
  const fetchedAt = useUiStore((s) =>
    accountId ? s.boardContentFetchedAt[boardContentKey(accountId, boardRemoteId)] : undefined,
  );
  const loadingContent = boardRemoteId !== '' && online && fetchedAt === undefined;

  const renderStack = useCallback(
    ({ item, index }: ListRenderItemInfo<Stack>) => (
      <StackSlot stackId={item.id} index={index} anchor={anchors.get(item.id) ?? index} step={columnWidth + GAP}>
        <StackColumn
          stack={item}
          cards={cardTilesByStack.get(item.id) ?? []}
          width={columnWidth}
          onCardPress={handleCardPress}
          onAddCard={handleAddCard}
          draggable={board?.canEdit}
          reorderable={board?.canManage}
          onOpenMenu={board?.canEdit ? handleOpenMenu : undefined}
        />
      </StackSlot>
    ),
    [anchors, cardTilesByStack, columnWidth, handleCardPress, handleAddCard, handleOpenMenu, board?.canEdit, board?.canManage],
  );

  const handleDrop = useCallback(
    ({ cardId, fromStackId, toStackId, index }: DropResult) => {
      const card = cards.find((c) => c.id === cardId);
      if (!card) return;

      const others = cards.filter((c) => c.stackId === toStackId && c.id !== cardId);
      if (toStackId === fromStackId) {
        const currentIndex = others.filter((c) => c.order < card.order).length;
        if (currentIndex === index) return;
      }

      const { local, remote } = orderFor(index, others.map((c) => c.order));
      void cardActions.move(card, toStackId, remote, local).catch(() => undefined);
    },
    [cards, cardActions],
  );

  const handleStackDrop = useCallback(
    (stackId: string, index: number) => {
      const revert = () => setOrderVersion((v) => v + 1);
      const stack = stacks.find((s) => s.id === stackId);
      if (!stack) return revert();
      void stackActions.move(stack, index).catch(revert);
    },
    [stacks, stackActions],
  );

  const stackSourceOf = useCallback(
    (stackId: string): StackDragSource | null => {
      const stack = stacks.find((s) => s.id === stackId);
      return stack ? { stack, cards: cardTilesByStack.get(stackId) ?? [] } : null;
    },
    [stacks, cardTilesByStack],
  );

  const menuStack = stacks.find((s) => s.id === menuStackId) ?? null;
  const menuCards = menuStack ? cards.filter((c) => c.stackId === menuStack.id) : [];

  if (!board) {
    return (
      <ViewContainer>
        <SafeAreaView edges={['top']} style={styles.flex}>
          <ScreenHeader onBack={() => router.back()} />
          <View style={styles.loading}>
            <Spinner />
          </View>
        </SafeAreaView>
      </ViewContainer>
    );
  }

  return (
    <ViewContainer>
      <DragProvider
        enabled={board.canEdit}
        onDrop={handleDrop}
        onStackDrop={handleStackDrop}
      >
        <BoardColumns
          board={board}
          stacks={stacks}
          orderVersion={orderVersion}
          columnWidth={columnWidth}
          windowWidth={windowWidth}
          renderStack={renderStack}
          canReorder={board.canManage}
          stackSourceOf={stackSourceOf}
          loading={loadingContent}
          onAddList={() => setFormTarget({ kind: 'list' })}
        />
        <DragOverlay />
      </DragProvider>

      {menuStack ? (
        <StackActionsSheet
          title={menuStack.title}
          cardCount={menuCards.length}
          canManage={board.canManage}
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
          onRename={() => setFormTarget({ kind: 'rename', stack: menuStack })}
          onMarkAllDone={() => {
            void (async () => {
              for (const card of menuCards) if (!card.doneAt) await cardActions.setDone(card, true);
            })().catch(() => undefined);
          }}
          onArchiveAll={() => {
            void (async () => {
              for (const card of menuCards) await cardActions.setArchived(card, true);
            })().catch(() => undefined);
          }}
          onDelete={() => void stackActions.remove(menuStack).catch(() => undefined)}
        />
      ) : null}

      <StackFormSheet
        visible={formTarget !== null}
        initial={formTarget?.kind === 'rename' ? { title: formTarget.stack.title } : undefined}
        heading={formTarget?.kind === 'card' ? t('board.form.newCard') : undefined}
        placeholder={formTarget?.kind === 'card' ? t('board.cardTitle') : undefined}
        onClose={() => setFormTarget(null)}
        onSubmit={({ title }) => {
          if (formTarget?.kind === 'card') {
            void cardActions
              .create({ boardLocalId: board.id, stackLocalId: formTarget.stackId, title })
              .catch(() => undefined);
          } else if (formTarget?.kind === 'rename') {
            if (title !== formTarget.stack.title) {
              void stackActions.rename(formTarget.stack, title).catch(() => undefined);
            }
          } else {
            void stackActions.create(title).catch(() => undefined);
          }
        }}
      />
    </ViewContainer>
  );
}

type BoardColumnsProps = {
  board: Pick<Board, 'title'>;
  stacks: Stack[];
  orderVersion: number;
  columnWidth: number;
  windowWidth: number;
  renderStack: (info: ListRenderItemInfo<Stack>) => ReactElement;
  canReorder: boolean;
  stackSourceOf: (stackId: string) => StackDragSource | null;
  loading: boolean;
  onAddList: () => void;
};

function BoardColumns({
  board,
  stacks,
  orderVersion,
  columnWidth,
  windowWidth,
  renderStack,
  canReorder,
  stackSourceOf,
  loading,
  onAddList,
}: BoardColumnsProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { frame, x, y, startX, target, zoom, stackOrder, scrollColumnBy } = useDrag();
  const activeData = useDragActiveData();
  const listRef = useAnimatedRef<FlatList<Stack>>();
  const listHeightRef = useRef(0);
  const insets = useSafeAreaInsets();
  const tabBarInset = nativeTabsEnabled() ? insets.bottom : 0;
  const bottomInset = 12 + tabBarInset;
  const boardRef = useRef<View>(null);
  const stackDragGesture = useStackDragGesture({
    enabled: canReorder,
    boardRef,
    listRef,
    viewportWidth: windowWidth,
    zoomOut: DRAG_ZOOM,
    bottomInset,
    sourceOf: stackSourceOf,
  });

  useEffect(() => {
    const stackIds = stacks.map((s) => s.id);
    const geometry = { gap: GAP, columnWidth, columnCount: stacks.length };
    frame.modify((f) => {
      'worklet';
      f.stackIds = stackIds;
      f.geometry = geometry;
      return f;
    });
    stackOrder.value = stackIds;
  }, [frame, stackOrder, stacks, columnWidth, orderVersion]);

  useEffect(() => {
    if (activeData === null || !('card' in activeData)) return undefined;

    let lastHorizontalScrollAt = 0;
    const interval = setInterval(() => {
      const dirX = edgeDirection(x.value, windowWidth, 48);
      if (dirX !== 0) {
        const now = Date.now();
        if (now - lastHorizontalScrollAt >= 600) {
          lastHorizontalScrollAt = now;
          listRef.current?.scrollToOffset({
            offset: frame.value.scrollX + dirX * (columnWidth + GAP),
            animated: true,
          });
        }
      }

      const dirY = edgeDirection(y.value - frame.value.listTopY, listHeightRef.current, 64);
      if (dirY !== 0) {
        const stackId = target.value?.stackId;
        if (stackId) scrollColumnBy(stackId, dirY * 120);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [activeData, x, y, target, frame, windowWidth, columnWidth, scrollColumnBy, listRef]);

  const zoomStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: startX.value * (1 - zoom.value) }, { scale: zoom.value }],
  }));

  const onScroll = useAnimatedScrollHandler((e) => {
    frame.modify((f) => {
      'worklet';
      f.scrollX = e.contentOffset.x;
      return f;
    });
  });

  return (
    <SafeAreaView edges={['top']} style={styles.flex}>
      <ScreenHeader title={board.title} onBack={() => router.back()} />

      <GestureDetector gesture={stackDragGesture}>
        <View ref={boardRef} style={styles.flex} collapsable={false}>
          <Reanimated.View style={[styles.zoomable, zoomStyle]}>
            <Reanimated.FlatList<Stack>
              ref={listRef}
              horizontal
              style={styles.overflowVisible}
              data={stacks}
              keyExtractor={(item) => item.id}
              renderItem={renderStack}
              onScroll={onScroll}
              scrollEventThrottle={16}
              onLayout={(e: LayoutChangeEvent) => {
                listHeightRef.current = e.nativeEvent.layout.height;
              }}
              contentContainerStyle={[styles.listContent, { paddingBottom: bottomInset }]}
              snapToInterval={columnWidth + GAP}
              snapToAlignment="start"
              decelerationRate="fast"
              disableIntervalMomentum
              showsHorizontalScrollIndicator={false}
              initialNumToRender={3}
              ListEmptyComponent={
                loading ? (
                  <View testID="board-loading" style={[styles.loading, { width: columnWidth }]}>
                    <Spinner />
                  </View>
                ) : null
              }
              ListFooterComponent={
                <View style={{ width: columnWidth }}>
                  <Button variant="secondary" title={t('board.addList')} onPress={onAddList} />
                </View>
              }
            />
          </Reanimated.View>
        </View>
      </GestureDetector>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  zoomable: { flex: 1, transformOrigin: [0, 0, 0] },
  overflowVisible: { overflow: 'visible' },
  listContent: { paddingHorizontal: GAP, gap: GAP },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 48 },
});
