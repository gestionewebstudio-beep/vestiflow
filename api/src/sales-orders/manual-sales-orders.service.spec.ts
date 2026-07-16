import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChannelSyncFacade } from '../channels/channel-sync.facade';
import type { DocumentSettingsService } from '../documents/document-settings.service';
import type { StockReservationService } from '../order-reservations/stock-reservation.service';
import type { PrismaService } from '../prisma/prisma.service';
import { testOwnerUser } from '../test/fixtures/user-profile.fixture';
import { ManualSalesOrdersService } from './manual-sales-orders.service';

const tenantId = 'tenant-1';

function createPrismaMock() {
  const prisma = {
    customer: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'cust-1',
        party: {
          companyName: 'Boutique Rossi',
          firstName: null,
          lastName: null,
          contactName: null,
          email: null,
        },
      }),
    },
    location: { findFirst: vi.fn().mockResolvedValue({ id: 'loc-1' }) },
    productVariant: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'var-1',
          sku: 'SKU-1',
          product: { managesStock: true, kind: 'article' },
        },
        {
          id: 'var-serv',
          sku: 'SRV-1',
          product: { managesStock: false, kind: 'service' },
        },
      ]),
    },
    vatCode: { findMany: vi.fn().mockResolvedValue([]) },
    documentSequence: {
      upsert: vi.fn().mockResolvedValue({ lastNumber: 12 }),
      findUnique: vi.fn().mockResolvedValue({ lastNumber: 11 }),
    },
    salesOrder: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    salesOrderLine: {
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    stockReservation: { findMany: vi.fn().mockResolvedValue([]) },
    inventoryLevel: { findMany: vi.fn().mockResolvedValue([]) },
    document: { create: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation((arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: typeof prisma) => unknown)(prisma);
    }
    return Promise.all(arg as Promise<unknown>[]);
  });
  prisma.salesOrder.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'order-1', ...data }),
  );
  prisma.salesOrderLine.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: `line-${String(data['lineNumber'])}`, ...data }),
  );
  prisma.salesOrder.findUniqueOrThrow.mockResolvedValue({
    id: 'order-1',
    orderNumber: 'OC-2026-0012',
    lines: [],
  });
  return prisma;
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  const reservations = {
    syncOrderReservationsTx: vi.fn().mockResolvedValue(undefined),
    releaseOrderReservationsTx: vi.fn().mockResolvedValue(undefined),
  };
  const settings = {
    getResolved: vi.fn().mockResolvedValue({
      type: 'customer_order',
      enabled: true,
      printTitle: 'Ordine cliente',
      autoNumbering: true,
      numberPrefix: 'OC',
      defaultSeries: 'A',
      blockAfterConfirm: false,
      pricesIncludeVat: false,
      defaultNotes: null,
    }),
  };
  const channelSync = { pushInventoryLevels: vi.fn().mockResolvedValue(undefined) };
  const service = new ManualSalesOrdersService(
    prisma as unknown as PrismaService,
    reservations as unknown as StockReservationService,
    settings as unknown as DocumentSettingsService,
    channelSync as unknown as ChannelSyncFacade,
  );
  return { service, reservations, settings, channelSync };
}

const baseDto = {
  customerId: 'cust-1',
  locationId: 'loc-1',
  documentDate: '2026-07-16',
  lines: [
    {
      variantId: 'var-1',
      sku: 'SKU-1',
      title: 'T-shirt',
      quantity: 3,
      unitPriceMinor: 10000,
      discount: '4+10%',
      commitsStock: true,
    },
  ],
};

