import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChannelSyncFacade } from '../channels/channel-sync.facade';
import type { DocumentSettingsService } from '../documents/document-settings.service';
import type { ExternalDocumentTypesService } from '../documents/external-document-types.service';
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
    documentCounter: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    salesOrder: {
      // Numerazione «massimo esistente + 1»: aggregato numerico (ultimo 11 → 12).
      aggregate: vi.fn().mockResolvedValue({ _max: { number: 11 } }),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    salesOrderLine: {
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    stockReservation: { findMany: vi.fn().mockResolvedValue([]) },
    inventoryLevel: { findMany: vi.fn().mockResolvedValue([]) },
    document: { create: vi.fn(), findFirst: vi.fn() },
    // Advisory lock sul contatore: qui non serializza niente (transazione
    // finta), ma senza la mock la chiamata romperebbe il salvataggio.
    $queryRaw: vi.fn().mockResolvedValue([]),
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
    orderNumber: 'OC-0012',
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
      printTitle: 'Ordine cliente',
      autoNumbering: true,
      numberPrefix: 'OC',
      defaultSeries: 'A',
      pricesIncludeVat: false,
      defaultNotes: null,
    }),
  };
  const channelSync = { pushInventoryLevels: vi.fn().mockResolvedValue(undefined) };
  const externalTypes = {
    resolveForWrite: vi
      .fn()
      .mockResolvedValue({ externalDocumentTypeId: null, externalDocumentTypeSnapshot: null }),
  };
  const service = new ManualSalesOrdersService(
    prisma as unknown as PrismaService,
    reservations as unknown as StockReservationService,
    settings as unknown as DocumentSettingsService,
    channelSync as unknown as ChannelSyncFacade,
    externalTypes as unknown as ExternalDocumentTypesService,
  );
  return { service, reservations, settings, channelSync, externalTypes };
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

  it('salva la sola testata senza righe: totali a zero e nessun impegno', async () => {
    const { service, reservations } = createService(prisma);

    const result = await service.save(
      tenantId,
      { ...baseDto, lines: [{ title: 'X', quantity: 0 }] },
      testOwnerUser(),
    );

    const createArgs = prisma.salesOrder.create.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(createArgs.data['subtotalMinor']).toBe(0);
    expect(createArgs.data['totalMinor']).toBe(0);
    // Confermato anche senza righe: il sync impegni gira a righe vuote
    // (rilascia eventuali impegni precedenti, non ne crea).
    expect(reservations.syncOrderReservationsTx).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ lines: [] }),
    );
    expect(result.warnings).toEqual([]);
  });

  it('rifiuta il salvataggio senza location di origine (testata obbligatoria)', async () => {
    const { service } = createService(prisma);
    await expect(
      service.save(tenantId, { ...baseDto, locationId: undefined }, testOwnerUser()),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it("crea l'ordine con numeratore dedicato, cascata esatta e impegni sincronizzati", async () => {
    const { service, reservations } = createService(prisma);

    const result = await service.save(tenantId, baseDto, testOwnerUser());

    // Numeratore customer_order: max+1 dall'aggregato numerico dei soli ordini
    // manuali; senza serie (nessun contatore predefinito) → OC-<progressivo>.
    expect(prisma.salesOrder.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ source: 'manual' }),
      }),
    );
    const createArgs = prisma.salesOrder.create.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(createArgs.data['orderNumber']).toBe('OC-0012');
    expect(createArgs.data['number']).toBe(12);
    expect(createArgs.data['series']).toBeNull();
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
      service.save(
        tenantId,
        { ...baseDto, id: '3f0b8f5e-8f5e-4f5e-8f5e-3f0b8f5e8f5e' },
        testOwnerUser(),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('consente la modifica di un ordine Concluso senza toccare gli impegni (prompt DDT)', async () => {
    prisma.salesOrder.findFirst.mockResolvedValue({
      id: 'order-1',
      orderNumber: 'OC-0012',
      source: 'manual',
      fulfilledAt: new Date(),
      fulfillmentStatus: 'fulfilled',
      locationId: 'loc-1',
      lines: [],
    });
    prisma.salesOrder.update.mockResolvedValue({ id: 'order-1' });
    const { service, reservations } = createService(prisma);

    await service.save(
      tenantId,
      { ...baseDto, id: '3f0b8f5e-8f5e-4f5e-8f5e-3f0b8f5e8f5e' },
      testOwnerUser(),
    );

    // Gli impegni consumati restano intoccati: né sync né rilascio.
    expect(reservations.syncOrderReservationsTx).not.toHaveBeenCalled();
    expect(reservations.releaseOrderReservationsTx).not.toHaveBeenCalled();
  });
});

