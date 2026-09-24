import { type ReactNode, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { setActiveAccountId } from '@/services/nextcloud/auth';
import { useAccounts } from '@/hooks/useAccounts';
import { useAccountStore } from '@/stores/accountStore';
import { AvatarImage } from '@/components/AvatarImage';
import { Select, type SelectOption } from '@/ui/components';

import { hostnameOf } from '../utils/account';

interface Props {
  trigger: ReactNode;
  footer?: (close: () => void) => ReactNode;
}

export function AccountSwitcher({ trigger, footer }: Props) {
  const { t } = useTranslation();
  const accounts = useAccounts();
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const setStoreId = useAccountStore((s) => s.setActiveAccountId);

  const handleChange = useCallback(async (id: string) => {
    await setActiveAccountId(id);
    setStoreId(id);
  }, [setStoreId]);

  const options: SelectOption<string>[] = accounts.map((account) => ({
    value: account.id,
    label: account.displayName || account.username,
    description: hostnameOf(account.baseUrl),
    leading: (size) => <AvatarImage account={account} size={size} />,
  }));

  return (
    <Select<string>
      value={activeAccountId ?? accounts[0]?.id ?? ''}
      options={options}
      onChange={(id) => { void handleChange(id); }}
      trigger={trigger}
      footer={footer}
      accessibilityLabel={t('settings.accounts')}
    />
  );
}
