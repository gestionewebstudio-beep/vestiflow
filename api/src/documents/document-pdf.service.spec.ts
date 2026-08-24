import { UnprocessableEntityException } from '@nestjs/common';
import { DocumentStatus, DocumentType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { DocumentPdfService } from './document-pdf.service';
import type { DocumentDetail } from './documents.service';
import { Prisma } from '@prisma/client';

describe('DocumentPdfService', () => {
  const prisma = {
    tenant: { findUniqueOrThrow: vi.fn() },
    location: { findMany: vi.fn() },
  };

  const service = new DocumentPdfService(prisma as never);

  const baseDocument: DocumentDetail = {
    id: 'doc-1',
    tenantId: 'tenant-1',
    type: DocumentType.sales_ddt,
    status: DocumentStatus.confirmed,
    series: 'A',
    number: 1,
    year: 2026,
    reference: 'DDT-2026-0001',
    documentDate: new Date('2026-06-15T10:00:00.000Z'),
    registrationDate: null,
    printTitle: 'Documento di trasporto',
    notes: 'Consegna urgente',
    internalComment: null,
    issuerSnapshot: null,
    supplierId: null,
    supplierName: null,
    customerId: 'cust-1',
    customerName: 'Cliente Demo',
    locationId: null,
    targetLocationId: null,
    adjustmentDirection: null,
    externalDocNumber: null,
    externalDocDate: null,
    externalRef: null,
    externalDocumentTypeId: null,
    externalDocumentTypeSnapshot: null,
    sourceDocumentId: null,
    onlineSaleId: null,
    supplierOrderId: null,
    billingCause: 'Vendita',
    paymentMethod: null,
    paymentMethodNote: null,
    paymentTerms: null,
    expectedDeliveryDate: null,
    paymentDueDate: null,
    iban: null,
    causalText: null,
    causalGenerationMode: null,
    causalTemplateSnapshot: null,
    followedBySalesDoc: false,
    transportCausal: null,
    transportStartAt: null,
    transportPort: null,
    transportCarrier: null,
    transportPackagesCount: null,
    transportWeight: null,
    transportGoodsAspect: null,
    transportShippingCode: null,
    transportTrackingCode: null,
    recipientAddress: null,
    destinationAddress: null,
    currency: 'EUR',
    subtotalMinor: 10000,
    taxMinor: 2200,
    totalMinor: 12200,
    outstandingMinor: 0,
    documentDiscountPercent: new Prisma.Decimal(0),
    pricesIncludeVat: false,
    purchaseCostEntryMode: 'vat_excluded',
    createdById: null,
    createdByName: 'Test',
    confirmedAt: null,
    cancelledAt: null,
    externallyIssuedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    salesOrder: null,
    sourceDocument: null,
    derivedDocuments: [],
    linkedSalesOrders: [],
    linkedSupplierOrder: null,
    linkedSupplierOrderLines: [],
    linkStatus: null,
    linkedPurchaseInvoice: null,
    linkedGoodsReceipts: [],
    paymentInstallments: [],
    linkedSalesDdts: [],
    lines: [
      {
        id: 'line-1',
        tenantId: 'tenant-1',
        documentId: 'doc-1',
        lineNumber: 1,
        unitOfMeasure: null,
        variantId: 'var-1',
        variantLabel: 'M / Rosso',
        sku: 'SKU-1',
        description: 'Maglietta',
        quantity: 2,
        unitPriceMinor: new Prisma.Decimal(5000),
        discountPercent: new Prisma.Decimal(0),
        vatCodeId: null,
        vatSnapshot: { ratePercent: 22 },
        enteredUnitCost: null,
        costEntryModeSnapshot: null,
        unitCostNet: null,
        unitCostGross: null,
        unitVatAmount: null,
        lineVatTotalMinor: 2200,
        lineGrossTotalMinor: 12200,
        supplierPayableLineMinor: 12200,
        reverseChargeVatMinor: 0,
        nonDeductibleVatMinor: 0,
        lineTotalMinor: 10000,
        loadsStock: true,
      isReference: false,
        supplierOrderLineId: null,
        lotCode: null,
        lotExpiryDate: null,
        linkedGoodsReceiptId: null,
        lineSource: null,
        serialNumbers: ['SN-001'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  };

  it('exportPdf genera un buffer PDF valido', async () => {
    prisma.tenant.findUniqueOrThrow.mockResolvedValue({
      name: 'Negozio',
      legalName: 'Negozio Srl',
      vatNumber: 'IT12345678901',
      addressLine1: 'Via Roma 1',
      addressLine2: null,
      postalCode: '80100',
      city: 'Napoli',
      province: 'NA',
    });
    prisma.location.findMany.mockResolvedValue([]);

    const { buffer, filename } = await service.exportPdf('tenant-1', baseDocument);

    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(filename.endsWith('.pdf')).toBe(true);
    expect(filename).toContain('DDT-2026-0001');
  });

  // L'anteprima a schermo chiede la testata da qui (GET :id/print-header): deve
  // essere la STESSA che finisce sul PDF, snapshot compreso.
  describe('issuerHeader', () => {
    it('compone la testata dall’anagrafica corrente quando non c’è snapshot', async () => {
      prisma.tenant.findUniqueOrThrow.mockResolvedValue({
        name: 'Negozio',
        legalName: 'Negozio Srl',
        vatNumber: 'IT12345678901',
        addressLine1: 'Via Roma 1',
        addressLine2: null,
        postalCode: '80100',
        city: 'Napoli',
        province: 'NA',
      });

      const header = await service.issuerHeader('tenant-1', baseDocument);

      expect(header.legalName).toBe('Negozio Srl');
      expect(header.lines).toContain('Via Roma 1, 80100 Napoli NA');
      expect(header.lines).toContain('P. IVA: IT12345678901');
    });

    // Un documento emesso non cambia più: se il titolare trasloca, la fattura
    // di marzo si riapre con l'indirizzo di marzo. È la ragione per cui la
    // testata passa dal server invece di essere letta viva nel frontend.
    it('preferisce lo snapshot congelato all’emissione', async () => {
      prisma.tenant.findUniqueOrThrow.mockResolvedValue({
        name: 'Negozio',
        legalName: 'Ragione sociale NUOVA',
        vatNumber: 'IT99999999999',
        addressLine1: 'Indirizzo NUOVO',
        addressLine2: null,
        postalCode: null,
        city: null,
        province: null,
      });

      // Il mock è condiviso dai test del file: si azzera qui, perché
      // l'asserzione che conta è «l'anagrafica corrente NON viene letta».
      prisma.tenant.findUniqueOrThrow.mockClear();

      const header = await service.issuerHeader('tenant-1', {
        ...baseDocument,
        issuerSnapshot: {
          legalName: 'Ragione sociale DI ALLORA',
          vatNumber: 'IT11111111111',
          addressLine1: 'Indirizzo di allora',
        },
      });

      expect(header.legalName).toBe('Ragione sociale DI ALLORA');
      expect(header.lines.join(' ')).toContain('IT11111111111');
      expect(header.lines.join(' ')).not.toContain('NUOVO');
      expect(prisma.tenant.findUniqueOrThrow).not.toHaveBeenCalled();
    });
  });

  it('exportPdf rifiuta tipi non stampabili', async () => {
    await expect(
      service.exportPdf('tenant-1', {
        ...baseDocument,
        // L'ordine fornitore vive in `supplier_orders` e ha un PDF proprio:
        // qui non deve passare. (Prima questo caso usava `inventory`, che oggi
        // si stampa — il test sarebbe diventato falso senza accorgersene.)
        type: DocumentType.supplier_order,
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  // I tipi aperti da questo lavoro: ognuno deve produrre un PDF vero, non un
  // 422. Sono quelli su cui il bottone c'era e il click non faceva niente.
  it.each([
    DocumentType.manual_load,
    DocumentType.initial_load,
    DocumentType.supplier_invoice,
    DocumentType.adjustment,
    DocumentType.inventory,
    DocumentType.store_sale,
    DocumentType.store_return,
    DocumentType.invoice_accompanying,
  ])('exportPdf genera il foglio per %s', async (type) => {
    prisma.tenant.findUniqueOrThrow.mockResolvedValue({
      name: 'Negozio',
      legalName: 'Negozio Srl',
      vatNumber: 'IT12345678901',
      addressLine1: 'Via Roma 1',
      addressLine2: null,
      postalCode: '80100',
      city: 'Napoli',
      province: 'NA',
    });
    prisma.location.findMany.mockResolvedValue([]);

    const { buffer } = await service.exportPdf('tenant-1', { ...baseDocument, type });

    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  // Una rettifica con la sua direzione e il suo esecutore: il foglio deve
  // uscire anche quando le righe valgono zero, che è sempre per questo tipo.
  it('exportPdf compone la rettifica senza colonne di valore', async () => {
    prisma.tenant.findUniqueOrThrow.mockResolvedValue({
      name: 'Negozio',
      legalName: 'Negozio Srl',
      vatNumber: null,
      addressLine1: null,
      addressLine2: null,
      postalCode: null,
      city: null,
      province: null,
    });
    prisma.location.findMany.mockResolvedValue([{ id: 'loc-1', name: 'Magazzino centrale' }]);

    const { buffer } = await service.exportPdf('tenant-1', {
      ...baseDocument,
      type: DocumentType.adjustment,
      locationId: 'loc-1',
      adjustmentDirection: 'decrease',
      // Come li scrive transfer-adjustment-workflow: valore zero fisso.
      subtotalMinor: 0,
      taxMinor: 0,
      totalMinor: 0,
      lines: [
        {
          ...baseDocument.lines[0]!,
          unitPriceMinor: new Prisma.Decimal(0),
          lineTotalMinor: 0,
          lineVatTotalMinor: 0,
          lineGrossTotalMinor: 0,
          vatSnapshot: null,
        },
      ],
    });

    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  // Registrazione fattura: scadenze, residuo e arrivi coperti sono dati già
  // caricati che il foglio non leggeva.
  it('exportPdf compone la registrazione fattura con scadenze e residuo', async () => {
    prisma.tenant.findUniqueOrThrow.mockResolvedValue({
      name: 'Negozio',
      legalName: 'Negozio Srl',
      vatNumber: null,
      addressLine1: null,
      addressLine2: null,
      postalCode: null,
      city: null,
      province: null,
    });
    prisma.location.findMany.mockResolvedValue([]);

    const { buffer } = await service.exportPdf('tenant-1', {
      ...baseDocument,
      type: DocumentType.supplier_invoice,
      supplierName: 'Fornitore Demo',
      registrationDate: new Date('2026-06-20T09:00:00.000Z'),
      outstandingMinor: 6100,
      paymentInstallments: [
        {
          id: 'inst-1',
          tenantId: 'tenant-1',
          documentId: 'doc-1',
          position: 1,
          dueDate: new Date('2026-07-31T00:00:00.000Z'),
          amountMinor: 6100,
          settled: false,
          settledAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      linkedGoodsReceipts: [
        {
          id: 'gr-1',
          number: 12,
          reference: 'CAR-A-12',
          documentDate: new Date('2026-06-01T00:00:00.000Z'),
          causalText: null,
          subtotalMinor: 10000,
          taxMinor: 2200,
          totalMinor: 12200,
          vatBreakdown: [],
        },
      ],
    });

    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  });
});
