import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DocumentStatus, DocumentType, Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TenantPermission } from '../auth/tenant-permission.constants';

import type { DocumentSettingsService } from './document-settings.service';
import type { ExternalDocumentTypesService } from './external-document-types.service';
import type { DocumentPriceModePreferenceService } from './document-price-mode-preference.service';
import type { ResolvedDocumentTypeSetting } from './document-defaults';
import { DocumentsService } from './documents.service';
import type { ChannelSyncFacade } from '../channels/channel-sync.facade';
import type { StockReservationService } from '../order-reservations/stock-reservation.service';
import type { PrismaService } from '../prisma/prisma.service';
import { testClerkUser, testOwnerUser } from '../test/fixtures/user-profile.fixture';

const tenantId = 'tenant-1';

function resolvedSetting(
  overrides: Partial<ResolvedDocumentTypeSetting> = {},
): ResolvedDocumentTypeSetting {
  return {
    type: DocumentType.sales_ddt,
    printTitle: 'Documento di trasporto',
    autoNumbering: true,
    numberPrefix: 'DDT',
    defaultSeries: 'A',
    defaultNotes: null,
    ...overrides,
  };
}

function createPrismaMock() {
  // getById include sempre purchaseInvoiceLinks/goodsReceiptLinks: Prisma
  // restituisce array (anche vuoti), le fixture parziali dei test no.
  // Il default qui evita di ripetere le due relazioni in ogni mock.
  const documentFindFirst = vi.fn();
  const withLinkDefaults = (value: unknown) =>
    value && typeof value === 'object'
      ? { purchaseInvoiceLinks: [], goodsReceiptLinks: [], ...value }
      : value;
  const rawMockResolvedValue = documentFindFirst.mockResolvedValue.bind(documentFindFirst);
  documentFindFirst.mockResolvedValue = ((value: unknown) =>
    rawMockResolvedValue(withLinkDefaults(value))) as typeof documentFindFirst.mockResolvedValue;
  const rawMockResolvedValueOnce = documentFindFirst.mockResolvedValueOnce.bind(documentFindFirst);
  documentFindFirst.mockResolvedValueOnce = ((value: unknown) =>
    rawMockResolvedValueOnce(
      withLinkDefaults(value),
    )) as typeof documentFindFirst.mockResolvedValueOnce;

  const prisma = {
    // Contatore predefinito: assente nel mock → serie di default null (senza serie).
    documentCounter: {
      findFirst: vi.fn().mockResolvedValue(null),
      // Nessun contatore disponibile: la serie resta «senza serie».
      findMany: vi.fn().mockResolvedValue([]),
    },
    document: {
      findFirst: documentFindFirst,
      // Numerazione «massimo esistente + 1»: la fonte è il massimo dei numeri
      // già assegnati nella serie/anno, non più il contatore.
      aggregate: vi.fn().mockResolvedValue({ _max: { number: null } }),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      // `cancel` rivendica il documento con un update CONDIZIONATO sullo stato:
      // di default la rivendicazione riesce.
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      delete: vi.fn(),
    },
    // Righe: dalla correzione «identità stabile» il salvataggio non cancella e
    // ricrea, ma aggiorna per id (`updateMany` con documento+tenant nel where) e
    // crea solo le righe nuove. `deleteMany` resta per le righe sparite.
    documentLine: {
      deleteMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    documentRevision: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    // Aggancio DDT della fattura: nessuno di default, quindi una Fattura
    // accompagnatoria scarica (con un DDT agganciato la merce è già uscita).
    invoiceSalesDdtLink: {
      count: vi.fn().mockResolvedValue(0),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    documentSequence: { upsert: vi.fn(), findUnique: vi.fn() },
    productVariant: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'var-1',
        sku: 'SKU-1',
        product: { inventoryTracking: 'standard' },
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    vatCode: { findMany: vi.fn().mockResolvedValue([]) },
    inventoryLevel: { upsert: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
    inventoryLot: { upsert: vi.fn() },
    inventorySerial: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    stockMovement: {
      create: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      // Usato da syncTransferLineMovements/syncAdjustmentLineMovements
      // (mirror sync arrivo merce): prima query = conversione legacy
      // (sourceLineId: null, sempre vuota nei test), seconda = movimenti
      // per-riga esistenti (nessuno di default: ogni riga crea un movimento
      // nuovo, come nel flusso reale alla prima conferma).
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    supplier: { findFirst: vi.fn() },
    customer: { findFirst: vi.fn() },
    // Ordine cliente manuale collegato a scarichi: nessuno di default.
    salesOrder: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    stockReservation: { findMany: vi.fn().mockResolvedValue([]) },
    location: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    supplierOrder: { findFirst: vi.fn() },
    supplierOrderLine: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    tenantFeatureSettings: {
      findUnique: vi.fn().mockResolvedValue({ defaultVatCodeId: null }),
    },
    // Intestazione congelata sul documento alla creazione: senza anagrafica
    // azienda si ripiega sui dati di attivazione (document-issuer.util).
    tenant: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        name: 'Negozio test',
        legalName: null,
        vatNumber: null,
        fiscalCode: null,
        phone: null,
        pec: null,
        iban: null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        province: null,
        postalCode: null,
        countryCode: null,
        companyProfile: null,
      }),
    },
    supplierVariantLink: { findUnique: vi.fn(), upsert: vi.fn() },
    // Advisory lock sul contatore, preso prima di leggere il massimo quando il
    // numero è automatico: la tx dei test è il mock stesso, quindi la chiamata
    // arriva qui.
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation((arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: typeof prisma) => unknown)(prisma);
    }
    return Promise.all(arg as Promise<unknown>[]);
  });
  return prisma;
}

function createService(prisma: ReturnType<typeof createPrismaMock>, setting = resolvedSetting()) {
  const settings = { getResolved: vi.fn().mockResolvedValue(setting) };
  const channelSync = { pushInventoryLevels: vi.fn().mockResolvedValue(undefined) };
  const stockReservations = {
    consumeReservationTx: vi.fn().mockResolvedValue(0),
    syncOrderReservationsTx: vi.fn().mockResolvedValue(undefined),
    releaseOrderReservationsTx: vi.fn().mockResolvedValue(undefined),
    restoreConsumedOrderReservationsTx: vi.fn().mockResolvedValue(undefined),
  };
  const priceModePreference = {
    resolvePricesIncludeVat: vi.fn().mockResolvedValue(false),
    resolveCompanyDefault: vi.fn().mockResolvedValue(false),
    salesPricesIncludeVat: vi.fn().mockResolvedValue(false),
    remember: vi.fn().mockResolvedValue(undefined),
  };
  // Nessun tipo documento controparte nei casi di questo file: il risolutore
  // ritorna la coppia vuota, che e' quello che il servizio scriverebbe comunque.
  const externalTypes = {
    resolveForWrite: vi
      .fn()
      .mockResolvedValue({ externalDocumentTypeId: null, externalDocumentTypeSnapshot: null }),
    findByIdIncludingDeleted: vi.fn().mockResolvedValue(null),
  };
  const service = new DocumentsService(
    prisma as unknown as PrismaService,
    settings as unknown as DocumentSettingsService,
    channelSync as unknown as ChannelSyncFacade,
    stockReservations as unknown as StockReservationService,
    priceModePreference as unknown as DocumentPriceModePreferenceService,
    externalTypes as unknown as ExternalDocumentTypesService,
  );
  return { service, settings, channelSync, stockReservations, priceModePreference, externalTypes };
}

/** Bozza minima per i test sul numero imposto in modifica. */
function draftDocumentForNumberUpdate(number: number) {
  return {
    id: 'doc-q',
    tenantId: 'tenant-1',
    type: DocumentType.quote,
    status: DocumentStatus.draft,
    series: 'A',
    year: 2026,
    number,
    reference: `PRE-2026-000${number}`,
    documentDate: new Date('2026-05-04'),
    currency: 'EUR',
    supplierId: null,
    customerId: 'cust-1',
    locationId: 'loc-1',
    targetLocationId: null,
    adjustmentDirection: null,
    notes: null,
    internalComment: null,
    externalDocNumber: null,
    documentDiscountPercent: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    lines: [],
  };
}

