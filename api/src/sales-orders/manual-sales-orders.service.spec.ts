import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SalesOrderSource } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChannelSyncFacade } from '../channels/channel-sync.facade';
import type { DocumentSettingsService } from '../documents/document-settings.service';
import type { ExternalDocumentTypesService } from '../documents/external-document-types.service';
import type { StockReservationService } from '../order-reservations/stock-reservation.service';
import type { PrismaService } from '../prisma/prisma.service';
import { testClerkUser, testOwnerUser } from '../test/fixtures/user-profile.fixture';
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
          optionValues: [
            { name: 'Colore', value: 'Rosso' },
            { name: 'Taglia', value: 'M' },
          ],
          product: { managesStock: true, kind: 'article' },
        },
        {
          id: 'var-L',
          sku: 'SKU-L',
          optionValues: [
            { name: 'Colore', value: 'Rosso' },
            { name: 'Taglia', value: 'L' },
          ],
          product: { managesStock: true, kind: 'article' },
        },
        {
          id: 'var-semplice',
          sku: 'SKU-SEMPLICE',
          // Prodotto senza opzioni importato da Shopify: la variante tecnica
          // che il canale crea comunque.
          optionValues: [{ name: 'Title', value: 'Default Title' }],
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

  // ── La nota interna ───────────────────────────────────────────────────────
  //
  // ⭐ Aggiunta il 25/08/2026 con la migration
  // `20260825160000_nota_interna_sull_ordine_cliente`. L'ordine cliente ne era
  // privo solo perche' `sales_orders` non aveva la colonna — «una differenza
  // del modello dati, non una ragione funzionale per avere una UI diversa»
  // (proprietario).
  it('⭐ la nota interna si persiste', async () => {
    const { service } = createService(prisma);

    await service.save(
      tenantId,
      { ...baseDto, internalComment: '  Cliente da richiamare  ' },
      testOwnerUser(),
    );

    const createArgs = prisma.salesOrder.create.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    // Ripulita dagli spazi, come le note pubbliche.
    expect(createArgs.data['internalComment']).toBe('Cliente da richiamare');
  });

  it('⛔ e vuota significa SVUOTATA, non «non toccare»', async () => {
    // ⚠️ La testata si riscrive per intero a ogni salvataggio: un campo assente
    // azzera quello che il documento portava. E' lo stesso contratto delle note
    // pubbliche — se qui tornasse `undefined`, Prisma lascerebbe il valore
    // vecchio e l'operatore non riuscirebbe piu' a cancellare una nota.
    const { service } = createService(prisma);

    await service.save(tenantId, { ...baseDto, internalComment: '   ' }, testOwnerUser());

    const createArgs = prisma.salesOrder.create.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(createArgs.data['internalComment']).toBeNull();
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
      // ⭐ Lo stato è la COLONNA, non più i campi del canale: la fixture lo
      //    dichiara come fa il database dopo la migration (`18` §2.4-bis).
      commercialState: 'concluded',
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
      // Obbligatoria nello schema (`SalesOrder.placedAt`): il finto ordine la
      // ometteva, e il precompilato che la usa per la riga di riferimento ha
      // fatto emergere la lacuna del fixture.
      placedAt: new Date('2026-07-29T00:00:00.000Z'),
      source: 'manual',
          commercialState: 'confirmed',
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
          commercialState: 'cancelled',
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

    await expect(service.delete(tenantId, 'order-1', testOwnerUser())).rejects.toBeInstanceOf(ConflictException);
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

    await service.delete(tenantId, 'order-1', testOwnerUser());

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

    await expect(service.delete(tenantId, 'order-1', testOwnerUser())).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.salesOrder.delete).not.toHaveBeenCalled();
  });
});

/**
 * «Concludi ordine» è un altro punto d'ingresso della regola `07` §12, non un
 * flusso a parte: il documento generato eredita le reference dell'ordine e
 * riceve il riferimento all'ordine stesso.
 */
describe('ManualSalesOrdersService.concludePrefill — riferimenti', () => {
  const prisma = createPrismaMock();

  beforeEach(() => {
    prisma.salesOrder.findFirst.mockResolvedValue({
      id: 'order-1',
      orderNumber: 'OC-0012',
      placedAt: new Date('2026-07-29T00:00:00.000Z'),
      source: 'manual',
          commercialState: 'confirmed',
      cancelledAt: null,
      fulfilledAt: null,
      documentId: null,
      locationId: 'loc-1',
      customerId: 'cust-1',
      customerName: 'Boutique Rossi',
      currency: 'EUR',
      subtotalMinor: 0,
      taxMinor: 0,
      totalMinor: 0,
      notes: null,
      externalRef: null,
      documentDiscountPercent: 0,
      lines: [
        {
          // La reference che l'ordine si era portato dietro dal preventivo.
          variantId: null,
          sku: null,
          title: 'Rif. Preventivo PRE-0002 del 31/07/2026',
          quantity: 0,
          totalMinor: 0,
          vatCodeId: null,
          commitsStock: false,
          isReference: true,
        },
      ],
    });
  });

  it('la reference dell ordine resta reference nel documento di scarico', async () => {
    const { service } = createService(prisma);

    const dto = await service.concludePrefill(tenantId, 'order-1', 'sales_ddt', testOwnerUser());

    expect(dto.lines?.[0]).toMatchObject({
      description: 'Rif. Preventivo PRE-0002 del 31/07/2026',
      isReference: true,
    });
  });

  it('e il precompilato porta numero e data per la reference all ordine', async () => {
    const { service } = createService(prisma);

    const dto = await service.concludePrefill(tenantId, 'order-1', 'sales_ddt', testOwnerUser());

    // Il TESTO non si compone qui: il formatter canonico vive nel frontend, e
    // duplicarlo sarebbe la terza copia della stessa frase (`07` §12).
    expect(dto.sourceSalesOrderNumber).toBe('OC-0012');
    expect(dto.sourceSalesOrderPlacedAt).toBe('2026-07-29T00:00:00.000Z');
  });
});

