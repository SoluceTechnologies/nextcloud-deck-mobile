import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';

import { dueStateOf } from '@/features/card/dueState';
import { formatRelative } from '@/utils/relativeTime';
import { AnimatedPressable, Avatar, Checkbox, Typography } from '@/ui/components';

export interface TodayRowProps {
  item: {
    id: string;
    title: string;
    duedate: number;
    boardTitle: string;
    stackTitle: string;
    assigneeName: string | null;
  };
  onToggleDone: (id: string) => void;
  onOpen: (id: string) => void;
}

export function TodayRow({ item, onToggleDone, onOpen }: TodayRowProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const overdue = dueStateOf(item.duedate, null, Date.now()).kind === 'overdue';

  return (
    <View style={styles.row}>
      <Checkbox
        testID={`today-done-${item.id}`}
        accessibilityLabel={t('today.markDone')}
        onPress={() => onToggleDone(item.id)}
      />
      <AnimatedPressable
        testID={`today-row-${item.id}`}
        onPress={() => onOpen(item.id)}
        style={styles.body}
        accessibilityRole="button"
        accessibilityLabel={item.title}
      >
        <View style={styles.content}>
          <Typography variant="body1" numberOfLines={2}>
            {item.title}
          </Typography>
          <View style={styles.metaRow}>
            <Typography
              testID={`today-due-${item.id}`}
              variant="caption"
              color={overdue ? 'danger' : 'secondary'}
              nowrap
            >
              {formatRelative(item.duedate)}
            </Typography>
            <Typography variant="caption" color="secondary" nowrap>
              {` · ${item.boardTitle} › ${item.stackTitle}`}
            </Typography>
          </View>
        </View>
        {item.assigneeName ? <Avatar name={item.assigneeName} size={28} /> : null}
        <ChevronRight size={20} color={colors.textTertiary} />
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, gap: 12 },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  content: { flex: 1, gap: 2 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap' },
});
