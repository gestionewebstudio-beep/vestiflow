import { DocumentType, MovementOrigin, StockMovementType } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  aggregateSalesMovements,
  channelOfOrigin,
  topProductsOf,
  type AggregatableMovement,
} from './movement-sales.util';
import { onlineOriginalKey, type RevenueLineMaps } from './movement-sales-revenue.util';

const maps: RevenueLineMaps = {
  documentLineTotal: new Map([
    ['dl-1', 3000],
    ['dl-ret', 1500],
  ]),
  onlineSaleLineTotal: new Map([
    ['ol-1', 5000],
    ['ol-2', 4000],
  ]),
  onlineOriginalUnitPrice: new Map([[onlineOriginalKey('sale-9', 'var-x'), 2000]]),
};

function mov(overrides: Partial<AggregatableMovement>): AggregatableMovement {
  return {
    type: StockMovementType.sale,
    origin: MovementOrigin.vestiflow_pos,
    quantity: 1,
    sku: 'SKU',
    variantId: 'var',
    totalCostMinor: 0,
    sourceDocumentType: DocumentType.store_sale,
    sourceDocumentId: 'doc',
    sourceLineId: 'dl-1',
    createdAt: new Date('2026-07-10T10:00:00.000Z'),
    productName: 'Prod',
    ...overrides,
  };
}

const scenario: AggregatableMovement[] = [
  // Vendita POS: ricavo 3000 (riga doc), costo 1200.
  mov({ sku: 'SKU-A', variantId: 'var-a', quantity: 2, totalCostMinor: 1200, sourceDocumentId: 'doc-1', sourceLineId: 'dl-1', productName: 'Prod A' }),
  // Vendita online Shopify: ricavo 5000 (riga online), costo 2500.
  mov({
    type: StockMovementType.online_sale,
    origin: MovementOrigin.shopify,
    sku: 'SKU-B', variantId: 'var-b', quantity: 1, totalCostMinor: 2500,
    sourceDocumentType: DocumentType.online_sale, sourceDocumentId: 'os-1', sourceLineId: 'ol-1', productName: 'Prod B',
  }),
  // Reso POS: -1500 ricavo (riga reso), -1200 costo (congelato originale).
  mov({
    type: StockMovementType.return, sku: 'SKU-A', variantId: 'var-a', quantity: 1, totalCostMinor: 1200,
    sourceDocumentType: DocumentType.store_return, sourceDocumentId: 'doc-ret', sourceLineId: 'dl-ret',
    createdAt: new Date('2026-07-11T09:00:00.000Z'), productName: 'Prod A',
  }),
  // Reso online (nessuna riga): ricavo invertito al prezzo originale 2000.
  mov({
    type: StockMovementType.return, origin: MovementOrigin.shopify,
    sku: 'SKU-B', variantId: 'var-x', quantity: 1, totalCostMinor: 2000,
    sourceDocumentType: DocumentType.online_sale, sourceDocumentId: 'sale-9', sourceLineId: null,
    createdAt: new Date('2026-07-11T09:00:00.000Z'), productName: 'Prod B',
  }),
  // Vendita online manuale a costo IGNOTO: ricavo 4000 contato, costo fuori dal margine.
  mov({
    type: StockMovementType.online_sale, origin: MovementOrigin.vestiflow_online,
    sku: 'SKU-C', variantId: 'var-c', quantity: 1, totalCostMinor: null,
    sourceDocumentType: DocumentType.online_sale, sourceDocumentId: 'os-2', sourceLineId: 'ol-2', productName: 'Prod C',
  }),
];

describe('aggregateSalesMovements', () => {
  const agg = aggregateSalesMovements(scenario, maps, ['2026-07-10', '2026-07-11']);

  it('ricavo netto = vendite − resi (dalle righe collegate)', () => {
    // 3000 + 5000 − 1500 − 2000 + 4000
    expect(agg.revenueMinor).toBe(8500);
  });

  it('costo netto dai costi congelati sui movimenti', () => {
    // 1200 + 2500 − 1200 − 2000 + (null escluso)
    expect(agg.costMinor).toBe(500);
  });

  it('ricavo a costo noto esclude i movimenti senza costo (denominatore margine)', () => {
    // 3000 + 5000 − 1500 − 2000 (SKU-C escluso)
    expect(agg.costKnownRevenueMinor).toBe(4500);
  });

  it('unità nette', () => {
    expect(agg.unitsSold).toBe(2);
  });

  it('una transazione = un documento di vendita (i resi non contano)', () => {
    // doc-1, os-1, os-2 → 3
    expect(agg.transactionCount).toBe(3);
  });

  it('ripartizione per canale (esterno = shopify+tiktok)', () => {
    expect(agg.byChannel.pos).toEqual({ revenueMinor: 1500, unitsSold: 1 });
    expect(agg.byChannel.shopify).toEqual({ revenueMinor: 3000, unitsSold: 0 });
    expect(agg.byChannel.online_manual).toEqual({ revenueMinor: 4000, unitsSold: 1 });
  });

  it('ricavo giornaliero coi resi in negativo', () => {
    expect(agg.daily.get('2026-07-10')).toBe(12000);
    expect(agg.daily.get('2026-07-11')).toBe(-3500);
  });

  it('top prodotti per ricavo (positivi), ordinati', () => {
    const top = topProductsOf(agg.topProducts);
    expect(top.map((row) => [row.sku, row.revenueMinor])).toEqual([
      ['SKU-C', 4000],
      ['SKU-B', 3000],
      ['SKU-A', 1500],
    ]);
  });

  // ── Verifiche incrociate (grandezze che devono coincidere) ────────────────

  it('cross-check: la somma dei canali = ricavo totale', () => {
    const byChannelTotal =
      agg.byChannel.shopify.revenueMinor +
      agg.byChannel.pos.revenueMinor +
      agg.byChannel.online_manual.revenueMinor;
    expect(byChannelTotal).toBe(agg.revenueMinor);
  });

  it('cross-check: vendita + reso completo azzera ricavo, costo e margine', () => {
    const sale = mov({
      quantity: 1, totalCostMinor: 1200, sourceDocumentId: 'd1', sourceLineId: 'dl-1',
    });
    // Reso completo: stessa riga di ricavo (3000) e stesso costo congelato (1200).
    const fullReturn = mov({
      type: StockMovementType.return, quantity: 1, totalCostMinor: 1200,
      sourceDocumentType: DocumentType.store_return, sourceDocumentId: 'd-ret', sourceLineId: 'dl-1',
    });
    const zeroed = aggregateSalesMovements([sale, fullReturn], maps);
    expect(zeroed.revenueMinor).toBe(0);
    expect(zeroed.costMinor).toBe(0);
    expect(zeroed.costKnownRevenueMinor).toBe(0);
  });
});

describe('channelOfOrigin', () => {
  it('shopify e tiktok confluiscono nel canale online', () => {
    expect(channelOfOrigin(MovementOrigin.shopify)).toBe('shopify');
    expect(channelOfOrigin(MovementOrigin.tiktok)).toBe('shopify');
  });

  it('pos, online manuale, e nessun canale per manual', () => {
    expect(channelOfOrigin(MovementOrigin.vestiflow_pos)).toBe('pos');
    expect(channelOfOrigin(MovementOrigin.vestiflow_online)).toBe('online_manual');
    expect(channelOfOrigin(MovementOrigin.manual)).toBeNull();
  });
});