describe('DocumentsService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
  });

  describe('list', () => {
    it('applica filtro customerId', async () => {
      const { service } = createService(prisma);
      prisma.document.findMany.mockResolvedValue([]);
      prisma.document.count.mockResolvedValue(0);

      await service.list(tenantId, { page: 1, pageSize: 20, customerId: 'cust-1' });

      expect(prisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId, customerId: 'cust-1' }),
        }),
      );
    });

    // «DDT da fatturare» = spunta «Seguirà doc. di vendita» E nessuna Fattura
    // viva che lo abbia incluso. Il legame è `InvoiceSalesDdtLink` (molti-a-uno),
    // non `sourceDocumentId` (generazione da un predecessore singolo).
    it('«DDT da fatturare» guarda la spunta e i legami fattura, non sourceDocumentId', async () => {
      const { service } = createService(prisma);
      prisma.document.findMany.mockResolvedValue([]);
      prisma.document.count.mockResolvedValue(0);

      await service.list(tenantId, { page: 1, pageSize: 20, pendingInvoice: true });

      const where = prisma.document.findMany.mock.calls[0]?.[0]?.where as Record<string, unknown>;
      expect(where.type).toBe(DocumentType.sales_ddt);
      expect(where.followedBySalesDoc).toBe(true);
      expect(where.invoiceLinks).toEqual({
        none: { invoice: { status: { not: DocumentStatus.cancelled } } },
      });
      // La vecchia condizione non deve tornare: si reggeva su una colonna che
      // nessuno scrive, e prendeva anche i DDT senza spunta.
      expect(where.derivedDocuments).toBeUndefined();
    });

    // Una Fattura annullata non consuma il DDT: il legame resta in tabella ma il
    // DDT torna da fatturare. È il motivo per cui si guarda lo STATO della
    // fattura collegata e non la sola esistenza del legame.
    it('un DDT legato a una sola Fattura annullata resta da fatturare', async () => {
      const { service } = createService(prisma);
      prisma.document.findMany.mockResolvedValue([]);
      prisma.document.count.mockResolvedValue(0);

      await service.list(tenantId, { page: 1, pageSize: 20, pendingInvoice: true });

      const where = prisma.document.findMany.mock.calls[0]?.[0]?.where as {
        invoiceLinks?: { none?: { invoice?: { status?: { not?: unknown } } } };
      };
      expect(where.invoiceLinks?.none?.invoice?.status?.not).toBe(DocumentStatus.cancelled);
    });

    it('titolare vede tutti i documenti, nessun filtro location aggiunto', async () => {
      const { service } = createService(prisma);
      prisma.document.findMany.mockResolvedValue([]);
      prisma.document.count.mockResolvedValue(0);

      await service.list(tenantId, { page: 1, pageSize: 20 }, testOwnerUser());

      expect(prisma.location.findMany).not.toHaveBeenCalled();
      const where = prisma.document.findMany.mock.calls[0]?.[0]?.where as Record<string, unknown>;
      expect(where['AND']).toBeUndefined();
    });

    it('esclude i documenti di location non autorizzate per l’utente corrente', async () => {
      const { service } = createService(prisma);
      prisma.location.findMany.mockResolvedValue([{ id: 'loc-1' }, { id: 'loc-2' }]);
      prisma.document.findMany.mockResolvedValue([]);
      prisma.document.count.mockResolvedValue(0);
      const clerk = testClerkUser({ assignedLocationIds: ['loc-1'] });

      await service.list(tenantId, { page: 1, pageSize: 20 }, clerk);

      const where = prisma.document.findMany.mock.calls[0]?.[0]?.where as {
        AND?: { OR?: unknown[] }[];
      };
      expect(where.AND).toContainEqual({
        OR: [{ locationId: null }, { locationId: { in: ['loc-1'] } }],
      });
    });

    it('lista vuota (non errore) quando l’utente non ha alcuna sede assegnata', async () => {
      const { service } = createService(prisma);
      prisma.location.findMany.mockResolvedValue([{ id: 'loc-1' }]);
      const clerk = testClerkUser({ hasAllLocationsAccess: false, assignedLocationIds: [] });

      const result = await service.list(tenantId, { page: 1, pageSize: 20 }, clerk);

      expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
      expect(prisma.document.findMany).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    // Numero imposto dalla testata (categoria A): si assegna già in bozza,
    // con il riferimento coerente. Senza numero resta null e lo assegna la
    // conferma prendendo il primo libero della serie.
    // Nascita-confermato (Fase 3): create+conferma in un'unica transazione. Il
    // mock di document.create restituisce la bozza (con riga) che la conferma
    // in-transazione promuove; il tipo proforma non muove magazzino, così la
    // conferma esegue solo numero + update. Le asserzioni restano sui dati del
    // create, invariati dalla nascita-confermato.
    it('salva il numero imposto in testata e ne compone il riferimento', async () => {
      const { service } = createService(prisma, resolvedSetting({ numberPrefix: 'DDT' }));
      prisma.document.create.mockResolvedValue({
        id: 'doc-1',
        status: DocumentStatus.draft,
        lines: [{ lineNumber: 1 }],
      });
      prisma.document.update.mockResolvedValue({ id: 'doc-1', lines: [] });

      await service.create(tenantId, {
        type: DocumentType.proforma,
        documentDate: '2026-03-01',
        number: 100,
        lines: [{ description: 'Capo', quantity: 1, unitPriceMinor: 1000 }],
      });

      const data = prisma.document.create.mock.calls[0]![0]!.data;
      expect(data.number).toBe(100);
      expect(data.reference).toBe('DDT-0100');
    });

    // Il payload riga nasce da `...rest` su ComputedLine: un campo di appoggio
    // al calcolo che nessuno esclude finisce dritto a Prisma, che rifiuta
    // l'INTERA scrittura con «Unknown argument» — 500 a ogni salvataggio, per
    // qualsiasi tipo documento. Il mock accetta tutto, quindi il confine lo
    // verifica il modello: le chiavi del payload devono essere colonne vere.
    it('manda a Prisma solo campi che sono colonne di document_lines', async () => {
      const { service } = createService(prisma);
      prisma.document.create.mockResolvedValue({
        id: 'doc-1',
        status: DocumentStatus.draft,
        lines: [{ lineNumber: 1 }],
      });
      prisma.document.update.mockResolvedValue({ id: 'doc-1', lines: [] });

      await service.create(tenantId, {
        type: DocumentType.proforma,
        documentDate: '2026-03-01',
        // Prezzo con coda decimale: e' il caso che ha introdotto il campo
        // d'appoggio lineNetExactMinor (§sei decimali).
        lines: [
          { description: 'Capo', quantity: 2, unitPriceMinor: 2459.0164, vatRatePercent: 22 },
        ],
      });

      const documentLine = Prisma.dmmf.datamodel.models.find((m) => m.name === 'DocumentLine');
      const columns = new Set((documentLine?.fields ?? []).map((field) => field.name));
      const data = prisma.document.create.mock.calls[0]![0]!.data;
      const lineData: Record<string, unknown> = data.lines.create[0];

      expect(columns.size).toBeGreaterThan(0);
      expect(Object.keys(lineData).filter((key) => !columns.has(key))).toEqual([]);
    });

    it('senza numero imposto lascia numero e riferimento alla conferma', async () => {
      const { service } = createService(prisma);
      prisma.document.create.mockResolvedValue({
        id: 'doc-1',
        status: DocumentStatus.draft,
        lines: [{ lineNumber: 1 }],
      });
      prisma.document.update.mockResolvedValue({ id: 'doc-1', lines: [] });

      await service.create(tenantId, {
        type: DocumentType.proforma,
        documentDate: '2026-03-01',
        lines: [{ description: 'Capo', quantity: 1, unitPriceMinor: 1000 }],
      });

      // Al momento del create il numero resta null: lo assegna la conferma
      // in-transazione (qui verifichiamo che il create parta senza numero).
      const data = prisma.document.create.mock.calls[0]![0]!.data;
      expect(data.number).toBeNull();
      expect(data.reference).toBeNull();
    });

    // Due salvataggi simultanei in READ COMMITTED leggono lo stesso massimo e
    // scelgono lo stesso numero: uno dei due lo scopre dal vincolo unico, a
    // lavoro finito. Il lock lo evita solo se precede la lettura del massimo —
    // l'ordine è la sostanza della correzione.
    it('numero automatico: il lock del contatore precede la lettura del massimo', async () => {
      const { service } = createService(prisma);
      prisma.document.create.mockResolvedValue({
        id: 'doc-1',
        status: DocumentStatus.draft,
        lines: [{ lineNumber: 1 }],
      });
      prisma.document.update.mockResolvedValue({ id: 'doc-1', lines: [] });

      await service.create(tenantId, {
        type: DocumentType.proforma,
        documentDate: '2026-03-01',
        lines: [{ description: 'Capo', quantity: 1, unitPriceMinor: 1000 }],
      });

      expect(prisma.document.aggregate).toHaveBeenCalled();
      const lockOrder = prisma.$queryRaw.mock.invocationCallOrder[0] ?? 0;
      const maxOrder = prisma.document.aggregate.mock.invocationCallOrder[0] ?? 0;
      expect(lockOrder).toBeGreaterThan(0);
      expect(lockOrder).toBeLessThan(maxOrder);
    });

    it('numero imposto in testata: nessun lock, il progressivo non si legge', async () => {
      const { service } = createService(prisma, resolvedSetting({ numberPrefix: 'DDT' }));
      prisma.document.create.mockResolvedValue({
        id: 'doc-1',
        status: DocumentStatus.draft,
        number: 100,
        reference: 'DDT-0100',
        lines: [{ lineNumber: 1 }],
      });
      prisma.document.update.mockResolvedValue({ id: 'doc-1', lines: [] });

      await service.create(tenantId, {
        type: DocumentType.proforma,
        documentDate: '2026-03-01',
        number: 100,
        lines: [{ description: 'Capo', quantity: 1, unitPriceMinor: 1000 }],
      });

      // Un numero scelto a mano non legge il massimo: non c'è nulla da
      // serializzare, e il conflitto sul vincolo unico resta l'informazione
      // utile da mostrare all'operatore.
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(prisma.document.aggregate).not.toHaveBeenCalled();
    });

    /**
     * La riga di riferimento non e' una riga economica ne' fisica — blocco A.
     *
     * Il difetto che questi test chiudono: `isReference` esisteva ma lato API
     * non lo guardava nessuno. La riga reggeva solo perche' arrivava con prezzo
     * zero e senza variante — due coincidenze, non una regola: bastava che
     * qualcuno scrivesse un prezzo su quella riga per farla entrare nei conti.
     *
     * Qui la riga arriva CON quantita' e prezzo, apposta: e' il caso che le
     * protezioni accidentali non coprivano.
     */
    it('una riga di riferimento non entra nei totali, anche se porta importi', async () => {
      const { service } = createService(prisma);
      prisma.document.create.mockResolvedValue({
        id: 'doc-1',
        status: DocumentStatus.draft,
        lines: [{ lineNumber: 1 }],
      });
      prisma.document.update.mockResolvedValue({ id: 'doc-1', lines: [] });

      await service.create(tenantId, {
        type: DocumentType.proforma,
        documentDate: '2026-03-01',
        lines: [
          {
            description: 'Rif. Preventivo PRE-0001 del 20/07/2026',
            quantity: 3,
            unitPriceMinor: 9999,
            discountPercent: 50,
            vatRatePercent: 22,
            isReference: true,
          },
          { description: 'Maglia', quantity: 2, unitPriceMinor: 1000, vatRatePercent: 22 },
        ],
      });

      const data = prisma.document.create.mock.calls[0]![0]!.data;
      // Solo la seconda riga fa 2000 + 440 di IVA: la prima non aggiunge nulla.
      expect(data.subtotalMinor).toBe(2000);
      expect(data.taxMinor).toBe(440);
      expect(data.totalMinor).toBe(2440);
      // Ma resta una riga a tutti gli effetti: due righe salvate, non una.
      // Identita', posizione e conteggio non cambiano (`07` §12).
      expect(data.lines.create).toHaveLength(2);
      expect(data.lines.create[0]).toMatchObject({
        lineNumber: 1,
        isReference: true,
        lineTotalMinor: 0,
      });
    });

    it('una riga di riferimento non muove magazzino, nemmeno se lo chiede', async () => {
      const { service } = createService(prisma);
      prisma.document.create.mockResolvedValue({
        id: 'doc-1',
        status: DocumentStatus.draft,
        lines: [{ lineNumber: 1 }],
      });
      prisma.document.update.mockResolvedValue({ id: 'doc-1', lines: [] });

      await service.create(tenantId, {
        type: DocumentType.proforma,
        documentDate: '2026-03-01',
        lines: [
          {
            description: 'Rif. DDT 17 del 30/07/2026',
            quantity: 5,
            unitPriceMinor: 0,
            isReference: true,
            loadsStock: true,
          },
        ],
      });

      const data = prisma.document.create.mock.calls[0]![0]!.data;
      expect(data.lines.create[0]).toMatchObject({ isReference: true, loadsStock: false });
    });

    it('calcola totali riga e IVA con prezzi IVA esclusa', async () => {
      const { service } = createService(prisma);
      prisma.document.create.mockResolvedValue({
        id: 'doc-1',
        status: DocumentStatus.draft,
        lines: [{ lineNumber: 1 }],
      });
      prisma.document.update.mockResolvedValue({ id: 'doc-1', lines: [] });

      await service.create(tenantId, {
        type: DocumentType.proforma,
        documentDate: '2026-03-01',
        lines: [
          { description: 'Maglia', quantity: 2, unitPriceMinor: 1000, vatRatePercent: 22 },
          { description: 'Sconto extra', quantity: 1, unitPriceMinor: 5000, discountPercent: 10 },
        ],
      });

      const data = prisma.document.create.mock.calls[0]![0]!.data;
      // Riga 1: 2 * 1000 = 2000 (IVA 22% -> 440). Riga 2: 5000 * 90% = 4500 (no IVA).
      expect(data.subtotalMinor).toBe(6500);
      expect(data.taxMinor).toBe(440);
      expect(data.totalMinor).toBe(6940);
      expect(data.status).toBe(DocumentStatus.draft);
      expect(data.year).toBe(2026);
      expect(data.lines.create).toHaveLength(2);
      expect(data.lines.create[0]).toMatchObject({ lineNumber: 1, tenantId, lineTotalMinor: 2000 });
      expect(data.lines.create[1]).toMatchObject({ lineNumber: 2, lineTotalMinor: 4500 });
    });

    // La modalità di visualizzazione non entra nei totali: la riga porta il
    // NETTO e l'imposta si calcola sopra, che l'operatore stesse guardando
    // prezzi netti o ivati. Prima, con «prezzi ivati», lo stesso numero veniva
    // scorporato: due documenti con la stessa riga valevano importi diversi.
    //
    // ⚠️ Dal 16/08/2026 la modalità di un documento nuovo non viene più dal
    // default per TIPO (`resolvedSetting`, ritirato) ma dalla convenzione
    // AZIENDALE: qui si pilota quella.
    it('i totali partono dal netto di riga, qualunque modalità mostri la testata', async () => {
      const { service, priceModePreference } = createService(prisma);
      priceModePreference.resolveCompanyDefault.mockResolvedValue(true);
      prisma.document.create.mockResolvedValue({
        id: 'doc-2',
        status: DocumentStatus.draft,
        lines: [{ lineNumber: 1 }],
      });
      prisma.document.update.mockResolvedValue({ id: 'doc-2', lines: [] });

      await service.create(tenantId, {
        type: DocumentType.proforma,
        documentDate: '2026-03-01',
        lines: [{ description: 'Capo', quantity: 1, unitPriceMinor: 1000, vatRatePercent: 22 }],
      });

      const data = prisma.document.create.mock.calls[0]![0]!.data;
      // 1000 netti, IVA 22% -> imponibile 1000, IVA 220, totale 1220.
      expect(data.subtotalMinor).toBe(1000);
      expect(data.taxMinor).toBe(220);
      expect(data.totalMinor).toBe(1220);
      // Il flag resta memorizzato: dice come il documento era compilato.
      expect(data.pricesIncludeVat).toBe(true);
    });

    // Lo sconto a cascata «4+10%» vale 13,6%: 4%, poi 10% su quel che resta.
    // Con la colonna intera il documento ne salvava 14 e valeva meno di quanto
    // l'anteprima aveva mostrato — l'anteprima aveva ragione.
    it('la riga sconta con la cascata, decimali compresi', async () => {
      const { service } = createService(prisma, resolvedSetting());
      prisma.document.create.mockResolvedValue({
        id: 'doc-4',
        status: DocumentStatus.draft,
        lines: [{ lineNumber: 1 }],
      });
      prisma.document.update.mockResolvedValue({ id: 'doc-4', lines: [] });

      await service.create(tenantId, {
        type: DocumentType.proforma,
        documentDate: '2026-03-01',
        lines: [{ description: 'Capo', quantity: 1, unitPriceMinor: 10000, discountPercent: 13.6 }],
      });

      const data = prisma.document.create.mock.calls[0]![0]!.data;
      // 100,00 scontati 13,6% = 86,40 (con 14% sarebbero stati 86,00).
      expect(data.lines.create[0]).toMatchObject({ lineTotalMinor: 8640 });
      expect(data.subtotalMinor).toBe(8640);
    });

    // §sei decimali: 123,97 digitati in modalità ivata valgono 10161,4754
    // centesimi netti. Con l'imposta calcolata sull'imponibile ARROTONDATO il
    // documento valeva 123,96 — un centesimo meno di quello che l'operatore
    // aveva scritto, e diverso da quello che il campo prezzo gli rimostrava.
    it('il totale torna al prezzo ivato digitato, coda decimale compresa', async () => {
      const { service, priceModePreference } = createService(prisma);
      priceModePreference.resolveCompanyDefault.mockResolvedValue(true);
      prisma.document.create.mockResolvedValue({
        id: 'doc-3',
        status: DocumentStatus.draft,
        lines: [{ lineNumber: 1 }],
      });
      prisma.document.update.mockResolvedValue({ id: 'doc-3', lines: [] });

      await service.create(tenantId, {
        type: DocumentType.proforma,
        documentDate: '2026-03-01',
        lines: [
          { description: 'Capo', quantity: 1, unitPriceMinor: 10161.4754, vatRatePercent: 22 },
        ],
      });

      const data = prisma.document.create.mock.calls[0]![0]!.data;
      expect(data.subtotalMinor).toBe(10161);
      expect(data.taxMinor).toBe(2236);
      expect(data.totalMinor).toBe(12397);
    });

    // Percorso duplicato Arrivo merce (post-audit): questi tipi hanno un
    // flusso dedicato che copre creazione E modifica con le validazioni
    // corrette (GoodsReceiptWorkflowService.saveGoodsReceipt, POST
    // documents/goods-receipt/save). Il percorso generico POST /documents
    // deve rifiutarli per evitare bozze prive di fornitore/location valide.
    it.each([DocumentType.goods_receipt, DocumentType.manual_load, DocumentType.initial_load])(
      'rifiuta la creazione generica di %s: usa il flusso dedicato arrivo merce',
      async (type) => {
        const { service } = createService(prisma, resolvedSetting({ type }));

        await expect(
          service.create(tenantId, { type, documentDate: '2026-01-10' }),
        ).rejects.toBeInstanceOf(UnprocessableEntityException);
        expect(prisma.document.create).not.toHaveBeenCalled();
      },
    );

    it('il messaggio di rifiuto indica il flusso dedicato, senza dettagli tecnici', async () => {
      const { service } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.goods_receipt }),
      );

      try {
        await service.create(tenantId, {
          type: DocumentType.goods_receipt,
          documentDate: '2026-01-10',
        });
        expect.fail('doveva rifiutare la creazione generica di goods_receipt');
      } catch (error) {
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        const message = (error as UnprocessableEntityException).message;
        expect(message).toContain('Salva documento');
        expect(message).not.toContain('property');
        expect(message).not.toContain('should not exist');
      }
    });

    // Trasferimento e rettifica NON hanno un flusso dedicato che copra la
    // creazione: TransferAdjustmentWorkflowService.saveTransfer/saveAdjustment
    // gestiscono SOLO la modifica di un documento già confermato (vedi
    // commenti in transfer-adjustment-workflow.service.ts e nel frontend
    // document.service.ts). La creazione/prima conferma resta sul percorso
    // generico: qui verifichiamo che NON vengano bloccati per errore.
    it.each([DocumentType.transfer, DocumentType.adjustment])(
      'NON blocca la creazione generica di %s (nessun flusso dedicato di creazione)',
      async (type) => {
        const { service } = createService(prisma, resolvedSetting({ type }));
        prisma.document.create.mockResolvedValue({
          id: 'doc-x',
          status: DocumentStatus.draft,
          lines: [],
        });

        // ⛔ Qui il salvataggio veniva atteso in RIFIUTO, e il commento diceva
        // perché: «senza righe la conferma in-transazione rifiuta, ma il fatto
        // che prisma.document.create sia stato invocato prova che il gate di
        // tipo NON blocca transfer/adjustment».
        //
        // ⭐ Il rifiuto era IMPALCATURA, non la tesi. Da quando un documento
        // vuoto si salva (25/08/2026) non arriva più, e la tesi si può
        // asserire diretta: il tipo passa il cancello e il documento nasce.
        await service.create(tenantId, { type, documentDate: '2026-01-10' });

        expect(prisma.document.create).toHaveBeenCalled();
      },
    );
  });

  describe('confirm', () => {
    it('assegna numero progressivo e riferimento formattato', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        tenantId,
        type: DocumentType.sales_ddt,
        status: DocumentStatus.draft,
        series: 'A',
        year: 2026,
        number: null,
        reference: null,
        lines: [{ id: 'l1' }],
      });
      prisma.document.aggregate.mockResolvedValue({ _max: { number: 6 } });
      prisma.document.update.mockResolvedValue({ id: 'doc-1', lines: [] });

      await service.confirm(tenantId, 'doc-1');

      const data = prisma.document.update.mock.calls[0]![0]!.data;
      expect(data.status).toBe(DocumentStatus.confirmed);
      expect(data.number).toBe(7);
      expect(data.reference).toBe('DDT-A-0007');
      expect(data.confirmedAt).toBeInstanceOf(Date);
    });

    it('non ri-numera un documento già confermato in precedenza', async () => {
      // Il documento ha già un numero: la conferma non lo tocca (number != null).
      const { service } = createService(prisma, resolvedSetting({}));
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        tenantId,
        type: DocumentType.sales_ddt,
        status: DocumentStatus.draft,
        series: 'A',
        year: 2026,
        number: 3,
        reference: 'DDT-2026-0003',
        lines: [{ id: 'l1' }],
      });
      prisma.document.update.mockResolvedValue({ id: 'doc-1', lines: [] });

      await service.confirm(tenantId, 'doc-1');

      expect(prisma.document.update).toHaveBeenCalled();
      const data = prisma.document.update.mock.calls[0]![0]!.data;
      expect(data.number).toBe(3);
    });

    it('rifiuta la conferma di un documento non in bozza', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        status: DocumentStatus.confirmed,
        lines: [{ id: 'l1' }],
      });

      await expect(service.confirm(tenantId, 'doc-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('⭐ un documento SENZA RIGHE si salva: numero, serie e data, e nient’altro', async () => {
      // ⛔ Qui c’era la prova opposta, «rifiuta la conferma senza righe».
      //
      // Decisione del proprietario, 25/08/2026, chiesta esplicitamente per TUTTI
      // i tipi — magazzino compreso:
      //
      //   «Se non ho fatto nulla nel documento e lo salvo, devo avere la
      //    possibilità di crearlo vuoto e avrò un documento vuoto con numero,
      //    eventuale serie e data. Ovviamente dopo aver selezionato i campi
      //    obbligatori previsti per quel documento. Ovunque deve essere così.»
      //
      // ⚠️ Non è più «conferma di una bozza»: con la nascita-confermato questa
      // riga sta sul percorso di CREAZIONE di ogni tipo. Rifiutare qui
      // significava rifiutare il documento vuoto ovunque — e le maschere lo
      // dicevano ognuna con parole sue, cinque frasi diverse per un unico
      // rifiuto che veniva da qui.
      //
      // ⭐ Un documento vuoto non fa danno: non avendo righe non muove giacenza.
      // Resta riapribile, e si compila dopo.
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        tenantId,
        type: DocumentType.quote,
        status: DocumentStatus.draft,
        series: 'A',
        year: 2026,
        number: null,
        reference: null,
        lines: [],
      });
      prisma.document.aggregate.mockResolvedValue({ _max: { number: 11 } });
      prisma.document.update.mockResolvedValue({ id: 'doc-1', lines: [] });

      await service.confirm(tenantId, 'doc-1');

      const data = prisma.document.update.mock.calls[0]![0]!.data;
      expect(data.status).toBe(DocumentStatus.confirmed);
      expect(data.number).toBe(12);
      expect(data.confirmedAt).toBeInstanceOf(Date);
    });

    it('propaga NotFound se il documento non esiste', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue(null);

      await expect(service.confirm(tenantId, 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('goods_receipt: la conferma dal flusso generico viene rifiutata (percorso unico)', async () => {
      const { service } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.goods_receipt, numberPrefix: 'CAR' }),
      );
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-gr',
        tenantId,
        type: DocumentType.goods_receipt,
        status: DocumentStatus.draft,
        supplierId: 'sup-1',
        locationId: 'loc-1',
        lines: [
          {
            id: 'l1',
            lineNumber: 1,
            variantId: 'var-1',
            sku: 'SKU-1',
            quantity: 5,
            loadsStock: true,
          },
        ],
      });

      await expect(service.confirm(tenantId, 'doc-gr')).rejects.toThrowError(/Salva documento/);
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('sales_ddt: genera movimenti di vendita alla conferma', async () => {
      const { service, channelSync } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-ddt',
        tenantId,
        type: DocumentType.sales_ddt,
        status: DocumentStatus.draft,
        series: 'A',
        year: 2026,
        number: null,
        reference: null,
        customerId: 'cust-1',
        locationId: 'loc-1',
        lines: [
          {
            id: 'l1',
            lineNumber: 1,
            variantId: 'var-1',
            sku: 'SKU-1',
            quantity: 3,
            loadsStock: true,
          },
        ],
      });
      prisma.document.aggregate.mockResolvedValue({ _max: { number: 11 } });
      prisma.productVariant.findMany.mockResolvedValue([
        { id: 'var-1', sku: 'SKU-1', product: { inventoryTracking: 'standard' } },
      ]);
      prisma.inventoryLevel.upsert.mockResolvedValue({});
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.document.update.mockResolvedValue({ id: 'doc-ddt', lines: [] });

      await service.confirm(
        tenantId,
        'doc-ddt',
        testOwnerUser({ id: 'user-1', displayName: 'Anna' }),
      );

      expect(prisma.stockMovement.create).toHaveBeenCalledTimes(1);
      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'sale',
            origin: 'manual',
            variantId: 'var-1',
            locationId: 'loc-1',
            quantity: 3,
            externalRef: 'doc-ddt',
            createdByName: 'Anna',
          }),
        }),
      );
      expect(channelSync.pushInventoryLevels).toHaveBeenCalledWith(tenantId, 'var-1', ['loc-1']);
    });

    it('sales_ddt: rifiuta conferma con righe stock senza cliente', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-ddt',
        type: DocumentType.sales_ddt,
        status: DocumentStatus.draft,
        customerId: null,
        locationId: 'loc-1',
        lines: [{ lineNumber: 1, variantId: 'v1', quantity: 2, loadsStock: true }],
      });

      await expect(service.confirm(tenantId, 'doc-ddt')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('transfer: genera movimenti transfer alla conferma', async () => {
      const { service, channelSync } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.transfer, numberPrefix: 'TR' }),
      );
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-tr',
        tenantId,
        type: DocumentType.transfer,
        status: DocumentStatus.draft,
        series: 'A',
        year: 2026,
        number: null,
        reference: null,
        locationId: 'loc-a',
        targetLocationId: 'loc-b',
        lines: [
          {
            id: 'l1',
            lineNumber: 1,
            variantId: 'var-1',
            sku: 'SKU-1',
            quantity: 4,
            loadsStock: true,
          },
        ],
      });
      prisma.document.aggregate.mockResolvedValue({ _max: { number: 1 } });
      prisma.productVariant.findMany.mockResolvedValue([
        { id: 'var-1', sku: 'SKU-1', product: { inventoryTracking: 'standard' } },
      ]);
      prisma.inventoryLevel.upsert.mockResolvedValue({});
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.inventoryLevel.findUnique.mockResolvedValue({ onHand: 10, available: 10 });
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.document.update.mockResolvedValue({ id: 'doc-tr', lines: [] });

      await service.confirm(tenantId, 'doc-tr');

      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'transfer',
            locationId: 'loc-a',
            targetLocationId: 'loc-b',
            quantity: 4,
          }),
        }),
      );
      expect(channelSync.pushInventoryLevels).toHaveBeenCalledWith(tenantId, 'var-1', ['loc-a']);
      expect(channelSync.pushInventoryLevels).toHaveBeenCalledWith(tenantId, 'var-1', ['loc-b']);
    });

    it('manual_unload: alla conferma sottrae la giacenza SENZA creare movimenti', async () => {
      // Deroga prompt Vendita manuale: giacenza modificata direttamente,
      // niente StockMovement; push canali comunque eseguito post-commit.
      const { service, channelSync } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.manual_unload, numberPrefix: 'SCA' }),
      );
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-sca',
        tenantId,
        type: DocumentType.manual_unload,
        status: DocumentStatus.draft,
        series: 'A',
        year: 2026,
        number: null,
        reference: null,
        locationId: 'loc-1',
        internalComment: null,
        lines: [
          {
            id: 'l1',
            lineNumber: 1,
            variantId: 'var-1',
            sku: 'SKU-1',
            quantity: 3,
            loadsStock: true,
          },
        ],
      });
      prisma.document.aggregate.mockResolvedValue({ _max: { number: 0 } });
      prisma.inventoryLevel.upsert.mockResolvedValue({});
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.inventoryLevel.findUnique.mockResolvedValue({ onHand: 10, available: 10 });
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.document.update.mockResolvedValue({ id: 'doc-sca', lines: [] });

      await service.confirm(tenantId, 'doc-sca');

      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
      expect(prisma.inventoryLevel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ variantId: 'var-1', locationId: 'loc-1' }),
          data: { onHand: { increment: -3 }, available: { increment: -3 } },
        }),
      );
      expect(channelSync.pushInventoryLevels).toHaveBeenCalledWith(tenantId, 'var-1', ['loc-1']);
    });

    it('adjustment: genera movimenti adjustment alla conferma', async () => {
      const { service } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.adjustment, numberPrefix: 'RET' }),
      );
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-ret',
        tenantId,
        type: DocumentType.adjustment,
        status: DocumentStatus.draft,
        series: 'A',
        year: 2026,
        number: null,
        reference: null,
        locationId: 'loc-1',
        adjustmentDirection: 'increase',
        internalComment: 'Inventario fisico',
        lines: [
          {
            id: 'l1',
            lineNumber: 1,
            variantId: 'var-1',
            sku: 'SKU-1',
            quantity: 2,
            loadsStock: true,
          },
        ],
      });
      prisma.document.aggregate.mockResolvedValue({ _max: { number: 0 } });
      prisma.inventoryLevel.upsert.mockResolvedValue({});
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.inventoryLevel.findUnique.mockResolvedValue({ onHand: 10, available: 10 });
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.document.update.mockResolvedValue({ id: 'doc-ret', lines: [] });

      await service.confirm(tenantId, 'doc-ret');

      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'adjustment',
            direction: 'increase',
            locationId: 'loc-1',
            quantity: 2,
          }),
        }),
      );
    });

    it('transfer: due righe con la stessa variante producono due movimenti distinti con sourceLineId', async () => {
      const { service } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.transfer, numberPrefix: 'TR' }),
      );
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-tr',
        tenantId,
        type: DocumentType.transfer,
        status: DocumentStatus.draft,
        series: 'A',
        year: 2026,
        number: null,
        reference: null,
        locationId: 'loc-a',
        targetLocationId: 'loc-b',
        lines: [
          {
            id: 'l1',
            lineNumber: 1,
            variantId: 'var-1',
            sku: 'SKU-1',
            quantity: 2,
            loadsStock: true,
          },
          {
            id: 'l2',
            lineNumber: 2,
            variantId: 'var-1',
            sku: 'SKU-1',
            quantity: 3,
            loadsStock: true,
          },
        ],
      });
      prisma.document.aggregate.mockResolvedValue({ _max: { number: 1 } });
      prisma.productVariant.findMany.mockResolvedValue([
        { id: 'var-1', sku: 'SKU-1', product: { inventoryTracking: 'standard' } },
      ]);
      prisma.inventoryLevel.upsert.mockResolvedValue({});
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.document.update.mockResolvedValue({ id: 'doc-tr', lines: [] });

      await service.confirm(tenantId, 'doc-tr');

      expect(prisma.stockMovement.create).toHaveBeenCalledTimes(2);
      const created = prisma.stockMovement.create.mock.calls.map((call) => call[0]!.data);
      expect(created.map((data) => data.sourceLineId)).toEqual(['l1', 'l2']);
      expect(created.every((data) => data.type === 'transfer')).toBe(true);
    });

    it('adjustment: due righe con la stessa variante producono due movimenti distinti con sourceLineId', async () => {
      const { service } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.adjustment, numberPrefix: 'RET' }),
      );
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-ret',
        tenantId,
        type: DocumentType.adjustment,
        status: DocumentStatus.draft,
        series: 'A',
        year: 2026,
        number: null,
        reference: null,
        locationId: 'loc-1',
        adjustmentDirection: 'increase',
        internalComment: 'Inventario fisico',
        lines: [
          {
            id: 'l1',
            lineNumber: 1,
            variantId: 'var-1',
            sku: 'SKU-1',
            quantity: 2,
            loadsStock: true,
          },
          {
            id: 'l2',
            lineNumber: 2,
            variantId: 'var-1',
            sku: 'SKU-1',
            quantity: 6,
            loadsStock: true,
          },
        ],
      });
      prisma.document.aggregate.mockResolvedValue({ _max: { number: 0 } });
      prisma.inventoryLevel.upsert.mockResolvedValue({});
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.document.update.mockResolvedValue({ id: 'doc-ret', lines: [] });

      await service.confirm(tenantId, 'doc-ret');

      expect(prisma.stockMovement.create).toHaveBeenCalledTimes(2);
      const created = prisma.stockMovement.create.mock.calls.map((call) => call[0]!.data);
      expect(created.map((data) => data.sourceLineId)).toEqual(['l1', 'l2']);
      expect(created.every((data) => data.type === 'adjustment')).toBe(true);
    });
  });

  describe('transizioni di stato', () => {
    it('cancel rifiuta un documento già annullato', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        status: DocumentStatus.cancelled,
        lines: [],
      });

      await expect(service.cancel(tenantId, 'doc-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('cancel goods_receipt confermato storna giacenza e registra revisione', async () => {
      const { service, channelSync } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.goods_receipt }),
      );
      const doc = {
        id: 'doc-gr',
        tenantId,
        type: DocumentType.goods_receipt,
        status: DocumentStatus.confirmed,
        reference: 'CAR-2026-0002',
        locationId: 'loc-1',
        series: 'A',
        documentDate: new Date(),
        currency: 'EUR',
        createdAt: new Date(),
        updatedAt: new Date(),
        lines: [
          {
            id: 'l1',
            lineNumber: 1,
            variantId: 'var-1',
            sku: 'SKU-1',
            quantity: 4,
            loadsStock: true,
            description: 'x',
            unitPriceMinor: 0,
            discountPercent: 0,
            lineTotalMinor: 0,
            documentId: 'doc-gr',
            tenantId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };
      prisma.document.findFirst.mockResolvedValue(doc);
      prisma.documentRevision.findFirst.mockResolvedValue(null);
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.document.update.mockResolvedValue({ ...doc, status: DocumentStatus.cancelled });

      await service.cancel(
        tenantId,
        'doc-gr',
        testOwnerUser({ id: 'user-1', displayName: 'Luigi' }),
      );

      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'unload',
            variantId: 'var-1',
            quantity: 4,
          }),
        }),
      );
      expect(prisma.documentRevision.create).toHaveBeenCalled();
      expect(channelSync.pushInventoryLevels).toHaveBeenCalledWith(tenantId, 'var-1', ['loc-1']);
    });

    it('cancel sales_ddt confermato ripristina giacenza', async () => {
      const { service, channelSync } = createService(prisma);
      const doc = {
        id: 'doc-ddt',
        tenantId,
        type: DocumentType.sales_ddt,
        status: DocumentStatus.confirmed,
        reference: 'DDT-2026-0012',
        locationId: 'loc-1',
        series: 'A',
        documentDate: new Date(),
        currency: 'EUR',
        createdAt: new Date(),
        updatedAt: new Date(),
        lines: [
          {
            id: 'l1',
            lineNumber: 1,
            variantId: 'var-1',
            sku: 'SKU-1',
            quantity: 2,
            loadsStock: true,
            description: 'x',
            unitPriceMinor: 0,
            discountPercent: 0,
            lineTotalMinor: 0,
            documentId: 'doc-ddt',
            tenantId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };
      prisma.document.findFirst.mockResolvedValue(doc);
      prisma.documentRevision.findFirst.mockResolvedValue(null);
      prisma.inventoryLevel.upsert.mockResolvedValue({});
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.document.update.mockResolvedValue({ ...doc, status: DocumentStatus.cancelled });

      await service.cancel(
        tenantId,
        'doc-ddt',
        testOwnerUser({ id: 'user-1', displayName: 'Luigi' }),
      );

      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'load',
            variantId: 'var-1',
            quantity: 2,
          }),
        }),
      );
      expect(channelSync.pushInventoryLevels).toHaveBeenCalledWith(tenantId, 'var-1', ['loc-1']);
    });

    /**
     * ⛔ DUE ANNULLAMENTI CONCORRENTI NON DEVONO STORNARE DUE VOLTE.
     *
     * La guardia «il documento è già annullato» legge FUORI dalla transazione
     * (`documents.service.ts` → `getById` in testa a `cancel`), e da quella
     * stessa lettura si calcolano i flag di storno (`wasStockLoaded` e
     * fratelli). La scrittura finale non porta alcuna condizione sullo stato:
     * `tx.document.update({ where: { id } })`.
     *
     * Due richieste che leggono entrambe `confirmed` passano quindi entrambe la
     * guardia e applicano entrambe la reintegra: la merce rientra due volte.
     *
     * ⚠️ **Il test SIMULA l'interleaving, non esegue concorrenza vera**: il
     * finto `findFirst` risponde sempre col documento pre-annullamento, che è
     * esattamente ciò che vedono due transazioni sovrapposte finché nessuna ha
     * confermato. È la sola forma possibile su un doppio in memoria, e va detta
     * invece di lasciar credere a una prova di parallelismo.
     *
     * ⚠️ **E dichiara anche il proprio confine.** Il finto `updateMany` sotto
     * riproduce ciò che fa un UPDATE condizionato in READ COMMITTED: la prima
     * rivendicazione trova la riga, la seconda — dopo il lock — non la trova
     * più. Il test prova quindi che **il servizio reagisce correttamente a una
     * rivendicazione persa**: non storna e dichiara il conflitto. Che PostgreSQL
     * serializzi davvero le due `UPDATE` è un'assunzione sul livello di
     * isolamento, non una cosa che questo test dimostri.
     */
    it('⛔ due annullamenti concorrenti stornano UNA volta sola', async () => {
      const { service } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.goods_receipt }),
      );
      const doc = {
        id: 'doc-conc',
        tenantId,
        type: DocumentType.goods_receipt,
        status: DocumentStatus.confirmed,
        reference: 'CAR-2026-0009',
        locationId: 'loc-1',
        series: 'A',
        documentDate: new Date(),
        currency: 'EUR',
        createdAt: new Date(),
        updatedAt: new Date(),
        lines: [
          {
            id: 'l1',
            lineNumber: 1,
            variantId: 'var-1',
            sku: 'SKU-1',
            quantity: 4,
            loadsStock: true,
            description: 'x',
            unitPriceMinor: 0,
            discountPercent: 0,
            lineTotalMinor: 0,
            documentId: 'doc-conc',
            tenantId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };
      // Entrambe le richieste leggono lo stato PRE-annullamento: è la finestra.
      prisma.document.findFirst.mockResolvedValue(doc);
      prisma.documentRevision.findFirst.mockResolvedValue(null);
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.document.update.mockResolvedValue({ ...doc, status: DocumentStatus.cancelled });

      // Il database sotto un UPDATE condizionato: la prima rivendicazione trova
      // la riga, la seconda no. Vedi il confine dichiarato nel docblock.
      let rivendicato = false;
      prisma.document.updateMany.mockImplementation(() => {
        if (rivendicato) {
          return Promise.resolve({ count: 0 });
        }
        rivendicato = true;
        return Promise.resolve({ count: 1 });
      });

      const attore = testOwnerUser({ id: 'user-1', displayName: 'Luigi' });
      const esiti = await Promise.allSettled([
        service.cancel(tenantId, 'doc-conc', attore),
        service.cancel(tenantId, 'doc-conc', attore),
      ]);

      // Una sola deve riuscire; l'altra dichiara il conflitto.
      expect(esiti.filter((e) => e.status === 'fulfilled')).toHaveLength(1);
      const respinta = esiti.find((e) => e.status === 'rejected');
      expect((respinta as PromiseRejectedResult | undefined)?.reason).toBeInstanceOf(
        ConflictException,
      );

      // ⛔ E soprattutto: la merce rientra UNA volta sola. Con due storni la
      // giacenza scenderebbe di 8 invece che di 4, e nessuno se ne accorgerebbe
      // guardando il documento — che risulta annullato una volta sola.
      expect(prisma.stockMovement.create).toHaveBeenCalledTimes(1);
    });

    it('cancel transfer legacy (senza movimenti per riga): usa il reverse aggregato', async () => {
      const { service } = createService(prisma, resolvedSetting({ type: DocumentType.transfer }));
      const doc = {
        id: 'doc-tr',
        tenantId,
        type: DocumentType.transfer,
        status: DocumentStatus.confirmed,
        reference: 'TR-2026-0004',
        locationId: 'loc-a',
        targetLocationId: 'loc-b',
        series: 'A',
        documentDate: new Date(),
        currency: 'EUR',
        createdAt: new Date(),
        updatedAt: new Date(),
        lines: [
          {
            id: 'l1',
            lineNumber: 1,
            variantId: 'var-1',
            sku: 'SKU-1',
            quantity: 4,
            loadsStock: true,
            description: 'x',
            unitPriceMinor: 0,
            discountPercent: 0,
            lineTotalMinor: 0,
            documentId: 'doc-tr',
            tenantId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };
      prisma.document.findFirst.mockResolvedValue(doc);
      // Nessun movimento con sourceLineId: documento pre-migrazione, ancora
      // sul modello aggregato legacy.
      prisma.stockMovement.count.mockResolvedValue(0);
      prisma.documentRevision.findFirst.mockResolvedValue(null);
      prisma.inventoryLevel.upsert.mockResolvedValue({});
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.inventoryLevel.findUnique.mockResolvedValue({ onHand: 10, available: 10 });
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.document.update.mockResolvedValue({ ...doc, status: DocumentStatus.cancelled });

      await service.cancel(tenantId, 'doc-tr');

      // reverseDocumentStockTransfer: storna verso l'origine invertendo le location.
      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'transfer',
            locationId: 'loc-b',
            targetLocationId: 'loc-a',
            quantity: 4,
          }),
        }),
      );
      expect(prisma.stockMovement.delete).not.toHaveBeenCalled();
    });

    it('cancel transfer con movimenti per riga: rimuove i movimenti collegati invece di crearne di nuovi', async () => {
      const { service } = createService(prisma, resolvedSetting({ type: DocumentType.transfer }));
      const doc = {
        id: 'doc-tr-pl',
        tenantId,
        type: DocumentType.transfer,
        status: DocumentStatus.confirmed,
        reference: 'TR-2026-0005',
        locationId: 'loc-a',
        targetLocationId: 'loc-b',
        series: 'A',
        documentDate: new Date(),
        currency: 'EUR',
        createdAt: new Date(),
        updatedAt: new Date(),
        lines: [
          {
            id: 'l1',
            lineNumber: 1,
            variantId: 'var-1',
            sku: 'SKU-1',
            quantity: 4,
            loadsStock: true,
            description: 'x',
            unitPriceMinor: 0,
            discountPercent: 0,
            lineTotalMinor: 0,
            documentId: 'doc-tr-pl',
            tenantId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };
      prisma.document.findFirst.mockResolvedValue(doc);
      prisma.stockMovement.count.mockResolvedValue(1);
      prisma.stockMovement.findMany.mockImplementation(
        ({ where }: { where: Record<string, unknown> }) => {
          if (where.sourceLineId === null) {
            return Promise.resolve([]);
          }
          return Promise.resolve([
            {
              id: 'mov-1',
              variantId: 'var-1',
              sku: 'SKU-1',
              locationId: 'loc-a',
              targetLocationId: 'loc-b',
              quantity: 4,
              sourceLineId: 'l1',
              createdAt: new Date(),
            },
          ]);
        },
      );
      prisma.documentRevision.findFirst.mockResolvedValue(null);
      prisma.inventoryLevel.upsert.mockResolvedValue({});
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.document.update.mockResolvedValue({ ...doc, status: DocumentStatus.cancelled });

      await service.cancel(tenantId, 'doc-tr-pl');

      expect(prisma.stockMovement.delete).toHaveBeenCalledWith({ where: { id: 'mov-1' } });
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
      // Storno: +4 all'origine, -4 alla destinazione.
      expect(prisma.inventoryLevel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ locationId: 'loc-a' }),
          data: expect.objectContaining({ onHand: { increment: 4 } }),
        }),
      );
      expect(prisma.inventoryLevel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ locationId: 'loc-b' }),
          data: expect.objectContaining({ onHand: { increment: -4 } }),
        }),
      );
    });

    it('cancel adjustment con movimenti per riga: rimuove i movimenti collegati invece di crearne di nuovi', async () => {
      const { service } = createService(prisma, resolvedSetting({ type: DocumentType.adjustment }));
      const doc = {
        id: 'doc-ret-pl',
        tenantId,
        type: DocumentType.adjustment,
        status: DocumentStatus.confirmed,
        reference: 'RET-2026-0002',
        locationId: 'loc-1',
        adjustmentDirection: 'increase',
        internalComment: 'Conteggio',
        series: 'A',
        documentDate: new Date(),
        currency: 'EUR',
        createdAt: new Date(),
        updatedAt: new Date(),
        lines: [
          {
            id: 'l1',
            lineNumber: 1,
            variantId: 'var-1',
            sku: 'SKU-1',
            quantity: 6,
            loadsStock: true,
            description: 'x',
            unitPriceMinor: 0,
            discountPercent: 0,
            lineTotalMinor: 0,
            documentId: 'doc-ret-pl',
            tenantId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };
      prisma.document.findFirst.mockResolvedValue(doc);
      prisma.stockMovement.count.mockResolvedValue(1);
      prisma.stockMovement.findMany.mockImplementation(
        ({ where }: { where: Record<string, unknown> }) => {
          if (where.sourceLineId === null) {
            return Promise.resolve([]);
          }
          return Promise.resolve([
            {
              id: 'mov-1',
              variantId: 'var-1',
              sku: 'SKU-1',
              locationId: 'loc-1',
              quantity: 6,
              direction: 'increase',
              sourceLineId: 'l1',
              createdAt: new Date(),
            },
          ]);
        },
      );
      prisma.documentRevision.findFirst.mockResolvedValue(null);
      prisma.inventoryLevel.upsert.mockResolvedValue({});
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.document.update.mockResolvedValue({ ...doc, status: DocumentStatus.cancelled });

      await service.cancel(tenantId, 'doc-ret-pl');

      expect(prisma.stockMovement.delete).toHaveBeenCalledWith({ where: { id: 'mov-1' } });
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
      expect(prisma.inventoryLevel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ locationId: 'loc-1' }),
          data: expect.objectContaining({ onHand: { increment: -6 } }),
        }),
      );
    });
  });

  // ── Identità stabile delle righe (FASE 1) ────────────────────────────────
  //
  // Il salvataggio generico cancellava tutte le righe e le ricreava: gli id
  // cambiavano a ogni salvataggio, e con loro si staccava tutto ciò che a una
  // riga si aggancia — il movimento di magazzino via `sourceLineId`, i seriali
  // via `InventorySerial.documentLineId`. Qui si verifica che l'identità
  // sopravviva. Causa e piano: `docs/09-specifica-movimenti-per-riga.md` §3.
  describe('update — identità delle righe', () => {
    function docWithLines(lines: unknown[]) {
      return { ...draftDocumentForNumberUpdate(7), lines };
    }

    function savedLine(id: string, overrides: Record<string, unknown> = {}) {
      return {
        id,
        documentId: 'doc-q',
        tenantId,
        lineNumber: 1,
        variantId: 'var-1',
        sku: 'SKU-1',
        description: 'Riga',
        quantity: 1,
        unitPriceMinor: new Prisma.Decimal(1000),
        discountPercent: new Prisma.Decimal(0),
        vatRatePercent: 22,
        lineTotalMinor: 1000,
        loadsStock: false,
        unitOfMeasure: null,
        isReference: false,
        supplierOrderLineId: null,
        lotCode: null,
        lotExpiryDate: null,
        serialNumbers: [],
        vatCodeId: null,
        vatSnapshot: null,
        ...overrides,
      };
    }

    function inputLine(overrides: Record<string, unknown> = {}) {
      return { description: 'Riga', quantity: 1, unitPriceMinor: 1000, ...overrides };
    }

    function arrange(lines: unknown[]) {
      const { service } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.quote, numberPrefix: 'PRE' }),
      );
      const doc = docWithLines(lines);
      prisma.document.findFirst.mockResolvedValueOnce(doc).mockResolvedValueOnce({ ...doc });
      prisma.document.update.mockResolvedValue({ ...doc, lines: [] });
      return service;
    }

    /** Id passati a `updateMany`, nell'ordine in cui il servizio li ha scritti. */
    function updatedIds(): string[] {
      return prisma.documentLine.updateMany.mock.calls.map(
        (call) => (call[0] as { where: { id: string } }).where.id,
      );
    }

    it('aggiorna le righe esistenti mantenendo il loro id, senza ricrearle', async () => {
      const service = arrange([savedLine('line-1'), savedLine('line-2', { lineNumber: 2 })]);

      await service.update(tenantId, 'doc-q', {
        lines: [inputLine({ id: 'line-1', quantity: 5 }), inputLine({ id: 'line-2', quantity: 3 })],
      });

      expect(updatedIds()).toEqual(['line-1', 'line-2']);
      expect(prisma.documentLine.create).not.toHaveBeenCalled();
      expect(prisma.documentLine.deleteMany).not.toHaveBeenCalled();
      // La quantità nuova finisce sulla stessa riga, non su una copia.
      const first = prisma.documentLine.updateMany.mock.calls[0]![0] as {
        data: { quantity: number };
      };
      expect(first.data.quantity).toBe(5);
    });

    // ── Unità di misura: il salvataggio non cancella ciò che non gli è stato
    // chiesto di cambiare (contratto della riga, fetta 1) ─────────────────
    //
    // Il round-trip dev'essere CONSERVATIVO: aprire e salvare un documento non
    // può modificare un dato che l'operatore non ha toccato. Vale per ogni
    // maschera che non espone la colonna — oggi DDT, Fattura, Proforma e Nota
    // di credito non ce l'hanno.

    // ── Snapshot IVA: la riga di un documento è una FOTOGRAFIA ────────────
    //
    // `regole-gestionale` → «La riga di un documento è una fotografia, e non si
    // riscatta da sola». Il contratto è BINARIO: su una riga esistente il
    // `vatCodeId` assente significa «non modificata», e il server conserva
    // codice e snapshot persistiti invece di rileggerli dall'anagrafica.
    //
    // Senza questa regola, cambiare l'aliquota di un Codice IVA ri-prezza ogni
    // documento che venga risalvato — basta riaprirne uno e correggere una nota.

    /** Snapshot come lo scrive `buildVatCodeSnapshot`, con l'aliquota di allora. */
    function snapshotStorico(ratePercent: number) {
      return { code: 'IVA22', ratePercent, natureKey: null, officialCode: null };
    }

    /** Il Codice IVA come è OGGI in anagrafica: aliquota già cambiata. */
    function vatCodeCorrente(id: string, ratePercent: number) {
      return {
        id,
        tenantId,
        code: 'IVA' + ratePercent,
        ratePercent: new Prisma.Decimal(ratePercent),
        isActive: true,
        calculationMode: 'standard',
        scope: 'both',
        deletedAt: null,
        description: null,
        notes: null,
        nonDeductiblePercent: new Prisma.Decimal(0),
        vatAffectsSupplierTotal: true,
        // `buildVatCodeSnapshot` legge la natura: e' una relazione, non un campo.
        nature: { key: null, label: null, officialCode: null },
      };
    }

    it('documento storico risalvato senza toccare l’IVA: lo snapshot resta quello di allora', async () => {
      const service = arrange([
        savedLine('line-1', { vatCodeId: 'vat-1', vatSnapshot: snapshotStorico(22) }),
      ]);
      // In anagrafica l'aliquota nel frattempo è diventata 24.
      prisma.vatCode.findMany.mockResolvedValue([vatCodeCorrente('vat-1', 24)]);

      await service.update(tenantId, 'doc-q', { lines: [inputLine({ id: 'line-1' })] });

      const scritto = prisma.documentLine.updateMany.mock.calls[0]![0] as {
        data: { vatCodeId: string | null; vatSnapshot: { ratePercent: number } };
      };
      expect(scritto.data.vatCodeId).toBe('vat-1');
      expect(scritto.data.vatSnapshot.ratePercent).toBe(22);
    });

    it('modifica di ALTRI campi: lo snapshot IVA non si muove', async () => {
      const service = arrange([
        savedLine('line-1', { vatCodeId: 'vat-1', vatSnapshot: snapshotStorico(22) }),
      ]);
      prisma.vatCode.findMany.mockResolvedValue([vatCodeCorrente('vat-1', 24)]);

      await service.update(tenantId, 'doc-q', {
        lines: [inputLine({ id: 'line-1', quantity: 9, description: 'Descrizione corretta' })],
      });

      const scritto = prisma.documentLine.updateMany.mock.calls[0]![0] as {
        data: { quantity: number; vatSnapshot: { ratePercent: number } };
      };
      expect(scritto.data.quantity).toBe(9);
      expect(scritto.data.vatSnapshot.ratePercent).toBe(22);
    });

    it('scelta esplicita di un altro Codice IVA: snapshot NUOVO, preso dall’anagrafica', async () => {
      const service = arrange([
        savedLine('line-1', { vatCodeId: 'vat-1', vatSnapshot: snapshotStorico(22) }),
      ]);
      prisma.vatCode.findMany.mockResolvedValue([
        vatCodeCorrente('vat-1', 22),
        vatCodeCorrente('vat-2', 10),
      ]);

      await service.update(tenantId, 'doc-q', {
        lines: [inputLine({ id: 'line-1', vatCodeId: 'vat-2' })],
      });

      const scritto = prisma.documentLine.updateMany.mock.calls[0]![0] as {
        data: { vatCodeId: string | null; vatSnapshot: { ratePercent: number } };
      };
      expect(scritto.data.vatCodeId).toBe('vat-2');
      expect(scritto.data.vatSnapshot.ratePercent).toBe(10);
    });

    it('aliquota cambiata in anagrafica e documento risalvato: il documento storico non si ri-prezza', async () => {
      // È il caso che rende la regola necessaria, non un caso limite: senza di
      // essa una fattura di marzo diventerebbe al 24% aprendola ad agosto.
      const service = arrange([
        savedLine('line-1', { vatCodeId: 'vat-1', vatSnapshot: snapshotStorico(22) }),
      ]);
      prisma.vatCode.findMany.mockResolvedValue([vatCodeCorrente('vat-1', 24)]);

      await service.update(tenantId, 'doc-q', { lines: [inputLine({ id: 'line-1' })] });

      const scritto = prisma.documentLine.updateMany.mock.calls[0]![0] as {
        data: { vatSnapshot: { ratePercent: number } };
      };
      expect(scritto.data.vatSnapshot.ratePercent).toBe(22);
      expect(scritto.data.vatSnapshot.ratePercent).not.toBe(24);
    });

    it('riga NUOVA: acquisisce normalmente il Codice IVA corrente e lo congela', async () => {
      const service = arrange([savedLine('line-1', { vatCodeId: 'vat-1' })]);
      prisma.vatCode.findMany.mockResolvedValue([vatCodeCorrente('vat-2', 10)]);

      await service.update(tenantId, 'doc-q', {
        lines: [inputLine({ id: 'line-1' }), inputLine({ vatCodeId: 'vat-2' })],
      });

      const creata = prisma.documentLine.create.mock.calls[0]![0] as {
        data: { vatCodeId: string | null; vatSnapshot: { ratePercent: number } };
      };
      expect(creata.data.vatCodeId).toBe('vat-2');
      expect(creata.data.vatSnapshot.ratePercent).toBe(10);
    });

    it('non cancella l’unità di misura quando la maschera non la manda', async () => {
      const service = arrange([savedLine('line-1', { unitOfMeasure: 'kg' })]);

      await service.update(tenantId, 'doc-q', {
        lines: [inputLine({ id: 'line-1', quantity: 5 })],
      });

      const data = (
        prisma.documentLine.updateMany.mock.calls[0]![0] as {
          data: Record<string, unknown>;
        }
      ).data;
      // `undefined` è il modo in cui Prisma dice «non toccare questa colonna»:
      // non finisce nella UPDATE. È la differenza con `null`, che invece la
      // scriverebbe — ed è esattamente ciò che succedeva prima.
      expect(data.unitOfMeasure).toBeUndefined();
      expect(data.quantity).toBe(5);
    });

    it('la svuota se l’operatore la svuota davvero', async () => {
      const service = arrange([savedLine('line-1', { unitOfMeasure: 'kg' })]);

      await service.update(tenantId, 'doc-q', {
        lines: [inputLine({ id: 'line-1', unitOfMeasure: '' })],
      });

      const data = (
        prisma.documentLine.updateMany.mock.calls[0]![0] as {
          data: Record<string, unknown>;
        }
      ).data;
      // Stringa vuota = svuotamento esplicito, ed è un gesto diverso dal
      // silenzio: qui la colonna si scrive, a null.
      expect(data.unitOfMeasure).toBeNull();
    });

    it('la scrive quando arriva', async () => {
      const service = arrange([savedLine('line-1')]);

      await service.update(tenantId, 'doc-q', {
        lines: [inputLine({ id: 'line-1', unitOfMeasure: '  kg  ' })],
      });

      const data = (
        prisma.documentLine.updateMany.mock.calls[0]![0] as {
          data: Record<string, unknown>;
        }
      ).data;
      expect(data.unitOfMeasure).toBe('kg');
    });

    it('assegna un id nuovo solo alle righe nuove', async () => {
      const service = arrange([savedLine('line-1')]);

      await service.update(tenantId, 'doc-q', {
        lines: [inputLine({ id: 'line-1' }), inputLine({ description: 'Riga aggiunta' })],
      });

      expect(updatedIds()).toEqual(['line-1']);
      expect(prisma.documentLine.create).toHaveBeenCalledTimes(1);
      // La riga nuova non porta con sé un id dichiarato dal client.
      const created = prisma.documentLine.create.mock.calls[0]![0] as {
        data: Record<string, unknown>;
      };
      expect(created.data.id).toBeUndefined();
      expect(created.data.documentId).toBe('doc-q');
      expect(created.data.tenantId).toBe(tenantId);
    });

    it('elimina la sola riga rimossa, e lascia stare le altre', async () => {
      const service = arrange([
        savedLine('line-1'),
        savedLine('line-2', { lineNumber: 2 }),
        savedLine('line-3', { lineNumber: 3 }),
      ]);

      await service.update(tenantId, 'doc-q', {
        lines: [inputLine({ id: 'line-1' }), inputLine({ id: 'line-3' })],
      });

      expect(prisma.documentLine.deleteMany).toHaveBeenCalledWith({
        where: { documentId: 'doc-q', tenantId, id: { in: ['line-2'] } },
      });
      expect(updatedIds()).toEqual(['line-1', 'line-3']);
    });

    it('tiene distinte due righe dello stesso articolo', async () => {
      const service = arrange([
        savedLine('line-1', { variantId: 'var-1' }),
        savedLine('line-2', { variantId: 'var-1', lineNumber: 2 }),
      ]);

      await service.update(tenantId, 'doc-q', {
        lines: [
          inputLine({ id: 'line-1', variantId: 'var-1', quantity: 2 }),
          inputLine({ id: 'line-2', variantId: 'var-1', quantity: 3 }),
        ],
      });

      // Due entità, non una somma: è la condizione perché domani ciascuna possa
      // avere il proprio movimento (§09 «due righe stesso articolo»).
      expect(updatedIds()).toEqual(['line-1', 'line-2']);
      expect(prisma.documentLine.create).not.toHaveBeenCalled();
    });

    it('conserva l’identità anche delle righe di riferimento e senza articolo', async () => {
      const service = arrange([
        savedLine('line-ref', {
          isReference: true,
          variantId: null,
          description: 'Rif. Ordine 12',
        }),
        savedLine('line-serv', {
          variantId: null,
          description: 'Spese di trasporto',
          lineNumber: 2,
        }),
      ]);

      await service.update(tenantId, 'doc-q', {
        lines: [
          inputLine({ id: 'line-ref', isReference: true, description: 'Rif. Ordine 12' }),
          inputLine({ id: 'line-serv', description: 'Spese di trasporto' }),
        ],
      });

      expect(updatedIds()).toEqual(['line-ref', 'line-serv']);
      expect(prisma.documentLine.create).not.toHaveBeenCalled();
    });

    it('riordinare le righe cambia la posizione, non l’identità', async () => {
      const service = arrange([savedLine('line-1'), savedLine('line-2', { lineNumber: 2 })]);

      await service.update(tenantId, 'doc-q', {
        lines: [inputLine({ id: 'line-2' }), inputLine({ id: 'line-1' })],
      });

      const calls = prisma.documentLine.updateMany.mock.calls.map(
        (call) => call[0] as { where: { id: string }; data: { lineNumber: number } },
      );
      expect(calls.map((c) => [c.where.id, c.data.lineNumber])).toEqual([
        ['line-2', 1],
        ['line-1', 2],
      ]);
      expect(prisma.documentLine.create).not.toHaveBeenCalled();
      expect(prisma.documentLine.deleteMany).not.toHaveBeenCalled();
    });

    it('salvare due volte lo stesso documento non duplica né ricrea nulla', async () => {
      const lines = [savedLine('line-1'), savedLine('line-2', { lineNumber: 2 })];
      const service = arrange(lines);
      const payload = {
        lines: [inputLine({ id: 'line-1' }), inputLine({ id: 'line-2' })],
      };

      await service.update(tenantId, 'doc-q', payload);
      // Secondo salvataggio identico: il documento riletto ha gli stessi id.
      const doc = docWithLines(lines);
      prisma.document.findFirst.mockResolvedValueOnce(doc).mockResolvedValueOnce({ ...doc });
      await service.update(tenantId, 'doc-q', payload);

      expect(updatedIds()).toEqual(['line-1', 'line-2', 'line-1', 'line-2']);
      expect(prisma.documentLine.create).not.toHaveBeenCalled();
      expect(prisma.documentLine.deleteMany).not.toHaveBeenCalled();
    });

    it('rifiuta un id di riga che non appartiene al documento', async () => {
      const service = arrange([savedLine('line-1')]);

      await expect(
        service.update(tenantId, 'doc-q', {
          lines: [inputLine({ id: '11111111-1111-4111-8111-111111111111' })],
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      // Rifiuto PRIMA di scrivere: nessuna riga toccata.
      expect(prisma.documentLine.updateMany).not.toHaveBeenCalled();
      expect(prisma.documentLine.deleteMany).not.toHaveBeenCalled();
      expect(prisma.documentLine.create).not.toHaveBeenCalled();
    });

    it('rifiuta lo stesso id dichiarato da due righe', async () => {
      const service = arrange([savedLine('line-1')]);

      await expect(
        service.update(tenantId, 'doc-q', {
          lines: [inputLine({ id: 'line-1' }), inputLine({ id: 'line-1' })],
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.documentLine.updateMany).not.toHaveBeenCalled();
    });

    it('impone documento e tenant nel where dell’aggiornamento', async () => {
      const service = arrange([savedLine('line-1')]);

      await service.update(tenantId, 'doc-q', { lines: [inputLine({ id: 'line-1' })] });

      const where = (prisma.documentLine.updateMany.mock.calls[0]![0] as { where: object }).where;
      expect(where).toEqual({ id: 'line-1', documentId: 'doc-q', tenantId });
    });

    it('si ferma se la riga è sparita sotto un salvataggio concorrente', async () => {
      const service = arrange([savedLine('line-1')]);
      prisma.documentLine.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.update(tenantId, 'doc-q', { lines: [inputLine({ id: 'line-1' })] }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    // Numero imposto in testata anche in modifica: riscrive numero e
    // riferimento, ma solo quando cambia davvero rispetto al salvato.
    it('riscrive numero e riferimento quando la testata impone un numero nuovo', async () => {
      const { service } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.quote, numberPrefix: 'PRE' }),
      );
      const doc = draftDocumentForNumberUpdate(7);
      prisma.document.findFirst.mockResolvedValueOnce(doc).mockResolvedValueOnce({ ...doc });
      prisma.document.update.mockResolvedValue({ ...doc, lines: [] });

      await service.update(tenantId, 'doc-q', { number: 12 });

      const data = prisma.document.update.mock.calls[0]![0]!.data;
      expect(data.number).toBe(12);
      expect(data.reference).toBe('PRE-A-0012');
    });

    it('non tocca il numero quando la testata rimanda quello già salvato', async () => {
      const { service } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.quote, numberPrefix: 'PRE' }),
      );
      const doc = draftDocumentForNumberUpdate(7);
      prisma.document.findFirst.mockResolvedValueOnce(doc).mockResolvedValueOnce({ ...doc });
      prisma.document.update.mockResolvedValue({ ...doc, lines: [] });

      await service.update(tenantId, 'doc-q', { number: 7 });

      const data = prisma.document.update.mock.calls[0]![0]!.data;
      expect(data.number).toBeUndefined();
      expect(data.reference).toBeUndefined();
    });

    it('rifiuta la modifica di documenti non editabili', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        tenantId,
        type: DocumentType.sales_ddt,
        // Annullato: dopo la rimozione di «Inviata al commercialista» è lo stato
        // non modificabile che resta.
        status: DocumentStatus.cancelled,
        lines: [],
        series: 'A',
        documentDate: new Date('2026-01-01'),
        currency: 'EUR',
        supplierId: null,
        customerId: null,
        locationId: null,
        targetLocationId: null,
        notes: null,
        internalComment: null,
        externalDocNumber: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(service.update(tenantId, 'doc-1', { notes: 'x' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rifiuta PATCH con righe se il documento ha movimenti per riga (nuovo flusso AM)', async () => {
      const { service } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.goods_receipt }),
      );
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-gr-lines',
        tenantId,
        type: DocumentType.goods_receipt,
        status: DocumentStatus.confirmed,
        lines: [],
        series: 'A',
        documentDate: new Date('2026-01-01'),
        currency: 'EUR',
        supplierId: 'sup-1',
        locationId: 'loc-1',
        reference: 'CAR-2026-0001',
        customerId: null,
        targetLocationId: null,
        notes: null,
        internalComment: null,
        externalDocNumber: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      // Almeno un movimento con sourceLineId: il documento va aggiornato solo
      // tramite «Salva documento» (saveGoodsReceipt), mai con PATCH righe.
      prisma.stockMovement.count.mockResolvedValue(1);

      await expect(
        service.update(tenantId, 'doc-gr-lines', {
          lines: [
            {
              description: 'Riga',
              sku: 'SKU-1',
              quantity: 2,
              unitPriceMinor: 1000,
              loadsStock: true,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it('goods_receipt: il PATCH generico viene rifiutato anche in bozza (percorso unico)', async () => {
      const { service } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.goods_receipt }),
      );
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-gr-draft',
        tenantId,
        type: DocumentType.goods_receipt,
        status: DocumentStatus.draft,
        lines: [],
        salesOrder: null,
        supplierOrder: null,
      });

      await expect(
        service.update(tenantId, 'doc-gr-draft', { internalComment: 'nota' }),
      ).rejects.toThrowError(/Salva documento/);
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    // Dalla correzione «movimenti per riga»: la modifica non accoda più una
    // rettifica del delta, ma scrive il movimento della riga con il suo
    // `sourceLineId`. Qui il documento non ha movimenti pregressi nel mock,
    // quindi il sync ne crea uno nuovo per la riga.
    it('sales_ddt confermato: scarico per riga con sourceLineId e revisione registrata', async () => {
      const { service, channelSync } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.sales_ddt }),
      );
      const doc = {
        id: 'doc-ddt',
        tenantId,
        type: DocumentType.sales_ddt,
        status: DocumentStatus.confirmed,
        series: 'A',
        year: 2026,
        reference: 'DDT-2026-0005',
        documentDate: new Date('2026-03-01'),
        currency: 'EUR',
        supplierId: null,
        customerId: 'cust-1',
        locationId: 'loc-1',
        notes: null,
        internalComment: null,
        targetLocationId: null,
        adjustmentDirection: null,
        externalDocNumber: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lines: [
          {
            id: 'l1',
            lineNumber: 1,
            variantId: 'var-1',
            sku: 'SKU-1',
            description: 'Maglia',
            quantity: 5,
            unitPriceMinor: 2000,
            discountPercent: 0,
            lineTotalMinor: 10000,
            loadsStock: true,
            documentId: 'doc-ddt',
            tenantId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };
      prisma.document.findFirst.mockResolvedValueOnce(doc).mockResolvedValueOnce({ ...doc });
      prisma.documentRevision.findFirst.mockResolvedValue(null);
      prisma.inventoryLevel.upsert.mockResolvedValue({});
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.inventoryLevel.findUnique.mockResolvedValue({ onHand: 20, available: 20 });
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.documentLine.deleteMany.mockResolvedValue({ count: 1 });
      // Il salvataggio conserva l'identità della riga: `saved.lines` è la riga
      // `l1` con la quantità nuova, ed è da lì che il sync legge.
      prisma.document.update.mockResolvedValue({
        ...doc,
        lines: [{ ...doc.lines[0], quantity: 8 }],
      });

      await service.update(
        tenantId,
        'doc-ddt',
        {
          lines: [
            {
              id: 'l1',
              description: 'Maglia',
              variantId: 'var-1',
              quantity: 8,
              unitPriceMinor: 2000,
              loadsStock: true,
            },
          ],
        },
        testOwnerUser({ id: 'user-1', displayName: 'Mario' }),
      );

      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'sale',
            variantId: 'var-1',
            quantity: 8,
            sourceLineId: 'l1',
            sourceDocumentId: 'doc-ddt',
            sourceDocumentType: DocumentType.sales_ddt,
          }),
        }),
      );
      expect(prisma.documentRevision.create).toHaveBeenCalled();
      expect(channelSync.pushInventoryLevels).toHaveBeenCalledWith(tenantId, 'var-1', ['loc-1']);
    });

    // Regressione del 15/08, trovata al primo collaudo a schermo: la guardia
    // dei flussi dedicati rifiutava OGNI documento con movimenti per riga. Da
    // quando lo scarico di vendita li ha, un DDT si salvava una volta sola — il
    // primo salvataggio creava i movimenti, il secondo veniva respinto con
    // «aggiornalo dal suo flusso dedicato, non con PATCH». Il DDT il suo flusso
    // dedicato non ce l'ha: è questo.
    it('DDT già convertito ai movimenti per riga: il PATCH continua a salvarlo', async () => {
      const { service } = createService(prisma, resolvedSetting({ type: DocumentType.sales_ddt }));
      const savedLine = {
        id: 'l-ddt',
        lineNumber: 1,
        variantId: 'var-1',
        sku: 'SKU-1',
        description: 'Maglietta',
        quantity: 3,
        unitPriceMinor: 2500,
        discountPercent: 0,
        lineTotalMinor: 7500,
        loadsStock: true,
        documentId: 'doc-ddt2',
        tenantId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const doc = {
        id: 'doc-ddt2',
        tenantId,
        type: DocumentType.sales_ddt,
        status: DocumentStatus.confirmed,
        series: null,
        year: 2026,
        number: 5,
        reference: 'DDT-0005',
        documentDate: new Date('2026-08-15'),
        currency: 'EUR',
        supplierId: null,
        customerId: 'cust-1',
        locationId: 'loc-1',
        targetLocationId: null,
        adjustmentDirection: null,
        notes: null,
        internalComment: null,
        externalDocNumber: null,
        documentDiscountPercent: 0,
        onlineSaleId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lines: [savedLine],
      };
      prisma.document.findFirst.mockResolvedValueOnce(doc).mockResolvedValueOnce({ ...doc });
      prisma.documentRevision.findFirst.mockResolvedValue(null);
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.document.update.mockResolvedValue({ ...doc, lines: [{ ...savedLine, quantity: 2 }] });
      // Il documento ha GIÀ i suoi movimenti per riga: è lo stato in cui la
      // guardia scattava.
      prisma.stockMovement.count.mockResolvedValue(1);
      prisma.stockMovement.findMany.mockImplementation(
        ({ where }: { where: Record<string, unknown> }) =>
          where.sourceLineId === null
            ? Promise.resolve([])
            : Promise.resolve([
                {
                  id: 'mov-ddt',
                  tenantId,
                  type: 'sale',
                  variantId: 'var-1',
                  sku: 'SKU-1',
                  locationId: 'loc-1',
                  quantity: 3,
                  reason: 'DDT vendita DDT-0005',
                  sourceLineId: 'l-ddt',
                  // Colonne NOT NULL: un movimento letto dal database porta
                  // sempre i due costi, zero compreso.
                  unitCostMinor: 0,
                  totalCostMinor: 0,
                  createdAt: new Date('2026-08-15T16:00:00.000Z'),
                },
              ]),
      );

      await service.update(tenantId, 'doc-ddt2', {
        lines: [
          {
            id: 'l-ddt',
            description: 'Maglietta',
            variantId: 'var-1',
            quantity: 2,
            unitPriceMinor: 2500,
            loadsStock: true,
          },
        ],
      });

      expect(prisma.stockMovement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'mov-ddt' },
          data: expect.objectContaining({ quantity: 2 }),
        }),
      );
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    // Il difetto misurato il 15/08: l'accompagnatoria scaricava alla conferma e
    // poi, se modificata, NON riconciliava nulla — documento e magazzino
    // divergevano in silenzio. Nessuna accompagnatoria esisteva ancora nel
    // database, quindi il difetto non era mai stato incontrato.
    it('accompagnatoria confermata e modificata: il suo movimento si aggiorna, non diverge', async () => {
      const { service } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.invoice_accompanying, numberPrefix: 'FTA' }),
      );
      const savedLine = {
        id: 'l-acc',
        lineNumber: 1,
        variantId: 'var-1',
        sku: 'SKU-1',
        description: 'Maglia',
        quantity: 3,
        unitPriceMinor: 2000,
        discountPercent: 0,
        lineTotalMinor: 6000,
        loadsStock: true,
        documentId: 'doc-acc',
        tenantId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const doc = {
        id: 'doc-acc',
        tenantId,
        type: DocumentType.invoice_accompanying,
        status: DocumentStatus.confirmed,
        series: 'A',
        year: 2026,
        number: 3,
        reference: 'FTA-0003',
        documentDate: new Date('2026-08-15'),
        currency: 'EUR',
        supplierId: null,
        customerId: 'cust-1',
        locationId: 'loc-1',
        targetLocationId: null,
        adjustmentDirection: null,
        notes: null,
        internalComment: null,
        externalDocNumber: null,
        documentDiscountPercent: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        lines: [savedLine],
      };
      prisma.document.findFirst.mockResolvedValueOnce(doc).mockResolvedValueOnce({ ...doc });
      prisma.documentRevision.findFirst.mockResolvedValue(null);
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.document.update.mockResolvedValue({
        ...doc,
        lines: [{ ...savedLine, quantity: 2 }],
      });
      // Il movimento nato alla conferma, collegato alla riga.
      prisma.stockMovement.findMany.mockImplementation(
        ({ where }: { where: Record<string, unknown> }) =>
          where.sourceLineId === null
            ? Promise.resolve([])
            : Promise.resolve([
                {
                  id: 'mov-acc',
                  tenantId,
                  type: 'sale',
                  variantId: 'var-1',
                  sku: 'SKU-1',
                  locationId: 'loc-1',
                  quantity: 3,
                  reason: 'Fattura accompagnatoria FTA-0003',
                  sourceLineId: 'l-acc',
                  // Colonne NOT NULL: un movimento letto dal database porta
                  // sempre i due costi, zero compreso.
                  unitCostMinor: 0,
                  totalCostMinor: 0,
                  createdAt: new Date('2026-08-15T09:00:00.000Z'),
                },
              ]),
      );

      await service.update(tenantId, 'doc-acc', {
        lines: [
          {
            id: 'l-acc',
            description: 'Maglia',
            variantId: 'var-1',
            quantity: 2,
            unitPriceMinor: 2000,
            loadsStock: true,
          },
        ],
      });

      // Lo stesso movimento passa a 2, e un pezzo torna in giacenza.
      expect(prisma.stockMovement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'mov-acc' },
          data: expect.objectContaining({ quantity: 2 }),
        }),
      );
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
      expect(prisma.inventoryLevel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ variantId: 'var-1', locationId: 'loc-1' }),
          data: expect.objectContaining({ onHand: { increment: 1 } }),
        }),
      );
    });

    it('transfer confermato: riconcilia movimenti transfer', async () => {
      const { service } = createService(prisma, resolvedSetting({ type: DocumentType.transfer }));
      const doc = {
        id: 'doc-tr',
        tenantId,
        type: DocumentType.transfer,
        status: DocumentStatus.confirmed,
        series: 'A',
        year: 2026,
        reference: 'TR-2026-0002',
        documentDate: new Date('2026-03-01'),
        currency: 'EUR',
        supplierId: null,
        customerId: null,
        locationId: 'loc-a',
        targetLocationId: 'loc-b',
        adjustmentDirection: null,
        internalComment: null,
        externalDocNumber: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lines: [
          {
            id: 'l1',
            lineNumber: 1,
            variantId: 'var-1',
            sku: 'SKU-1',
            description: 'Maglia',
            quantity: 2,
            unitPriceMinor: 0,
            discountPercent: 0,
            lineTotalMinor: 0,
            loadsStock: true,
            documentId: 'doc-tr',
            tenantId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };
      prisma.document.findFirst.mockResolvedValueOnce(doc).mockResolvedValueOnce({ ...doc });
      prisma.documentRevision.findFirst.mockResolvedValue(null);
      prisma.inventoryLevel.upsert.mockResolvedValue({});
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.inventoryLevel.findUnique.mockResolvedValue({ onHand: 10, available: 10 });
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.documentLine.deleteMany.mockResolvedValue({ count: 1 });
      prisma.document.update.mockResolvedValue({ ...doc, lines: doc.lines });

      await service.update(tenantId, 'doc-tr', {
        lines: [
          {
            description: 'Maglia',
            variantId: 'var-1',
            quantity: 5,
            loadsStock: true,
          },
        ],
      });

      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'transfer',
            quantity: 3,
          }),
        }),
      );
      expect(prisma.documentRevision.create).toHaveBeenCalled();
    });

    it('manual_unload confermato: riconcilia vendita manuale', async () => {
      const { service } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.manual_unload }),
      );
      const doc = {
        id: 'doc-sca',
        tenantId,
        type: DocumentType.manual_unload,
        status: DocumentStatus.confirmed,
        series: 'A',
        year: 2026,
        reference: 'SCA-2026-0001',
        documentDate: new Date('2026-03-01'),
        currency: 'EUR',
        supplierId: null,
        customerId: null,
        locationId: 'loc-1',
        targetLocationId: null,
        adjustmentDirection: null,
        internalComment: 'Campione',
        externalDocNumber: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lines: [
          {
            id: 'l1',
            lineNumber: 1,
            variantId: 'var-1',
            sku: 'SKU-1',
            description: 'Maglia',
            quantity: 2,
            unitPriceMinor: 0,
            discountPercent: 0,
            lineTotalMinor: 0,
            loadsStock: true,
            documentId: 'doc-sca',
            tenantId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };
      prisma.document.findFirst.mockResolvedValueOnce(doc).mockResolvedValueOnce({ ...doc });
      prisma.documentRevision.findFirst.mockResolvedValue(null);
      prisma.inventoryLevel.upsert.mockResolvedValue({});
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.inventoryLevel.findUnique.mockResolvedValue({ onHand: 10, available: 10 });
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.documentLine.deleteMany.mockResolvedValue({ count: 1 });
      prisma.document.update.mockResolvedValue({ ...doc, lines: doc.lines });

      // ⚠️ L’utente ora serve: dal 26/08/2026 modificare una Vendita manuale
      //   richiede che la funzione sia ACCESA per l’azienda, e il flag viaggia
      //   sul profilo. Senza utente il servizio rifiuta — fail-closed voluto,
      //   perche' l'interruttore e' una misura di sicurezza.
      await service.update(
        tenantId,
        'doc-sca',
        {
          lines: [
            {
              description: 'Maglia',
              variantId: 'var-1',
              quantity: 4,
              loadsStock: true,
            },
          ],
        },
        testOwnerUser(),
      );

      // Deroga prompt Vendita manuale: riconciliazione a delta diretto
      // (2 → 4 scarica solo -2) SENZA creare movimenti.
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
      expect(prisma.inventoryLevel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ variantId: 'var-1', locationId: 'loc-1' }),
          data: { onHand: { increment: -2 }, available: { increment: -2 } },
        }),
      );
      expect(prisma.documentRevision.create).toHaveBeenCalled();
    });

    it('adjustment confermato: riconcilia rettifica inventario', async () => {
      const { service } = createService(prisma, resolvedSetting({ type: DocumentType.adjustment }));
      const doc = {
        id: 'doc-ret',
        tenantId,
        type: DocumentType.adjustment,
        status: DocumentStatus.confirmed,
        series: 'A',
        year: 2026,
        reference: 'RET-2026-0001',
        documentDate: new Date('2026-03-01'),
        currency: 'EUR',
        supplierId: null,
        customerId: null,
        locationId: 'loc-1',
        targetLocationId: null,
        adjustmentDirection: 'increase',
        internalComment: 'Conteggio',
        externalDocNumber: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lines: [
          {
            id: 'l1',
            lineNumber: 1,
            variantId: 'var-1',
            sku: 'SKU-1',
            description: 'Maglia',
            quantity: 2,
            unitPriceMinor: 0,
            discountPercent: 0,
            lineTotalMinor: 0,
            loadsStock: true,
            documentId: 'doc-ret',
            tenantId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };
      prisma.document.findFirst.mockResolvedValueOnce(doc).mockResolvedValueOnce({ ...doc });
      prisma.documentRevision.findFirst.mockResolvedValue(null);
      prisma.inventoryLevel.upsert.mockResolvedValue({});
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.inventoryLevel.findUnique.mockResolvedValue({ onHand: 10, available: 10 });
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.documentLine.deleteMany.mockResolvedValue({ count: 1 });
      prisma.document.update.mockResolvedValue({ ...doc, lines: doc.lines });

      await service.update(tenantId, 'doc-ret', {
        lines: [
          {
            description: 'Maglia',
            variantId: 'var-1',
            quantity: 5,
            loadsStock: true,
          },
        ],
      });

      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'adjustment',
            direction: 'increase',
            quantity: 3,
          }),
        }),
      );
      expect(prisma.documentRevision.create).toHaveBeenCalled();
    });

    it('rifiuta PATCH con righe se un trasferimento ha già movimenti per riga (bypass generico, mirror arrivo merce)', async () => {
      const { service } = createService(prisma, resolvedSetting({ type: DocumentType.transfer }));
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-tr-lines',
        tenantId,
        type: DocumentType.transfer,
        status: DocumentStatus.confirmed,
        lines: [],
        series: 'A',
        documentDate: new Date('2026-01-01'),
        currency: 'EUR',
        supplierId: null,
        customerId: null,
        locationId: 'loc-a',
        targetLocationId: 'loc-b',
        notes: null,
        internalComment: null,
        externalDocNumber: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      // Almeno un movimento con sourceLineId: mirror del gate arrivo merce,
      // type-agnostico su documents.service.ts (§ verifica esplicita).
      prisma.stockMovement.count.mockResolvedValue(1);

      await expect(
        service.update(tenantId, 'doc-tr-lines', {
          lines: [
            {
              description: 'Riga',
              sku: 'SKU-1',
              quantity: 2,
              unitPriceMinor: 0,
              loadsStock: true,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it('rifiuta PATCH con righe se una rettifica ha già movimenti per riga (bypass generico, mirror arrivo merce)', async () => {
      const { service } = createService(prisma, resolvedSetting({ type: DocumentType.adjustment }));
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-ret-lines',
        tenantId,
        type: DocumentType.adjustment,
        status: DocumentStatus.confirmed,
        lines: [],
        series: 'A',
        documentDate: new Date('2026-01-01'),
        currency: 'EUR',
        supplierId: null,
        customerId: null,
        locationId: 'loc-1',
        targetLocationId: null,
        adjustmentDirection: 'increase',
        notes: null,
        internalComment: 'Conteggio',
        externalDocNumber: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.stockMovement.count.mockResolvedValue(1);

      await expect(
        service.update(tenantId, 'doc-ret-lines', {
          lines: [
            {
              description: 'Riga',
              sku: 'SKU-1',
              quantity: 2,
              unitPriceMinor: 0,
              loadsStock: true,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it('trasferimento con movimenti per riga esistenti: PATCH senza righe non riconcilia in modo aggregato', async () => {
      const { service } = createService(prisma, resolvedSetting({ type: DocumentType.transfer }));
      const doc = {
        id: 'doc-tr-hdr',
        tenantId,
        type: DocumentType.transfer,
        status: DocumentStatus.confirmed,
        series: 'A',
        year: 2026,
        reference: 'TR-2026-0003',
        documentDate: new Date('2026-03-01'),
        currency: 'EUR',
        supplierId: null,
        customerId: null,
        locationId: 'loc-a',
        targetLocationId: 'loc-b',
        adjustmentDirection: null,
        internalComment: null,
        externalDocNumber: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lines: [
          {
            id: 'l1',
            lineNumber: 1,
            variantId: 'var-1',
            sku: 'SKU-1',
            description: 'Maglia',
            quantity: 2,
            unitPriceMinor: 0,
            discountPercent: 0,
            lineTotalMinor: 0,
            loadsStock: true,
            documentId: 'doc-tr-hdr',
            tenantId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };
      prisma.document.findFirst.mockResolvedValueOnce(doc).mockResolvedValueOnce({ ...doc });
      // Il documento ha già movimenti per riga (creati da confirm() o dal
      // salvataggio dedicato): il PATCH generico, pur senza righe, NON deve
      // ri-generare movimenti aggregati.
      prisma.stockMovement.count.mockResolvedValue(1);
      prisma.documentRevision.findFirst.mockResolvedValue(null);
      prisma.document.update.mockResolvedValue({ ...doc, internalComment: 'nuova nota interna' });

      await service.update(tenantId, 'doc-tr-hdr', { internalComment: 'nuova nota interna' });

      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });
  });

  describe('percorso unico arrivo merce (guard su update/confirm)', () => {
    it('update rifiuta i tipi a workflow dedicato anche in bozza', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-gr-1',
        tenantId,
        type: DocumentType.goods_receipt,
        status: DocumentStatus.draft,
        lines: [],
        salesOrder: null,
        supplierOrder: null,
      });

      await expect(
        service.update(tenantId, 'doc-gr-1', { internalComment: 'x' }),
      ).rejects.toThrowError(/Salva documento/);
    });

    it('confirm rifiuta i tipi a workflow dedicato anche in bozza', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-gr-1',
        tenantId,
        type: DocumentType.goods_receipt,
        status: DocumentStatus.draft,
        lines: [{ id: 'l1', lineNumber: 1, quantity: 1, loadsStock: true, variantId: 'var-1' }],
      });

      await expect(service.confirm(tenantId, 'doc-gr-1')).rejects.toThrowError(/Salva documento/);
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });
  });

  describe('getById', () => {
    it('include linkedSupplierOrderLines quando il documento ha ordine fornitore', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-gr-1',
        tenantId,
        type: DocumentType.goods_receipt,
        status: DocumentStatus.draft,
        lines: [],
        salesOrder: null,
        supplierOrder: {
          id: 'po-1',
          reference: 'OF-2026-001',
          lines: [
            {
              id: 'pol-1',
              variantId: 'var-1',
              sku: 'SKU-1',
              orderedQuantity: 10,
              receivedQuantity: 3,
            },
          ],
        },
      });

      const detail = await service.getById(tenantId, 'doc-gr-1');

      expect(detail.linkedSupplierOrder).toEqual({ id: 'po-1', reference: 'OF-2026-001' });
      expect(detail.linkedSupplierOrderLines).toEqual([
        {
          id: 'pol-1',
          variantId: 'var-1',
          sku: 'SKU-1',
          orderedQuantity: 10,
          receivedQuantity: 3,
        },
      ]);
    });

    it('rifiuta con ForbiddenException l’apertura diretta di un documento su una sede non autorizzata', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-gr-2',
        tenantId,
        type: DocumentType.goods_receipt,
        status: DocumentStatus.confirmed,
        locationId: 'loc-9',
        lines: [],
        salesOrder: null,
        supplierOrder: null,
      });
      const clerk = testClerkUser({ assignedLocationIds: ['loc-1'] });

      await expect(service.getById(tenantId, 'doc-gr-2', clerk)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('consente l’apertura diretta sulla sede assegnata', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-gr-3',
        tenantId,
        type: DocumentType.goods_receipt,
        status: DocumentStatus.confirmed,
        locationId: 'loc-1',
        lines: [],
        salesOrder: null,
        supplierOrder: null,
      });
      const clerk = testClerkUser({ assignedLocationIds: ['loc-1'] });

      await expect(service.getById(tenantId, 'doc-gr-3', clerk)).resolves.toMatchObject({
        id: 'doc-gr-3',
      });
    });

    it('non applica alcun controllo location per documenti senza locationId (es. fattura)', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-inv-1',
        tenantId,
        type: DocumentType.invoice,
        status: DocumentStatus.confirmed,
        locationId: null,
        lines: [],
        salesOrder: null,
        supplierOrder: null,
      });
      const clerk = testClerkUser({ assignedLocationIds: ['loc-1'] });

      await expect(service.getById(tenantId, 'doc-inv-1', clerk)).resolves.toMatchObject({
        id: 'doc-inv-1',
      });
    });
  });

  describe('enforcement location sulle mutazioni (utente multi-sede)', () => {
    // Clerk con view_all_locations: può LEGGERE ogni sede (getById passa) ma
    // non scrivere fuori dalle sedi assegnate → isola il gate di scrittura.
    const clerkViewAll = () =>
      testClerkUser({
        assignedLocationIds: ['loc-A'],
        permissions: [
          TenantPermission.InventoryManage,
          TenantPermission.InventoryViewAllLocations,
          // Matrice documenti: le mutazioni sotto toccano DDT e trasferimenti,
          // il test isola il gate di SEDE, non quello di tipo.
          'doc.sales_ddt.manage',
          'doc.transfer.manage',
          'doc.invoice.manage',
        ],
      });

    const docInLocB = (overrides: Record<string, unknown> = {}) => ({
      id: 'doc-b',
      tenantId,
      type: DocumentType.sales_ddt,
      status: DocumentStatus.draft,
      locationId: 'loc-B',
      targetLocationId: null,
      lines: [],
      salesOrder: null,
      supplierOrder: null,
      ...overrides,
    });

    it('update rifiuta con 403 un documento di una sede non assegnata', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue(docInLocB());

      await expect(
        service.update(tenantId, 'doc-b', { internalComment: 'x' }, clerkViewAll()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it('confirm rifiuta con 403 un documento di una sede non assegnata', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue(
        docInLocB({
          lines: [{ id: 'l1', lineNumber: 1, variantId: 'var-1', quantity: 1, loadsStock: true }],
        }),
      );

      await expect(service.confirm(tenantId, 'doc-b', clerkViewAll())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('cancel rifiuta con 403 un documento di una sede non assegnata', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue(docInLocB({ status: DocumentStatus.confirmed }));

      await expect(service.cancel(tenantId, 'doc-b', clerkViewAll())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it('delete rifiuta con 403 un documento di una sede non assegnata', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue(docInLocB());

      await expect(service.delete(tenantId, 'doc-b', clerkViewAll())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.document.delete).not.toHaveBeenCalled();
    });

    it('convertPrefill rifiuta con 403 una proforma di una sede non assegnata', async () => {
      const { service } = createService(prisma, resolvedSetting({ type: DocumentType.proforma }));
      prisma.document.findFirst.mockResolvedValue(
        docInLocB({
          type: DocumentType.proforma,
          lines: [{ id: 'l1', lineNumber: 1, quantity: 1, unitPriceMinor: 100 }],
        }),
      );

      await expect(
        service.convertPrefill(
          tenantId,
          'doc-b',
          { targetType: DocumentType.sales_ddt },
          clerkViewAll(),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.document.create).not.toHaveBeenCalled();
    });

    it('listRevisions rifiuta con 403 un documento di una sede non autorizzata in lettura', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue(docInLocB());
      const clerk = testClerkUser({ assignedLocationIds: ['loc-A'] });

      await expect(service.listRevisions(tenantId, 'doc-b', clerk)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.documentRevision.findMany).not.toHaveBeenCalled();
    });

    it('assertWritableById rifiuta con 403 la sede fuori scope e passa sulla sede assegnata', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue(docInLocB());

      await expect(
        service.assertWritableById(tenantId, 'doc-b', clerkViewAll()),
      ).rejects.toBeInstanceOf(ForbiddenException);

      prisma.document.findFirst.mockResolvedValue(docInLocB({ locationId: 'loc-A' }));
      await expect(
        service.assertWritableById(tenantId, 'doc-b', clerkViewAll()),
      ).resolves.toMatchObject({ id: 'doc-b' });
    });

    it('trasferimento: la destinazione fuori dalle sedi assegnate resta consentita (transferDestination)', async () => {
      const { service } = createService(prisma, resolvedSetting({ type: DocumentType.transfer }));
      prisma.document.findFirst.mockResolvedValue(
        docInLocB({
          type: DocumentType.transfer,
          locationId: 'loc-A',
          targetLocationId: 'loc-B',
        }),
      );

      await expect(
        service.assertWritableById(tenantId, 'doc-b', clerkViewAll()),
      ).resolves.toMatchObject({ id: 'doc-b' });
    });

    it('non blocca le mutazioni dei documenti senza sede (es. fattura)', async () => {
      const { service } = createService(prisma, resolvedSetting({ type: DocumentType.invoice }));
      prisma.document.findFirst.mockResolvedValue(
        docInLocB({ type: DocumentType.invoice, locationId: null }),
      );
      prisma.document.delete.mockResolvedValue({ id: 'doc-b' });

      await service.delete(tenantId, 'doc-b', clerkViewAll());

      expect(prisma.document.delete).toHaveBeenCalledWith({ where: { id: 'doc-b' } });
    });

    /**
     * ⛔ **P0 — si autorizzava la sede vecchia e si scriveva nella nuova.**
     *
     * `assertDocumentLocationWritable(user, doc)` autorizza il documento
     * COM'ERA. Ma `dto.locationId` può cambiarne la sede, e da lì in poi è
     * quella nuova a decidere dove vanno movimenti, giacenze e push ai canali.
     * Le sedi in ingresso erano validate per esistenza e tenant, non per
     * l'ambito dell'utente.
     *
     * L'attacco: apro un MIO documento della sede A — il gate passa, A è mia —
     * lo salvo con sede B, e muovo il magazzino di B.
     *
     * ⭐ La correzione autorizza anche lo stato RISULTANTE, nel punto in cui
     * viene costruito e prima di qualunque scrittura.
     */
    describe('P0 — la sede risultante dalla modifica', () => {
      const docInLocA = (overrides: Record<string, unknown> = {}) => ({
        id: 'doc-a',
        tenantId,
        type: DocumentType.sales_ddt,
        status: DocumentStatus.draft,
        locationId: 'loc-A',
        targetLocationId: null,
        lines: [],
        salesOrder: null,
        supplierOrder: null,
        ...overrides,
      });

      const preparaDocumento = (doc: Record<string, unknown>) => {
        prisma.document.findFirst.mockResolvedValue(doc);
        prisma.document.update.mockResolvedValue({ ...doc, lines: [] });
        // Le sedi ESISTONO nel tenant: è il punto. La validazione di esistenza
        // passa, e resta da decidere se l'utente possa scriverci.
        prisma.location.findFirst.mockResolvedValue({ id: 'loc-B' });
      };

      /**
       * Il soggetto è il GATE DI SEDE, non l'intero salvataggio: il mock non
       * arriva in fondo a un update completo, e non serve che ci arrivi.
       * Restituisce l'errore, o `null` se è andato a buon fine.
       */
      const esitoDi = (p: Promise<unknown>): Promise<unknown> =>
        p.then(
          () => null,
          (errore: unknown) => errore,
        );

      it('⛔ A → B con diritto di scrittura sulla sola A: RIFIUTATO', async () => {
        const { service } = createService(prisma);
        preparaDocumento(docInLocA());

        await expect(
          service.update(tenantId, 'doc-a', { locationId: 'loc-B' }, clerkViewAll()),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });

      // ⭐ Il criterio che rende la correzione utile: il rifiuto arriva PRIMA di
      // ogni effetto. Un 403 dopo aver mosso il magazzino non è una protezione.
      it('⛔ e dopo il rifiuto: zero update, zero movimenti', async () => {
        const { service } = createService(prisma);
        preparaDocumento(docInLocA());

        await expect(
          service.update(tenantId, 'doc-a', { locationId: 'loc-B' }, clerkViewAll()),
        ).rejects.toBeInstanceOf(ForbiddenException);

        expect(prisma.document.update).not.toHaveBeenCalled();
        expect(prisma.stockMovement.create).not.toHaveBeenCalled();
      });

      /**
       * ⚠️ `inventory.view_all_locations` LEGGE ovunque, non SCRIVE ovunque.
       * `clerkViewAll` ce l'ha e ha `loc-A` assegnata: se il gate usasse per
       * sbaglio la politica di lettura, questo test diventerebbe verde con la
       * porta aperta.
       */
      it('⛔ leggere ovunque non autorizza a spostare il documento altrove', async () => {
        const { service } = createService(prisma);
        preparaDocumento(docInLocA());

        await expect(
          service.update(tenantId, 'doc-a', { locationId: 'loc-B' }, clerkViewAll()),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });

      it('✅ A → resta A: il gate di sede non rifiuta', async () => {
        const { service } = createService(prisma);
        preparaDocumento(docInLocA());

        const esito = await esitoDi(
          service.update(tenantId, 'doc-a', { internalComment: 'nota' }, clerkViewAll()),
        );

        expect(esito).not.toBeInstanceOf(ForbiddenException);
      });

      it('✅ A → B per chi ha scrittura su ENTRAMBE: il gate non rifiuta', async () => {
        const { service } = createService(prisma);
        preparaDocumento(docInLocA());
        const multisede = testClerkUser({
          assignedLocationIds: ['loc-A', 'loc-B'],
          permissions: [TenantPermission.InventoryManage, 'doc.sales_ddt.manage'],
        });

        const esito = await esitoDi(
          service.update(tenantId, 'doc-a', { locationId: 'loc-B' }, multisede),
        );

        expect(esito).not.toBeInstanceOf(ForbiddenException);
      });

      // Idempotenza: rimandare la sede che c'è già non diventa un rifiuto.
      it('✅ rimandare la stessa sede non rifiuta', async () => {
        const { service } = createService(prisma);
        preparaDocumento(docInLocA());

        const esito = await esitoDi(
          service.update(tenantId, 'doc-a', { locationId: 'loc-A' }, clerkViewAll()),
        );

        expect(esito).not.toBeInstanceOf(ForbiddenException);
      });

      /**
       * ⚠️ **Comportamento PRESERVATO, non norma dedotta qui.**
       *
       * `assertLocationInUserScope` esenta deliberatamente la destinazione di un
       * trasferimento: `if (purpose === 'transferDestination') return;`. La
       * correzione riusa la politica esistente e non la cambia — se quella
       * esenzione sia voluta è una decisione da confermare a parte, insieme al
       * caso «record senza sede».
       */
      it('la destinazione di un trasferimento resta esente: policy preservata', async () => {
        const { service } = createService(prisma);
        preparaDocumento(docInLocA({ type: DocumentType.transfer, targetLocationId: 'loc-A' }));
        const soloA = testClerkUser({
          assignedLocationIds: ['loc-A'],
          permissions: [TenantPermission.InventoryManage, 'doc.transfer.manage'],
        });

        const esito = await esitoDi(
          service.update(tenantId, 'doc-a', { targetLocationId: 'loc-B' }, soloA),
        );

        expect(esito).not.toBeInstanceOf(ForbiddenException);
      });

      // ⭐ Ma la SORGENTE del trasferimento no: quella è soggetta a `write`.
      it('⛔ la sorgente del trasferimento NON è esente', async () => {
        const { service } = createService(prisma);
        preparaDocumento(docInLocA({ type: DocumentType.transfer, targetLocationId: 'loc-A' }));
        const soloA = testClerkUser({
          assignedLocationIds: ['loc-A'],
          permissions: [TenantPermission.InventoryManage, 'doc.transfer.manage'],
        });

        await expect(
          service.update(tenantId, 'doc-a', { locationId: 'loc-B' }, soloA),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });
    });

    /**
     * ⛔ **Ogni DDT agganciato dev'essere un DDT che l'utente potrebbe aprire.**
     *
     * `linkedSalesDdtIds` è un array di UUID che arriva dal client. Prima del
     * 28/08/2026 gli id erano risolti con
     * `where: { id: { in }, tenantId, type: sales_ddt, cancelledAt: null }` e
     * `select: { id: true }`: la sede non era né letta né confrontata, quindi un
     * DDT di un'altra sede — per il resto valido — veniva **agganciato**.
     *
     * ⚠️ Che la Fattura abbia una propria sede autorizzata non autorizza i DDT:
     * sono documenti distinti, ciascuno con la sua.
     */
    describe('P0 — la sede dei DDT agganciati alla fattura differita', () => {
      const SEDE_MIA = 'loc-A';
      const SEDE_ALTRUI = 'loc-B';

      const limitato = () =>
        testClerkUser({
          assignedLocationIds: [SEDE_MIA],
          permissions: [TenantPermission.InventoryManage, 'doc.invoice.manage'],
        });

      /**
       * La forma che la query SELEZIONA, non quella del caso felice: la
       * `findMany` dei DDT agganciati legge `type` e `cancelledAt` proprio
       * per poterli scartare, quindi un DDT trovato può avere qualunque tipo
       * ed essere annullato. Stretta a `sales_ddt`/`null`, la fixture non
       * poteva esprimere i casi che il test deve coprire.
       */
      type DdtTrovato = {
        readonly id: string;
        readonly locationId: string | null;
        readonly type: DocumentType;
        readonly cancelledAt: Date | null;
      };

      const ddt = (id: string, locationId: string | null): DdtTrovato => ({
        id,
        locationId,
        type: DocumentType.sales_ddt,
        cancelledAt: null,
      });

      const fattura = () => ({
        id: 'inv-1',
        tenantId,
        type: DocumentType.invoice,
        status: DocumentStatus.draft,
        locationId: SEDE_MIA,
        targetLocationId: null,
        documentDate: new Date('2026-08-01'),
        series: null,
        number: null,
        reference: null,
        lines: [],
        salesOrder: null,
        supplierOrder: null,
        linkedSalesOrders: [],
      });

      function preparaFattura(ddtTrovati: readonly DdtTrovato[]) {
        prisma.document.findFirst.mockResolvedValue(fattura());
        prisma.document.update.mockResolvedValue({ ...fattura(), lines: [] });
        prisma.location.findFirst.mockResolvedValue({ id: SEDE_MIA });
        prisma.document.findMany.mockResolvedValue(ddtTrovati);
      }

      const esitoDi = (p: Promise<unknown>): Promise<unknown> =>
        p.then(
          () => null,
          (errore: unknown) => errore,
        );

      it('✅ un DDT della propria sede: il gate non rifiuta', async () => {
        const { service } = createService(prisma);
        preparaFattura([ddt('ddt-1', SEDE_MIA)]);

        const esito = await esitoDi(
          service.update(tenantId, 'inv-1', { linkedSalesDdtIds: ['ddt-1'] }, limitato()),
        );

        expect(esito).not.toBeInstanceOf(ForbiddenException);
      });

      it('✅ più DDT tutti autorizzati: il gate non rifiuta', async () => {
        const { service } = createService(prisma);
        preparaFattura([ddt('ddt-1', SEDE_MIA), ddt('ddt-2', SEDE_MIA)]);

        const esito = await esitoDi(
          service.update(
            tenantId,
            'inv-1',
            { linkedSalesDdtIds: ['ddt-1', 'ddt-2'] },
            limitato(),
          ),
        );

        expect(esito).not.toBeInstanceOf(ForbiddenException);
      });

      /**
       * ⭐ **Il DDT fuori ambito NON è il primo dell'array**, ed è deliberato:
       * un controllo che si fermasse al primo id passerebbe questo test se il
       * fuori-ambito fosse in testa. Qui è in mezzo.
       */
      it('⛔ un solo DDT fuori ambito fra tre: l’operazione INTERA è rifiutata', async () => {
        const { service } = createService(prisma);
        preparaFattura([
          ddt('ddt-1', SEDE_MIA),
          ddt('ddt-2', SEDE_ALTRUI),
          ddt('ddt-3', SEDE_MIA),
        ]);

        await expect(
          service.update(
            tenantId,
            'inv-1',
            { linkedSalesDdtIds: ['ddt-1', 'ddt-2', 'ddt-3'] },
            limitato(),
          ),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });

      it('⛔ e nessun collegamento viene creato o cancellato', async () => {
        const { service } = createService(prisma);
        preparaFattura([ddt('ddt-1', SEDE_MIA), ddt('ddt-2', SEDE_ALTRUI)]);

        await expect(
          service.update(
            tenantId,
            'inv-1',
            { linkedSalesDdtIds: ['ddt-1', 'ddt-2'] },
            limitato(),
          ),
        ).rejects.toBeInstanceOf(ForbiddenException);

        expect(prisma.invoiceSalesDdtLink.createMany).not.toHaveBeenCalled();
        expect(prisma.invoiceSalesDdtLink.deleteMany).not.toHaveBeenCalled();
      });

      it('⛔ DDT di un altro tenant: non si trova, messaggio generico', async () => {
        const { service } = createService(prisma);
        preparaFattura([]);

        await expect(
          service.update(tenantId, 'inv-1', { linkedSalesDdtIds: ['ddt-x'] }, limitato()),
        ).rejects.toBeInstanceOf(UnprocessableEntityException);
      });

      it('✅ chi ha inventory.view_all_locations aggancia qualunque sede', async () => {
        const { service } = createService(prisma);
        preparaFattura([ddt('ddt-1', SEDE_ALTRUI)]);
        const supervisore = testClerkUser({
          assignedLocationIds: [SEDE_MIA],
          permissions: [
            TenantPermission.InventoryManage,
            TenantPermission.InventoryViewAllLocations,
            'doc.invoice.manage',
          ],
        });

        const esito = await esitoDi(
          service.update(tenantId, 'inv-1', { linkedSalesDdtIds: ['ddt-1'] }, supervisore),
        );

        expect(esito).not.toBeInstanceOf(ForbiddenException);
      });

      /**
       * ⭐ **Il DDT fuori ambito non è un oracolo sulla propria condizione.**
       *
       * Questi DDT sono di sede altrui **e** non collegabili — tipo sbagliato o
       * annullato. Se il controllo di sede stesse dopo, la risposta direbbe
       * «non esiste, non è un DDT o è annullato», rivelando una condizione di un
       * documento che il richiedente non può vedere.
       */
      it.each([
        ['tipo sbagliato', { type: DocumentType.invoice }],
        ['annullato', { cancelledAt: new Date('2026-08-01') }],
      ])(
        '⛔ DDT fuori ambito e %s: risponde 403, non la condizione',
        async (_caso, extra) => {
          const { service } = createService(prisma);
          preparaFattura([{ ...ddt('ddt-1', SEDE_ALTRUI), ...extra }]);

          await expect(
            service.update(tenantId, 'inv-1', { linkedSalesDdtIds: ['ddt-1'] }, limitato()),
          ).rejects.toBeInstanceOf(ForbiddenException);
        },
      );

      // ⚠️ Comportamento PRESERVATO: un DDT senza sede non ha nulla da
      // confrontare. Non è una decisione presa qui.
      it('DDT senza sede: passa, policy preservata', async () => {
        const { service } = createService(prisma);
        preparaFattura([ddt('ddt-1', null)]);

        const esito = await esitoDi(
          service.update(tenantId, 'inv-1', { linkedSalesDdtIds: ['ddt-1'] }, limitato()),
        );

        expect(esito).not.toBeInstanceOf(ForbiddenException);
      });
    });
  });

  describe('previewNextReference', () => {
    it('calcola anteprima come massimo esistente + 1, senza scrivere nulla', async () => {
      const { service } = createService(
        prisma,
        resolvedSetting({
          type: DocumentType.goods_receipt,
          numberPrefix: 'CAR',
          defaultSeries: 'A',
        }),
      );
      prisma.document.aggregate.mockResolvedValue({ _max: { number: 44 } });

      const preview = await service.previewNextReference(tenantId, DocumentType.goods_receipt, 'A');

      expect(preview).toEqual({
        reference: 'CAR-A-0045',
        previewNumber: 45,
        series: 'A',
      });
      // L'anteprima non consuma il numero: nessuna scrittura.
      expect(prisma.document.update).not.toHaveBeenCalled();
      expect(prisma.document.create).not.toHaveBeenCalled();
    });

    it('usa 1 come primo numero se la serie è ancora vuota', async () => {
      const { service } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.goods_receipt, numberPrefix: 'CAR' }),
      );
      prisma.document.aggregate.mockResolvedValue({ _max: { number: null } });

      const preview = await service.previewNextReference(tenantId, DocumentType.goods_receipt);

      expect(preview.previewNumber).toBe(1);
      // Nessun contatore predefinito nel mock → senza serie → PREFISSO-NUMERO.
      expect(preview.reference).toBe('CAR-0001');
    });
  });

  describe('delete', () => {
    it('consente l’eliminazione di una bozza', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        status: DocumentStatus.draft,
        lines: [],
      });
      prisma.document.delete.mockResolvedValue({ id: 'doc-1' });

      await service.delete(tenantId, 'doc-1');

      expect(prisma.document.delete).toHaveBeenCalledWith({ where: { id: 'doc-1' } });
    });

    /**
     * ⭐ Passo 14, 22/08/2026. Qui c'era il contrario — «rifiuta l'eliminazione
     * delle vendite al banco» — e quel rifiuto era il PRIMO di tre cancelli:
     * gli altri due erano il gate di stato (un documento del banco nasce
     * `confirmed`) e l'assenza dai tipi che stornano, che l'avrebbe fatto uscire
     * senza restituire la merce.
     *
     * ⛔ La prova guarda le due cose insieme: che il documento sparisca **e**
     * che i movimenti passino dal motore di neutralizzazione. Senza la seconda,
     * un'eliminazione «riuscita» lascerebbe la giacenza scalata per sempre.
     */
    it('⭐ elimina una VENDITA al banco confermata, e passa dal motore di scarico', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-vn',
        type: DocumentType.store_sale,
        status: DocumentStatus.confirmed,
        locationId: 'loc-1',
        lines: [],
      });
      prisma.stockMovement.findMany.mockResolvedValue([]);
      prisma.document.delete.mockResolvedValue({ id: 'doc-vn' });

      await service.delete(tenantId, 'doc-vn');

      expect(prisma.document.delete).toHaveBeenCalledWith({ where: { id: 'doc-vn' } });
      // Il motore legge i movimenti del documento per toglierli riga per riga.
      expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sourceDocumentId: 'doc-vn',
            sourceDocumentType: DocumentType.store_sale,
          }),
        }),
      );
    });

    it('⭐ elimina anche un RESO al banco: il verso opposto, stesso contratto', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-rn',
        type: DocumentType.store_return,
        status: DocumentStatus.confirmed,
        locationId: 'loc-1',
        lines: [],
      });
      prisma.stockMovement.findMany.mockResolvedValue([]);
      prisma.document.delete.mockResolvedValue({ id: 'doc-rn' });

      await service.delete(tenantId, 'doc-rn');

      expect(prisma.document.delete).toHaveBeenCalledWith({ where: { id: 'doc-rn' } });
    });

    it('rifiuta l’eliminazione di documenti confermati', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        status: DocumentStatus.confirmed,
        lines: [],
      });

      await expect(service.delete(tenantId, 'doc-1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.document.delete).not.toHaveBeenCalled();
    });
  });
});

