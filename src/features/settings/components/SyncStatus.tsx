import { Q } from '@nozbe/watermelondb';
import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useDatabase } from '@/database/DatabaseProvider';
import type OutboxEntry from '@/database/models/OutboxEntry';
import { safeWrite } from '@/database/utils/safeTransaction';
import { useAccountStore } from '@/stores/accountStore';
import { useUiStore } from '@/stores/uiStore';
import { OUTBOX_FAILED, OUTBOX_QUEUED } from '@/sync/outbox/enqueue';
import { markLocalWrite } from '@/sync/localWrites';
import { describeMutationError } from '@/services/shared/errors';
import { subjectKey, subjectOf, type SubjectRef } from '../syncLabels';
import { Item, List, SectionHeader, Stack, Typography } from '@/ui/components';

function useSubjectTitles(refs: SubjectRef[]): Map<string, string> {
  const database = useDatabase();
  const [titles, setTitles] = useState<Map<string, string>>(new Map());
  const signature = refs.map(subjectKey).sort().join('|');

  useEffect(() => {
    let cancelled = false;
    const unique = new Map(refs.map((ref) => [subjectKey(ref), ref]));
    void Promise.all(
      Array.from(unique, async ([key, ref]) => {
        try {
          const record = (await database.get(ref.table).find(ref.id)) as { title?: string };
          return record.title ? ([key, record.title] as const) : null;
        } catch {
          return null; // deleted locally (e.g. a pending delete)
        }
      }),
    ).then((found) => {
      if (!cancelled) setTitles(new Map(found.filter((f) => f !== null)));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [database, signature]);

  return titles;
}

export function SyncStatus() {
  const { t } = useTranslation();
  const database = useDatabase();
  const accountId = useAccountStore((s) => s.activeAccountId);
  const allConflicts = useUiStore((s) => s.conflicts);
  const clearConflicts = useUiStore((s) => s.clearConflicts);
  const conflicts = allConflicts.filter((c) => c.accountId === accountId);
  const [entries, setEntries] = useState<OutboxEntry[]>([]);

  useEffect(() => {
    if (!accountId) {
      setEntries([]);
      return;
    }
    const subscription = database
      .get<OutboxEntry>('outbox')
      .query(Q.where('account_id', accountId))
      .observeWithColumns(['state', 'attempts', 'last_error', 'next_attempt_at'])
      .subscribe(setEntries);
    return () => subscription.unsubscribe();
  }, [accountId, database]);

  const queued = entries.filter((e) => e.state === OUTBOX_QUEUED);
  const failed = entries.filter((e) => e.state === OUTBOX_FAILED);

  const subjects = useMemo(() => {
    const refs: SubjectRef[] = conflicts.map((c) => ({ table: 'cards', id: c.cardId }));
    for (const entry of entries) {
      const ref = subjectOf(entry.payloadJson);
      if (ref) refs.push(ref);
    }
    return refs;
  }, [conflicts, entries]);
  const titles = useSubjectTitles(subjects);

  const titleOf = (ref: SubjectRef | null) => (ref ? titles.get(subjectKey(ref)) : undefined);
  const joinParts = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' · ');

  const retry = async (entry: OutboxEntry) => {
    await safeWrite(
      database,
      () =>
        entry.update((r: OutboxEntry) => {
          r.state = OUTBOX_QUEUED;
          r.attempts = 0;
          r.nextAttemptAt = 0;
          r.lastError = undefined;
        }),
      10000,
      'syncStatus:retry',
    );
    markLocalWrite();
  };

  const discard = (entry: OutboxEntry) =>
    safeWrite(database, () => entry.destroyPermanently(), 10000, 'syncStatus:discard');

  const confirmDiscard = (entry: OutboxEntry) =>
    Alert.alert(t('sync.discardTitle'), t('sync.discardMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('sync.discard'),
        style: 'destructive',
        onPress: () => void discard(entry).catch(() => undefined),
      },
    ]);

  const renderEntry = (entry: OutboxEntry, retryLabel: string) => (
    <Item
      key={entry.id}
      testID={`sync-entry-${entry.id}`}
      title={t(`sync.kinds.${entry.kind}`, { defaultValue: t('sync.kinds.unknown') })}
      description={joinParts(
        titleOf(subjectOf(entry.payloadJson)),
        entry.state === OUTBOX_QUEUED && entry.attempts === 0
          ? t('sync.waiting')
          : describeMutationError(new Error(entry.lastError ?? '')),
      )}
      trailing={
        <Stack direction="horizontal" gap={16}>
          <Item title={t(retryLabel)} onPress={() => void retry(entry).catch(() => undefined)} />
          <Item title={t('sync.discard')} onPress={() => confirmDiscard(entry)} />
        </Stack>
      }
    />
  );

  const intro = (
    <Typography variant="caption" color="secondary" style={styles.intro}>
      {t('sync.description')}
    </Typography>
  );

  if (entries.length === 0 && conflicts.length === 0) {
    return (
      <Stack gap={24} hAlign="stretch" style={styles.page}>
        {intro}
        <List>
          <Item title={t('sync.empty')} />
        </List>
      </Stack>
    );
  }

  return (
    <Stack gap={24} hAlign="stretch" style={styles.page}>
      {intro}
      {conflicts.length > 0 ? (
        <View>
          <SectionHeader
            title={t('sync.conflicts')}
            trailing={<Item title={t('sync.dismiss')} onPress={clearConflicts} />}
          />
          <List>
            {conflicts.map((conflict, index) => (
              <Item
                key={index}
                title={t('sync.conflictTitle')}
                description={joinParts(
                  titleOf({ table: 'cards', id: conflict.cardId }),
                  conflict.fields.map((f) => t(`sync.fields.${f}`, { defaultValue: f })).join(', '),
                )}
              />
            ))}
          </List>
        </View>
      ) : null}

      {queued.length > 0 ? (
        <View>
          <SectionHeader title={t('sync.queued')} />
          <List>{queued.map((entry) => renderEntry(entry, 'sync.retryNow'))}</List>
        </View>
      ) : null}

      {failed.length > 0 ? (
        <View>
          <SectionHeader title={t('sync.failed')} />
          <List>{failed.map((entry) => renderEntry(entry, 'sync.retry'))}</List>
        </View>
      ) : null}
    </Stack>
  );
}

const styles = StyleSheet.create({
  page: { marginHorizontal: 16 },
  intro: { paddingHorizontal: 6 },
});