/**
 * ⛔ **L'etichetta della variante è una FOTOGRAFIA.**
 *
 * Prima della colonna `variantLabel` la card dell'Ordine cliente la ricostruiva
 * DAL VIVO, sottraendo il nome prodotto dal titolo corrente della variante: un
 * ordine di ieri mostrava la variante di oggi, e una variante uscita dal
 * catalogo non mostrava piu' niente.
 *
 * La regola che questi test inchiodano NON e' «conserva se c'e'»: e'
 *
 *   riga nuova                        -> si calcola dalla variante scelta
 *   riga esistente, STESSA variante   -> si conserva ESATTAMENTE il persistito
 *   riga esistente, variante DIVERSA  -> si ricalcola dalla nuova
 *
 * Il secondo caso e' quello che protegge lo storico; il terzo e' quello che un
 * banale `persistito ?? calcola` sbaglierebbe.
 */
describe('ManualSalesOrdersService — etichetta della variante', () => {
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
    prisma.salesOrder.update.mockResolvedValue({ id: 'order-1' });
  });

  /** Le righe come sono state scritte a database, in ordine. */
  function righeScritte(): Record<string, unknown>[] {
    const create = prisma.salesOrderLine.create.mock.calls.map(
      (c) => (c[0] as { data: Record<string, unknown> }).data,
    );
    const update = prisma.salesOrderLine.update.mock.calls.map(
      (c) => (c[0] as { data: Record<string, unknown> }).data,
    );
    return [...create, ...update];
  }

  /** Un ordine gia' salvato, con una riga che porta la sua fotografia. */
  function ordineEsistente(riga: { variantId: string | null; variantLabel: string }): void {
    prisma.salesOrder.findFirst.mockResolvedValue({
      id: 'order-1',
      orderNumber: 'OC-0012',
      source: 'manual',
          commercialState: 'confirmed',
      locationId: 'loc-1',
      lines: [
        {
          id: 'line-1',
          vatCodeId: null,
          vatSnapshot: null,
          variantId: riga.variantId,
          variantLabel: riga.variantLabel,
        },
      ],
    });
  }

  const ID_ORDINE = '3f0b8f5e-8f5e-4f5e-8f5e-3f0b8f5e8f5e';

  it('riga nuova: l’etichetta si compone dalla variante scelta', async () => {
    const { service } = createService(prisma);

    await service.save(tenantId, baseDto, testOwnerUser());

    expect(righeScritte()[0]!['variantLabel']).toBe('Rosso / M');
  });

  it('prodotto semplice o «Default Title» di Shopify: etichetta VUOTA', async () => {
    const { service } = createService(prisma);

    await service.save(
      tenantId,
      {
        ...baseDto,
        lines: [{ ...baseDto.lines[0]!, variantId: 'var-semplice', sku: 'SKU-SEMPLICE' }],
      },
      testOwnerUser(),
    );

    expect(righeScritte()[0]!['variantLabel']).toBe('');
  });

  /**
   * ⭐ Il caso che la colonna esiste per risolvere: l'anagrafica cambia, il
   * documento no. Qui la variante corrente direbbe «Rosso / M», ma la riga era
   * stata salvata quando il colore si chiamava «Bordeaux».
   */
  it('rinominare un valore d’opzione NON tocca un ordine gia’ salvato', async () => {
    ordineEsistente({ variantId: 'var-1', variantLabel: 'Bordeaux / M' });
    const { service } = createService(prisma);

    await service.save(
      tenantId,
      { ...baseDto, id: ID_ORDINE, lines: [{ ...baseDto.lines[0]!, id: 'line-1' }] },
      testOwnerUser(),
    );

    // Non «Rosso / M», che e' quello che dice l'anagrafica di adesso.
    expect(righeScritte()[0]!['variantLabel']).toBe('Bordeaux / M');
  });

  /**
   * ⛔ Il caso che un `persistito ?? calcola` sbaglierebbe: qui l'operatore ha
   * cambiato articolo sulla riga, e conservare la vecchia etichetta scriverebbe
   * «M» su una riga che ora e' una «L».
   */
  it('cambiare variante sulla riga RICALCOLA l’etichetta', async () => {
    ordineEsistente({ variantId: 'var-1', variantLabel: 'Rosso / M' });
    const { service } = createService(prisma);

    await service.save(
      tenantId,
      {
        ...baseDto,
        id: ID_ORDINE,
        lines: [{ ...baseDto.lines[0]!, id: 'line-1', variantId: 'var-L', sku: 'SKU-L' }],
      },
      testOwnerUser(),
    );

    expect(righeScritte()[0]!['variantLabel']).toBe('Rosso / L');
  });

  /**
   * La duplicazione RIPORTA l'etichetta dell'origine invece di ricomporla: se
   * la variante e' uscita dal catalogo, ricomporla darebbe stringa vuota e il
   * duplicato perderebbe l'informazione.
   */
  it('la duplicazione riporta l’etichetta dell’ordine origine', async () => {
    const { service } = createService(prisma);

    await service.save(
      tenantId,
      {
        ...baseDto,
        lines: [{ ...baseDto.lines[0]!, variantLabel: 'Bordeaux / XS' }],
      },
      testOwnerUser(),
    );

    // Su una riga NUOVA l'etichetta dichiarata vince sul calcolo.
    expect(righeScritte()[0]!['variantLabel']).toBe('Bordeaux / XS');
  });

  /** ⛔ Ma su una riga ESISTENTE no: la fotografia non la decide chi chiama. */
  it('su una riga esistente l’etichetta dichiarata viene IGNORATA', async () => {
    ordineEsistente({ variantId: 'var-1', variantLabel: 'Bordeaux / M' });
    const { service } = createService(prisma);

    await service.save(
      tenantId,
      {
        ...baseDto,
        id: ID_ORDINE,
        lines: [{ ...baseDto.lines[0]!, id: 'line-1', variantLabel: 'INVENTATA' }],
      },
      testOwnerUser(),
    );

    expect(righeScritte()[0]!['variantLabel']).toBe('Bordeaux / M');
  });
});

