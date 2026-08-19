import { ConflictException, ForbiddenException } from '@nestjs/common';
import { DocumentStatus, DocumentType, UserRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { testClerkUser, testOwnerUser } from '../test/fixtures/user-profile.fixture';
import { DocumentsService } from './documents.service';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * I tre gate del modello «sezioni + documenti»: il registro FILTRA per tipo,
 * il dettaglio rifiuta la famiglia non consentita, le mutazioni chiedono
 * «Gestisci» su quella famiglia. Senza questi test il filtro sopravvivrebbe
 * solo per abitudine: sta dentro un `AND` che cinque scrittori toccano.
 */
describe('DocumentsService — matrice permessi documenti', () => {
  const tenantId = 'tenant-1';

  let prisma: {
    document: {
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
    location: { findMany: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let service: DocumentsService;

  /** Utente con la sola famiglia indicata (più le sezioni del preset). */
  const clerkWith = (...permissions: string[]): UserProfileDto =>
    testClerkUser({ hasAllLocationsAccess: true, permissions });

  beforeEach(() => {
    prisma = {
      document: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn(),
      },
      location: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn(async (ops: unknown) =>
        Array.isArray(ops) ? Promise.all(ops as Promise<unknown>[]) : ops,
      ),
    };
    service = new DocumentsService(
      prisma as unknown as PrismaService,
      {} as never,
      {} as never,
      {} as never,
      // priceModePreference: dal 16/08 il create chiede la convenzione aziendale.
      { resolveCompanyDefault: async () => false } as never,
      {} as never,
    );
  });

  /** Estrae il filtro `type` che il servizio ha messo nella clausola AND. */
  function typesInWhere(): readonly DocumentType[] | null {
    const call = prisma.document.findMany.mock.calls[0]?.[0] as
      | { where?: { AND?: unknown } }
      | undefined;
    const and = call?.where?.AND;
    const blocks = Array.isArray(and) ? and : and ? [and] : [];
    for (const block of blocks as { type?: { in?: DocumentType[] } }[]) {
      if (block?.type?.in) {
        return block.type.in;
      }
    }
    return null;
  }

  describe('list: il registro restituisce solo le famiglie consultabili', () => {
    it('filtra per tipo in base ai permessi, non solo per la richiesta del client', async () => {
      await service.list(
        tenantId,
        { page: 1, pageSize: 20 } as never,
        clerkWith('doc.sales_ddt.view', 'doc.quote.view'),
      );

      const types = typesInWhere();
      expect(types).toEqual(
        expect.arrayContaining([DocumentType.sales_ddt, DocumentType.quote]),
      );
      expect(types).not.toContain(DocumentType.invoice_draft);
      expect(types).not.toContain(DocumentType.supplier_invoice);
    });

    it('«Gestisci» implica «Consulta»: la famiglia gestita compare nel filtro', async () => {
      await service.list(
        tenantId,
        { page: 1, pageSize: 20 } as never,
        clerkWith('doc.invoice.manage'),
      );

      const types = typesInWhere();
      // La famiglia «invoice» copre fattura e fattura accompagnatoria.
      expect(types).toEqual(
        expect.arrayContaining([DocumentType.invoice_draft, DocumentType.invoice_accompanying]),
      );
    });

    it('nessuna famiglia consultabile: elenco vuoto senza nemmeno interrogare il database', async () => {
      const result = await service.list(tenantId, { page: 1, pageSize: 20 } as never, clerkWith());

      expect(result).toMatchObject({ items: [], total: 0 });
      expect(prisma.document.findMany).not.toHaveBeenCalled();
    });

    it('il titolare non ha restrizioni di tipo', async () => {
      await service.list(tenantId, { page: 1, pageSize: 20 } as never, testOwnerUser());

      expect(typesInWhere()).toBeNull();
    });
  });

  describe('getById: la famiglia del tipo decide chi apre il documento', () => {
    const invoiceRow = {
      id: 'doc-1',
      tenantId,
      type: DocumentType.invoice_draft,
      status: DocumentStatus.confirmed,
      locationId: null,
      targetLocationId: null,
      lines: [],
      derivedDocuments: [],
      salesOrders: [],
      purchaseInvoiceLinks: [],
      goodsReceiptLinks: [],
      ddtLinks: [],
      paymentInstallments: [],
    };

    it('rifiuta con 403 una famiglia che l’utente non consulta', async () => {
      prisma.document.findFirst.mockResolvedValue(invoiceRow);

      await expect(
        service.getById(tenantId, 'doc-1', clerkWith('doc.sales_ddt.view')),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('consente la famiglia consultabile', async () => {
      prisma.document.findFirst.mockResolvedValue(invoiceRow);

      await expect(
        service.getById(tenantId, 'doc-1', clerkWith('doc.invoice.view')),
      ).resolves.toMatchObject({ id: 'doc-1' });
    });
  });

  describe('mutazioni: richiedono «Gestisci» sulla famiglia', () => {
    it('create rifiuta il tipo che l’utente non gestisce', async () => {
      await expect(
        service.create(
          tenantId,
          { type: DocumentType.invoice_draft, lines: [] } as never,
          clerkWith('doc.invoice.view', 'doc.goods_receipt.manage'),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('cancel rifiuta la famiglia non gestita', async () => {
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        tenantId,
        type: DocumentType.sales_ddt,
        status: DocumentStatus.confirmed,
        locationId: null,
        targetLocationId: null,
        lines: [],
        derivedDocuments: [],
        salesOrders: [],
        purchaseInvoiceLinks: [],
        goodsReceiptLinks: [],
        ddtLinks: [],
        paymentInstallments: [],
      });

      await expect(
        service.cancel(tenantId, 'doc-1', clerkWith('doc.sales_ddt.view')),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('assertWritableById (allegati) rifiuta la famiglia non gestita', async () => {
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        tenantId,
        type: DocumentType.invoice_draft,
        status: DocumentStatus.confirmed,
        locationId: null,
        targetLocationId: null,
        lines: [],
        derivedDocuments: [],
        salesOrders: [],
        purchaseInvoiceLinks: [],
        goodsReceiptLinks: [],
        ddtLinks: [],
        paymentInstallments: [],
      });

      // Il commesso di preset consulta tutto e gestisce il solo arrivo merce:
      // non deve poter caricare né ELIMINARE gli allegati di una fattura.
      await expect(
        service.assertWritableById(
          tenantId,
          'doc-1',
          clerkWith('doc.invoice.view', 'doc.goods_receipt.manage'),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('assertWritableById consente la famiglia gestita', async () => {
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-2',
        tenantId,
        type: DocumentType.goods_receipt,
        status: DocumentStatus.confirmed,
        locationId: null,
        targetLocationId: null,
        lines: [],
        derivedDocuments: [],
        salesOrders: [],
        purchaseInvoiceLinks: [],
        goodsReceiptLinks: [],
        ddtLinks: [],
        paymentInstallments: [],
      });

      await expect(
        service.assertWritableById(tenantId, 'doc-2', clerkWith('doc.goods_receipt.manage')),
      ).resolves.toMatchObject({ id: 'doc-2' });
    });

    it('chiamata interna (senza utente) non è soggetta ai gate', async () => {
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-3',
        tenantId,
        type: DocumentType.invoice_draft,
        status: DocumentStatus.confirmed,
        locationId: null,
        targetLocationId: null,
        lines: [],
        derivedDocuments: [],
        salesOrders: [],
        purchaseInvoiceLinks: [],
        goodsReceiptLinks: [],
        ddtLinks: [],
        paymentInstallments: [],
      });

      await expect(service.getById(tenantId, 'doc-3')).resolves.toMatchObject({ id: 'doc-3' });
    });
  });

  it('il ruolo non basta: un clerk senza famiglie non vede nulla', () => {
    const bare = testClerkUser({ permissions: [] });
    expect(bare.role).toBe(UserRole.clerk);
  });
});

/**
 * `includedSalesOrderIds` è un campo del CORPO che sposta l'operazione su
 * un'altra famiglia: gli Ordini cliente. Il gate della rotta («gestisci almeno
 * una famiglia») e quello del tipo salvato guardano il DDT, non l'ordine — ma
 * agganciarlo ne CONSUMA gli impegni di magazzino alla conferma, e sganciarlo
 * (elenco vuoto) lo riapre ricreandoli. Questi test tengono la guardia dove il
 * dato arriva: nel servizio, prima di ogni effetto.
 */
describe('DocumentsService — ordini cliente agganciati al documento', () => {
  const tenantId = 'tenant-1';

  /**
   * Errore riconoscibile al posto della transazione: oltre le guardie c'è solo
   * la scrittura, quindi il verso positivo si vede dal fatto che ci arriva.
   */
  const transazioneRaggiunta = new Error('transazione raggiunta');

  const soloDdt = () =>
    testClerkUser({ hasAllLocationsAccess: true, permissions: ['doc.sales_ddt.manage'] });
  const ddtEOrdini = () =>
    testClerkUser({
      hasAllLocationsAccess: true,
      permissions: ['doc.sales_ddt.manage', 'doc.sales_order.manage'],
    });

  function createService() {
    const prisma = {
      document: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
      salesOrder: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
      stockMovement: { count: vi.fn().mockResolvedValue(0) },
      tenantFeatureSettings: { findUnique: vi.fn().mockResolvedValue(null) },
      // Intestazione congelata alla creazione (document-issuer.util).
      tenant: {
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ name: 'Negozio test', companyProfile: null }),
      },
      $transaction: vi.fn().mockRejectedValue(transazioneRaggiunta),
    };
    const settings = {
      getResolved: vi.fn().mockResolvedValue({
        pricesIncludeVat: false,
        printTitle: 'DDT',
        defaultNotes: null,
        numberPrefix: 'DDT',
      }),
    };
    const service = new DocumentsService(
      prisma as unknown as PrismaService,
      settings as never,
      {} as never,
      {} as never,
      // priceModePreference: dal 16/08 il create chiede la convenzione aziendale.
      { resolveCompanyDefault: async () => false } as never,
      {} as never,
    );
    return { service, prisma };
  }

  /** DDT vendita con un ordine cliente già agganciato. */
  const ddtConOrdine = (status: DocumentStatus) => ({
    id: 'ddt-1',
    tenantId,
    type: DocumentType.sales_ddt,
    status,
    locationId: null,
    targetLocationId: null,
    documentDate: new Date('2026-08-12T00:00:00.000Z'),
    lines: [],
    derivedDocuments: [],
    salesOrders: [
      {
        id: 'order-1',
        orderNumber: 'OC-1',
        cancelledAt: null,
        fulfilledAt: null,
        fulfillmentStatus: 'unfulfilled',
      },
    ],
    purchaseInvoiceLinks: [],
    goodsReceiptLinks: [],
    ddtLinks: [],
    paymentInstallments: [],
  });

  const nuovoDdt = (includedSalesOrderIds?: string[]) =>
    ({
      type: DocumentType.sales_ddt,
      documentDate: '2026-08-12',
      lines: [],
      ...(includedSalesOrderIds !== undefined ? { includedSalesOrderIds } : {}),
    }) as never;

  describe('creazione: agganciare un ordine chiede la famiglia dell’ordine', () => {
    it('nega a chi gestisce il DDT ma non gli ordini cliente, senza alcun effetto', async () => {
      const { service, prisma } = createService();

      await expect(
        service.create(tenantId, nuovoDdt(['order-1']), soloDdt()),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.document.create).not.toHaveBeenCalled();
      expect(prisma.salesOrder.update).not.toHaveBeenCalled();
    });

    it('consente a chi gestisce anche gli ordini cliente', async () => {
      const { service, prisma } = createService();

      await expect(service.create(tenantId, nuovoDdt(['order-1']), ddtEOrdini())).rejects.toBe(
        transazioneRaggiunta,
      );
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('un salvataggio che non tocca ordini non chiede il permesso in più', async () => {
      const { service, prisma } = createService();

      // Elenco vuoto su un documento nuovo: nessun ordine agganciato, nessuno
      // sganciato. Bloccarlo sarebbe una guardia che ferma anche gli innocenti.
      await expect(service.create(tenantId, nuovoDdt([]), soloDdt())).rejects.toBe(
        transazioneRaggiunta,
      );
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('il titolare non è mai fermato: array permessi vuoto, accesso pieno', async () => {
      const { service } = createService();

      await expect(
        service.create(tenantId, nuovoDdt(['order-1']), testOwnerUser({ permissions: [] })),
      ).rejects.toBe(transazioneRaggiunta);
    });

    it('chiamata interna (senza utente) non è soggetta al gate', async () => {
      const { service } = createService();

      await expect(service.create(tenantId, nuovoDdt(['order-1']))).rejects.toBe(
        transazioneRaggiunta,
      );
    });
  });

  describe('modifica: anche l’elenco VUOTO sgancia, quindi va autorizzato', () => {
    it('nega lo sgancio a chi non gestisce gli ordini cliente, senza alcun effetto', async () => {
      const { service, prisma } = createService();
      prisma.document.findFirst.mockResolvedValue(ddtConOrdine(DocumentStatus.confirmed));

      // Strada (b): un elenco vuoto su un DDT che ha ordini agganciati li
      // riapre e ne ricrea gli impegni — senza conoscere alcun id.
      await expect(
        service.update(tenantId, 'ddt-1', { includedSalesOrderIds: [] } as never, soloDdt()),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.document.update).not.toHaveBeenCalled();
      expect(prisma.salesOrder.update).not.toHaveBeenCalled();
    });

    // Documento annullato: subito oltre le guardie c'è il rifiuto «non
    // modificabile», quindi il verso positivo si riconosce da quel conflitto —
    // il gate dei permessi ha lasciato passare.
    it('consente lo sgancio a chi gestisce anche gli ordini cliente', async () => {
      const { service, prisma } = createService();
      prisma.document.findFirst.mockResolvedValue(ddtConOrdine(DocumentStatus.cancelled));

      await expect(
        service.update(tenantId, 'ddt-1', { includedSalesOrderIds: [] } as never, ddtEOrdini()),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('il titolare non è mai fermato: array permessi vuoto, accesso pieno', async () => {
      const { service, prisma } = createService();
      prisma.document.findFirst.mockResolvedValue(ddtConOrdine(DocumentStatus.cancelled));

      await expect(
        service.update(
          tenantId,
          'ddt-1',
          { includedSalesOrderIds: [] } as never,
          testOwnerUser({ permissions: [] }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('un salvataggio che non dichiara gli ordini non chiede il permesso in più', async () => {
      const { service, prisma } = createService();
      prisma.document.findFirst.mockResolvedValue(ddtConOrdine(DocumentStatus.cancelled));

      // Campo assente = il salvataggio non riguarda gli ordini agganciati.
      await expect(
        service.update(tenantId, 'ddt-1', { notes: 'nota' } as never, soloDdt()),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  /**
   * Terza strada verso gli stessi ordini, e non passa da alcun corpo di
   * richiesta: annullare il documento li riapre e ne ricrea gli impegni. Con il
   * solo permesso sui DDT si rimettevano in gioco ordini che l'operatore non
   * può nemmeno consultare.
   */
  describe('annullamento: riapre gli ordini agganciati, quindi va autorizzato', () => {
    it('nega l’annullamento a chi non gestisce gli ordini cliente', async () => {
      const { service, prisma } = createService();
      prisma.document.findFirst.mockResolvedValue(ddtConOrdine(DocumentStatus.confirmed));

      await expect(service.cancel(tenantId, 'ddt-1', soloDdt())).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.salesOrder.update).not.toHaveBeenCalled();
    });

    it('consente l’annullamento a chi gestisce anche gli ordini cliente', async () => {
      const { service, prisma } = createService();
      // Già annullato: oltre le guardie c'è il rifiuto «non annullabile», che
      // dimostra che il gate dei permessi ha lasciato passare.
      prisma.document.findFirst.mockResolvedValue(ddtConOrdine(DocumentStatus.cancelled));

      await expect(service.cancel(tenantId, 'ddt-1', ddtEOrdini())).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('il titolare non è mai fermato', async () => {
      const { service, prisma } = createService();
      prisma.document.findFirst.mockResolvedValue(ddtConOrdine(DocumentStatus.cancelled));

      await expect(
        service.cancel(tenantId, 'ddt-1', testOwnerUser({ permissions: [] })),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  /**
   * Gli impegni di magazzino stanno sulla sede dell'ORDINE: chi opera su una
   * sola sede non deve muovere le giacenze di un'altra passando dal documento.
   */
  describe('lo scope di sede segue l’ordine, non il documento', () => {
    /** Servizio la cui transazione esegue davvero il callback, su un `tx` finto. */
    function createServiceConTransazione(ordineDaAgganciare: { locationId: string }) {
      const tx = {
        document: {
          create: vi
            .fn()
            .mockResolvedValue({ id: 'ddt-new', type: DocumentType.sales_ddt, lines: [] }),
        },
        salesOrder: {
          findMany: vi
            .fn()
            // 1ª chiamata: ordini già agganciati al documento (nessuno).
            .mockResolvedValueOnce([])
            // 2ª chiamata: gli ordini che il corpo chiede di agganciare.
            .mockResolvedValueOnce([
              {
                id: 'order-1',
                orderNumber: 'OC-1',
                source: 'manual',
                cancelledAt: null,
                documentId: null,
                locationId: ordineDaAgganciare.locationId,
              },
            ]),
          update: vi.fn().mockResolvedValue({ id: 'order-1' }),
        },
        documentLine: { findMany: vi.fn().mockResolvedValue([]) },
        stockReservation: { findMany: vi.fn().mockResolvedValue([]) },
      };
      const prisma = {
        tenantFeatureSettings: { findUnique: vi.fn().mockResolvedValue(null) },
      // Intestazione congelata alla creazione (document-issuer.util).
      tenant: {
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ name: 'Negozio test', companyProfile: null }),
      },
        $transaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) => fn(tx)),
      };
      const settings = {
        getResolved: vi.fn().mockResolvedValue({
          pricesIncludeVat: false,
          printTitle: 'DDT',
          defaultNotes: null,
          numberPrefix: 'DDT',
        }),
      };
      const service = new DocumentsService(
        prisma as unknown as PrismaService,
        settings as never,
        {} as never,
        {} as never,
        // priceModePreference: dal 16/08 il create chiede la convenzione aziendale.
        { resolveCompanyDefault: async () => false } as never,
        {} as never,
      );
      return { service, tx };
    }

    /** Commesso di una sola sede, con entrambe le famiglie in mano. */
    const commessoDiSedeA = () =>
      testClerkUser({
        hasAllLocationsAccess: false,
        assignedLocationIds: ['loc-A'],
        permissions: ['doc.sales_ddt.manage', 'doc.sales_order.manage'],
      });

    const ddtConOrdineIncluso = () =>
      ({
        type: DocumentType.sales_ddt,
        documentDate: '2026-08-12',
        series: 'A',
        lines: [],
        includedSalesOrderIds: ['order-1'],
      }) as never;

    it('nega l’aggancio di un ordine di un’altra sede, senza agganciare nulla', async () => {
      const { service, tx } = createServiceConTransazione({ locationId: 'loc-B' });

      await expect(
        service.create(tenantId, ddtConOrdineIncluso(), commessoDiSedeA()),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(tx.salesOrder.update).not.toHaveBeenCalled();
    });

    it('consente l’aggancio di un ordine della propria sede', async () => {
      const { service, tx } = createServiceConTransazione({ locationId: 'loc-A' });

      // Oltre l'aggancio il flusso prosegue con la conferma, che qui non è
      // simulata: quello che conta è che l'ordine sia stato agganciato.
      await service
        .create(tenantId, ddtConOrdineIncluso(), commessoDiSedeA())
        .catch(() => undefined);

      expect(tx.salesOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'order-1' } }),
      );
    });
  });

});

/**
 * L'anteprima numero riceve il tipo dalla query string, non da un documento
 * salvato: è l'unica rotta di lettura che espone un numeratore senza passare
 * dal filtro dell'elenco. Senza guardia, chi consulta i soli Preventivi legge
 * il prossimo numero delle Fatture.
 */
describe('DocumentsService — anteprima numero: il tipo arriva dal client', () => {
  const tenantId = 'tenant-1';

  const soloPreventivi = (): UserProfileDto =>
    testClerkUser({ hasAllLocationsAccess: true, permissions: ['doc.quote.view'] });

  /** Nessuna dipendenza serve: la guardia scatta prima di ogni lettura. */
  const createService = (): DocumentsService =>
    new DocumentsService(
      {} as unknown as PrismaService,
      {} as never,
      {} as never,
      {} as never,
      // priceModePreference: dal 16/08 il create chiede la convenzione aziendale.
      { resolveCompanyDefault: async () => false } as never,
      {} as never,
    );

  it('nega la famiglia non consultabile prima di leggere le impostazioni', async () => {
    await expect(
      createService().previewNextReference(
        tenantId,
        DocumentType.invoice_draft,
        undefined,
        undefined,
        undefined,
        soloPreventivi(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('chiamata interna senza utente: nessuna restrizione (il gate è a monte)', async () => {
    // `settings` non è iniettato: se la guardia lasciasse passare, il
    // fallimento sarebbe un TypeError e non un ForbiddenException.
    await expect(
      createService().previewNextReference(tenantId, DocumentType.invoice_draft),
    ).rejects.not.toBeInstanceOf(ForbiddenException);
  });
});
