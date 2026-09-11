import { Q } from '@nozbe/watermelondb';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useDatabase } from '@/database/DatabaseProvider';
import type OutboxEntry from '@/database/models/OutboxEntry';
import { safeWrite } from '@/database/utils/safeTransaction';
import { useAccountStore } from '@/stores/accountStore';
import { useUiStore } from '@/stores/uiStore';
import { OUTBOX_FAILED, OUTBOX_QUEUED } from '@/sync/outbox/enqueue';
import { Item, List, SectionHeader, Stack } from '@/ui/components';

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
      .observeWithColumns(['state', 'attempts', 'last_error'])
      .subscribe(setEntries);
    return () => subscription.unsubscribe();
  }, [accountId, database]);

  const queued = entries.filter((e) => e.state === OUTBOX_QUEUED);
  const failed = entries.filter((e) => e.state === OUTBOX_FAILED);

  const retry = (entry: OutboxEntry) =>
    safeWrite(
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

  const discard = (entry: OutboxEntry) =>
    safeWrite(database, () => entry.destroyPermanently(), 10000, 'syncStatus:discard');

  // This screen is the only place a permanently-failed edit surfaces, and
  // discarding it is unrecoverable — it needs its own labelled control, not
  // a tap anywhere on the row, and a confirmation before it runs.
  const confirmDiscard = (entry: OutboxEntry) =>
    Alert.alert(t('sync.discardTitle'), t('sync.discardMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('sync.discard'),
        style: 'destructive',
        onPress: () => void discard(entry).catch(() => undefined),
      },
    ]);

  if (entries.length === 0 && conflicts.length === 0) {
    return (
      <List>
        <Item title={t('sync.empty')} />
      </List>
    );
  }

  return (
    <>
      {conflicts.length > 0 ? (
        <>
          <SectionHeader
            title={t('sync.conflicts')}
            trailing={<Item title={t('sync.dismiss')} onPress={clearConflicts} />}
          />
          <List>
            {conflicts.map((conflict, index) => (
              <Item
                key={index}
                title={t('sync.conflictTitle')}
                description={conflict.fields.join(', ')}
              />
            ))}
          </List>
        </>
      ) : null}

      {entries.length > 0 ? (
        <>
          <SectionHeader title={t('sync.queued')} trailing={undefined} />
          <List>
            <Item title={String(queued.length)} description={t('sync.queued')} />
          </List>

          {failed.length > 0 ? (
            <>
              <SectionHeader title={t('sync.failed')} />
              <List>
                {failed.map((entry) => (
                  <Item
                    key={entry.id}
                    title={entry.kind}
                    description={entry.lastError ?? ''}
                    trailing={
                      <Stack direction="horizontal" gap={16}>
                        <Item
                          title={t('sync.retry')}
                          onPress={() => void retry(entry).catch(() => undefined)}
                        />
                        <Item title={t('sync.discard')} onPress={() => confirmDiscard(entry)} />
                      </Stack>
                    }
                  />
                ))}
              </List>
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}
