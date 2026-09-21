import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useIsOnline } from '@/services/shared/network';
import { Typography } from '@/ui/components';

export function OfflineBanner() {
  const online = useIsOnline();
  const { t } = useTranslation();
  const { colors } = useTheme();

  if (online) return null;

  return (
    <SafeAreaView
      edges={['top']}
      testID="offline-banner"
      accessibilityRole="alert"
      style={[styles.root, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
    >
      <Typography variant="caption" color="secondary" align="center">
        {t('offline.banner')}
      </Typography>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: 12, paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth },
});
