import { DocumentStatus, DocumentType, SalesOrderFinancialStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { ShopifyOrderDocumentService } from './shopify-order-document.service';

describe('ShopifyOrderDocumentService', () => {
  let service: ShopifyOrderDocumentService;
  let prisma: {
    salesOrder: { findFirst: ReturnType<typeof vi.fn> };
    location: { findFirst: ReturnType<typeof vi.fn> };
    documentTypeSetting: { findUnique: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    prisma = {
      salesOrder: { findFirst: vi.fn(), findMany: vi.fn() },
      location: { findFirst: vi.fn() },
      documentTypeSetting: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
    };
    service = new ShopifyOrderDocumentService(prisma as unknown as PrismaService);
  });

  it('crea documento e movimenti per ordine con righe', async () => {
    prisma.salesOrder.findFirst.mockResolvedValue({
      id: 'order-1',
      tenantId: 'tenant-1',
      orderNumber: '#1001',
      documentId: null,
      customerId: 'cust-1',
      customerName: 'Mario Rossi',
      currency: 'EUR',
      subtotalMinor: 1000,
      taxMinor: 220,
      totalMinor: 1220,
      placedAt: new Date('2026-06-01T10:00:00Z'),
      financialStatus: SalesOrderFinancialStatus.paid,
      lines: [
        {
          variantId: 'var-1',
          sku: 'SKU-1',
          title: 'Maglietta',
          quantity: 2,
          unitPriceMinor: 500,
          totalMinor: 1000,
        },
      ],
    });
    prisma.location.findFirst.mockResolvedValue({ id: 'loc-1' });

    const documentCreate = vi.fn().mockResolvedValue({ id: 'doc-1' });
    const salesOrderUpdate = vi.fn();
    const stockMovementFindFirst = vi.fn().mockResolvedValue(null);
    const stockMovementCreate = vi.fn();
    const stockMovementDeleteMany = vi.fn();
    const documentLineDeleteMany = vi.fn();

    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        document: { create: documentCreate, update: vi.fn(), findFirst: vi.fn() },
        documentLine: { deleteMany: documentLineDeleteMany, createMany: vi.fn() },
        documentSequence: {
          upsert: vi.fn().mockResolvedValue({ lastNumber: 7 }),
        },
        salesOrder: { update: salesOrderUpdate },
        stockMovement: {
          findFirst: stockMovementFindFirst,
          create: stockMovementCreate,
          update: vi.fn(),
          deleteMany: stockMovementDeleteMany,
        },
      }),
    );

    const result = await service.syncFromShopifyOrder({
      tenantId: 'tenant-1',
      salesOrderId: 'order-1',
      shopifyOrderId: 'gid://shopify/Order/1',
      orderPayload: { location_id: 55 },
    });

    expect(result).toBe('doc-1');
    expect(documentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: DocumentType.sales_ddt,
          status: DocumentStatus.confirmed,
          externalRef: 'gid://shopify/Order/1',
        }),
      }),
    );
    expect(stockMovementCreate).toHaveBeenCalled();
    expect(salesOrderUpdate).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { documentId: 'doc-1' },
    });
  });

  it('ritorna null se DDT vendita disabilitato', async () => {
    prisma.documentTypeSetting.findUnique.mockResolvedValue({
      enabled: false,
      printTitle: 'DDT',
      autoNumbering: true,
      numberPrefix: 'DDT',
      defaultSeries: 'A',
      blockAfterConfirm: false,
      pricesIncludeVat: false,
      defaultNotes: null,
    });

    const result = await service.syncFromShopifyOrder({
      tenantId: 'tenant-1',
      salesOrderId: 'order-1',
      shopifyOrderId: 'gid://shopify/Order/1',
      orderPayload: {},
    });

    expect(result).toBeNull();
    expect(prisma.salesOrder.findFirst).not.toHaveBeenCalled();
  });

  it('backfillUnlinkedOrders in dry-run non scrive', async () => {
    prisma.salesOrder.findMany.mockResolvedValue([
      {
        id: 'order-1',
        tenantId: 'tenant-1',
        shopifyOrderId: 'gid://shopify/Order/1',
        orderNumber: '#1001',
      },
    ]);

    const result = await service.backfillUnlinkedOrders({ dryRun: true });

    expect(result).toEqual({ candidates: 1, linked: 0, skipped: 0, failed: [] });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
