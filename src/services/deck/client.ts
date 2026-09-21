import type { Account } from '@/types';
import { httpErrorFrom } from '@/services/shared/errors';
import { trustedFetch } from '@/services/shared/trustedFetch';

const API_VERSION = '1.1';

export type DeckAccount = Pick<Account, 'baseUrl' | 'username' | 'appPassword'>;

export type DeckResult<T> = {
  data: T | null;
  etag: string | null;
  notModified: boolean;
};

export type DeckRequestOptions = {
  path: string;
  api?: 'rest' | 'ocs';
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  sinceMs?: number;
  etag?: string | null;
  /** Used in error messages so a failure names the caller. */
  context: string;
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function toImfFixdate(ms: number): string {
  const d = new Date(ms);
  return (
    `${DAYS[d.getUTCDay()]}, ${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ` +
    `${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:` +
    `${pad(d.getUTCSeconds())} GMT`
  );
}

function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

export function deckRestUrl(baseUrl: string, path: string): string {
  return `${trimBase(baseUrl)}/index.php/apps/deck/api/v${API_VERSION}${path}`;
}

export function deckOcsUrl(baseUrl: string, path: string): string {
  return `${trimBase(baseUrl)}/ocs/v2.php/apps/deck/api/v${API_VERSION}${path}`;
}

function basicAuth(account: DeckAccount): string {
  return 'Basic ' + btoa(`${account.username}:${account.appPassword}`);
}

function unwrap<T>(parsed: unknown, api: 'rest' | 'ocs'): T {
  if (api === 'ocs' && parsed && typeof parsed === 'object' && 'ocs' in parsed) {
    return (parsed as { ocs: { data: T } }).ocs.data;
  }
  return parsed as T;
}

export async function deckRequest<T>(
  account: DeckAccount,
  opts: DeckRequestOptions,
): Promise<DeckResult<T>> {
  const api = opts.api ?? 'rest';
  const url =
    api === 'ocs' ? deckOcsUrl(account.baseUrl, opts.path) : deckRestUrl(account.baseUrl, opts.path);

  const headers: Record<string, string> = {
    Authorization: basicAuth(account),
    'OCS-APIRequest': 'true',
    Accept: 'application/json',
  };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.sinceMs !== undefined) headers['If-Modified-Since'] = toImfFixdate(opts.sinceMs);
  if (opts.etag) headers['If-None-Match'] = opts.etag;

  const res = await trustedFetch(url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    maxRetries: 2,
  });

  if (res.status === 304) return { data: null, etag: null, notModified: true };
  if (!res.ok) throw httpErrorFrom(res, opts.context);

  const raw = await res.text();
  const data = raw.length === 0 ? null : unwrap<T>(JSON.parse(raw), api);

  return { data, etag: res.headers.get('ETag'), notModified: false };
}
