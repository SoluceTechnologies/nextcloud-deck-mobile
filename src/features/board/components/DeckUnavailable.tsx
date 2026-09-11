import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAccountStore } from '@/stores/accountStore';
import type { DeckAppStatus } from '@/types';
import { Typography, ViewContainer } from '@/ui/components';

export function useDeckAvailability(): DeckAppStatus {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const capabilitiesAccountId = useAccountStore((s) => s.capabilitiesAccountId);
  const deckApp = useAccountStore((s) => s.capabilities.deckApp);

  // The stored verdict was measured against whichever account was active
  // during the probe. If that isn't the account that's active now (switch,
  // or a stale/failed probe that never got refreshed), the verdict says
  // nothing about the current account — treat it as not-yet-known rather
  // than block on someone else's result.
  if (!activeAccountId || capabilitiesAccountId !== activeAccountId) return 'unknown';
  return deckApp;
}

export function DeckUnavailable({ baseUrl }: { baseUrl: string }) {
  const { t } = useTranslation();
  const host = baseUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');

  return (
    <ViewContainer>
      <View style={styles.center}>
        <Typography variant="h2">{t('deck.unavailableTitle')}</Typography>
        <Typography variant="body2" color="secondary">
          {host}
        </Typography>
        <Typography variant="body2" color="secondary">
          {t('deck.unavailableHint')}
        </Typography>
      </View>
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
});
