export interface NcLoginData {
  server: string;
  user: string;
  password: string;
  oneTime: boolean;
}

function decodeNcValue(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, '%20'));
  } catch {
    return value;
  }
}

export function parseNcLoginUrl(raw: string): NcLoginData | null {
  const match = raw.trim().match(/^nc:\/\/(onetime-)?login\/(.+)$/i);
  if (!match) return null;

  const fields: Partial<Record<'server' | 'user' | 'password', string>> = {};

  for (const token of match[2].split('&')) {
    const sep = token.indexOf(':');
    if (sep <= 0) continue;
    const key = token.slice(0, sep).toLowerCase();
    if (key !== 'user' && key !== 'password' && key !== 'server') continue;
    fields[key] = decodeNcValue(token.slice(sep + 1));
  }

  if (!fields.user || !fields.password || !fields.server) return null;

  return {
    user:     fields.user,
    password: fields.password,
    server:   fields.server.replace(/\/$/, ''),
    oneTime:  Boolean(match[1]),
  };
}
