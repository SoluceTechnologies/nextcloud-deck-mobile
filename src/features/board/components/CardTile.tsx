import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';
import { Paperclip, MessageCircle } from 'lucide-react-native';
import dayjs from 'dayjs';

import type Card from '@/database/models/Card';
import { AnimatedPressable, Avatar, Chip, Typography } from '@/ui/components';

export type CardTileData = {
  card: Card;
  labels: { id: string; title: string; color: string | null }[];
  assignees: { participant: string; displayName: string }[];
};

const MAX_AVATARS = 3;
const AVATAR_SIZE = 22;

function CardTileImpl({ data, onPress }: { data: CardTileData; onPress: () => void }) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const { card, labels, assignees } = data;

  const title = card.title || t('card.noTitle');
  const shownAssignees = assignees.slice(0, MAX_AVATARS);
  const overflow = assignees.length - shownAssignees.length;
  const hasFooter = Boolean(card.duedate) || card.attachmentCount > 0 || card.commentsCount > 0;

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
              <Chip
                key={label.id}
                small
                active={Boolean(label.color)}
                activeColor={label.color ?? undefined}
              >
                {label.title}
              </Chip>
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
            {card.duedate ? (
              <Typography testID="card-due" variant="caption" color="secondary">
                {t('card.dueOn', { when: dayjs(card.duedate).format('D MMM') })}
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
  avatarsRow: { flexDirection: 'row' },
  avatarWrap: { borderRadius: AVATAR_SIZE, borderWidth: 2 },
  avatarOverlap: { marginLeft: -8 },
  overflowBadge: { width: AVATAR_SIZE, height: AVATAR_SIZE, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  spacer: { flex: 1 },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});

// A column re-renders on every observed change; a tile whose data did not
// change must not re-render (spec §10).
export const CardTile = React.memo(CardTileImpl);
