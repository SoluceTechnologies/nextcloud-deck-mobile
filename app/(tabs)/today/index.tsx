import { useMemo, useState } from 'react';
import { FlatList, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react-native';

import { useAccountStore } from '@/stores/accountStore';
import { useAccountCards, useBoards } from '@/database/hooks/useBoards';
import { useAccountCardRelations, useAccountStacks } from '@/database/hooks/useAccountRelations';
import { useRecentBoards } from '@/database/hooks/useRecentBoards';
import { useCardActions } from '@/features/board/hooks/useCardActions';
import { useActiveAccount } from '@/hooks/useAccounts';
import type Card from '@/database/models/Card';
import { groupUpcoming, UPCOMING_BUCKETS } from '@/features/today/upcoming';
import { OverdueBanner } from '@/features/today/components/OverdueBanner';
import { RecentBoardCard } from '@/features/today/components/RecentBoardCard';
import { TodayRow } from '@/features/today/components/TodayRow';
import { QuickAddCardFlow } from '@/features/card/components/QuickAddCardFlow';
import { haptic } from '@/utils/haptics';
import {
  Button, ScreenHeader, SectionHeader, Typography, ViewContainer,
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
            <Typography testID="today-empty" color="secondary" align="center" style={styles.empty}>
              {t('today.empty')}
            </Typography>
          }
          ListFooterComponent={
            recentBoards.length > 0 ? (
              <View style={styles.recentSection}>
                <SectionHeader title={t('today.recent')} />
                <FlatList
                  horizontal
                  data={recentBoards}
                  keyExtractor={(board) => board.id}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.recentList}
                  renderItem={({ item }) => (
                    <RecentBoardCard
                      board={{ id: item.id, title: item.title, color: item.color ?? null, shared: item.shared }}
                      onPress={(id) => router.push(`/boards/${id}`, { withAnchor: true })}
                    />
                  )}
                />
              </View>
            ) : null
          }
        />

        <Button
          testID="today-add-card"
          variant="secondary"
          icon={<Plus size={18} color={colors.primary} />}
          title={t('today.addCard')}
          style={styles.addCard}
          onPress={() => setAddVisible(true)}
        />
      </SafeAreaView>

      <QuickAddCardFlow visible={addVisible} accountId={accountId} onClose={() => setAddVisible(false)} />
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 4 },
  empty: { marginTop: 32 },
  recentSection: { marginTop: 8 },
  recentList: { gap: 12, paddingVertical: 4 },
  addCard: { marginHorizontal: 16, marginBottom: 12 },
});
