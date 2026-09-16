import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Settings, X } from 'lucide-react-native';

import { useAccountStore } from '@/stores/accountStore';
import { useBoards } from '@/database/hooks/useBoards';
import { useLocalSearch } from '@/features/search/useLocalSearch';
import { useRemoteSearch } from '@/features/search/useRemoteSearch';
import { useIsOnline } from '@/services/shared/network';
import { OperatorsSection } from '@/features/search/components/OperatorsSection';
import { SearchResults } from '@/features/search/components/SearchResults';
import {
  IconButton, ScreenHeader, TextField, ViewContainer,
} from '@/ui/components';

export default function SearchScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const accountId = useAccountStore((s) => s.activeAccountId);
  const [query, setQuery] = useState('');

  const local = useLocalSearch(accountId, query);
  const remote = useRemoteSearch(accountId, query, local.remoteIds);
  const online = useIsOnline();

  // Not derived from local.boards: that list is title-matching boards only, and
  // a remote hit's board may not match the query text at all.
  const boards = useBoards(accountId);
  const boardLocalIdByRemote = useMemo(
    () => new Map(boards.map((b) => [b.remoteId, b.id])),
    [boards],
  );

  return (
    <ViewContainer>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScreenHeader
          title={t('search.title')}
          left={
            <IconButton
              variant="ghost"
              glass
              round
              size={40}
              accessibilityRole="button"
              accessibilityLabel={t('tabs.settings')}
              onPress={() => router.push('/(tabs)/settings')}
            >
              <Settings size={22} color={colors.text} />
            </IconButton>
          }
        />

        <View style={styles.filterSection}>
          <TextField
            testID="search-input"
            placeholder={t('search.placeholder')}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            right={
              query.length > 0 ? (
                <IconButton
                  variant="plain"
                  size={36}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.clear')}
                  onPress={() => setQuery('')}
                >
                  <X size={18} color={colors.textTertiary} />
                </IconButton>
              ) : undefined
            }
          />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {local.isEmpty ? (
            <OperatorsSection onTry={setQuery} />
          ) : (
            <SearchResults
              local={local}
              remote={remote}
              offline={!online}
              onOpenCard={(cardId) => router.push(`/card/${cardId}`)}
              onOpenBoard={(boardLocalId) => router.push(`/boards/${boardLocalId}`)}
              boardLocalIdByRemote={boardLocalIdByRemote}
            />
          )}
        </ScrollView>
      </SafeAreaView>
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  filterSection: { paddingHorizontal: 16, marginBottom: 8 },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
});
