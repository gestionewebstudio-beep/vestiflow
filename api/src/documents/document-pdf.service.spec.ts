import { UnprocessableEntityException } from '@nestjs/common';
import { DocumentStatus, DocumentType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { DocumentPdfService } from './document-pdf.service';
import type { DocumentDetail } from './documents.service';

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
    documentDiscountPercent: 0,
    pricesIncludeVat: false,
    purchaseCostEntryMode: 'vat_excluded',
    createdById: null,
    createdByName: 'Test',
    confirmedAt: null,
    cancelledAt: null,
    externallyIssuedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    blockAfterConfirm: false,
    salesOrder: null,
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
        variantId: 'var-1',
        sku: 'SKU-1',
        description: 'Maglietta',
        quantity: 2,
        unitPriceMinor: 5000,
        discountPercent: 0,
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

  it('exportPdf rifiuta tipi non stampabili', async () => {
    await expect(
      service.exportPdf('tenant-1', {
        ...baseDocument,
        type: DocumentType.inventory,
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });
});
