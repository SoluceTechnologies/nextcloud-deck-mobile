import { useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  CalendarClock, CalendarDays, ChevronRight, Ellipsis, Link2, Palette, Tag, Users, X,
} from 'lucide-react-native';

import { useAccountStore } from '@/stores/accountStore';
import { useActiveAccount } from '@/hooks/useAccounts';
import { useCard } from '@/database/hooks/useCard';
import { useAccountCards, useBoards } from '@/database/hooks/useBoards';
import { useBoardStacks } from '@/database/hooks/useBoardContent';
import { useCardAttachments, useCardComments } from '@/database/hooks/useCardDetail';
import type Attachment from '@/database/models/Attachment';
import { useBoardLabels, useCardAssignees, useCardLabels } from '@/database/hooks/useCardRelations';
import { useCardActions } from '@/features/board/hooks/useCardActions';
import { AssigneesSheet } from '@/features/card/components/AssigneesSheet';
import { AttachmentPreview } from '@/features/card/components/AttachmentPreview';
import { AttachmentsSection } from '@/features/card/components/AttachmentsSection';
import { CardIdentity } from '@/features/card/components/CardIdentity';
import { CardMenu } from '@/features/card/components/CardMenu';
import { CardPickerSheet } from '@/features/card/components/CardPickerSheet';
import { ColorSheet } from '@/features/card/components/ColorSheet';
import { CommentsSection } from '@/features/card/components/CommentsSection';
import { DateRow } from '@/features/card/components/DateRow';
import { DependenciesSheet } from '@/features/card/components/DependenciesSheet';
import { LabelsSheet } from '@/features/card/components/LabelsSheet';
import { dueStateOf } from '@/features/card/dueState';
import { useCardDetailSync } from '@/features/card/hooks/useCardDetailSync';
import { DescriptionEditor } from '@/features/card/markdown/DescriptionEditor';
import { DescriptionView } from '@/features/card/markdown/DescriptionView';
import {
  parseArray, participantName, participantsOf, type Participant,
} from '@/features/card/participants';
// Pure URL builder, not a request — trustedFetch/deckRequest never run from a screen.
import { attachmentDownloadUrl } from '@/services/deck/attachments';
import {
  Checkbox, IconButton, IconTile, Item, List, ScreenHeader, SectionHeader, Typography,
  ViewContainer,
} from '@/ui/components';
import { formatRelative } from '@/utils/relativeTime';

