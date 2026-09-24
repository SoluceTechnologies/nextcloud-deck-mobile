import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ArrowUpDown, Plus, Settings } from 'lucide-react-native';

import { useAccountStore } from '@/stores/accountStore';
import { useAccountCards, useBoards } from '@/database/hooks/useBoards';
import { useBoardActions } from '@/features/board/hooks/useBoardActions';
import {
  filterBoards, sortBoards, summarizeBoards, type BoardSort, type BoardSummary,
} from '@/features/board/boardFilter';
import { BoardActionsSheet } from '@/features/board/components/BoardActionsSheet';
import { BoardFormSheet } from '@/features/board/components/BoardFormSheet';
import { BoardRow } from '@/features/board/components/BoardRow';
import type Board from '@/database/models/Board';
import { haptic } from '@/utils/haptics';
import {
  IconButton, ScreenHeader, SectionHeader, Select, TextField, Typography, ViewContainer,
} from '@/ui/components';

export default function BoardsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const accountId = useAccountStore((s) => s.activeAccountId);
  const boards = useBoards(accountId);
  const cards = useAccountCards(accountId);
  const actions = useBoardActions(accountId);

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<BoardSort>('title');

  const [formBoard, setFormBoard] = useState<Board | null>(null);
  const [formVisible, setFormVisible] = useState(false);

  const [actionsTarget, setActionsTarget] = useState<BoardSummary | null>(null);
  const [actionsVisible, setActionsVisible] = useState(false);

  const rows = useMemo(
    () => sortBoards(filterBoards(summarizeBoards(boards, cards), query), sort),
    [boards, cards, query, sort],
  );

  function openCreate() {
    setFormBoard(null);
    setFormVisible(true);
  }

  function openEdit(board: Board) {
    setFormBoard(board);
    setFormVisible(true);
  }

  function handleLongPress(summary: BoardSummary) {
    haptic();
    setActionsTarget(summary);
    setActionsVisible(true);
  }

  return (
    <ViewContainer>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScreenHeader
          title={t('boards.title')}
          left={
            <IconButton
              variant="ghost"
              glass
              round
              size={40}
              accessibilityRole="button"
              accessibilityLabel={t('tabs.settings')}
              onPress={() => router.push('/(tabs)/settings')}
            >
              <Settings size={22} color={colors.text} />
            </IconButton>
          }
          right={
            <View style={styles.headerRight}>
              <Select<BoardSort>
                variant="icon"
                glass
                value={sort}
                onChange={setSort}
                accessibilityLabel={t('boards.sort.label')}
                icon={(color) => <ArrowUpDown size={20} color={color} />}
                options={[
                  { value: 'title', label: t('boards.sort.title') },
                  { value: 'lastModified', label: t('boards.sort.lastModified') },
                ]}
              />
              <IconButton
                variant="ghost"
                glass
                round
                size={40}
                accessibilityRole="button"
                accessibilityLabel={t('boards.form.newTitle')}
                onPress={openCreate}
              >
                <Plus size={22} color={colors.text} />
              </IconButton>
            </View>
          }
        />

        <View style={styles.filterSection}>
          <TextField
            placeholder={t('boards.filter')}
            value={query}
            onChangeText={setQuery}
          />
          <SectionHeader
            title={t('boards.openSection')}
            trailing={
              <Typography variant="caption" color="secondary">
                {t('boards.count', { count: rows.length })}
              </Typography>
            }
          />
        </View>

        <FlatList
          style={styles.flex}
          contentInsetAdjustmentBehavior="automatic"
          data={rows}
          keyExtractor={(item) => item.board.id}
          renderItem={({ item }) => (
            <BoardRow
              summary={item}
              onPress={() => router.push(`/boards/${item.board.id}`)}
              onLongPress={() => handleLongPress(item)}
            />
          )}
          ListEmptyComponent={
            <Typography color="secondary" align="center" style={styles.empty}>
              {boards.length === 0 ? t('boards.empty') : t('boards.emptyFiltered')}
            </Typography>
          }
        />
      </SafeAreaView>

      {actionsTarget ? (
        <BoardActionsSheet
          summary={actionsTarget}
          visible={actionsVisible}
          onClose={() => setActionsVisible(false)}
          onOpen={() => router.push(`/boards/${actionsTarget.board.id}`)}
          onRename={() => openEdit(actionsTarget.board)}
          onRecolor={() => openEdit(actionsTarget.board)}
          onArchive={() =>
            void actions
              .setArchived(actionsTarget.board, !actionsTarget.board.archived)
              .catch(() => undefined)
          }
          onDelete={() => void actions.remove(actionsTarget.board).catch(() => undefined)}
        />
      ) : null}

      <BoardFormSheet
        visible={formVisible}
        initial={formBoard ? { title: formBoard.title, color: formBoard.color ?? null } : undefined}
        onClose={() => setFormVisible(false)}
        onSubmit={(input) => {
          if (!formBoard) {
            void actions.create(input).catch(() => undefined);
            return;
          }

          const changes: { title?: string; color?: string | null } = {};
          if (input.title !== formBoard.title) changes.title = input.title;
          if (input.color !== (formBoard.color ?? null)) changes.color = input.color;

          if (Object.keys(changes).length > 0) {
            void actions.update(formBoard, changes).catch(() => undefined);
          }
        }}
      />
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  filterSection: { paddingHorizontal: 16, gap: 12, marginBottom: 8 },
  empty: { marginTop: 32 },
});
