import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Check, Search } from 'lucide-react-native';

import { useAvatar } from '@/features/account/hooks/useAvatar';
import { filterParticipants, participantKey, type Participant } from '@/features/card/participants';
import type { Account } from '@/types';
import { AnimatedPressable, Avatar, EmptyState, Icon, Sheet, TextField, Typography } from '@/ui/components';

export interface AssigneesSheetProps {
  visible: boolean;
  account: Account | null;
  participants: Participant[];
  selected: Participant[];
  onClose: () => void;
  onToggle: (participant: Participant, checked: boolean) => void;
}

// A large board can match hundreds of participants on a common two-letter
// substring; each result row mounts an avatar fetch, so results are capped
// independently of how many participants match.
const MAX_RESULTS = 25;

/** A user's avatar comes from the server; a group or team has none, so it
 * renders initials only (assigneeType !== 0, handled by the caller). */
function ParticipantAvatar({ account, participant }: { account: Account | null; participant: Participant }) {
  const { data } = useAvatar(account, participant.participant);
  return <Avatar uri={data} name={participant.displayName} size={32} />;
}

/**
 * The board's users and ACL entries, searched locally (spec §7.5.5 — never a
 * network call). The card's current assignees are always shown first as
 * checked rows; below that, either the "type at least two characters" hint or
 * the still-unassigned people matching the query. Toggling never closes the
 * sheet — assigning several people in a row is the common case, same as
 * LabelsSheet.
 */
export function AssigneesSheet({
  visible,
  account,
  participants,
  selected,
  onClose,
  onToggle,
}: AssigneesSheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  const close = () => {
    setQuery('');
    onClose();
  };

  const selectedKeys = new Set(selected.map(participantKey));
  // filterParticipants already enforces the two-character floor, so an empty
  // `results` also covers the below-threshold case — no second check needed.
  const results = filterParticipants(participants, query).filter(
    (p) => !selectedKeys.has(participantKey(p)),
  );

  const row = (p: Participant, checked: boolean) => (
    <AnimatedPressable
      key={participantKey(p)}
      testID={`assignee-row-${p.participant}-${p.assigneeType}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onToggle(p, !checked)}
      style={styles.row}
    >
      {p.assigneeType === 0 ? (
        <ParticipantAvatar account={account} participant={p} />
      ) : (
        <Avatar name={p.displayName} size={32} />
      )}
      <Typography style={styles.title}>{p.displayName}</Typography>
      {checked ? (
        <Icon size={20}>
          <Check color={colors.primary} />
        </Icon>
      ) : null}
    </AnimatedPressable>
  );

  return (
    <Sheet visible={visible} onClose={close} title={t('card.assignPeople')}>
      <TextField
        testID="assignee-search"
        value={query}
        onChangeText={setQuery}
        placeholder={t('card.searchPeople')}
      />
      {selected.map((p) => row(p, true))}
      {query.trim().length < 2 ? (
        <EmptyState
          testID="assignees-hint"
          icon={<Search />}
          title={t('card.searchPeople')}
          description={t('card.typeTwo')}
        />
      ) : (
        results.slice(0, MAX_RESULTS).map((p) => row(p, false))
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  title: { flex: 1 },
});
