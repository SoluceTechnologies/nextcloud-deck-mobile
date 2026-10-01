import { useCallback, useMemo, useReducer, useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Plus, Settings } from 'lucide-react-native';

import { useAccountStore } from '@/stores/accountStore';
import { useRecentSearchStore, type RecentSearch } from '@/stores/recentSearchStore';
import { useBoards } from '@/database/hooks/useBoards';
import { useLocalSearch } from '@/features/search/useLocalSearch';
import { useRemoteSearch } from '@/features/search/useRemoteSearch';
import { useSearchSuggestions } from '@/features/search/useSearchSuggestions';
import { matchesBoard } from '@/features/search/matchCard';
import { EMPTY_MODEL, isEmptyModel, reduceSearch } from '@/features/search/searchModel';
import type { Resolve, SearchAction, SearchModel } from '@/features/search/searchModel';
import { lastOpenWord, toTerm } from '@/features/search/searchSyntax';
import { buildHints, buildValueSuggestions, resolveValue } from '@/features/search/suggestions';
import { useIsOnline } from '@/services/shared/network';
import { SearchField } from '@/features/search/components/SearchField';
import { FilterMenu } from '@/features/search/components/FilterMenu';
import { FilterBar } from '@/features/search/components/FilterBar';
import { ValueSuggestions } from '@/features/search/components/ValueSuggestions';
import { SearchResults } from '@/features/search/components/SearchResults';
import { QuickAddCardFlow } from '@/features/card/components/QuickAddCardFlow';
import { nativeTabsEnabled } from '@/utils/nativeTabs';
import { Button, IconButton, ScreenHeader, ViewContainer } from '@/ui/components';

type Dispatched = { action: SearchAction; resolve: Resolve };

const NO_RECENT: RecentSearch[] = [];

function reducer(model: SearchModel, { action, resolve }: Dispatched): SearchModel {
  return reduceSearch(model, action, resolve);
}

export default function SearchScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const accountId = useAccountStore((s) => s.activeAccountId);
  const [addVisible, setAddVisible] = useState(false);

  const data = useSearchSuggestions(accountId);
  const resolve = useCallback<Resolve>((key, raw) => resolveValue(key, raw, data), [data]);
  const [model, dispatch] = useReducer(reducer, EMPTY_MODEL);
  const send = useCallback((action: SearchAction) => dispatch({ action, resolve }), [resolve]);

  const local = useLocalSearch(accountId, toTerm(model, { board: true }));
  const remoteState = useRemoteSearch(accountId, toTerm(model, { board: false }), local.remoteIds);
  const remote = { ...remoteState, hits: remoteState.hits.filter((hit) => matchesBoard(hit.boardTitle, local.query)) };
  const online = useIsOnline();

  const boards = useBoards(accountId);
  const boardLocalIdByRemote = useMemo(() => new Map(boards.map((b) => [b.remoteId, b.id])), [boards]);

  const recent = useRecentSearchStore((s) => (accountId ? s.byAccount[accountId] ?? NO_RECENT : NO_RECENT));
  const addRecent = useRecentSearchStore((s) => s.add);
  const removeRecent = useRecentSearchStore((s) => s.remove);
  const remember = () => {
    if (accountId) addRecent(accountId, model);
  };

  const tokens = model.segments.flatMap((segment) => (segment.kind === 'token' ? [segment.token] : []));
  const typedWord = model.pending ? '' : (lastOpenWord(model.input)?.text ?? '');
  const hints = buildHints(typedWord, data, tokens);

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
          <SearchField
            model={model}
            onChangeInput={(text) => send({ type: 'input', text })}
            onBackspaceEmpty={() => send({ type: 'backspaceEmpty' })}
            onSubmit={() => {
              if (model.pending) {
                send({ type: 'commitRaw' });
                return;
              }
              remember();
              Keyboard.dismiss();
            }}
            onBlur={() => {
              if (model.input.trim()) send({ type: 'commitRaw' });
            }}
            onSelectToken={(id) => send({ type: 'select', id })}
            onRemoveToken={(id) => send({ type: 'remove', id })}
            onClear={() => send({ type: 'clear' })}
          />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >
          {model.pending ? (
            <ValueSuggestions
              pending={model.pending}
              typed={model.input}
              suggestions={buildValueSuggestions(model.pending, model.input, data, (count) =>
                t('search.boardsCount', { count }),
              )}
              onPick={(resolved) => send({ type: 'commit', resolved })}
              onUseTyped={() => send({ type: 'commitRaw' })}
            />
          ) : isEmptyModel(model) ? (
            <FilterMenu
              recent={recent}
              onStart={(key) => send({ type: 'startFilter', key })}
              onLoadRecent={(entry) => send({ type: 'load', model: entry.model })}
              onRemoveRecent={(entry) => {
                if (accountId) removeRecent(accountId, entry.id);
              }}
            />
          ) : (
            <>
              <FilterBar
                hints={hints}
                onStart={(key) => send({ type: 'startFilter', key })}
                onHint={(hint) =>
                  send({
                    type: 'replaceLastWord',
                    key: hint.key,
                    resolved: { value: hint.value, label: hint.label, color: hint.color },
                  })
                }
              />
              <SearchResults
                local={local}
                remote={remote}
                offline={!online}
                onOpenCard={(cardId) => {
                  remember();
                  router.push(`/card/${cardId}`);
                }}
                onOpenBoard={(boardLocalId) => {
                  remember();
                  router.push(`/boards/${boardLocalId}`, { withAnchor: true });
                }}
                boardLocalIdByRemote={boardLocalIdByRemote}
              />
            </>
          )}
        </ScrollView>

        {nativeTabsEnabled() ? null : (
          <Button
            testID="search-add-card"
            variant="secondary"
            icon={<Plus size={18} color={colors.primary} />}
            title={t('today.addCard')}
            style={styles.addCard}
            onPress={() => setAddVisible(true)}
          />
        )}
      </SafeAreaView>

      <QuickAddCardFlow visible={addVisible} accountId={accountId} onClose={() => setAddVisible(false)} />
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  filterSection: { paddingHorizontal: 16, marginBottom: 8 },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  addCard: { marginHorizontal: 16, marginBottom: 12 },
});
