import { describe, expect, it } from 'vitest';

import { SupplierOrderStatus } from '@core/models/supplier-order.model';

import { mapSupplierOrderApiRow } from './supplier-order-api.mapper';

describe('mapSupplierOrderApiRow', () => {
  it('mappa totali, costi riga, sconto e IVA', () => {
    const order = mapSupplierOrderApiRow({
      id: 'ord-1',
      tenantId: 'tenant-1',
      reference: 'OF-2026-0001',
      supplierId: 'sup-1',
      supplierName: 'Fornitore ABC',
      status: SupplierOrderStatus.Confirmed,
      currency: 'EUR',
      costEntryMode: 'vat_excluded',
      orderDate: '2026-06-01T00:00:00.000Z',
      supplierReference: 'CONF-77',
      subtotalMinor: 5990,
      taxMinor: 1318,
      totalMinor: 7308,
      expectedAt: '2026-07-01',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
      lines: [
        {
          id: 'line-1',
          orderId: 'ord-1',
          variantId: 'var-1',
          sku: 'SKU-RED-M',
          description: 'T-shirt — M / Rosso',
          orderedQuantity: 10,
          receivedQuantity: 0,
          unitCostMinor: 599,
          enteredUnitCostMinor: 599,
          discountPercent: 10,
          vatCodeId: 'vat-22',
          vatSnapshot: { code: '22', ratePercent: 22 },
          lineTotalMinor: 5391,
        },
      ],
      linkedDocuments: [
        {
          id: 'doc-1',
          type: 'goods_receipt',
          reference: 'CAR-2026-0005',
          number: 5,
          documentDate: '2026-06-10T00:00:00.000Z',
          status: 'confirmed',
        },
      ],
    });

    expect(order.totalAmount).toEqual({ amountMinor: 7308, currencyCode: 'EUR' });
    expect(order.subtotal).toEqual({ amountMinor: 5990, currencyCode: 'EUR' });
    expect(order.tax).toEqual({ amountMinor: 1318, currencyCode: 'EUR' });
    expect(order.supplierReference).toBe('CONF-77');
    expect(order.lines[0]?.unitCost).toEqual({ amountMinor: 599, currencyCode: 'EUR' });
    expect(order.lines[0]?.discountPercent).toBe(10);
    expect(order.lines[0]?.vatCode).toBe('22');
    expect(order.lines[0]?.vatRatePercent).toBe(22);
    expect(order.lines[0]?.lineTotal.amountMinor).toBe(5391);
    expect(order.linkedDocuments?.[0]?.reference).toBe('CAR-2026-0005');
    expect(order.expectedAt).toBe('2026-07-01');
  });

  it('normalizza i campi opzionali assenti (payload legacy)', () => {
    const order = mapSupplierOrderApiRow({
      id: 'ord-2',
      tenantId: 'tenant-1',
      reference: 'OF-2026-0002',
      supplierId: 'sup-1',
      supplierName: 'Fornitore ABC',
      destinationLocationId: 'loc-1',
      status: SupplierOrderStatus.Concluded,
      currency: 'EUR',
      totalMinor: 1000,
      expectedAt: null,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
      lines: [
        {
          id: 'line-1',
          orderId: 'ord-2',
          variantId: 'var-1',
          sku: 'SKU-1',
          orderedQuantity: 2,
          receivedQuantity: 2,
          unitCostMinor: 500,
        },
      ],
    });

    expect(order.expectedAt).toBeUndefined();
    expect(order.supplierReference).toBeUndefined();
    expect(order.costEntryMode).toBe('vat_excluded');
    expect(order.orderDate).toBe('2026-06-01T00:00:00.000Z');
    expect(order.subtotal.amountMinor).toBe(1000);
    expect(order.tax.amountMinor).toBe(0);
    expect(order.lines[0]?.description).toBe('SKU-1');
    expect(order.lines[0]?.enteredUnitCost.amountMinor).toBe(500);
    expect(order.lines[0]?.lineTotal.amountMinor).toBe(1000);
  });

  // ── Le colonne NUMERIC arrivano come stringhe ──────────────────────────────
  // Prisma serializza `NUMERIC` in stringa decimale, non in numero: senza
  // conversione il costo resterebbe testo e ogni calcolo a valle lo tratterebbe
  // per quello che sembra, non per quello che vale.
  it('converte in numero i costi e lo sconto che arrivano come stringhe decimali', () => {
    const order = mapSupplierOrderApiRow({
      id: 'ord-3',
      tenantId: 'tenant-1',
      reference: 'OF-2026-0003',
      supplierId: 'sup-1',
      supplierName: 'Fornitore ABC',
      status: SupplierOrderStatus.Confirmed,
      currency: 'EUR',
      totalMinor: 502,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
      lines: [
        {
          id: 'line-1',
          orderId: 'ord-3',
          variantId: 'var-1',
          sku: 'SKU-1',
          orderedQuantity: 1,
          receivedQuantity: 0,
          // 5,02 ivati al 22%: il netto canonico porta la coda dello scorporo.
          unitCostMinor: '411.4754',
          enteredUnitCostMinor: '502.0000',
          discountPercent: '13.6000',
        },
      ],
    });

    expect(order.lines[0]?.unitCost.amountMinor).toBe(411.4754);
    expect(order.lines[0]?.enteredUnitCost.amountMinor).toBe(502);
    expect(order.lines[0]?.discountPercent).toBe(13.6);
  });

  // ── La trappola del ripiego ────────────────────────────────────────────────
  // `enteredUnitCostMinor ?? unitCostMinor` deve ripiegare PRIMA della
  // conversione. Convertire per primo — `Number(entered) ?? unitCost` — farebbe
  // valere ZERO un costo assente, perché `Number(null)` è 0 e `0 ?? x` resta 0:
  // l'ordine si riaprirebbe con la riga a costo nullo, senza dire niente.
  it('con costo digitato assente ripiega sul netto canonico, non su zero', () => {
    const order = mapSupplierOrderApiRow({
      id: 'ord-4',
      tenantId: 'tenant-1',
      reference: 'OF-2026-0004',
      supplierId: 'sup-1',
      supplierName: 'Fornitore ABC',
      status: SupplierOrderStatus.Confirmed,
      currency: 'EUR',
      totalMinor: 1000,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
      lines: [
        {
          id: 'line-1',
          orderId: 'ord-4',
          variantId: 'var-1',
          sku: 'SKU-1',
          orderedQuantity: 2,
          receivedQuantity: 0,
          unitCostMinor: '500.0000',
          enteredUnitCostMinor: null,
        },
      ],
    });

    expect(order.lines[0]?.enteredUnitCost.amountMinor).toBe(500);
  });
});