/** A read-only fact: its label above the value, unlike Item's value-under-title. */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Typography variant="caption" color="secondary">
        {label}
      </Typography>
      <Typography variant="body1">{value}</Typography>
    </View>
  );
}

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
  const comments = useCardComments(accountId, card?.id ?? null);
  const attachments = useCardAttachments(accountId, card?.id ?? null);
  // Keyed off the route param, not card?.id: syncCardDetail resolves the
  // card itself from the database, so this can start fetching before
  // useCard's own subscription (above) has resolved a row to render.
  const { hasMore, loadMore, loading: detailLoading } = useCardDetailSync(accountId, id);
  const [colorSheetVisible, setColorSheetVisible] = useState(false);
  const [labelsSheetVisible, setLabelsSheetVisible] = useState(false);
  const [assigneesSheetVisible, setAssigneesSheetVisible] = useState(false);
  const [dependenciesSheetVisible, setDependenciesSheetVisible] = useState(false);
  const [descriptionEditorVisible, setDescriptionEditorVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [previewing, setPreviewing] = useState<Attachment | null>(null);

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

  // Every part has to have synced before a file can be addressed on the server.
  const attachmentRef =
    board?.remoteId && stack?.remoteId && card.remoteId
      ? { boardRemoteId: board.remoteId, stackRemoteId: stack.remoteId, cardRemoteId: card.remoteId }
      : null;

  const openExternally = (a: Attachment) => {
    if (!activeAccount || !attachmentRef) return;
    void Linking.openURL(attachmentDownloadUrl(activeAccount, attachmentRef, a)).catch(
      () => undefined,
    );
  };

  const dueState = dueStateOf(card.duedate ?? null, card.doneAt ?? null, Date.now());
  const overdueLine =
    dueState.kind === 'overdue'
      ? `${t('card.needsAttention')} · ${t('card.overdue', { count: dueState.days })}`
      : undefined;

  return (
    <ViewContainer>
      <SafeAreaView edges={['top']} style={styles.flex}>
        {/* No title here: the identity card directly below carries it in full,
            and is the one that can be tapped to rename. */}
        <ScreenHeader left={closeButton} right={menuButton} />
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <CardIdentity
            title={card.title}
            boardTitle={board?.title ?? ''}
            stackTitle={stack?.title ?? ''}
            onChangeTitle={(title) => void cardActions.patch(card, { title }).catch(() => undefined)}
          />
          <View testID="card-sections" style={styles.sections}>
            {/* Status and scheduling — what the card is doing right now. */}
            <List>
              <Item
                title={t(card.doneAt ? 'card.markNotDone' : 'card.markDone')}
                accessibilityRole="checkbox"
                leading={
                  // The same control Today's rows use, so "done" reads
                  // identically wherever a card shows up.
                  <Checkbox
                    testID="card-done"
                    checked={Boolean(card.doneAt)}
                    accessibilityLabel={t(card.doneAt ? 'card.markNotDone' : 'card.markDone')}
                    onPress={() => void cardActions.setDone(card, !card.doneAt).catch(() => undefined)}
                  />
                }
                onPress={() => void cardActions.setDone(card, !card.doneAt).catch(() => undefined)}
              />
              <DateRow
                label={t('card.startDate')}
                emptyLabel={t('card.noStartDate')}
                icon={<IconTile><CalendarDays /></IconTile>}
                value={card.startdate ?? null}
                onChange={(v) => void cardActions.patch(card, { startdate: v }).catch(() => undefined)}
              />
              <DateRow
                label={t('card.dueDate')}
                emptyLabel={t('card.noDueDate')}
                icon={<IconTile><CalendarClock /></IconTile>}
                value={card.duedate ?? null}
                overdueLine={overdueLine}
                onChange={(v) => void cardActions.patch(card, { duedate: v }).catch(() => undefined)}
              />
            </List>

            {/* Everything that classifies the card, each opening its own sheet. */}
            <List>
              <Item
                title={t('card.labels')}
                description={
                  cardLabels.length > 0 ? cardLabels.map((l) => l.title).join(', ') : t('card.noLabels')
                }
                leading={<IconTile><Tag /></IconTile>}
                trailing={<ChevronRight size={20} color={colors.textTertiary} />}
                onPress={() => setLabelsSheetVisible(true)}
              />
              <Item
                title={t('card.assignees')}
                description={
                  cardAssignees.length > 0
                    ? cardAssignees.map((a) => a.displayName).join(', ')
                    : t('card.noAssignees')
                }
                leading={<IconTile><Users /></IconTile>}
                trailing={<ChevronRight size={20} color={colors.textTertiary} />}
                onPress={() => setAssigneesSheetVisible(true)}
              />
              <Item
                title={t('card.dependencies')}
                description={
                  dependencies.length > 0
                    ? dependencies.map((d) => d.title).join(', ')
                    : t('card.noDependencies')
                }
                leading={<IconTile><Link2 /></IconTile>}
                trailing={<ChevronRight size={20} color={colors.textTertiary} />}
                onPress={() => setDependenciesSheetVisible(true)}
              />
              <Item
                title={t('card.color')}
                description={card.color ?? t('card.noColor')}
                leading={
                  // The card's own colour reads better as the glyph's tint than
                  // as a separate dot next to a generic one.
                  card.color ? (
                    <View style={[styles.colorTile, { backgroundColor: card.color }]}>
                      <Palette size={20} color="#ffffff" />
                    </View>
                  ) : (
                    <IconTile><Palette /></IconTile>
                  )
                }
                trailing={<ChevronRight size={20} color={colors.textTertiary} />}
                onPress={() => setColorSheetVisible(true)}
              />
            </List>
            <DescriptionView
              markdown={card.description}
              onToggleTask={(next) => void cardActions.patch(card, { description: next }).catch(() => undefined)}
              onEdit={() => setDescriptionEditorVisible(true)}
            />
            <AttachmentsSection
              attachments={attachments}
              loading={detailLoading}
              // The card already knows how many files it has, so an empty
              // list on a card with none needs no spinner at all.
              expectedCount={card.attachmentCount}
              onOpen={setPreviewing}
            />
            <CommentsSection
              comments={comments}
              hasMore={hasMore}
              loading={detailLoading}
              expectedCount={card.commentsCount}
              // CardAssignee.participant and Comment.actorId are both the
              // Nextcloud uid (normalize.ts's uidOf), which davUserId — not
              // the free-typed username — is kept in step with.
              me={activeAccount?.davUserId ?? ''}
              onLoadMore={loadMore}
              onSubmit={(message, parentRemoteId) =>
                void cardActions.addComment(card, message, parentRemoteId).catch(() => undefined)
              }
              onEdit={(comment, message) =>
                void cardActions.editComment(comment, message).catch(() => undefined)
              }
              onDelete={(comment) => void cardActions.removeComment(comment).catch(() => undefined)}
            />

            {/* Provenance, last because it is reference rather than action.
                Every value here is a column the card already carries. */}
            <View>
              <SectionHeader title={t('card.details.title')} />
              <List>
                {card.owner ? (
                  <DetailRow
                    label={t('card.details.createdBy')}
                    // The raw owner is a bare uid — an opaque UUID on an SSO
                    // server — so it is resolved against the board's people.
                    value={participantName(participants, card.owner, activeAccount)}
                  />
                ) : null}
                {card.createdAt > 0 ? (
                  <DetailRow
                    label={t('card.details.created')}
                    value={formatRelative(card.createdAt)}
                  />
                ) : null}
                {/* Same guard as the board list: lastModified is the server's
                    clock and reads 0 until the card has actually synced. */}
                {card.lastModified > 0 ? (
                  <DetailRow
                    label={t('card.details.modified')}
                    value={formatRelative(card.lastModified)}
                  />
                ) : null}
              </List>
            </View>
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
      <AttachmentPreview
        attachment={previewing}
        account={activeAccount}
        ref_={attachmentRef}
        onClose={() => setPreviewing(null)}
        onOpenExternally={openExternally}
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

const MAX_CONTENT_WIDTH = 700;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  deleted: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  // Same gutter as the settings screens, so a card doesn't run edge to edge.
  scroll: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  sections: { marginTop: 24, gap: 24 },
  colorTile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  detailRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 2 },
});