/**
 * ⛔ **L'interruttore aziendale della Vendita manuale, dove conta: sull'API.**
 *
 * La UI non è la protezione. Nascondere il pulsante toglie la strada comoda, non
 * la strada: `POST /documents` accetta il tipo, e lo sblocco della maschera è
 * solo stato del client. Chi vuole aggirare il blocco apre una Vendita manuale
 * storica, la sblocca, cambia le quantità e salva — ottenendo la stessa
 * variazione diretta di giacenza, senza `StockMovement`.
 *
 * Per questo il rifiuto copre **creazione e modifica**, e per questo sta qui.
 */
describe('DocumentsService — l’interruttore della Vendita manuale', () => {
  const tenantId = 'tenant-1';

  function utente(acceso: boolean) {
    return { ...testOwnerUser(), manualUnloadEnabled: acceso };
  }

  it('⛔ spenta: la creazione è rifiutata dall’API, non solo nascosta', async () => {
    const prisma = createPrismaMock();
    const { service } = createService(
      prisma,
      resolvedSetting({ type: DocumentType.manual_unload }),
    );

    await expect(
      service.create(
        tenantId,
        { type: DocumentType.manual_unload, documentDate: '2026-08-26' },
        utente(false),
      ),
    ).rejects.toThrow(/non è attiva per questa azienda/i);
    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  it('⛔ e senza utente affatto: spenta', async () => {
    // ⚠️ Fail-closed voluto, e diverso dalla convenzione del file — dove
    //   «utente assente» significa «chiamata interna fidata». Qui il flag è del
    //   TENANT, non della persona: nessun utente = nessuna azienda = spenta.
    //   Nessun chiamante interno crea manual_unload (verificato il 26/08/2026):
    //   le creazioni interne passano da `createDocumentRecord`, più a valle.
    const prisma = createPrismaMock();
    const { service } = createService(
      prisma,
      resolvedSetting({ type: DocumentType.manual_unload }),
    );

    await expect(
      service.create(tenantId, { type: DocumentType.manual_unload, documentDate: '2026-08-26' }),
    ).rejects.toThrow(/non è attiva per questa azienda/i);
  });

  it('⭐ accesa: il rifiuto NON scatta', async () => {
    // ⚠️ Espresso come «non fallisce per QUESTO motivo» invece che «riesce»: far
    //   arrivare `create` in fondo richiederebbe di simulare mezzo dominio, e la
    //   prova finirebbe per misurare i mock invece dell'interruttore.
    const prisma = createPrismaMock();
    const { service } = createService(
      prisma,
      resolvedSetting({ type: DocumentType.manual_unload }),
    );

    const esito = await service
      .create(
        tenantId,
        { type: DocumentType.manual_unload, documentDate: '2026-08-26' },
        utente(true),
      )
      .catch((errore: Error) => errore);

    expect(String(esito)).not.toMatch(/non è attiva per questa azienda/i);
  });

  it('⛔ spenta: anche la MODIFICA è rifiutata', async () => {
    const prisma = createPrismaMock();
    const { service } = createService(
      prisma,
      resolvedSetting({ type: DocumentType.manual_unload }),
    );
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-vm',
      tenantId,
      type: DocumentType.manual_unload,
      status: DocumentStatus.confirmed,
      lines: [],
    });

    await expect(service.update(tenantId, 'doc-vm', { lines: [] }, utente(false))).rejects.toThrow(
      /non è attiva per questa azienda/i,
    );
  });

  it('⭐ e nessun ALTRO tipo è toccato, nemmeno a funzione spenta', async () => {
    const prisma = createPrismaMock();
    const { service } = createService(prisma, resolvedSetting({ type: DocumentType.quote }));

    const esito = await service
      .create(tenantId, { type: DocumentType.quote, documentDate: '2026-08-26' }, utente(false))
      .catch((errore: Error) => errore);

    expect(String(esito)).not.toMatch(/non è attiva per questa azienda/i);
  });
});

