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
import Reanimated, { useAnimatedScrollHandler } from 'react-native-reanimated';

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
import { toCardTileCard, type CardTileData } from '@/features/board/components/CardTile';
import { DragProvider, useDrag, useDragActiveData } from '@/features/board/dnd/DragContext';
import { DragOverlay } from '@/features/board/dnd/DragOverlay';
import type { DropResult } from '@/features/board/dnd/dragController';
import { edgeDirection, orderFor } from '@/features/board/dnd/dropTarget';
import { recordRecentBoard } from '@/features/today/recentBoards';
import { useIsOnline } from '@/services/shared/network';
import { requestBoardSnapshot } from '@/sync/scheduler';
import { nativeTabsEnabled } from '@/utils/nativeTabs';
import { Button, ScreenHeader, Spinner, ViewContainer } from '@/ui/components';

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

  const [addTarget, setAddTarget] = useState<AddTarget | null>(null);

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
  const handleAddCard = useCallback((stackId: string) => setAddTarget({ kind: 'card', stackId }), []);

  const columnWidth = windowWidth - PEEK;

  const online = useIsOnline();
  const fetchedAt = useUiStore((s) =>
    accountId ? s.boardContentFetchedAt[boardContentKey(accountId, boardRemoteId)] : undefined,
  );
  const loadingContent = boardRemoteId !== '' && online && fetchedAt === undefined;

  const renderStack = useCallback(
    ({ item }: ListRenderItemInfo<Stack>) => (
      <StackColumn
        stack={item}
        cards={cardTilesByStack.get(item.id) ?? []}
        width={columnWidth}
        onCardPress={handleCardPress}
        onAddCard={handleAddCard}
        draggable={board?.canEdit}
      />
    ),
    [cardTilesByStack, columnWidth, handleCardPress, handleAddCard, board?.canEdit],
  );

  const handleDrop = useCallback(
    ({ cardId, fromStackId, toStackId, index }: DropResult) => {
      const card = cards.find((c) => c.id === cardId);
      if (!card) return;

      const others = cards.filter((c) => c.stackId === toStackId && c.id !== cardId);
      if (toStackId === fromStackId) {
        // Same list: a drop back at the card's own current position (among the
        // others) changes nothing — skip the write rather than reorder a no-op.
        const currentIndex = others.filter((c) => c.order < card.order).length;
        if (currentIndex === index) return;
      }

      const { local, remote } = orderFor(index, others.map((c) => c.order));
      void cardActions.move(card, toStackId, remote, local).catch(() => undefined);
    },
    [cards, cardActions],
  );

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
      <DragProvider enabled={board.canEdit} onDrop={handleDrop}>
        <BoardColumns
          board={board}
          stacks={stacks}
          columnWidth={columnWidth}
          windowWidth={windowWidth}
          renderStack={renderStack}
          loading={loadingContent}
          onAddList={() => setAddTarget({ kind: 'list' })}
        />
        <DragOverlay />
      </DragProvider>

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

type BoardColumnsProps = {
  board: Pick<Board, 'title'>;
  stacks: Stack[];
  columnWidth: number;
  windowWidth: number;
  renderStack: (info: ListRenderItemInfo<Stack>) => ReactElement;
  /** The board's first content fetch is still in flight. */
  loading: boolean;
  onAddList: () => void;
};

function BoardColumns({
  board,
  stacks,
  columnWidth,
  windowWidth,
  renderStack,
  loading,
  onAddList,
}: BoardColumnsProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { frame, x, y, target, scrollColumnBy } = useDrag();
  const activeData = useDragActiveData();
  const listRef = useRef<FlatList<Stack>>(null);
  const listHeightRef = useRef(0);
  // The iOS 26 tab bar floats over the screen; its height is in the tab's bottom inset.
  const insets = useSafeAreaInsets();
  const tabBarInset = nativeTabsEnabled() ? insets.bottom : 0;

  useEffect(() => {
    const stackIds = stacks.map((s) => s.id);
    const geometry = { gap: GAP, columnWidth, columnCount: stacks.length };
    frame.modify((f) => {
      'worklet';
      f.stackIds = stackIds;
      f.geometry = geometry;
      return f;
    });
  }, [frame, stacks, columnWidth]);

  useEffect(() => {
    if (activeData === null) return undefined;

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
  }, [activeData, x, y, target, frame, windowWidth, columnWidth, scrollColumnBy]);

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

      <Reanimated.FlatList<Stack>
        ref={listRef}
        horizontal
        data={stacks}
        keyExtractor={(item) => item.id}
        renderItem={renderStack}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onLayout={(e: LayoutChangeEvent) => {
          listHeightRef.current = e.nativeEvent.layout.height;
        }}
        contentContainerStyle={[styles.listContent, { paddingBottom: 12 + tabBarInset }]}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listContent: { paddingHorizontal: GAP, gap: GAP },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 48 },
});
