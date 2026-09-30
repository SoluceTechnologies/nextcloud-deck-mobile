import { useMemo, useState } from 'react';
import { FlatList, SectionList, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CircleCheckBig, Plus } from 'lucide-react-native';

import { useAccountStore } from '@/stores/accountStore';
import { useAccountCards, useBoards } from '@/database/hooks/useBoards';
import { useAccountCardRelations, useAccountStacks } from '@/database/hooks/useAccountRelations';
import { useRecentBoards } from '@/database/hooks/useRecentBoards';
import { useCardActions } from '@/features/board/hooks/useCardActions';
import { useActiveAccount } from '@/hooks/useAccounts';
import { useWideLayout } from '@/hooks/useWideLayout';
import { summarizeBoards } from '@/features/board/boardFilter';
import { dueStateOf } from '@/features/card/dueState';
import type Card from '@/database/models/Card';
import { groupUpcoming, UPCOMING_BUCKETS } from '@/features/today/upcoming';
import { OverdueBanner } from '@/features/today/components/OverdueBanner';
import { RecentBoardCard, type RecentBoardStats } from '@/features/today/components/RecentBoardCard';
import { TodayRow } from '@/features/today/components/TodayRow';
import { QuickAddCardFlow } from '@/features/card/components/QuickAddCardFlow';
import { nativeTabsEnabled } from '@/utils/nativeTabs';
import { haptic } from '@/utils/haptics';
import {
  Button, EmptyState, ScreenHeader, SectionHeader, ViewContainer,
} from '@/ui/components';

export default function TodayScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const accountId = useAccountStore((s) => s.activeAccountId);
  const me = useActiveAccount(accountId)?.davUserId ?? '';

  const boards = useBoards(accountId);
  const stacks = useAccountStacks(accountId);
  const recentBoards = useRecentBoards(accountId);
  const { assigneesByCard } = useAccountCardRelations(accountId);
  const actions = useCardActions(accountId);

  const boardTitleById = useMemo(() => new Map(boards.map((b) => [b.id, b.title])), [boards]);
  const stackTitleById = useMemo(() => new Map(stacks.map((s) => [s.id, s.title])), [stacks]);

  const allCards = useAccountCards(accountId);
  const cards = useMemo(
    () => allCards.filter((card) => boardTitleById.has(card.boardId)),
    [allCards, boardTitleById],
  );

  const groups = useMemo(
    () => groupUpcoming(cards, assigneesByCard, me, Date.now()),
    [cards, assigneesByCard, me],
  );

  const sections = useMemo(
    () => UPCOMING_BUCKETS
      .filter((bucket) => groups[bucket].length > 0)
      .map((bucket) => ({ bucket, data: groups[bucket] })),
    [groups],
  );

  const wide = useWideLayout();
  const { width: windowWidth } = useWindowDimensions();
  const recentColumns = Math.max(1, Math.floor((windowWidth - CONTENT_PADDING * 2 + GRID_GAP) / (RECENT_MIN_WIDTH + GRID_GAP)));
  const recentWidth = (windowWidth - CONTENT_PADDING * 2 - GRID_GAP * (recentColumns - 1)) / recentColumns;

  const recentStats = useMemo(() => {
    if (!wide) return null;
    const now = Date.now();
    const overdue = new Map<string, number>();
    for (const card of cards) {
      if (card.archived || dueStateOf(card.duedate ?? null, card.doneAt ?? null, now).kind !== 'overdue') continue;
      overdue.set(card.boardId, (overdue.get(card.boardId) ?? 0) + 1);
    }
    return new Map<string, RecentBoardStats>(
      summarizeBoards(recentBoards, cards).map(({ board, doneCount, totalCount }) => [
        board.id,
        { doneCount, totalCount, overdueCount: overdue.get(board.id) ?? 0, lastModified: board.lastModified },
      ]),
    );
  }, [wide, recentBoards, cards]);

  const openBoard = (id: string) => router.push(`/boards/${id}`, { withAnchor: true });

  const [addVisible, setAddVisible] = useState(false);

  function handleToggleDone(card: Card) {
    haptic();
    void actions.setDone(card, true).catch(() => undefined);
  }

  return (
    <ViewContainer>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScreenHeader title={t('today.title')} />
        <SectionList
          style={styles.flex}
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          stickySectionHeadersEnabled={false}
          sections={sections}
          keyExtractor={(card) => card.id}
          renderSectionHeader={({ section }) => (
            <SectionHeader title={t(`today.sections.${section.bucket}`)} />
          )}
          renderItem={({ item: card }) => (
            <TodayRow
              item={{
                id: card.id,
                title: card.title,
                duedate: card.duedate as number, // groupUpcoming only keeps duedate != null
                boardTitle: boardTitleById.get(card.boardId) ?? '',
                stackTitle: stackTitleById.get(card.stackId) ?? '',
                assigneeName: assigneesByCard.get(card.id)?.[0]?.displayName ?? null,
              }}
              onToggleDone={() => handleToggleDone(card)}
              onOpen={(id) => router.push(`/card/${id}`)}
            />
          )}
          ListHeaderComponent={<OverdueBanner count={groups.overdue.length} />}
          ListEmptyComponent={
            <EmptyState
              testID="today-empty"
              icon={
                <View style={[styles.emptyBadge, { backgroundColor: `${colors.primary}1f` }]}>
                  <CircleCheckBig size={34} color={colors.primary} />
                </View>
              }
              title={t('today.emptyTitle')}
              description={t('today.empty')}
            />
          }
          ListFooterComponent={
            recentBoards.length > 0 ? (
              <View style={styles.recentSection}>
                <SectionHeader title={t('today.recent')} />
                {recentStats ? (
                  <View style={styles.recentGrid}>
                    {recentBoards.map((item) => (
                      <RecentBoardCard
                        key={item.id}
                        board={{ id: item.id, title: item.title, color: item.color ?? null, shared: item.shared }}
                        stats={recentStats.get(item.id)}
                        style={{ width: recentWidth }}
                        onPress={openBoard}
                      />
                    ))}
                  </View>
                ) : (
                  <FlatList
                    horizontal
                    data={recentBoards}
                    keyExtractor={(board) => board.id}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.recentList}
                    renderItem={({ item }) => (
                      <RecentBoardCard
                        board={{ id: item.id, title: item.title, color: item.color ?? null, shared: item.shared }}
                        onPress={openBoard}
                      />
                    )}
                  />
                )}
              </View>
            ) : null
          }
        />

        {nativeTabsEnabled() ? null : (
          <Button
            testID="today-add-card"
            variant="secondary"
            icon={<Plus size={18} color={colors.primary} />}
            title={t('today.addCard')}
            style={styles.addCard}
            onPress={() => setAddVisible(true)}
          />
        )}
      </SafeAreaView>

      <QuickAddCardFlow visible={addVisible} accountId={accountId} onClose={() => setAddVisible(false)} />
    </ViewContainer>
  );
}

const CONTENT_PADDING = 16;
const GRID_GAP = 12;
const RECENT_MIN_WIDTH = 280;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: CONTENT_PADDING, paddingBottom: 24, gap: 4 },
  emptyBadge: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  recentSection: { marginTop: 8 },
  recentList: { gap: GRID_GAP, paddingVertical: 4 },
  recentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, paddingVertical: 4 },
  addCard: { marginHorizontal: 16, marginBottom: 12 },
});
