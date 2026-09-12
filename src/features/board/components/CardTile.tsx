import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';
import { Paperclip, MessageCircle } from 'lucide-react-native';
import dayjs from 'dayjs';

import type Card from '@/database/models/Card';
import { AnimatedPressable, Avatar, Typography } from '@/ui/components';
import { dueStateOf } from '@/features/card/dueState';

export type CardTileCard = {
  id: string;
  title: string;
  color: string | null;
  duedate: number | null;
  doneAt: number | null;
  attachmentCount: number;
  commentsCount: number;
};

export type CardTileData = {
  card: CardTileCard;
  labels: { id: string; title: string; color: string | null }[];
  assignees: { participant: string; displayName: string }[];
};

/** A per-render snapshot: the model instance is mutated in place by every optimistic write, so a value comparator must compare copies, never the instance. */
export function toCardTileCard(card: Card): CardTileCard {
  return {
    id: card.id,
    title: card.title,
    color: card.color ?? null,
    duedate: card.duedate ?? null,
    doneAt: card.doneAt ?? null,
    attachmentCount: card.attachmentCount,
    commentsCount: card.commentsCount,
  };
}

type CardTileProps = { data: CardTileData; onPress: () => void };

const MAX_AVATARS = 3;
const AVATAR_SIZE = 22;

function CardTileImpl({ data, onPress }: CardTileProps) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const { card, labels, assignees } = data;

  const title = card.title || t('card.noTitle');
  const shownAssignees = assignees.slice(0, MAX_AVATARS);
  const overflow = assignees.length - shownAssignees.length;

  // Date.now() is read once per render, so an overdue count can go stale
  // across midnight until something else causes this tile to re-render —
  // acceptable for v0.
  const dueState = dueStateOf(card.duedate, card.doneAt, Date.now());
  const dueLabel =
    dueState.kind === 'overdue' ? t('card.overdue', { count: dueState.days })
    : dueState.kind === 'today' ? t('card.dueToday')
    : dueState.kind === 'tomorrow' ? t('card.dueTomorrow')
    : dueState.kind === 'upcoming' ? t('card.dueOn', { when: dayjs(dueState.at).format('D MMM') })
    : null;

  const hasFooter = dueLabel != null || card.attachmentCount > 0 || card.commentsCount > 0;

  return (
    <AnimatedPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={[
        styles.root,
        { backgroundColor: colors.item, borderColor: colors.border, borderRadius: radius.md },
      ]}
    >
      {card.color ? (
        <View testID="card-edge" style={[styles.edge, { backgroundColor: card.color }]} />
      ) : null}
      <View style={styles.body}>
        <Typography variant="body1" numberOfLines={2}>
          {title}
        </Typography>

        {labels.length > 0 ? (
          <View style={styles.chipsRow}>
            {labels.map((label) => (
              <View
                key={label.id}
                testID={`label-chip-${label.id}`}
                style={[
                  styles.labelChip,
                  { borderRadius: radius.sm },
                  label.color
                    ? { backgroundColor: `${label.color}26`, borderColor: 'transparent' }
                    : { backgroundColor: 'transparent', borderColor: colors.border },
                ]}
              >
                <Typography variant="caption" color={label.color ? 'text' : 'secondary'} numberOfLines={1}>
                  {label.title}
                </Typography>
              </View>
            ))}
          </View>
        ) : null}

        {shownAssignees.length > 0 ? (
          <View style={styles.avatarsRow}>
            {shownAssignees.map((assignee, index) => (
              <View
                key={assignee.participant}
                style={[
                  styles.avatarWrap,
                  index > 0 && styles.avatarOverlap,
                  { borderColor: colors.item },
                ]}
              >
                <Avatar name={assignee.displayName} size={AVATAR_SIZE} />
              </View>
            ))}
            {overflow > 0 ? (
              <View
                style={[
                  styles.avatarWrap,
                  styles.avatarOverlap,
                  styles.overflowBadge,
                  { borderColor: colors.item, backgroundColor: colors.border },
                ]}
              >
                <Typography variant="caption" color="secondary">{`+${overflow}`}</Typography>
              </View>
            ) : null}
          </View>
        ) : null}

        {hasFooter ? (
          <View style={styles.footer}>
            {dueLabel != null ? (
              <Typography
                testID="card-due"
                variant="caption"
                color={dueState.kind === 'overdue' ? 'danger' : 'secondary'}
              >
                {dueLabel}
              </Typography>
            ) : null}
            <View style={styles.spacer} />
            {card.attachmentCount > 0 ? (
              <View testID="card-attachments" style={styles.counter}>
                <Paperclip size={14} color={colors.textSecondary} />
                <Typography variant="caption" color="secondary">
                  {String(card.attachmentCount)}
                </Typography>
              </View>
            ) : null}
            {card.commentsCount > 0 ? (
              <View testID="card-comments" style={styles.counter}>
                <MessageCircle size={14} color={colors.textSecondary} />
                <Typography variant="caption" color="secondary">
                  {String(card.commentsCount)}
                </Typography>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', overflow: 'hidden', borderWidth: 1 },
  edge: { width: 4, alignSelf: 'stretch' },
  body: { flex: 1, padding: 10, gap: 6 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  labelChip: { paddingHorizontal: 11, paddingVertical: 5, borderWidth: 1 },
  avatarsRow: { flexDirection: 'row' },
  avatarWrap: { borderRadius: AVATAR_SIZE, borderWidth: 2 },
  avatarOverlap: { marginLeft: -8 },
  overflowBadge: { width: AVATAR_SIZE, height: AVATAR_SIZE, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  spacer: { flex: 1 },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});

function sameLabels(a: CardTileData['labels'], b: CardTileData['labels']) {
  if (a.length !== b.length) return false;
  return a.every((label, i) => label.id === b[i].id && label.title === b[i].title && label.color === b[i].color);
}

function sameAssignees(a: CardTileData['assignees'], b: CardTileData['assignees']) {
  if (a.length !== b.length) return false;
  return a.every(
    (assignee, i) => assignee.participant === b[i].participant && assignee.displayName === b[i].displayName,
  );
}

// A column re-renders on every observed change and rebuilds `data` fresh each
// time, so a default shallow compare on { data, onPress } never bails — it's a
// no-op. Comparing primitives is the fix, but only because `card` is a
// snapshot (see `toCardTileCard`), not the WatermelonDB model instance:
// WatermelonDB keeps one JS instance per row (its identity map), so an
// optimistic local write mutates that instance in place. Reading fields off
// the live instance would make prev.data.card and next.data.card the same
// mutated object — both sides already showing the new value — so the
// comparator would bail and the tile would stay stale. A snapshot taken fresh
// on every render captures the field values at that moment, so a real change
// shows up as two different values, never as one object compared to itself.
function areEqual(prev: CardTileProps, next: CardTileProps) {
  if (prev.onPress !== next.onPress) return false;

  const a = prev.data.card;
  const b = next.data.card;
  if (
    a.id !== b.id ||
    a.title !== b.title ||
    a.color !== b.color ||
    a.duedate !== b.duedate ||
    a.doneAt !== b.doneAt ||
    a.attachmentCount !== b.attachmentCount ||
    a.commentsCount !== b.commentsCount
  ) {
    return false;
  }

  return sameLabels(prev.data.labels, next.data.labels) && sameAssignees(prev.data.assignees, next.data.assignees);
}

export const CardTile = React.memo(CardTileImpl, areEqual);
