import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';
import { Users } from 'lucide-react-native';

import { AnimatedPressable, Typography } from '@/ui/components';

export interface RecentBoardCardProps {
  board: { id: string; title: string; color: string | null; shared: boolean };
  onPress: (id: string) => void;
}

export function RecentBoardCard({ board, onPress }: RecentBoardCardProps) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();

  return (
    <AnimatedPressable
      onPress={() => onPress(board.id)}
      style={[
        styles.root,
        { backgroundColor: colors.item, borderColor: colors.border, borderRadius: radius.md },
      ]}
    >
      <View
        testID={`recent-edge-${board.id}`}
        style={[styles.edge, { backgroundColor: board.color || colors.border }]}
      />
      <View style={styles.body}>
        <Typography variant="body1" numberOfLines={2}>
          {board.title}
        </Typography>
        {board.shared ? (
          <View style={styles.sharedRow}>
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

const styles = StyleSheet.create({
  root: { width: 180, flexDirection: 'row', overflow: 'hidden', borderWidth: 1 },
  edge: { width: 4, alignSelf: 'stretch' },
  body: { flex: 1, padding: 10, gap: 6 },
  sharedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
