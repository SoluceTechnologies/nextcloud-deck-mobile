import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react-native';

import { useAccountStore } from '@/stores/accountStore';
import { useCard } from '@/database/hooks/useCard';
import { useBoards } from '@/database/hooks/useBoards';
import { useBoardStacks } from '@/database/hooks/useBoardContent';
import { useCardActions } from '@/features/board/hooks/useCardActions';
import { CardIdentity } from '@/features/card/components/CardIdentity';
import { IconButton, ScreenHeader, Typography, ViewContainer } from '@/ui/components';

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const accountId = useAccountStore((s) => s.activeAccountId);

  const card = useCard(id);
  const boards = useBoards(accountId);
  const stacks = useBoardStacks(accountId, card?.boardId ?? null);
  const cardActions = useCardActions(accountId);

  const closeButton = (
    <IconButton
      variant="ghost"
      round
      size={40}
      testID="card-close"
      accessibilityLabel={t('common.close')}
      onPress={() => router.back()}
    >
      <X size={22} color={colors.text} />
    </IconButton>
  );

  // The sync can reconcile a server-side delete while this card is open —
  // rendering the last-known card would let the user edit a ghost.
  if (!card) {
    return (
      <ViewContainer>
        <SafeAreaView edges={['top']} style={styles.flex}>
          <ScreenHeader left={closeButton} />
          <View style={styles.deleted}>
            <Typography align="center">{t('card.deleted')}</Typography>
          </View>
        </SafeAreaView>
      </ViewContainer>
    );
  }

  const board = boards.find((b) => b.id === card.boardId);
  const stack = stacks.find((s) => s.id === card.stackId);

  return (
    <ViewContainer>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScreenHeader title={card.title} left={closeButton} />
        <ScrollView keyboardShouldPersistTaps="handled">
          <CardIdentity
            title={card.title}
            boardTitle={board?.title ?? ''}
            stackTitle={stack?.title ?? ''}
            onChangeTitle={(title) => void cardActions.patch(card, { title }).catch(() => undefined)}
          />
          <View testID="card-sections" />
        </ScrollView>
      </SafeAreaView>
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  deleted: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
