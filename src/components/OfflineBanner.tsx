import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useIsOnline } from '@/services/shared/network';
import { Typography } from '@/ui/components';

/**
 * Spec §9's discreet, non-blocking offline strip. It sits above the navigator
 * and takes the top inset itself, so while it is up the screens below start
 * lower — deliberate: overlaying would cover each screen's header, and a
 * bottom anchor would cover the tab bar. Reading stays whole offline either
 * way; this only says so.
 */
export function OfflineBanner() {
  const online = useIsOnline();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  if (online) return null;

  return (
    <View
      testID="offline-banner"
      accessibilityRole="alert"
      style={[
        styles.root,
        { paddingTop: insets.top, backgroundColor: colors.surface, borderBottomColor: colors.border },
      ]}
    >
      <Typography variant="caption" color="secondary" align="center">
        {t('offline.banner')}
      </Typography>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: 12, paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth },
});
