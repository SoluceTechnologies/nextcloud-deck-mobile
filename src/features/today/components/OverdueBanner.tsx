import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';
import { AlertTriangle } from 'lucide-react-native';

import { darkTheme } from '@/theme';
import { Typography } from '@/ui/components';

export interface OverdueBannerProps {
  count: number;
}

export function OverdueBanner({ count }: OverdueBannerProps) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();

  if (count === 0) return null;

  return (
    <View style={[styles.root, { backgroundColor: darkTheme.colors.surfaceRaised, borderRadius: radius.md }]}>
      <View testID="overdue-edge" style={[styles.edge, { backgroundColor: colors.danger }]} />
      <View style={styles.content}>
        <AlertTriangle size={20} color={colors.danger} />
        <View style={styles.text}>
          <Typography variant="body2" color="light">
            {t('today.overdueBanner', { count })}
          </Typography>
          <Typography variant="caption" color="light">
            {t('today.overdueHint')}
          </Typography>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  edge: { width: 4, alignSelf: 'stretch' },
  content: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  text: { flex: 1, gap: 2 },
});
