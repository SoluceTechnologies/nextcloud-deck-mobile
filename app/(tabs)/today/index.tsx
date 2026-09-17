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
  // CardAssignee.participant is the Nextcloud uid (see normalize.ts's
  // uidOf), which davUserId — not the free-typed username — is kept in
  // step with (see nextcloud.ts). The two can differ (email alias, case).
  const me = useActiveAccount(accountId)?.davUserId ?? '';

  const boards = useBoards(accountId);
  const stacks = useAccountStacks(accountId);
  const recentBoards = useRecentBoards(accountId);
  const { assigneesByCard } = useAccountCardRelations(accountId);
  const actions = useCardActions(accountId);

  const boardTitleById = useMemo(() => new Map(boards.map((b) => [b.id, b.title])), [boards]);
  const stackTitleById = useMemo(() => new Map(stacks.map((s) => [s.id, s.title])), [stacks]);

  // R9: syncBoards doesn't yet cascade a board deleted on the server, and
  // useAccountCards reads account-wide — so an orphaned card would otherwise
  // render here with a blank board name. useBoards already excludes archived
  // boards too, so this one check keeps both off Today, same shape as
  // useLocalSearch's `if (boardTitle === undefined) continue`.
  const allCards = useAccountCards(accountId);
  const cards = useMemo(
    () => allCards.filter((card) => boardTitleById.has(card.boardId)),
    [allCards, boardTitleById],
  );

  // Recomputed with Date.now() at render rather than a ticking clock: the
  // screen only re-renders on the next cache emission anyway, so a midnight
  // rollover shows the previous day's buckets until then — acceptable.
  const groups = useMemo(
    () => groupUpcoming(cards, assigneesByCard, me, Date.now()),
    [cards, assigneesByCard, me],
  );

  // Spec Sec.10 wants every list virtualized; this screen used to .map() every
  // bucket straight into a ScrollView, mounting every due card at once. One
  // SectionList over the non-empty buckets only mounts what's on screen.
  // Buckets with no cards are omitted entirely (same as the old `if
  // (groups[bucket].length === 0) return null`), so an empty `sections` is
  // exactly the "nothing due" case — SectionList's own ListEmptyComponent
  // covers it without a separate isEmpty flag.
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
            <>
              {recentBoards.length > 0 ? (
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
                        onPress={(id) => router.push(`/boards/${id}`)}
                      />
                    )}
                  />
                </View>
              ) : null}

              <Button
                testID="today-add-card"
                variant="secondary"
                icon={<Plus size={18} color={colors.primary} />}
                title={t('today.addCard')}
                onPress={() => setAddVisible(true)}
              />
            </>
          }
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
});
