import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';

import type { BoardSummary } from '@/features/board/boardFilter';
import { formatRelative } from '@/utils/relativeTime';
import { Item, Typography } from '@/ui/components';

export interface BoardRowProps {
  summary: BoardSummary;
  onPress: () => void;
  onLongPress: () => void;
}

export function BoardRow({ summary, onPress, onLongPress }: BoardRowProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { board, doneCount, totalCount, shared } = summary;
  const pct = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);

  return (
    <Item
      onPress={onPress}
      onLongPress={onLongPress}
      leading={
        <View
          testID="board-edge"
          style={[styles.edge, { backgroundColor: board.color || colors.border }]}
        />
      }
      title={board.title}
      description={
        <View style={styles.secondary}>
          <View style={[styles.track, { backgroundColor: colors.border }]}>
            <View style={[styles.fill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
          </View>
          <Typography variant="caption" color="secondary" nowrap>
            {`${doneCount}/${totalCount}`}
          </Typography>
          {/* `lastModified` is the server's clock, and it is 0 until the board
              has actually been synced — POST /boards does not echo one back,
              so a board created here carries 0 until the next board-list pass.
              Formatting that yields "57 years ago", the unix epoch. */}
          {board.lastModified > 0 ? (
            <Typography testID="board-updated" variant="caption" color="secondary" nowrap>
              {t('boards.updated', { when: formatRelative(board.lastModified) })}
            </Typography>
          ) : null}
          {shared ? (
            <Typography variant="caption" color="secondary" nowrap>
              {t('boards.shared')}
            </Typography>
          ) : null}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  edge: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  secondary: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  track: { width: 32, height: 3, borderRadius: 1.5, overflow: 'hidden' },
  fill: { height: 3, borderRadius: 1.5 },
});
