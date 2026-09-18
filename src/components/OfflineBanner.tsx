import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
 *
 * `SafeAreaView` (not `useSafeAreaInsets`), matching every screen in this repo:
 * it is a pure native view that needs no `SafeAreaProvider`, where the hook
 * throws without one — and this banner sits at the app's root, above
 * everything else, so a missing provider here would be a white screen on launch.
 */
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
