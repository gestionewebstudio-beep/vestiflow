import { describe, expect, it, vi } from 'vitest';

import type { ShopifyInventoryPushService } from '../shopify/shopify-inventory-push.service';
import type { ShopifyProductPushService } from '../shopify/shopify-product-push.service';
import type { TikTokInventoryPushService } from '../tiktok/tiktok-inventory-push.service';
import type { TikTokProductPushService } from '../tiktok/tiktok-product-push.service';
import { ChannelSyncFacade } from './channel-sync.facade';

describe('ChannelSyncFacade', () => {
  it('enqueueProductPush invoca entrambi i canali', () => {
    const shopifyProductPush = { enqueuePush: vi.fn().mockResolvedValue(undefined) };
    const tiktokProductPush = { enqueuePush: vi.fn().mockResolvedValue(undefined) };
    const facade = new ChannelSyncFacade(
      {} as ShopifyInventoryPushService,
      shopifyProductPush as unknown as ShopifyProductPushService,
      {} as TikTokInventoryPushService,
      tiktokProductPush as unknown as TikTokProductPushService,
    );

    facade.enqueueProductPush('tenant-1', 'prod-1');

    expect(shopifyProductPush.enqueuePush).toHaveBeenCalledWith('tenant-1', 'prod-1');
    expect(tiktokProductPush.enqueuePush).toHaveBeenCalledWith('tenant-1', 'prod-1');
  });

  it('pushInventoryLevels propaga a Shopify e TikTok', async () => {
    const shopifyInventoryPush = {
      pushLevels: vi.fn().mockResolvedValue(undefined),
    };
    const tiktokInventoryPush = {
      pushVariantStock: vi.fn().mockResolvedValue(undefined),
    };
    const facade = new ChannelSyncFacade(
      shopifyInventoryPush as unknown as ShopifyInventoryPushService,
      {} as ShopifyProductPushService,
      tiktokInventoryPush as unknown as TikTokInventoryPushService,
      {} as TikTokProductPushService,
    );

    await facade.pushInventoryLevels('tenant-1', 'var-1', ['loc-1']);

    expect(shopifyInventoryPush.pushLevels).toHaveBeenCalledWith('tenant-1', 'var-1', ['loc-1']);
    expect(tiktokInventoryPush.pushVariantStock).toHaveBeenCalledWith('tenant-1', 'var-1');
  });

  it('pushInventoryLevels non propaga errori Shopify', async () => {
    const shopifyInventoryPush = {
      pushLevels: vi.fn().mockRejectedValue(new Error('rate limit')),
    };
    const tiktokInventoryPush = {
      pushVariantStock: vi.fn().mockResolvedValue(undefined),
    };
    const facade = new ChannelSyncFacade(
      shopifyInventoryPush as unknown as ShopifyInventoryPushService,
      {} as ShopifyProductPushService,
      tiktokInventoryPush as unknown as TikTokInventoryPushService,
      {} as TikTokProductPushService,
    );

    await expect(
      facade.pushInventoryLevels('tenant-1', 'var-1', ['loc-1']),
    ).resolves.toBeUndefined();
    expect(tiktokInventoryPush.pushVariantStock).toHaveBeenCalled();
  });
});
