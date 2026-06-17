import { Injectable } from '@nestjs/common';

import { ShopifyConfigService } from './shopify-config.service';
import {
  computeShopifyRetryDelayMs,
  parseShopifyCallLimitHeader,
  sleepMs,
} from './shopify-rate-limiter.util';

interface ShopRateState {
  lastRequestAt: number;
  pauseUntil: number;
}

/**
 * Throttle outbound Shopify Admin API per shop (leaky-bucket assistito + header Shopify).
 * Process-local: su più istanze Railway ogni replica ha il proprio bucket (conservativo).
 */
@Injectable()
export class ShopifyRateLimiterService {
  private readonly shops = new Map<string, ShopRateState>();

  constructor(private readonly shopifyConfig: ShopifyConfigService) {}

  async beforeRequest(shopDomain: string): Promise<void> {
    const state = this.getOrCreateState(shopDomain);
    const now = Date.now();

    if (state.pauseUntil > now) {
      await sleepMs(state.pauseUntil - now);
    }

    const elapsed = Date.now() - state.lastRequestAt;
    const minIntervalMs = this.shopifyConfig.apiMinIntervalMs;
    if (state.lastRequestAt > 0 && elapsed < minIntervalMs) {
      await sleepMs(minIntervalMs - elapsed);
    }

    state.lastRequestAt = Date.now();
  }

  onCallLimitHeader(shopDomain: string, header: string | null | undefined): void {
    const snapshot = parseShopifyCallLimitHeader(header);
    if (!snapshot) {
      return;
    }

    const ratio = snapshot.used / snapshot.max;
    if (ratio < this.shopifyConfig.apiBucketHighWatermark) {
      return;
    }

    const state = this.getOrCreateState(shopDomain);
    const pauseUntil = Date.now() + this.shopifyConfig.apiBucketPauseMs;
    state.pauseUntil = Math.max(state.pauseUntil, pauseUntil);
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
    state.lastRequestAt = Date.now();
  }

  private getOrCreateState(shopDomain: string): ShopRateState {
    let state = this.shops.get(shopDomain);
    if (!state) {
      state = { lastRequestAt: 0, pauseUntil: 0 };
      this.shops.set(shopDomain, state);
    }
    return state;
  }
}
