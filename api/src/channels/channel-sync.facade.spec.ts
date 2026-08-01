import { TenantChannelProfile } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import type { ShopifyInventoryPushService } from '../shopify/shopify-inventory-push.service';
import type { ShopifyProductPushService } from '../shopify/shopify-product-push.service';
import type { TikTokInventoryPushService } from '../tiktok/tiktok-inventory-push.service';
import type { TikTokProductPushService } from '../tiktok/tiktok-product-push.service';
import { ChannelSyncFacade } from './channel-sync.facade';

function setup(profile: TenantChannelProfile | null) {
  const findUnique = vi
    .fn()
    .mockResolvedValue(profile === null ? null : { channelProfile: profile });
  const prisma = { tenant: { findUnique } } as unknown as PrismaService;

  const shopifyInventoryPush = { pushLevels: vi.fn().mockResolvedValue(undefined) };
  const shopifyProductPush = {
    enqueuePush: vi.fn().mockResolvedValue({ pushed: true }),
    deleteProduct: vi.fn().mockResolvedValue({ deleted: true }),
  };
  const tiktokInventoryPush = { pushVariantStock: vi.fn().mockResolvedValue(undefined) };
  const tiktokProductPush = { enqueuePush: vi.fn().mockResolvedValue({ pushed: true }) };

  const facade = new ChannelSyncFacade(
    prisma,
    shopifyInventoryPush as unknown as ShopifyInventoryPushService,
    shopifyProductPush as unknown as ShopifyProductPushService,
    tiktokInventoryPush as unknown as TikTokInventoryPushService,
    tiktokProductPush as unknown as TikTokProductPushService,
  );

  return {
    facade,
    findUnique,
    shopifyInventoryPush,
    shopifyProductPush,
    tiktokInventoryPush,
    tiktokProductPush,
  };
}

describe('ChannelSyncFacade', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('profilo «solo gestionale»', () => {
    it('non tocca alcun canale sul push inventario', async () => {
      const t = setup(TenantChannelProfile.gestionale);

      await t.facade.pushInventoryLevels('tenant-1', 'var-1', ['loc-1']);

      expect(t.shopifyInventoryPush.pushLevels).not.toHaveBeenCalled();
      expect(t.tiktokInventoryPush.pushVariantStock).not.toHaveBeenCalled();
    });

    it('non tocca alcun canale sul push prodotto', async () => {
      const t = setup(TenantChannelProfile.gestionale);

      await t.facade.pushProductNow('tenant-1', 'prod-1');

      expect(t.shopifyProductPush.enqueuePush).not.toHaveBeenCalled();
      expect(t.tiktokProductPush.enqueuePush).not.toHaveBeenCalled();
    });

    it('deleteProduct riporta not_connected senza interrogare Shopify', async () => {
      const t = setup(TenantChannelProfile.gestionale);

      const result = await t.facade.deleteProduct('tenant-1', 'gid://shopify/Product/1');

      expect(result).toEqual({ deleted: false, reason: 'not_connected' });
      expect(t.shopifyProductPush.deleteProduct).not.toHaveBeenCalled();
    });
  });

  describe('profilo Shopify', () => {
    it('push inventario va solo a Shopify', async () => {
      const t = setup(TenantChannelProfile.shopify);

      await t.facade.pushInventoryLevels('tenant-1', 'var-1', ['loc-1']);

      expect(t.shopifyInventoryPush.pushLevels).toHaveBeenCalledWith('tenant-1', 'var-1', [
        'loc-1',
      ]);
      expect(t.tiktokInventoryPush.pushVariantStock).not.toHaveBeenCalled();
    });

    it('non propaga gli errori del canale', async () => {
      const t = setup(TenantChannelProfile.shopify);
      t.shopifyInventoryPush.pushLevels.mockRejectedValue(new Error('rate limit'));

      await expect(
        t.facade.pushInventoryLevels('tenant-1', 'var-1', ['loc-1']),
      ).resolves.toBeUndefined();
    });
  });

  describe('profilo TikTok Shop', () => {
    it('push inventario va solo a TikTok', async () => {
      const t = setup(TenantChannelProfile.tiktok_shop);

      await t.facade.pushInventoryLevels('tenant-1', 'var-1', ['loc-1']);

      expect(t.tiktokInventoryPush.pushVariantStock).toHaveBeenCalledWith('tenant-1', 'var-1');
      expect(t.shopifyInventoryPush.pushLevels).not.toHaveBeenCalled();
    });
  });

  describe('cache del profilo', () => {
    it('interroga il tenant una sola volta per push ripetuti', async () => {
      const t = setup(TenantChannelProfile.shopify);

      await t.facade.pushInventoryLevels('tenant-1', 'var-1', ['loc-1']);
      await t.facade.pushInventoryLevels('tenant-1', 'var-2', ['loc-1']);
      await t.facade.pushInventoryLevels('tenant-1', 'var-3', ['loc-1']);

      expect(t.findUnique).toHaveBeenCalledTimes(1);
      expect(t.shopifyInventoryPush.pushLevels).toHaveBeenCalledTimes(3);
    });

    it('invalidateProfile forza una nuova lettura', async () => {
      const t = setup(TenantChannelProfile.shopify);

      await t.facade.pushInventoryLevels('tenant-1', 'var-1', ['loc-1']);
      t.facade.invalidateProfile('tenant-1');
      await t.facade.pushInventoryLevels('tenant-1', 'var-2', ['loc-1']);

      expect(t.findUnique).toHaveBeenCalledTimes(2);
    });

    it('tenant inesistente non tocca alcun canale', async () => {
      const t = setup(null);

      await t.facade.pushInventoryLevels('ignoto', 'var-1', ['loc-1']);

      expect(t.shopifyInventoryPush.pushLevels).not.toHaveBeenCalled();
      expect(t.tiktokInventoryPush.pushVariantStock).not.toHaveBeenCalled();
    });
  });
});
