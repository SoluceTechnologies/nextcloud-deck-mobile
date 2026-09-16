import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { LocalSearchResult } from '@/features/search/useLocalSearch';
import type { RemoteSearchState } from '@/features/search/useRemoteSearch';
import { Item, List, SectionHeader, Stack, Typography } from '@/ui/components';

export interface SearchResultsProps {
  local: LocalSearchResult;
  remote: RemoteSearchState;
  offline: boolean;
  onOpenCard: (cardId: string) => void;
  onOpenBoard: (boardLocalId: string) => void;
  /** Remote card hits carry a boardRemoteId, not a local board id — this resolves one to the other. */
  boardLocalIdByRemote: Map<string, string>;
}

export function SearchResults({
  local, remote, offline, onOpenCard, onOpenBoard, boardLocalIdByRemote,
}: SearchResultsProps) {
  const { t } = useTranslation();
  const nothing = local.groups.length === 0 && local.boards.length === 0 && remote.hits.length === 0;

  return (
    <>
      {offline ? (
        <Typography variant="caption" color="secondary" style={styles.note}>
          {t('search.offlineNote')}
        </Typography>
      ) : null}
      {remote.failed ? (
        <Typography variant="caption" color="danger" style={styles.note}>
          {t('search.serverFailed')}
        </Typography>
      ) : null}

      {local.groups.map((group) => (
        <Stack key={group.boardId} hAlign="stretch" style={styles.section}>
          <SectionHeader title={group.boardTitle} />
          <List>
            {group.cards.map((card) => (
              <Item
                key={card.id}
                testID={`result-card-${card.id}`}
                title={card.title}
                description={card.stackTitle}
                onPress={() => onOpenCard(card.id)}
              />
            ))}
          </List>
        </Stack>
      ))}

      {local.boards.length > 0 ? (
        <Stack hAlign="stretch" style={styles.section}>
          <SectionHeader title={t('search.boards')} />
          <List>
            {local.boards.map((board) => (
              <Item
                key={board.id}
                testID={`result-board-${board.id}`}
                title={board.title}
                onPress={() => onOpenBoard(board.id)}
              />
            ))}
          </List>
        </Stack>
      ) : null}

      {remote.hits.length > 0 ? (
        <Stack hAlign="stretch" style={styles.section}>
          <SectionHeader title={t('search.fromServer')} />
          <List>
            {remote.hits.map((hit) => {
              const boardLocalId = boardLocalIdByRemote.get(hit.card.boardRemoteId);
              return (
                <Item
                  key={hit.card.remoteId}
                  testID={`result-hit-${hit.card.remoteId}`}
                  title={hit.card.title}
                  description={`${hit.boardTitle} › ${hit.stackTitle}`}
                  onPress={boardLocalId ? () => onOpenBoard(boardLocalId) : undefined}
                />
              );
            })}
          </List>
        </Stack>
      ) : null}

      {nothing && !remote.loading ? (
        <Stack hAlign="stretch" style={styles.section} testID="search-empty">
          <Typography variant="body1" align="center">{t('search.noResults')}</Typography>
          <Typography variant="caption" color="secondary" align="center">{t('search.noResultsHint')}</Typography>
        </Stack>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 24 },
  note: { paddingHorizontal: 2, marginBottom: 8 },
});
