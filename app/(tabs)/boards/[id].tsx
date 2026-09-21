import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  FlatList,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { Button, ScreenHeader, Spinner, ViewContainer } from '@/ui/components';

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

  const db = useDatabase();
  const boardRemoteId = board?.remoteId ?? '';
  useEffect(() => {
    // Recent boards are sourced from in-app consultations (design spec
    // §7.6), not from a successful sync — record the open even when the
    // board has no remote id yet. recordRecentBoard is a local-only
    // preference write (never an outbox intent), so it is called directly
    // here rather than through a use*Actions mutate() hook.
    if (accountId && board?.id) {
      void recordRecentBoard(db, accountId, board.id).catch(() => undefined);
    }
    // A board created offline has no remote id yet — nothing to fetch.
    if (!accountId || !boardRemoteId) return;
    requestBoardSnapshot(accountId, boardRemoteId);
    return () => useUiStore.getState().setActiveBoardRemoteId(null);
  }, [accountId, boardRemoteId, board?.id]);

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

  // A board with no lists is either genuinely empty or still on its way, and
  // the stack list alone cannot tell them apart. Three things settle it:
  // a board with no remote id was created here and has nothing to fetch; the
  // scheduler stamps every attempt it makes (see runTask); and offline there
  // will be no attempt at all, so waiting on one would spin forever.
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

  // A drop's target list is `cards` in `toStackId` order, minus the card being moved —
  // exactly the siblings it would land among. `cards` is already sorted by `order`
  // (useBoardCards), so `others` stays sorted too, matching what orderFor expects.
  // Exactly one mutate: cardActions.move is the only write this ever issues.
  // useCallback so this stays referentially stable across a re-render that
  // doesn't change cards/cardActions (e.g. the add-card sheet opening) —
  // DragProvider's onDrop prop feeds straight into its memoized context
  // value (see DragContext.tsx), so an unstable closure here would
  // re-render every mounted DraggableCard on every such screen re-render.
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

  // useBoards starts at [] and fills in once its subscription emits, so a
  // cold open lands here for a frame or two — rendering null makes that read
  // as a broken screen rather than a loading one.
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

// Lives inside <DragProvider> (BoardScreen's return, above) so it can call useDrag():
// BoardScreen renders DragProvider itself, so it can never be a descendant of its own
// output and cannot reach the shared drag state in its own body.
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
  // The vertical scrollable area's own height (its own onLayout below) — distinct
  // from the window height, since the header above it isn't part of it.
  const listHeightRef = useRef(0);

  // Keeps the UI-thread-visible column geometry in step with what's actually on
  // screen, so targetAt (dragController.ts) never needs a JS round trip mid-gesture.
  useEffect(() => {
    // Mapped out here, not inside the modifier: the modifier is a worklet and
    // runs on the UI thread, so everything it closes over crosses the runtime
    // boundary — and `stacks` holds WatermelonDB models, which cannot. Plain
    // ids and numbers can.
    const stackIds = stacks.map((s) => s.id);
    const geometry = { gap: GAP, columnWidth, columnCount: stacks.length };
    frame.modify((f) => {
      'worklet';
      f.stackIds = stackIds;
      f.geometry = geometry;
      return f;
    });
  }, [frame, stacks, columnWidth]);

  // JS-side autoscroll, only while a card is actually lifted (activeData is set by
  // DraggableCard's begin()/cleared by its finish() — see DragContext). Tearing down
  // on drop and on unmount both go through the same effect cleanup: a drop clears
  // activeData, which re-runs this effect (cleanup first, then the now-null-guarded
  // body that starts nothing), and unmounting runs the same cleanup once more.
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
    // Already on the UI thread here, so this modifier needs no boundary
    // crossing — the directive is for uniformity with the JS-side writers, so
    // "every modify() modifier is a worklet" holds everywhere and greps clean.
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
        contentContainerStyle={styles.listContent}
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
  listContent: { paddingHorizontal: GAP, paddingBottom: 12, gap: GAP },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 48 },
});