describe('ManualSalesOrdersService.conclude', () => {
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
    prisma.salesOrder.findFirst.mockResolvedValue({
      id: 'order-1',
      orderNumber: 'OC-0012',
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
      service.concludePrefill(tenantId, 'order-1', 'goods_receipt', testOwnerUser()),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it("restituisce il documento di scarico precompilato e vi aggancia l'ordine", async () => {
    const { service } = createService(prisma);

    const dto = await service.concludePrefill(tenantId, 'order-1', 'sales_ddt', testOwnerUser());

    expect(dto.type).toBe('sales_ddt');
    expect(dto.locationId).toBe('loc-1');
    expect(dto.includedSalesOrderIds).toEqual(['order-1']);
    // Prezzo unitario SCONTATO ereditato dalla riga ordine (25920 / 3 = 8640).
    expect(dto.lines?.[0]).toMatchObject({ quantity: 3, unitPriceMinor: 8640, loadsStock: true });
    // Nessun documento nasce a monte: il form lo crea (confermato) al salvataggio.
    expect(prisma.document.create).not.toHaveBeenCalled();
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
      service.concludePrefill(tenantId, 'order-1', 'manual_unload', testOwnerUser()),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

/**
 * Eliminazione: gli ordini di canale non si toccano, con UNA eccezione.
 *
 * Cancellarli qui non servirebbe a niente — il prossimo scarico li
 * riporterebbe, perché il sync fa upsert sull'id Shopify. Il motivo cade solo
 * quando sul canale non risultano più, ed è l'unica azione prevista dopo la
 * segnalazione della riconciliazione.
 */
describe('ManualSalesOrdersService.delete', () => {
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
  });

  it('un ordine di canale ancora presente su Shopify non è eliminabile', async () => {
    prisma.salesOrder.findFirst.mockResolvedValue({
      id: 'order-1',
      source: 'shopify_online',
      locationId: null,
      orderNumber: '#1001',
      channelMissingSince: null,
      onlineSale: null,
    });
    const { service } = createService(prisma);

    await expect(service.delete(tenantId, 'order-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.salesOrder.delete).not.toHaveBeenCalled();
  });

  // Il controllo inverso: senza, il test qui sopra passerebbe anche se
  // l'eliminazione fosse rimasta vietata a tutti gli ordini di canale.
  it('lo stesso ordine, segnalato come sparito, si può rimuovere', async () => {
    prisma.salesOrder.findFirst.mockResolvedValue({
      id: 'order-1',
      source: 'shopify_online',
      locationId: null,
      orderNumber: '#1001',
      channelMissingSince: new Date('2026-08-08T12:00:00.000Z'),
      onlineSale: null,
    });
    const { service } = createService(prisma);

    await service.delete(tenantId, 'order-1');

    expect(prisma.salesOrder.delete).toHaveBeenCalledWith({ where: { id: 'order-1' } });
  });

  // L'eccezione non scavalca la Vendita online: la merce è uscita davvero e il
  // corrispettivo è registrato. Resta la sola segnalazione.
  it('un ordine sparito ma già evaso resta non eliminabile', async () => {
    prisma.salesOrder.findFirst.mockResolvedValue({
      id: 'order-1',
      source: 'shopify_online',
      locationId: null,
      orderNumber: '#1001',
      channelMissingSince: new Date('2026-08-08T12:00:00.000Z'),
      onlineSale: { id: 'vo-1' },
    });
    const { service } = createService(prisma);

    await expect(service.delete(tenantId, 'order-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.salesOrder.delete).not.toHaveBeenCalled();
  });
});