/**
 * TOTALI DETERMINATI DI RIGA — §5.2 di `docs/24`, Tranche 0A.1.
 *
 * ⛔ Ogni prova asserisce il VALORE ESATTO. Un test che si accontentasse di
 * «non è nullo» tornerebbe verde anche sul difetto che stiamo chiudendo: le
 * colonne hanno `@default(0)`, quindi «definito» e «mai scritto» sono la stessa
 * cosa. Per la stessa ragione qui non si usa `toMatchObject`, che non vede un
 * campo assente — è ciò che ha lasciato passare il difetto per 112 prove.
 *
 * Il difetto chiuso: `ComputedLine` non dichiarava le due colonne e la
 * persistenza era uno spread, quindi ogni documento del percorso generico
 * nasceva con imposta e lordo di riga a zero.
 */
describe('totali determinati di riga (Tranche 0A.1)', () => {
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
    prisma.document.create.mockResolvedValue({
      id: 'doc-1',
      status: DocumentStatus.draft,
      lines: [{ lineNumber: 1 }],
    });
    prisma.document.update.mockResolvedValue({ id: 'doc-1', lines: [] });
  });

  /** Le righe passate a `document.create`, con i totali economici scritti. */
  function righeCreate(): {
    lineTotalMinor: number;
    lineVatTotalMinor: number;
    lineGrossTotalMinor: number;
  }[] {
    const data = prisma.document.create.mock.calls[0]![0]!.data as {
      lines: { create: { lineTotalMinor: number; lineVatTotalMinor: number; lineGrossTotalMinor: number }[] };
    };
    return data.lines.create;
  }

  function testata(): { subtotalMinor: number; taxMinor: number; totalMinor: number } {
    return prisma.document.create.mock.calls[0]![0]!.data as {
      subtotalMinor: number;
      taxMinor: number;
      totalMinor: number;
    };
  }

  async function creaCon(lines: unknown[], type: DocumentType = DocumentType.proforma) {
    const { service } = createService(prisma, resolvedSetting({ type }));
    await service.create(tenantId, { type, documentDate: '2026-03-01', lines } as never);
  }

  it('IVA ordinaria: 2 × 10,00 € al 22% persiste 4,40 € di imposta e 24,40 € di lordo', async () => {
    await creaCon([{ description: 'Maglia', quantity: 2, unitPriceMinor: 1000, vatRatePercent: 22 }]);

    const [riga] = righeCreate();
    expect(riga!.lineTotalMinor).toBe(2000);
    expect(riga!.lineVatTotalMinor).toBe(440);
    expect(riga!.lineGrossTotalMinor).toBe(2440);
  });

  it('la TESTATA somma i valori finali delle righe: imponibile, IVA e lordo', async () => {
    await creaCon([
      { description: 'A', quantity: 2, unitPriceMinor: 1000, vatRatePercent: 22 },
      { description: 'B', quantity: 1, unitPriceMinor: 10000, vatRatePercent: 10 },
    ]);

    const righe = righeCreate();
    const somme = righe.reduce(
      (acc, r) => ({
        imponibile: acc.imponibile + r.lineTotalMinor,
        iva: acc.iva + r.lineVatTotalMinor,
        lordo: acc.lordo + r.lineGrossTotalMinor,
      }),
      { imponibile: 0, iva: 0, lordo: 0 },
    );

    // ⭐ È l'uguaglianza che prima non si poteva nemmeno scrivere: il valore di
    // riga non veniva persistito, quindi non c'era niente da sommare.
    expect(testata().subtotalMinor).toBe(somme.imponibile);
    expect(testata().taxMinor).toBe(somme.iva);
    expect(testata().totalMinor).toBe(somme.lordo);
    // E i numeri, per esteso: 2000 + 10000 di imponibile, 440 + 1000 di imposta.
    expect(somme.imponibile).toBe(12000);
    expect(somme.iva).toBe(1440);
    expect(somme.lordo).toBe(13440);
  });

  it('due aliquote diverse: ogni riga porta la PROPRIA imposta, non una media', async () => {
    await creaCon([
      { description: 'Al 22%', quantity: 1, unitPriceMinor: 10000, vatRatePercent: 22 },
      { description: 'Al 10%', quantity: 1, unitPriceMinor: 10000, vatRatePercent: 10 },
    ]);

    const [a, b] = righeCreate();
    expect(a!.lineVatTotalMinor).toBe(2200);
    expect(a!.lineGrossTotalMinor).toBe(12200);
    expect(b!.lineVatTotalMinor).toBe(1000);
    expect(b!.lineGrossTotalMinor).toBe(11000);
  });

  it('IVA 0% valida: imposta zero PRODOTTA dal calcolo, e lordo pari all’imponibile', async () => {
    await creaCon([{ description: 'Esente', quantity: 1, unitPriceMinor: 5000, vatRatePercent: 0 }]);

    const [riga] = righeCreate();
    expect(riga!.lineVatTotalMinor).toBe(0);
    // ⭐ Ciò che distingue lo zero vero dal campo non compilato: se la colonna
    // fosse rimasta al default, il LORDO sarebbe zero anche lui.
    expect(riga!.lineGrossTotalMinor).toBe(5000);
  });

  it('sconto di riga: l’imposta segue l’imponibile scontato, non il prezzo pieno', async () => {
    await creaCon([
      { description: 'Scontata', quantity: 1, unitPriceMinor: 10000, discountPercent: 10, vatRatePercent: 22 },
    ]);

    const [riga] = righeCreate();
    expect(riga!.lineTotalMinor).toBe(9000);
    expect(riga!.lineVatTotalMinor).toBe(1980);
    expect(riga!.lineGrossTotalMinor).toBe(10980);
  });

  it('quantità e sconto con coda decimale: l’imposta nasce dall’imponibile ESATTO', async () => {
    // 3 × 33,33 € scontati del 7% = 92,9907 € esatti → imponibile persistito 9299.
    // Lordo  = round(9299,07 × 1,22) = 11345.  Imposta = 11345 − 9299 = 2046.
    await creaCon([
      { description: 'Coda', quantity: 3, unitPriceMinor: 3333, discountPercent: 7, vatRatePercent: 22 },
    ]);

    const [riga] = righeCreate();
    expect(riga!.lineTotalMinor).toBe(9299);
    expect(riga!.lineVatTotalMinor).toBe(2046);
    expect(riga!.lineGrossTotalMinor).toBe(11345);
    expect(riga!.lineGrossTotalMinor).toBe(riga!.lineTotalMinor + riga!.lineVatTotalMinor);
  });

  it('nota di credito: i totali si determinano come su ogni altro documento', async () => {
    await creaCon(
      [{ description: 'Reso', quantity: 1, unitPriceMinor: 5000, vatRatePercent: 22 }],
      DocumentType.credit_note,
    );

    const [riga] = righeCreate();
    expect(riga!.lineVatTotalMinor).toBe(1100);
    expect(riga!.lineGrossTotalMinor).toBe(6100);
  });

  it('ogni tipo del percorso generico persiste i totali, non solo la proforma', async () => {
    for (const type of [
      DocumentType.quote,
      DocumentType.proforma,
      DocumentType.sales_ddt,
      DocumentType.invoice,
      DocumentType.credit_note,
    ]) {
      prisma = createPrismaMock();
      prisma.document.create.mockResolvedValue({
        id: 'doc-1',
        status: DocumentStatus.draft,
        lines: [{ lineNumber: 1 }],
      });
      prisma.document.update.mockResolvedValue({ id: 'doc-1', lines: [] });

      await creaCon([{ description: 'Riga', quantity: 1, unitPriceMinor: 10000, vatRatePercent: 22 }], type);

      const [riga] = righeCreate();
      expect(riga!.lineVatTotalMinor, `tipo ${type}`).toBe(2200);
      expect(riga!.lineGrossTotalMinor, `tipo ${type}`).toBe(12200);
    }
  });

  describe('modifica di un documento esistente', () => {
    /** Dati scritti dall'ultimo `updateMany` sulla riga. */
    function rigaAggiornata(): {
      lineTotalMinor: number;
      lineVatTotalMinor: number;
      lineGrossTotalMinor: number;
    } {
      const calls = prisma.documentLine.updateMany.mock.calls;
      return (calls[calls.length - 1]![0] as { data: never }).data;
    }

    function preparaDocumentoConUnaRiga() {
      const doc = {
        ...draftDocumentForNumberUpdate(7),
        lines: [
          {
            id: 'line-1',
            documentId: 'doc-q',
            tenantId,
            lineNumber: 1,
            variantId: null,
            sku: null,
            description: 'Riga',
            quantity: 1,
            unitPriceMinor: new Prisma.Decimal(1000),
            discountPercent: new Prisma.Decimal(0),
            vatRatePercent: 22,
            lineTotalMinor: 1000,
            lineVatTotalMinor: 220,
            lineGrossTotalMinor: 1220,
            loadsStock: false,
            unitOfMeasure: null,
            isReference: false,
            supplierOrderLineId: null,
            lotCode: null,
            lotExpiryDate: null,
            serialNumbers: [],
            vatCodeId: null,
            vatSnapshot: null,
          },
        ],
      };
      const { service } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.quote, numberPrefix: 'PRE' }),
      );
      prisma.document.findFirst.mockResolvedValueOnce(doc).mockResolvedValueOnce({ ...doc });
      prisma.document.update.mockResolvedValue({ ...doc, lines: [] });
      return service;
    }

    it('cambiando la quantità, imposta e lordo si riscrivono sulla riga esistente', async () => {
      const service = preparaDocumentoConUnaRiga();

      await service.update(tenantId, 'doc-q', {
        lines: [{ id: 'line-1', description: 'Riga', quantity: 5, unitPriceMinor: 1000, vatRatePercent: 22 }],
      } as never);

      // 5 × 1000 = 5000 → imposta 1100, lordo 6100.
      expect(rigaAggiornata().lineTotalMinor).toBe(5000);
      expect(rigaAggiornata().lineVatTotalMinor).toBe(1100);
      expect(rigaAggiornata().lineGrossTotalMinor).toBe(6100);
    });

    it('cambiando lo sconto, l’imposta lo segue', async () => {
      const service = preparaDocumentoConUnaRiga();

      await service.update(tenantId, 'doc-q', {
        lines: [
          {
            id: 'line-1',
            description: 'Riga',
            quantity: 1,
            unitPriceMinor: 1000,
            discountPercent: 50,
            vatRatePercent: 22,
          },
        ],
      } as never);

      expect(rigaAggiornata().lineTotalMinor).toBe(500);
      expect(rigaAggiornata().lineVatTotalMinor).toBe(110);
      expect(rigaAggiornata().lineGrossTotalMinor).toBe(610);
    });

    it('secondo salvataggio senza modifiche: i valori restano identici, non si azzerano', async () => {
      const service = preparaDocumentoConUnaRiga();

      await service.update(tenantId, 'doc-q', {
        lines: [{ id: 'line-1', description: 'Riga', quantity: 1, unitPriceMinor: 1000, vatRatePercent: 22 }],
      } as never);

      // ⭐ È il caso che il difetto rendeva invisibile: prima l'update non
      // nominava mai le due colonne, quindi un risalvataggio non le riparava
      // né le peggiorava — restavano a zero per sempre.
      expect(rigaAggiornata().lineTotalMinor).toBe(1000);
      expect(rigaAggiornata().lineVatTotalMinor).toBe(220);
      expect(rigaAggiornata().lineGrossTotalMinor).toBe(1220);
    });
  });
});
