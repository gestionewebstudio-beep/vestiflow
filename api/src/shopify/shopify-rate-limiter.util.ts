/** Parsed value of `X-Shopify-Shop-Api-Call-Limit` (es. `32/40`). */
export interface ShopifyCallLimitSnapshot {
  readonly used: number;
  readonly max: number;
}

export function parseShopifyCallLimitHeader(
  header: string | null | undefined,
): ShopifyCallLimitSnapshot | null {
  if (!header) {
    return null;
  }

  const match = header.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match) {
    return null;
  }

  const used = Number.parseInt(match[1]!, 10);
  const max = Number.parseInt(match[2]!, 10);
  if (!Number.isFinite(used) || !Number.isFinite(max) || max <= 0) {
    return null;
  }

  return { used, max };
}

export function parseShopifyRetryAfterHeader(header: string | null | undefined): number | null {
  if (!header) {
    return null;
  }

  const seconds = Number.parseFloat(header.trim());
  if (!Number.isFinite(seconds) || seconds < 0) {
    return null;
  }

  return seconds;
}

/** Backoff per retry 429: preferisce Retry-After, altrimenti esponenziale capped. */
export function computeShopifyRetryDelayMs(
  attempt: number,
  retryAfterSeconds: number | null,
): number {
  if (retryAfterSeconds != null && retryAfterSeconds > 0) {
    return Math.ceil(retryAfterSeconds * 1000);
  }

  const baseMs = 1000 * 2 ** attempt;
  return Math.min(baseMs, 30_000);
}

export function sleepMs(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