/**
 * ⛔ La settima rotta fuori scope sede: gli impegni dell'ordine.
 *
 * `GET /sales-orders/manual/:id/reservations` risolveva l'ordine **solo per
 * tenant**. Conoscere l'id bastava a leggere gli impegni di un ordine di una
 * sede non propria — e da lì la disponibilità di quella sede.
 *
 * ⭐ Il metodo pubblico si chiama `listActiveReservationsForUser` **apposta**:
 * la lettura nuda resta privata e serve `save`, che ha già autorizzato. Fonderle
 * dietro un `user?` opzionale renderebbe il controllo saltabile per
 * dimenticanza.
 */
describe('ManualSalesOrdersService.listActiveReservationsForUser', () => {
  const SEDE_MIA = 'loc-mia';
  const SEDE_ALTRUI = 'loc-altrui';
  const commesso = () => testClerkUser({ assignedLocationIds: [SEDE_MIA] });

  function conOrdine(order: { locationId: string | null; source?: SalesOrderSource } | null) {
    const prisma = createPrismaMock();
    prisma.salesOrder.findFirst = vi
      .fn()
      .mockResolvedValue(order === null ? null : { source: SalesOrderSource.manual, ...order });
    prisma.stockReservation.findMany = vi
      .fn()
      .mockResolvedValue([{ variantId: 'var-1', remainingQuantity: 3 }]);
    return { prisma, ...createService(prisma) };
  }

  it('⛔ sede altrui: negato anche conoscendo l’id', async () => {
    const { service } = conOrdine({ locationId: SEDE_ALTRUI });

    await expect(
      service.listActiveReservationsForUser('tenant-1', 'ordine-1', commesso()),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('⛔ e nessuna query sugli impegni viene eseguita dopo il rifiuto', async () => {
    const { service, prisma } = conOrdine({ locationId: SEDE_ALTRUI });

    await expect(
      service.listActiveReservationsForUser('tenant-1', 'ordine-1', commesso()),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.stockReservation.findMany).not.toHaveBeenCalled();
  });

  it('✅ la propria sede si legge', async () => {
    const { service } = conOrdine({ locationId: SEDE_MIA });

    await expect(
      service.listActiveReservationsForUser('tenant-1', 'ordine-1', commesso()),
    ).resolves.toEqual([{ variantId: 'var-1', remainingQuantity: 3 }]);
  });

  it('✅ il titolare accede a qualunque sede', async () => {
    const { service } = conOrdine({ locationId: SEDE_ALTRUI });

    await expect(
      service.listActiveReservationsForUser(
        'tenant-1',
        'ordine-1',
        testOwnerUser({ assignedLocationIds: [] }),
      ),
    ).resolves.toHaveLength(1);
  });

  it('ordine di canale: lo scope sede non si applica', async () => {
    const { service } = conOrdine({
      locationId: SEDE_ALTRUI,
      source: SalesOrderSource.shopify_online,
    });

    await expect(
      service.listActiveReservationsForUser('tenant-1', 'ordine-1', commesso()),
    ).resolves.toHaveLength(1);
  });

  it('tenant diverso: 404 come prima', async () => {
    const { service } = conOrdine(null);

    await expect(
      service.listActiveReservationsForUser('tenant-1', 'ordine-1', commesso()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
