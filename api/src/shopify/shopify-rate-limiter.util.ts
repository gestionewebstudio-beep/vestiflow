/** Parsed value of `X-Shopify-Shop-Api-Call-Limit` (es. `32/40`). */
export interface ShopifyCallLimitSnapshot {
  readonly used: number;
  readonly max: number;
}

/** `extensions.cost.throttleStatus` dalla risposta GraphQL Admin API. */
export interface ShopifyGraphQlThrottleStatus {
  readonly maximumAvailable: number;
  readonly currentlyAvailable: number;
  readonly restoreRate: number;
}

export interface ShopifyGraphQlCostExtensions {
  readonly requestedQueryCost?: number;
  readonly actualQueryCost?: number;
  readonly throttleStatus?: ShopifyGraphQlThrottleStatus;
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

export function parseGraphQlCostExtensions(
  extensions: unknown,
): ShopifyGraphQlCostExtensions | null {
  if (typeof extensions !== 'object' || extensions === null) {
    return null;
  }

  const cost = (extensions as { cost?: unknown }).cost;
  if (typeof cost !== 'object' || cost === null) {
    return null;
  }

  const raw = cost as {
    requestedQueryCost?: unknown;
    actualQueryCost?: unknown;
    throttleStatus?: unknown;
  };

  const throttleStatus = parseGraphQlThrottleStatus(raw.throttleStatus);
  const requestedQueryCost = parseFiniteNumber(raw.requestedQueryCost);
  const actualQueryCost = parseFiniteNumber(raw.actualQueryCost);

  if (throttleStatus == null && requestedQueryCost == null && actualQueryCost == null) {
    return null;
  }

  return {
    ...(requestedQueryCost != null ? { requestedQueryCost } : {}),
    ...(actualQueryCost != null ? { actualQueryCost } : {}),
    ...(throttleStatus != null ? { throttleStatus } : {}),
  };
}

function parseGraphQlThrottleStatus(value: unknown): ShopifyGraphQlThrottleStatus | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const raw = value as {
    maximumAvailable?: unknown;
    currentlyAvailable?: unknown;
    restoreRate?: unknown;
  };

  const maximumAvailable = parseFiniteNumber(raw.maximumAvailable);
  const currentlyAvailable = parseFiniteNumber(raw.currentlyAvailable);
  const restoreRate = parseFiniteNumber(raw.restoreRate);

  if (
    maximumAvailable == null ||
    currentlyAvailable == null ||
    restoreRate == null ||
    restoreRate <= 0
  ) {
    return null;
  }

  return { maximumAvailable, currentlyAvailable, restoreRate };
}

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

/**
 * Ritardo adattivo REST: sfrutta il burst del leaky bucket (40 slot) quando c'è headroom,
 * aumenta verso minIntervalMs solo quando used/max si avvicina alla soglia alta.
 */
export function computeRestRequestDelayMs(
  snapshot: ShopifyCallLimitSnapshot | null,
  minIntervalMs: number,
  burstRatio: number,
  highWatermark: number,
  coldStartIntervalMs: number,
): number {
  if (!snapshot || snapshot.max <= 0) {
    return coldStartIntervalMs;
  }

  const ratio = snapshot.used / snapshot.max;
  if (ratio <= burstRatio) {
    return 0;
  }

  if (ratio >= highWatermark) {
    return minIntervalMs;
  }

  const span = highWatermark - burstRatio;
  if (span <= 0) {
    return minIntervalMs;
  }

  const t = (ratio - burstRatio) / span;
  return Math.round(t * minIntervalMs);
}

/**
 * Attesa GraphQL basata su punti costo disponibili (restoreRate punti/secondo).
 */
export function computeGraphQlRequestDelayMs(
  throttleStatus: ShopifyGraphQlThrottleStatus | null,
  reservePoints: number,
): number {
  if (!throttleStatus || throttleStatus.restoreRate <= 0) {
    return 0;
  }

  const deficit = reservePoints - throttleStatus.currentlyAvailable;
  if (deficit <= 0) {
    return 0;
  }

  return Math.ceil((deficit / throttleStatus.restoreRate) * 1000);
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
