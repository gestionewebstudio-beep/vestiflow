import { createHmac } from 'node:crypto';

/** Firma richieste TikTok Shop Partner API (HMAC-SHA256). */
export function signTikTokRequest(
  appSecret: string,
  path: string,
  query: Record<string, string>,
  body = '',
): string {
  const exclude = new Set(['sign', 'access_token']);
  const paramString = Object.keys(query)
    .filter((key) => !exclude.has(key))
    .sort()
    .map((key) => `${key}${query[key]}`)
    .join('');

  const payload = `${appSecret}${path}${paramString}${body}${appSecret}`;
  return createHmac('sha256', appSecret).update(payload).digest('hex');
}

export function buildTikTokQuery(
  appKey: string,
  timestamp: number,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    app_key: appKey,
    timestamp: String(timestamp),
    ...extra,
  };
}
