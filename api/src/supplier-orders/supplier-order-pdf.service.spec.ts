import { SupplierOrderStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { SupplierOrderPdfService } from './supplier-order-pdf.service';
import type { SupplierOrderWithLines } from './supplier-orders.service';

describe('SupplierOrderPdfService', () => {
  const prisma = {
    tenant: { findUniqueOrThrow: vi.fn() },
  };

  const service = new SupplierOrderPdfService(prisma as never);

  const baseOrder: SupplierOrderWithLines = {
    id: 'po-1',
    tenantId: 'tenant-1',
    reference: 'OF-2026-0042',
    supplierId: 'sup-1',
    supplierName: 'Fornitore Demo Srl',
    destinationLocationId: null,
    status: SupplierOrderStatus.confirmed,
    currency: 'EUR',
    costEntryMode: 'vat_excluded',
    orderDate: new Date('2026-07-10T09:00:00.000Z'),
    supplierReference: 'ORD-77/2026',
    subtotalMinor: 30000,
    taxMinor: 6600,
    totalMinor: 36600,
    expectedAt: new Date('2026-08-01T00:00:00.000Z'),
    createdAt: new Date('2026-07-10T09:00:00.000Z'),
    updatedAt: new Date('2026-07-10T09:00:00.000Z'),
    lines: [
      {
        id: 'line-1',
        orderId: 'po-1',
        variantId: 'var-1',
        sku: 'SKU-001',
        description: 'T-shirt Basic — M / Bianco',
        orderedQuantity: 3,
        receivedQuantity: 0,
        unitCostMinor: 10000,
        enteredUnitCostMinor: 10000,
        discountPercent: 0,
        vatCodeId: 'vat-22',
        vatSnapshot: { code: '22', ratePercent: 22 },
        lineTotalMinor: 30000,
      },
    ],
    linkedDocuments: [
      {
        id: 'doc-1',
        type: 'goods_receipt',
        reference: 'CAR-2026-0005',
        number: 5,
        documentDate: new Date('2026-07-12T00:00:00.000Z'),
        status: 'confirmed',
      },
    ],
  };

  it('exportPdf genera un buffer PDF valido con nome file dal riferimento', async () => {
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

    const { buffer, filename } = await service.exportPdf('tenant-1', baseOrder);

    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(filename).toBe('ordine-fornitore-OF-2026-0042.pdf');
  });

  it('exportPdf gestisce ordine minimale (senza consegna prevista, rif. fornitore e righe)', async () => {
    prisma.tenant.findUniqueOrThrow.mockResolvedValue({
      name: 'Negozio',
      legalName: null,
      vatNumber: null,
      addressLine1: null,
      addressLine2: null,
      postalCode: null,
      city: null,
      province: null,
    });

    const { buffer } = await service.exportPdf('tenant-1', {
      ...baseOrder,
      expectedAt: null,
      supplierReference: null,
      linkedDocuments: [],
      lines: [],
    });

    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  });
});
