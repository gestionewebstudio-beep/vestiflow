import { SupplierOrderStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { SupplierOrderPdfService } from './supplier-order-pdf.service';
import type { SupplierOrderWithLines } from './supplier-orders.service';

describe('SupplierOrderPdfService', () => {
  const prisma = {
    tenant: { findUniqueOrThrow: vi.fn() },
    location: { findFirst: vi.fn() },
  };

  const service = new SupplierOrderPdfService(prisma as never);

  const baseOrder: SupplierOrderWithLines = {
    id: 'po-1',
    tenantId: 'tenant-1',
    reference: 'PO-2026-0042',
    supplierId: 'sup-1',
    supplierName: 'Fornitore Demo Srl',
    destinationLocationId: 'loc-1',
    status: SupplierOrderStatus.sent,
    currency: 'EUR',
    totalMinor: 30000,
    expectedAt: new Date('2026-08-01T00:00:00.000Z'),
    createdAt: new Date('2026-07-10T09:00:00.000Z'),
    updatedAt: new Date('2026-07-10T09:00:00.000Z'),
    lines: [
      {
        id: 'line-1',
        orderId: 'po-1',
        variantId: 'var-1',
        sku: 'SKU-001',
        orderedQuantity: 3,
        receivedQuantity: 0,
        unitCostMinor: 10000,
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
    prisma.location.findFirst.mockResolvedValue({ name: 'Magazzino centrale' });

    const { buffer, filename } = await service.exportPdf('tenant-1', baseOrder);

    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(filename).toBe('ordine-fornitore-PO-2026-0042.pdf');
    expect(prisma.location.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', id: 'loc-1' },
      select: { name: true },
    });
  });

  it('exportPdf gestisce ordine senza data attesa e location mancante', async () => {
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
    prisma.location.findFirst.mockResolvedValue(null);

    const { buffer } = await service.exportPdf('tenant-1', {
      ...baseOrder,
      expectedAt: null,
      lines: [],
    });

    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  });
});
