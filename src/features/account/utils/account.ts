import type { Account } from '@/types';

export interface AccountProfilePatch {
  displayName?: string;
  email?: string;
}

export type AccountField = keyof AccountProfilePatch | 'appPassword' | 'username';

export type FieldErrorCode = 'required' | 'invalidEmail' | 'accountMismatch';

export type FieldErrors = Partial<Record<AccountField, FieldErrorCode>>;

export class AccountFieldError extends Error {
  readonly fields: FieldErrors;

  constructor(fields: FieldErrors) {
    super(`Invalid account fields: ${Object.keys(fields).join(', ')}`);
    this.name = 'AccountFieldError';
    this.fields = fields;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalize(value: string | undefined): string | undefined {
  return value === undefined ? undefined : value.trim();
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function diffProfile(account: Account, patch: AccountProfilePatch): AccountProfilePatch {
  const changes: AccountProfilePatch = {};
  const displayName = normalize(patch.displayName);
  const email = normalize(patch.email);
  if (displayName !== undefined && displayName !== account.displayName) {
    changes.displayName = displayName;
  }
  if (email !== undefined && email !== (account.email ?? '')) {
    changes.email = email;
  }
  return changes;
}

export function validateProfilePatch(patch: AccountProfilePatch): FieldErrors | null {
  const errors: FieldErrors = {};

  if (patch.displayName !== undefined && !patch.displayName.trim()) {
    errors.displayName = 'required';
  }

  const email = normalize(patch.email);
  if (email && !EMAIL_RE.test(email)) {
    errors.email = 'invalidEmail';
  }

  return Object.keys(errors).length > 0 ? errors : null;
}
