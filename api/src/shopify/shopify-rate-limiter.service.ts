import { Injectable } from '@nestjs/common';

import { ShopifyConfigService } from './shopify-config.service';
import {
  computeGraphQlRequestDelayMs,
  computeRestRequestDelayMs,
  computeShopifyRetryDelayMs,
  parseShopifyCallLimitHeader,
  sleepMs,
} from './shopify-rate-limiter.util';
import type {
  ShopifyCallLimitSnapshot,
  ShopifyGraphQlCostExtensions,
  ShopifyGraphQlThrottleStatus,
} from './shopify-rate-limiter.util';

interface ShopRateState {
  lastRestRequestAt: number;
  lastGraphqlRequestAt: number;
  pauseUntil: number;
  restBucket: ShopifyCallLimitSnapshot | null;
  graphqlThrottle: ShopifyGraphQlThrottleStatus | null;
  graphqlReservePoints: number;
}

/**
 * Throttle outbound Shopify Admin API per shop.
 * REST: burst adattivo sul leaky bucket (header X-Shopify-Shop-Api-Call-Limit).
 * GraphQL: attesa su punti costo (extensions.cost.throttleStatus).
 * Process-local: su più istanze Railway ogni replica ha il proprio stato (conservativo).
 */
@Injectable()
export class ShopifyRateLimiterService {
  private readonly shops = new Map<string, ShopRateState>();

  constructor(private readonly shopifyConfig: ShopifyConfigService) {}

  async beforeRestRequest(shopDomain: string): Promise<void> {
    const state = this.getOrCreateState(shopDomain);
    await this.waitUntilUnpaused(state);

    const delayMs = computeRestRequestDelayMs(
      state.restBucket,
      this.shopifyConfig.apiMinIntervalMs,
      this.shopifyConfig.apiBucketBurstRatio,
      this.shopifyConfig.apiBucketHighWatermark,
      this.shopifyConfig.apiColdStartIntervalMs,
    );
    await this.enforceMinInterval(state.lastRestRequestAt, delayMs);

    state.lastRestRequestAt = Date.now();
  }

  async beforeGraphqlRequest(shopDomain: string): Promise<void> {
    const state = this.getOrCreateState(shopDomain);
    await this.waitUntilUnpaused(state);

    const costDelayMs = computeGraphQlRequestDelayMs(
      state.graphqlThrottle,
      state.graphqlReservePoints,
    );
    await this.enforceMinInterval(
      state.lastGraphqlRequestAt,
      Math.max(costDelayMs, this.shopifyConfig.graphqlMinIntervalMs),
    );

    state.lastGraphqlRequestAt = Date.now();
  }

  onCallLimitHeader(shopDomain: string, header: string | null | undefined): void {
    const snapshot = parseShopifyCallLimitHeader(header);
    if (!snapshot) {
      return;
    }

    const state = this.getOrCreateState(shopDomain);
    state.restBucket = snapshot;

    const ratio = snapshot.used / snapshot.max;
    if (ratio < this.shopifyConfig.apiBucketHighWatermark) {
      return;
    }

    const pauseUntil = Date.now() + this.shopifyConfig.apiBucketPauseMs;
    state.pauseUntil = Math.max(state.pauseUntil, pauseUntil);
  }

  onGraphQlCost(shopDomain: string, cost: ShopifyGraphQlCostExtensions | null | undefined): void {
    if (!cost?.throttleStatus) {
      return;
    }

    const state = this.getOrCreateState(shopDomain);
    state.graphqlThrottle = cost.throttleStatus;

    const estimatedNextCost =
      cost.actualQueryCost ?? cost.requestedQueryCost ?? state.graphqlReservePoints;
    state.graphqlReservePoints = Math.max(
      this.shopifyConfig.graphqlCostReservePoints,
      Math.ceil(estimatedNextCost),
    );
  }

  async waitForRetry(
    shopDomain: string,
    attempt: number,
    retryAfterSeconds: number | null,
  ): Promise<void> {
    const delayMs = computeShopifyRetryDelayMs(attempt, retryAfterSeconds);
    const state = this.getOrCreateState(shopDomain);
    state.pauseUntil = Math.max(state.pauseUntil, Date.now() + delayMs);
    await sleepMs(delayMs);
    state.lastRestRequestAt = Date.now();
    state.lastGraphqlRequestAt = Date.now();
  }

  private async waitUntilUnpaused(state: ShopRateState): Promise<void> {
    const now = Date.now();
    if (state.pauseUntil > now) {
      await sleepMs(state.pauseUntil - now);
    }
  }

  private async enforceMinInterval(lastRequestAt: number, delayMs: number): Promise<void> {
    if (lastRequestAt <= 0 || delayMs <= 0) {
      return;
    }

    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < delayMs) {
      await sleepMs(delayMs - elapsed);
    }
  }

  private getOrCreateState(shopDomain: string): ShopRateState {
    let state = this.shops.get(shopDomain);
    if (!state) {
      state = {
        lastRestRequestAt: 0,
        lastGraphqlRequestAt: 0,
        pauseUntil: 0,
        restBucket: null,
        graphqlThrottle: null,
        graphqlReservePoints: this.shopifyConfig.graphqlCostReservePoints,
      };
      this.shops.set(shopDomain, state);
    }
    return state;
  }
}
