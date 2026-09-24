import { useTranslation } from 'react-i18next';

import { SettingsPage } from '@/features/settings/components/SettingsPage';
import { SyncStatus } from '@/features/settings/components/SyncStatus';

export default function SyncSettingsScreen() {
  const { t } = useTranslation();
  return (
    <SettingsPage title={t('sync.title')}>
      <SyncStatus />
    </SettingsPage>
  );
}
