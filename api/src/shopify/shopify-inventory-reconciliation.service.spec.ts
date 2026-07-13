import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { ShopifyInventoryReconciliationService } from './shopify-inventory-reconciliation.service';

describe('ShopifyInventoryReconciliationService', () => {
  function createService(options: {
    variant?: { id: string; sku: string } | null;
    location?: { id: string } | null;
    level?: { onHand: number; committed: number } | null;
    syncState?: { lastPushedAvailable: number | null; lastPushedAt: Date | null };
    activeReservations?: number;
  } = {}) {
    const {
      variant = { id: 'var-1', sku: 'SKU-1' },
      location = { id: 'loc-1' },
      level = { onHand: 10, committed: 3 },
      syncState = { lastPushedAvailable: null, lastPushedAt: null },
      activeReservations = 0,
    } = options;

    const prisma = {
      productVariant: { findFirst: vi.fn().mockResolvedValue(variant) },
      location: { findFirst: vi.fn().mockResolvedValue(location) },
      inventoryLevel: { findUnique: vi.fn().mockResolvedValue(level) },
      shopifyInventorySyncState: {
        upsert: vi.fn().mockResolvedValue(syncState),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      stockReservation: { count: vi.fn().mockResolvedValue(activeReservations) },
    };

    const service = new ShopifyInventoryReconciliationService(
      prisma as unknown as PrismaService,
    );
    return { service, prisma };
  }

  it('Caso A: valore Shopify coincidente con pubblicabile VF → reconciled', async () => {
    const { service } = createService();

    const outcome = await service.reconcileFromShopifyWebhook(
      'tenant-1',
      'inv-1',
      'shop-loc-1',
      7,
    );

    expect(outcome).toBe('reconciled');
  });

  it('Caso B: webhook eco del push recente → echo_confirmed', async () => {
    const { service } = createService({
      syncState: { lastPushedAvailable: 7, lastPushedAt: new Date() },
    });

    const outcome = await service.reconcileFromShopifyWebhook(
      'tenant-1',
      'inv-1',
      'shop-loc-1',
      7,
    );

    expect(outcome).toBe('echo_confirmed');
  });

  it('Caso C: quantità inferiore con impegni Shopify attivi → deferred', async () => {
    const { service } = createService({ activeReservations: 2 });

    const outcome = await service.reconcileFromShopifyWebhook(
      'tenant-1',
      'inv-1',
      'shop-loc-1',
      5,
    );

    expect(outcome).toBe('deferred');
  });

  it('Caso D: disallineamento → mismatch_republish', async () => {
    const { service, prisma } = createService({ activeReservations: 0 });

    const outcome = await service.reconcileFromShopifyWebhook(
      'tenant-1',
      'inv-1',
      'shop-loc-1',
      3,
    );

    expect(outcome).toBe('mismatch_republish');
    expect(prisma.shopifyInventorySyncState.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ mismatchDetected: true }),
      }),
    );
  });
});
