import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AccountSwitcher } from '@/features/account/components/AccountSwitcher';
import { useAccounts } from '@/hooks/useAccounts';
import { useAccountStore } from '@/stores/accountStore';
import type { DeckAppStatus } from '@/types';
import { Button, Typography, ViewContainer } from '@/ui/components';

export function useDeckAvailability(): DeckAppStatus {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const capabilitiesAccountId = useAccountStore((s) => s.capabilitiesAccountId);
  const deckApp = useAccountStore((s) => s.capabilities.deckApp);

  if (!activeAccountId || capabilitiesAccountId !== activeAccountId) return 'unknown';
  return deckApp;
}

export function DeckUnavailable({ baseUrl }: { baseUrl: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const accounts = useAccounts();
  const host = baseUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');

  return (
    <ViewContainer>
      <View style={styles.center}>
        <Typography variant="h2">{t('deck.unavailableTitle')}</Typography>
        <Typography variant="body2" color="secondary">
          {host}
        </Typography>
        <Typography variant="body2" color="secondary" align="center">
          {t('deck.unavailableHint')}
        </Typography>

        <View style={styles.actions}>
          {accounts.length > 1 ? (
            <AccountSwitcher
              trigger={
                <View pointerEvents="none">
                  <Button testID="deck-switch-account" title={t('deck.switchAccount')} />
                </View>
              }
            />
          ) : null}
          <Button
            testID="deck-add-account"
            variant="secondary"
            title={t('deck.addAccount')}
            onPress={() => router.push('/(auth)/setup')}
          />
        </View>
      </View>
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  actions: { alignSelf: 'stretch', gap: 12, marginTop: 24 },
});
