export type AccountField = 'appPassword' | 'username';

export type FieldErrorCode = 'required' | 'accountMismatch';

export type FieldErrors = Partial<Record<AccountField, FieldErrorCode>>;

export class AccountFieldError extends Error {
  readonly fields: FieldErrors;

  constructor(fields: FieldErrors) {
    super(`Invalid account fields: ${Object.keys(fields).join(', ')}`);
    this.name = 'AccountFieldError';
    this.fields = fields;
  }
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
