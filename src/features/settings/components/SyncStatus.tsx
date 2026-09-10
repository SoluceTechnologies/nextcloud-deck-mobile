import { Q } from '@nozbe/watermelondb';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useDatabase } from '@/database/DatabaseProvider';
import type OutboxEntry from '@/database/models/OutboxEntry';
import { safeWrite } from '@/database/utils/safeTransaction';
import { useAccountStore } from '@/stores/accountStore';
import { OUTBOX_FAILED, OUTBOX_QUEUED } from '@/sync/outbox/enqueue';
import { Item, List, SectionHeader } from '@/ui/components';

export function SyncStatus() {
  const { t } = useTranslation();
  const database = useDatabase();
  const accountId = useAccountStore((s) => s.activeAccountId);
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

  if (entries.length === 0) {
    return (
      <List>
        <Item title={t('sync.empty')} />
      </List>
    );
  }

  return (
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
                  <Item
                    title={t('sync.retry')}
                    onPress={() => void retry(entry).catch(() => undefined)}
                  />
                }
                onPress={() => void discard(entry).catch(() => undefined)}
              />
            ))}
          </List>
        </>
      ) : null}
    </>
  );
}
