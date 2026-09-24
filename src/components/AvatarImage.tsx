import { useAvatar } from '@/features/account/hooks/useAvatar';
import { Avatar } from '@/ui/components';
import type { Account } from '@/types';

interface Props {
  account: Account;
  size: number;
}


export function AvatarImage({ account, size }: Props) {
  const { data: avatarUri } = useAvatar(account);
  return <Avatar uri={avatarUri} name={account.displayName} size={size} />;
}