describe('ManualSalesOrdersService.save', () => {
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
  });

  it('rifiuta il salvataggio senza righe valide (o Confermato, o non esiste)', async () => {
    const { service } = createService(prisma);
    await expect(
      service.save(tenantId, { ...baseDto, lines: [{ title: 'X', quantity: 0 }] }, testOwnerUser()),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('crea l\'ordine con numeratore dedicato, cascata esatta e impegni sincronizzati', async () => {
    const { service, reservations } = createService(prisma);

    const result = await service.save(tenantId, baseDto, testOwnerUser());

    // Numeratore customer_order: OC-<anno>-<progressivo>.
    expect(prisma.documentSequence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId_type_series_year: expect.objectContaining({ type: 'customer_order' }),
        }),
      }),
    );
    const createArgs = prisma.salesOrder.create.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(createArgs.data['orderNumber']).toBe('OC-2026-0012');
    // Sconto a cascata ESATTO: 100,00 € con 4+10% → 86,40 € × 3 = 259,20 €.
    expect(createArgs.data['subtotalMinor']).toBe(3 * 8640);
    expect(createArgs.data['source']).toBe('manual');

    expect(reservations.syncOrderReservationsTx).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        tenantId,
        channel: 'manual',
        locationId: 'loc-1',
        lines: [
          expect.objectContaining({ variantId: 'var-1', quantity: 3, salesOrderLineId: 'line-1' }),
        ],
      }),
    );
    expect(result.warnings).toEqual([]);
  });

  it('riga Servizio (spunta OFF) non impegna; ordine annullato rilascia tutto', async () => {
    const { service, reservations } = createService(prisma);

    await service.save(
      tenantId,
      {
        ...baseDto,
        status: 'cancelled' as const,
        lines: [
          { variantId: 'var-serv', title: 'Orlo pantalone', quantity: 1, commitsStock: false },
        ],
      },
      testOwnerUser(),
    );

    expect(reservations.syncOrderReservationsTx).not.toHaveBeenCalled();
    expect(reservations.releaseOrderReservationsTx).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ note: 'Ordine cliente annullato' }),
    );
  });

  it('avvisa (senza bloccare) quando la disponibilità va sotto zero', async () => {
    prisma.inventoryLevel.findMany.mockResolvedValue([{ variantId: 'var-1', available: -2 }]);
    const { service } = createService(prisma);

    const result = await service.save(tenantId, baseDto, testOwnerUser());

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('disponibili solo 1');
  });

  it('rifiuta la modifica di ordini non manuali (Shopify resta dei connettori)', async () => {
    prisma.salesOrder.findFirst.mockResolvedValue({
      id: 'order-shop',
      source: 'shopify_online',
      fulfilledAt: null,
      lines: [],
    });
    const { service } = createService(prisma);

    await expect(
      service.save(tenantId, { ...baseDto, id: '3f0b8f5e-8f5e-4f5e-8f5e-3f0b8f5e8f5e' }, testOwnerUser()),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rifiuta la modifica di un ordine Concluso', async () => {
    prisma.salesOrder.findFirst.mockResolvedValue({
      id: 'order-1',
      source: 'manual',
      fulfilledAt: new Date(),
      locationId: 'loc-1',
      lines: [],
    });
    const { service } = createService(prisma);

    await expect(
      service.save(tenantId, { ...baseDto, id: '3f0b8f5e-8f5e-4f5e-8f5e-3f0b8f5e8f5e' }, testOwnerUser()),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('ManualSalesOrdersService.conclude', () => {
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
    prisma.salesOrder.findFirst.mockResolvedValue({
      id: 'order-1',
      orderNumber: 'OC-2026-0012',
      source: 'manual',
      cancelledAt: null,
      fulfilledAt: null,
      documentId: null,
      locationId: 'loc-1',
      customerId: 'cust-1',
      customerName: 'Boutique Rossi',
      currency: 'EUR',
      subtotalMinor: 25920,
      taxMinor: 0,
      totalMinor: 25920,
      notes: null,
      externalRef: null,
      lines: [
        {
          id: 'line-1',
          variantId: 'var-1',
          sku: 'SKU-1',
          title: 'T-shirt',
          quantity: 3,
          totalMinor: 25920,
          lineVatTotalMinor: 0,
          vatCodeId: null,
          vatSnapshot: null,
          commitsStock: true,
        },
      ],
    });
    prisma.document.create.mockResolvedValue({ id: 'doc-1', type: 'sales_ddt' });
  });

  it('rifiuta tipi di scarico non disponibili in VestiFlow', async () => {
    const { service } = createService(prisma);
    await expect(
      service.conclude(tenantId, 'order-1', 'goods_receipt', testOwnerUser()),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('genera la bozza di scarico precompilata e collega l\'ordine', async () => {
    const { service } = createService(prisma);

    const result = await service.conclude(tenantId, 'order-1', 'sales_ddt', testOwnerUser());

    expect(result).toEqual({ documentId: 'doc-1', documentType: 'sales_ddt' });
    const createArgs = prisma.document.create.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(createArgs.data['type']).toBe('sales_ddt');
    expect(createArgs.data['status']).toBe('draft');
    expect(createArgs.data['locationId']).toBe('loc-1');
    const lines = (createArgs.data['lines'] as { create: readonly Record<string, unknown>[] })
      .create;
    // Prezzo unitario SCONTATO ereditato dalla riga ordine (25920 / 3 = 8640).
    expect(lines[0]).toMatchObject({ quantity: 3, unitPriceMinor: 8640, loadsStock: true });
    expect(prisma.salesOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { documentId: 'doc-1' } }),
    );
  });

  it('un ordine annullato non può essere concluso', async () => {
    prisma.salesOrder.findFirst.mockResolvedValue({
      id: 'order-1',
      source: 'manual',
      cancelledAt: new Date(),
      fulfilledAt: null,
      lines: [],
    });
    const { service } = createService(prisma);
    await expect(
      service.conclude(tenantId, 'order-1', 'manual_unload', testOwnerUser()),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
