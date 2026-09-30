import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';
import { Users } from 'lucide-react-native';

import { formatRelative } from '@/utils/relativeTime';
import { AnimatedPressable, Typography } from '@/ui/components';

export interface RecentBoardStats {
  doneCount: number;
  totalCount: number;
  overdueCount: number;
  lastModified: number;
}

export interface RecentBoardCardProps {
  board: { id: string; title: string; color: string | null; shared: boolean };
  onPress: (id: string) => void;
  stats?: RecentBoardStats;
  style?: StyleProp<ViewStyle>;
}

export function RecentBoardCard({ board, onPress, stats, style }: RecentBoardCardProps) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const detailed = stats !== undefined;

  return (
    <AnimatedPressable
      onPress={() => onPress(board.id)}
      style={[
        styles.root,
        detailed && styles.rootDetailed,
        { backgroundColor: colors.item, borderColor: colors.border, borderRadius: radius.md },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={board.title}
    >
      <View
        testID={`recent-edge-${board.id}`}
        style={[styles.edge, detailed && styles.edgeDetailed, { backgroundColor: board.color || colors.border }]}
      />
      <View style={[styles.body, detailed && styles.bodyDetailed]}>
        <Typography variant={detailed ? 'title' : 'body1'} numberOfLines={2}>
          {board.title}
        </Typography>
        {stats ? <StatsBlock stats={stats} /> : null}
        {board.shared ? (
          <View style={styles.row}>
            <Users size={14} color={colors.textSecondary} />
            <Typography variant="caption" color="secondary">
              {t('boards.shared')}
            </Typography>
          </View>
        ) : null}
      </View>
    </AnimatedPressable>
  );
}

function StatsBlock({ stats }: { stats: RecentBoardStats }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { doneCount, totalCount, overdueCount, lastModified } = stats;
  const pct = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);

  return (
    <View style={styles.stats}>
      <View style={styles.row}>
        <View style={[styles.track, { backgroundColor: colors.border }]}>
          <View style={[styles.fill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
        </View>
        <Typography testID="recent-progress" variant="caption" color="secondary" nowrap>
          {t('today.recentProgress', { done: doneCount, total: totalCount })}
        </Typography>
      </View>
      <View style={styles.row}>
        {overdueCount > 0 ? (
          <Typography testID="recent-overdue" variant="caption" color="danger" nowrap>
            {t('today.overdueBanner', { count: overdueCount })}
          </Typography>
        ) : null}
        {lastModified > 0 ? (
          <Typography variant="caption" color="secondary" nowrap>
            {t('boards.updated', { when: formatRelative(lastModified) })}
          </Typography>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: 180, flexDirection: 'row', overflow: 'hidden', borderWidth: 1 },
  rootDetailed: { width: undefined, minHeight: 120 },
  edge: { width: 4, alignSelf: 'stretch' },
  edgeDetailed: { width: 6 },
  body: { flex: 1, padding: 10, gap: 6 },
  bodyDetailed: { padding: 16, gap: 10 },
  stats: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  track: { flex: 1, maxWidth: 120, height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
});
