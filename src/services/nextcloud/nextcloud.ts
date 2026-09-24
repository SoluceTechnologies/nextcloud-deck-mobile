import type { Account, ServerCapabilities } from '@/types';
import { httpErrorFrom } from '../shared/errors';
import { trustedFetch } from '../shared/trustedFetch';

function basicAuth(account: Pick<Account, 'username' | 'appPassword'>): string {
  return 'Basic ' + btoa(`${account.username}:${account.appPassword}`);
}

const NAMED_XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeXmlEntities(input: string): string {
  return input.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity[0] === '#') {
      const code =
        entity[1] === 'x' || entity[1] === 'X'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_XML_ENTITIES[entity] ?? match;
  });
}

function extractPropHref(xml: string, localName: string): string | undefined {
  const prop = new RegExp(
    `<[A-Za-z0-9_.-]*:?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)</[A-Za-z0-9_.-]*:?${localName}\\s*>`,
    'i',
  ).exec(xml)?.[1];
  const href = prop && /<[A-Za-z0-9_.-]*:?href(?:\s[^>]*)?>([\s\S]*?)</i.exec(prop)?.[1];
  return href ? decodeXmlEntities(href).trim() : undefined;
}

function extractSlug(url: string): string {
  const slug = url.replace(/\/$/, '').split('/').pop() ?? '';
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

export async function validateCredentials(params: {
  baseUrl: string;
  username: string;
  appPassword: string;
}): Promise<{ davUserId: string }> {
  const res = await trustedFetch(`${params.baseUrl}/remote.php/dav/`, {
    method: 'PROPFIND',
    headers: { Authorization: basicAuth(params), Depth: '0', 'Content-Type': 'application/xml' },
    body: '<?xml version="1.0" encoding="utf-8"?>' +
    '<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>',
    timeoutMs: 20000,
    maxRetries: 0,
  });
  if (res.status !== 207 && !res.ok) throw httpErrorFrom(res, 'validateCredentials');

  const principalPath = extractPropHref(await res.text(), 'current-user-principal');
  if (!principalPath) {
    const principalUrl = `${params.baseUrl}/remote.php/dav/principals/users/${encodeURIComponent(params.username)}/`;
    const fallback = await trustedFetch(principalUrl, {
      method: 'PROPFIND',
      headers: { Authorization: basicAuth(params), Depth: '0', 'Content-Type': 'application/xml' },
      timeoutMs: 20000,
      maxRetries: 0,
    });
    if (fallback.status !== 207 && !fallback.ok) throw httpErrorFrom(fallback, 'validateCredentials');
    return { davUserId: params.username };
  }

  return { davUserId: extractSlug(principalPath) || params.username };
}

export async function exchangeOneTimeToken(params: {
  baseUrl: string;
  username: string;
  oneTimeToken: string;
}): Promise<string> {
  const url = `${params.baseUrl}/ocs/v2.php/core/getapppassword-onetime`;
  const res = await trustedFetch(url, {
    headers: {
      Authorization: 'Basic ' + btoa(`${params.username}:${params.oneTimeToken}`),
      'OCS-APIRequest': 'true',
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw httpErrorFrom(res, 'exchangeOneTimeToken');

  const json = await res.json();
  const appPassword = json?.ocs?.data?.apppassword;
  if (typeof appPassword !== 'string' || !appPassword) {
    throw new Error('exchangeOneTimeToken: response carried no apppassword');
  }
  return appPassword;
}

export async function fetchUserInfo(
  account: Pick<Account, 'baseUrl' | 'username' | 'appPassword' | 'davUserId'>
): Promise<{ displayName: string }> {
  try {
    const url = `${account.baseUrl}/ocs/v2.php/cloud/users/${encodeURIComponent(account.davUserId)}`;
    const res = await trustedFetch(url, {
      headers: {
        Authorization: basicAuth(account),
        'OCS-APIRequest': 'true',
        Accept: 'application/json',
      },
    });
    if (!res.ok) return { displayName: '' };
    const json = await res.json();
    const data = json?.ocs?.data;
    return {
      displayName: (data?.displayname as string) || (data?.['display-name'] as string) || '',
    };
  } catch {
    return { displayName: '' };
  }
}

const UNKNOWN_CAPABILITIES: ServerCapabilities = {
  deckApp: 'unknown',
  deckVersion: '',
  canCreateBoards: false,
};

export async function fetchCapabilities(
  account: Pick<Account, 'baseUrl' | 'username' | 'appPassword'>
): Promise<ServerCapabilities> {
  try {
    const url = `${account.baseUrl}/ocs/v2.php/cloud/capabilities`;
    const res = await trustedFetch(url, {
      headers: {
        Authorization: basicAuth(account),
        'OCS-APIRequest': 'true',
        Accept: 'application/json',
      },
    });
    if (!res.ok) return UNKNOWN_CAPABILITIES;

    const json = await res.json();
    const deck = json?.ocs?.data?.capabilities?.deck;
    if (!deck) return { deckApp: 'unavailable', deckVersion: '', canCreateBoards: false };

    return {
      deckApp: 'available',
      deckVersion: typeof deck.version === 'string' ? deck.version : '',
      canCreateBoards: deck.canCreateBoards === true,
    };
  } catch {
    return UNKNOWN_CAPABILITIES;
  }
}
