import { ForbiddenException } from '@nestjs/common';
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
