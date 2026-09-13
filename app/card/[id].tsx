import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Circle, CircleCheck, Ellipsis, X } from 'lucide-react-native';

import { useAccountStore } from '@/stores/accountStore';
import { useActiveAccount } from '@/hooks/useAccounts';
import { useCard } from '@/database/hooks/useCard';
import { useAccountCards, useBoards } from '@/database/hooks/useBoards';
import { useBoardStacks } from '@/database/hooks/useBoardContent';
import { useBoardLabels, useCardAssignees, useCardLabels } from '@/database/hooks/useCardRelations';
import { useCardActions } from '@/features/board/hooks/useCardActions';
import { AssigneesSheet } from '@/features/card/components/AssigneesSheet';
import { CardIdentity } from '@/features/card/components/CardIdentity';
import { CardMenu } from '@/features/card/components/CardMenu';
import { CardPickerSheet } from '@/features/card/components/CardPickerSheet';
import { ColorSheet } from '@/features/card/components/ColorSheet';
import { DateRow } from '@/features/card/components/DateRow';
import { DependenciesSheet } from '@/features/card/components/DependenciesSheet';
import { LabelsSheet } from '@/features/card/components/LabelsSheet';
import { dueStateOf } from '@/features/card/dueState';
import { DescriptionEditor } from '@/features/card/markdown/DescriptionEditor';
import { DescriptionView } from '@/features/card/markdown/DescriptionView';
import { parseArray, participantsOf, type Participant } from '@/features/card/participants';
import { Icon, IconButton, Item, List, ScreenHeader, SectionHeader, Typography, ViewContainer } from '@/ui/components';

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const accountId = useAccountStore((s) => s.activeAccountId);

  const card = useCard(id);
  const boards = useBoards(accountId);
  const stacks = useBoardStacks(accountId, card?.boardId ?? null);
  const cardLabels = useCardLabels(accountId, card?.id ?? null);
  const boardLabels = useBoardLabels(accountId, card?.boardId ?? null);
  const cardAssignees = useCardAssignees(accountId, card?.id ?? null);
  const accountCards = useAccountCards(accountId);
  const activeAccount = useActiveAccount(accountId);
  const cardActions = useCardActions(accountId);
  const [colorSheetVisible, setColorSheetVisible] = useState(false);
  const [labelsSheetVisible, setLabelsSheetVisible] = useState(false);
  const [assigneesSheetVisible, setAssigneesSheetVisible] = useState(false);
  const [dependenciesSheetVisible, setDependenciesSheetVisible] = useState(false);
  const [descriptionEditorVisible, setDescriptionEditorVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);

  // Resolved against every card of the account so the row can show a title
  // instead of a bare remote id; a dependency not yet pulled by sync falls
  // back to "#<id>" rather than disappearing from the list.
  const dependencies = useMemo(() => {
    const ids = parseArray<string>(card?.dependentCardsJson ?? '[]');
    return ids.map((remoteId) => {
      const match = accountCards.find((c) => c.remoteId === remoteId);
      return { remoteId, title: match ? match.title : `#${remoteId}` };
    });
  }, [card?.dependentCardsJson, accountCards]);

  // Found before the early return below so the hooks that depend on it
  // (useMemo here) stay unconditional — card can flip to null later if sync
  // reconciles a server-side delete while this screen is open.
  const board = boards.find((b) => b.id === card?.boardId);
  const participants = useMemo(
    () => (board ? participantsOf(board) : []),
    [board?.usersJson, board?.aclJson],
  );

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

  const menuButton = (
    <IconButton
      variant="ghost"
      round
      size={40}
      testID="card-menu"
      accessibilityLabel={t('card.menu.title')}
      onPress={() => setMenuVisible(true)}
    >
      <Ellipsis size={22} color={colors.text} />
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

  const stack = stacks.find((s) => s.id === card.stackId);

  const dueState = dueStateOf(card.duedate ?? null, card.doneAt ?? null, Date.now());
  const overdueLine =
    dueState.kind === 'overdue'
      ? `${t('card.needsAttention')} · ${t('card.overdue', { count: dueState.days })}`
      : undefined;

  return (
    <ViewContainer>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScreenHeader title={card.title} left={closeButton} right={menuButton} />
        <ScrollView keyboardShouldPersistTaps="handled">
          <CardIdentity
            title={card.title}
            boardTitle={board?.title ?? ''}
            stackTitle={stack?.title ?? ''}
            onChangeTitle={(title) => void cardActions.patch(card, { title }).catch(() => undefined)}
          />
          <View testID="card-sections">
            <List>
              <Item
                title={t(card.doneAt ? 'card.markNotDone' : 'card.markDone')}
                leading={
                  <Icon color={colors.primary}>{card.doneAt ? <CircleCheck /> : <Circle />}</Icon>
                }
                onPress={() => void cardActions.setDone(card, !card.doneAt).catch(() => undefined)}
              />
              <DateRow
                label={t('card.startDate')}
                emptyLabel={t('card.noStartDate')}
                value={card.startdate ?? null}
                onChange={(v) => void cardActions.patch(card, { startdate: v }).catch(() => undefined)}
              />
              <DateRow
                label={t('card.dueDate')}
                emptyLabel={t('card.noDueDate')}
                value={card.duedate ?? null}
                overdueLine={overdueLine}
                onChange={(v) => void cardActions.patch(card, { duedate: v }).catch(() => undefined)}
              />
              <Item
                title={t('card.color')}
                description={card.color ?? t('card.noColor')}
                leading={
                  <View
                    style={[
                      styles.colorDot,
                      card.color
                        ? { backgroundColor: card.color }
                        : { borderWidth: 1, borderColor: colors.border },
                    ]}
                  />
                }
                onPress={() => setColorSheetVisible(true)}
              />
              <Item
                title={t('card.labels')}
                description={
                  cardLabels.length > 0 ? cardLabels.map((l) => l.title).join(', ') : t('card.noLabels')
                }
                onPress={() => setLabelsSheetVisible(true)}
              />
              <Item
                title={t('card.assignees')}
                description={
                  cardAssignees.length > 0
                    ? cardAssignees.map((a) => a.displayName).join(', ')
                    : t('card.noAssignees')
                }
                onPress={() => setAssigneesSheetVisible(true)}
              />
              <Item
                title={t('card.dependencies')}
                description={
                  dependencies.length > 0
                    ? dependencies.map((d) => d.title).join(', ')
                    : t('card.noDependencies')
                }
                onPress={() => setDependenciesSheetVisible(true)}
              />
            </List>
            <SectionHeader title={t('card.description')} />
            <DescriptionView
              markdown={card.description}
              onToggleTask={(next) => void cardActions.patch(card, { description: next }).catch(() => undefined)}
              onEdit={() => setDescriptionEditorVisible(true)}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
      <DescriptionEditor
        visible={descriptionEditorVisible}
        initial={card.description}
        onClose={() => setDescriptionEditorVisible(false)}
        onSave={(md) => void cardActions.patch(card, { description: md }).catch(() => undefined)}
      />
      <ColorSheet
        visible={colorSheetVisible}
        value={card.color ?? null}
        onClose={() => setColorSheetVisible(false)}
        onSelect={(c) => void cardActions.patch(card, { color: c }).catch(() => undefined)}
      />
      <LabelsSheet
        visible={labelsSheetVisible}
        boardLabels={boardLabels}
        selected={cardLabels.map((l) => l.id)}
        onClose={() => setLabelsSheetVisible(false)}
        onToggle={(id, on) =>
          void (on ? cardActions.addLabel(card, id) : cardActions.removeLabel(card, id)).catch(() => undefined)
        }
        onCreate={(input) =>
          void cardActions
            .createLabel(card.boardId, input)
            .then((newId) => (newId ? cardActions.addLabel(card, newId) : undefined))
            .catch(() => undefined)
        }
      />
      <AssigneesSheet
        visible={assigneesSheetVisible}
        account={activeAccount}
        participants={participants}
        selected={cardAssignees.map(
          (a): Participant => ({
            participant: a.participant,
            displayName: a.displayName,
            assigneeType: a.assigneeType,
          }),
        )}
        onClose={() => setAssigneesSheetVisible(false)}
        onToggle={(p, on) =>
          void (on ? cardActions.assignUser(card, p) : cardActions.unassignUser(card, p)).catch(() => undefined)
        }
      />
      <DependenciesSheet
        visible={dependenciesSheetVisible}
        accountId={accountId}
        cardId={card.id}
        dependencies={dependencies}
        onClose={() => setDependenciesSheetVisible(false)}
        onAdd={(id) => void cardActions.addDependency(card, id).catch(() => undefined)}
        onRemove={(id) => void cardActions.removeDependency(card, id).catch(() => undefined)}
      />
      <CardMenu
        visible={menuVisible}
        card={card}
        onClose={() => setMenuVisible(false)}
        onMove={() => setPickerVisible(true)}
        onCopy={() => void cardActions.clone(card).catch(() => undefined)}
        onArchive={() => {
          void cardActions.setArchived(card, !card.archived).catch(() => undefined);
          // An archived card leaves the board — leaving the detail screen open
          // would strand the user on a card they can no longer see in its list.
          router.back();
        }}
        onDelete={() => {
          void cardActions.remove(card).catch(() => undefined);
          router.back();
        }}
      />
      <CardPickerSheet
        visible={pickerVisible}
        accountId={accountId}
        mode="stack"
        onClose={() => setPickerVisible(false)}
        onPick={({ stackLocalId }) => void cardActions.move(card, stackLocalId).catch(() => undefined)}
      />
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  deleted: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  colorDot: { width: 20, height: 20, borderRadius: 10 },
});
