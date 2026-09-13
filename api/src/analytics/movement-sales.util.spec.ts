import { DocumentType, MovementOrigin, SalesOrderSource, StockMovementType } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  addOnlineRefundsToAggregate,
  addOnlineSalesToAggregate,
  type AggregatableMovement,
  type AggregatableOnlineRefund,
  type AggregatableOnlineSale,
  aggregateSalesMovements,
  channelOfOrigin,
  channelOfSale,
  topProductsOf,
} from './movement-sales.util';
import type { RevenueLineMaps } from './movement-sales-revenue.util';

const maps: RevenueLineMaps = {
  documentLineTotal: new Map([
    ['dl-1', 3000],
    ['dl-ret', 1500],
  ]),
  onlineSaleLineTotal: new Map([
    ['ol-1', 5000],
    ['ol-2', 4000],
  ]),
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
  mov({
    sku: 'SKU-A',
    variantId: 'var-a',
    quantity: 2,
    totalCostMinor: 1200,
    sourceDocumentId: 'doc-1',
    sourceLineId: 'dl-1',
    productName: 'Prod A',
  }),
  // Vendita online Shopify: ricavo 5000 (riga online), costo 2500.
  mov({
    type: StockMovementType.online_sale,
    origin: MovementOrigin.shopify,
    sku: 'SKU-B',
    variantId: 'var-b',
    quantity: 1,
    totalCostMinor: 2500,
    sourceDocumentType: DocumentType.online_sale,
    sourceDocumentId: 'os-1',
    sourceLineId: 'ol-1',
    productName: 'Prod B',
  }),
  // Reso POS: -1500 ricavo (riga reso), -1200 costo (congelato originale).
  mov({
    type: StockMovementType.return,
    sku: 'SKU-A',
    variantId: 'var-a',
    quantity: 1,
    totalCostMinor: 1200,
    sourceDocumentType: DocumentType.store_return,
    sourceDocumentId: 'doc-ret',
    sourceLineId: 'dl-ret',
    createdAt: new Date('2026-07-11T09:00:00.000Z'),
    productName: 'Prod A',
  }),
  // Reso online (nessuna riga): porta SOLO il costo (−2000); ricavo e pezzi della
  // rettifica vengono dal rimborso persistito (13/09/2026).
  mov({
    type: StockMovementType.return,
    origin: MovementOrigin.shopify,
    sku: 'SKU-B',
    variantId: 'var-x',
    quantity: 1,
    totalCostMinor: 2000,
    sourceDocumentType: DocumentType.online_sale,
    sourceDocumentId: 'sale-9',
    sourceLineId: null,
    createdAt: new Date('2026-07-11T09:00:00.000Z'),
    productName: 'Prod B',
  }),
  // Vendita online a costo ZERO: entra nel margine come ogni altra — un costo
  // non valorizzato vale zero, non «ignoto» (`regole-gestionale`).
  mov({
    type: StockMovementType.online_sale,
    origin: MovementOrigin.vestiflow_online,
    sku: 'SKU-C',
    variantId: 'var-c',
    quantity: 1,
    totalCostMinor: 0,
    sourceDocumentType: DocumentType.online_sale,
    sourceDocumentId: 'os-2',
    sourceLineId: 'ol-2',
    productName: 'Prod C',
  }),
];

describe('aggregateSalesMovements', () => {
  const agg = aggregateSalesMovements(scenario, maps, ['2026-07-10', '2026-07-11']);

  it('ricavo netto = vendite − resi (dalle righe collegate); il reso online non toglie ricavo qui', () => {
    // 3000 + 5000 − 1500 + 4000 (il reso online −2000 NON c'è più: è del rimborso)
    expect(agg.revenueMinor).toBe(10500);
  });

  it('costo netto dai costi congelati sui movimenti', () => {
    // 1200 + 2500 − 1200 − 2000 + 0
    expect(agg.costMinor).toBe(500);
  });

  // ⛔ Qui c'era «ricavo a costo noto esclude i movimenti senza costo»: il
  // ricavo a costo noto non esiste più, perché non esistono movimenti senza
  // costo. Il ricavo li conta TUTTI, SKU-C compreso.
  it('il ricavo conta ogni movimento, anche quelli a costo zero', () => {
    // 3000 + 5000 − 1500 + 4000 (SKU-C incluso)
    expect(agg.revenueMinor).toBe(10500);
  });

  it('unità nette (il pezzo del reso online lo toglie il rimborso, non il movimento)', () => {
    // 2 + 1 − 1 + 1 = 3
    expect(agg.unitsSold).toBe(3);
  });

  it('una transazione = un documento di vendita (i resi non contano)', () => {
    // doc-1, os-1, os-2 → 3
    expect(agg.transactionCount).toBe(3);
  });

  it('ripartizione per canale (esterno = shopify+tiktok)', () => {
    expect(agg.byChannel.pos).toEqual({ revenueMinor: 1500, unitsSold: 1 });
    expect(agg.byChannel.shopify).toEqual({ revenueMinor: 5000, unitsSold: 1 });
    expect(agg.byChannel.online_manual).toEqual({ revenueMinor: 4000, unitsSold: 1 });
  });

  it('ricavo giornaliero coi resi in negativo', () => {
    expect(agg.daily.get('2026-07-10')).toBe(12000);
    expect(agg.daily.get('2026-07-11')).toBe(-1500);
  });

  it('top prodotti per ricavo (positivi), ordinati', () => {
    const top = topProductsOf(agg.topProducts);
    expect(top.map((row) => [row.sku, row.revenueMinor])).toEqual([
      ['SKU-B', 5000],
      ['SKU-C', 4000],
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
      quantity: 1,
      totalCostMinor: 1200,
      sourceDocumentId: 'd1',
      sourceLineId: 'dl-1',
    });
    // Reso completo: stessa riga di ricavo (3000) e stesso costo congelato (1200).
    const fullReturn = mov({
      type: StockMovementType.return,
      quantity: 1,
      totalCostMinor: 1200,
      sourceDocumentType: DocumentType.store_return,
      sourceDocumentId: 'd-ret',
      sourceLineId: 'dl-1',
    });
    const zeroed = aggregateSalesMovements([sale, fullReturn], maps);
    expect(zeroed.revenueMinor).toBe(0);
    expect(zeroed.costMinor).toBe(0);
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

describe('addOnlineSalesToAggregate — strada A (12/09/2026)', () => {
  const vendita = (extra: Partial<AggregatableOnlineSale> = {}): AggregatableOnlineSale => ({
    id: 'sale-1',
    channel: 'shopify',
    fulfilledAt: new Date('2026-09-02T10:00:00Z'),
    costMinor: 900,
    lines: [
      { variantId: 'var-a', sku: 'A', productName: 'Abito', quantity: 3, totalMinor: 7500 },
      { variantId: 'var-c', sku: 'C', productName: 'Cintura', quantity: 1, totalMinor: 1000 },
    ],
    ...extra,
  });

  it('una Vendita conta UNA volta, nel giorno della sua data, con i totali di riga e il costo congelato', () => {
    const acc = aggregateSalesMovements([], maps, ['2026-09-01', '2026-09-02']);
    addOnlineSalesToAggregate(acc, [vendita()]);
    expect(acc).toMatchObject({
      revenueMinor: 8500,
      unitsSold: 4,
      costMinor: 900,
      transactionCount: 1,
    });
    expect(acc.byChannel.shopify).toEqual({ revenueMinor: 8500, unitsSold: 4 });
    expect(acc.daily.get('2026-09-02')).toBe(8500);
    expect(acc.daily.get('2026-09-01')).toBe(0);
    expect([...acc.topProducts.values()].map((r) => [r.sku, r.revenueMinor, r.unitsSold])).toEqual([
      ['A', 7500, 3],
      ['C', 1000, 1],
    ]);
    expect([...acc.topProducts.keys()]).toEqual(['var-a', 'var-c']);
  });

  it('il costo è quello della Vendita anche se i suoi movimenti sono di un altro mese: il margine confronta le stesse righe', () => {
    // 1 pezzo uscito ad agosto (costo 300) e 2 a settembre (costo 600): la
    // Vendita di settembre porta 900, non 600.
    const acc = aggregateSalesMovements([], maps, ['2026-09-02']);
    addOnlineSalesToAggregate(acc, [vendita({ costMinor: 900 })]);
    expect(acc.revenueMinor - acc.costMinor).toBe(7600);
  });

  it('il canale: shopify_online e shopify_pos sono «shopify», il resto è online manuale', () => {
    expect(channelOfSale(SalesOrderSource.shopify_online)).toBe('shopify');
    expect(channelOfSale(SalesOrderSource.shopify_pos)).toBe('shopify');
    expect(channelOfSale(SalesOrderSource.manual)).toBe('online_manual');
  });
});

/**
 * ⭐ Le RETTIFICHE del canale nel Cruscotto (deciso dal proprietario il 13/09/2026):
 *    si riusano i rimborsi persistiti, alla loro data, senza toccare le Vendite
 *    online e senza un secondo calcolo. I numeri sono quelli del collaudo: il
 *    giorno di #1012 (1 pezzo, 600,00) e #1014 (3 ordinati, 1 annullato prima
 *    della spedizione, 749,95 rimborsati) deve dire 2 vendite · 3 pezzi netti ·
 *    2.099,90 di valore netto delle vendite.
 */
describe('addOnlineRefundsToAggregate — le rettifiche del canale (13/09/2026)', () => {
  const giorno = '2026-09-13';
  const vendite: AggregatableOnlineSale[] = [
    {
      id: 'vo-1',
      channel: 'shopify',
      fulfilledAt: new Date('2026-09-13T13:13:52Z'),
      costMinor: 60000,
      lines: [
        { variantId: 'var-snow', sku: 'SNOW', productName: 'The Hidden Snowboard', quantity: 3, totalMinor: 224985 },
      ],
    },
    {
      id: 'vo-2',
      channel: 'shopify',
      fulfilledAt: new Date('2026-09-13T12:00:00Z'),
      costMinor: 20000,
      lines: [
        { variantId: 'var-arch', sku: 'ARCH', productName: 'The Archived Snowboard', quantity: 1, totalMinor: 60000 },
      ],
    },
  ];
  const annullamentoParziale: AggregatableOnlineRefund = {
    id: 'r-1014',
    channel: 'shopify',
    occurredAt: new Date('2026-09-13T13:11:58Z'),
    totalMinor: 74995,
    lines: [
      { variantId: 'var-snow', sku: 'SNOW', productName: 'The Hidden Snowboard', quantity: 1, amountMinor: 74995 },
    ],
  };

  function cruscotto(rettifiche: readonly AggregatableOnlineRefund[], giorni = [giorno]) {
    const acc = aggregateSalesMovements([], maps, giorni);
    addOnlineSalesToAggregate(acc, vendite);
    return addOnlineRefundsToAggregate(acc, rettifiche);
  }

  it('⭐ #1014 e #1012: 2 vendite · 3 pezzi netti · 2.099,90 — il costo resta quello dei movimenti', () => {
    const acc = cruscotto([annullamentoParziale]);
    expect(acc.transactionCount).toBe(2);
    expect(acc.unitsSold).toBe(3);
    expect(acc.revenueMinor).toBe(209990);
    // Il pezzo annullato non era mai uscito: nessun costo da togliere, e nessuno tolto.
    expect(acc.costMinor).toBe(80000);
    expect(acc.byChannel.shopify).toEqual({ revenueMinor: 209990, unitsSold: 3 });
    expect(acc.daily.get(giorno)).toBe(209990);
    expect(acc.topProducts.get('var-snow')).toEqual({
      variantId: 'var-snow',
      sku: 'SNOW',
      title: 'The Hidden Snowboard',
      revenueMinor: 149990,
      unitsSold: 2,
    });
  });

  it('un rimborso SENZA righe (spedizione, importo) toglie valore e nessun pezzo', () => {
    const soloImporto: AggregatableOnlineRefund = {
      id: 'r-sped',
      channel: 'shopify',
      occurredAt: new Date('2026-09-13T15:00:00Z'),
      totalMinor: 990,
      lines: [],
    };
    const acc = cruscotto([soloImporto]);
    expect(acc.unitsSold).toBe(4);
    expect(acc.revenueMinor).toBe(284985 - 990);
  });

  it('una riga rimborsata CON quantità toglie i pezzi qualunque sia il reintegro: reso, no_restock, cancel', () => {
    // Tre rettifiche da un pezzo ciascuna, tre gesti fisici diversi, stessa grandezza economica.
    const rettifiche: AggregatableOnlineRefund[] = ['reso', 'no_restock', 'cancel'].map((id, i) => ({
      id,
      channel: 'shopify',
      occurredAt: new Date(`2026-09-13T1${i}:00:00Z`),
      totalMinor: 74995,
      lines: [
      { variantId: 'var-snow', sku: 'SNOW', productName: 'The Hidden Snowboard', quantity: 1, amountMinor: 74995 },
    ],
    }));
    const acc = cruscotto(rettifiche);
    expect(acc.unitsSold).toBe(1);
    expect(acc.revenueMinor).toBe(284985 - 3 * 74995);
  });

  it('una rettifica in un periodo successivo resta nel suo giorno, e non tocca quello della vendita', () => {
    const dopo: AggregatableOnlineRefund = { ...annullamentoParziale, occurredAt: new Date('2026-09-20T10:00:00Z') };
    const acc = cruscotto([dopo], ['2026-09-13', '2026-09-20']);
    expect(acc.daily.get('2026-09-13')).toBe(284985);
    expect(acc.daily.get('2026-09-20')).toBe(-74995);
    expect(acc.revenueMinor).toBe(209990);
  });

  it('il rientro fisico (movimento di reso online) porta solo il costo: con il rimborso non si sottrae due volte', () => {
    const acc = aggregateSalesMovements(
      [
        mov({
          type: StockMovementType.return,
          origin: MovementOrigin.shopify,
          sku: 'SNOW',
          variantId: 'var-snow',
          quantity: 1,
          totalCostMinor: 20000,
          sourceDocumentType: DocumentType.online_sale,
          sourceDocumentId: 'vo-1',
          sourceLineId: null,
          createdAt: new Date('2026-09-13T16:00:00Z'),
          productName: 'The Hidden Snowboard',
        }),
      ],
      maps,
      [giorno],
    );
    addOnlineSalesToAggregate(acc, vendite);
    addOnlineRefundsToAggregate(acc, [
      {
        id: 'r-reso',
        channel: 'shopify',
        occurredAt: new Date('2026-09-13T16:00:00Z'),
        totalMinor: 74995,
        lines: [
      { variantId: 'var-snow', sku: 'SNOW', productName: 'The Hidden Snowboard', quantity: 1, amountMinor: 74995 },
    ],
      },
    ]);
    // Ricavo e pezzi: una volta sola, dal rimborso. Costo: una volta sola, dal movimento.
    expect(acc.revenueMinor).toBe(284985 - 74995);
    expect(acc.unitsSold).toBe(3);
    expect(acc.costMinor).toBe(80000 - 20000);
  });
});

/**
 * ⭐ L'identità di «Top prodotti» è la VARIANTE, non lo SKU né il titolo (proprietario,
 *    13/09/2026). Sul negozio due prodotti importati senza SKU — riga con «—» — si
 *    fondevano in una riga sola; e due varianti eliminate (nel cestino) con lo stesso nome
 *    devono restare due.
 */
describe('Top prodotti — l’identità è la variante', () => {
  const senzaSku = (variantId: string, nome: string, totalMinor: number): AggregatableOnlineSale => ({
    id: `vo-${variantId}`,
    channel: 'shopify',
    fulfilledAt: new Date('2026-09-13T12:00:00Z'),
    costMinor: 0,
    lines: [{ variantId, sku: '—', productName: nome, quantity: 1, totalMinor }],
  });

  it('due prodotti senza SKU (riga «—») restano due righe', () => {
    const acc = aggregateSalesMovements([], maps);
    addOnlineSalesToAggregate(acc, [
      senzaSku('var-hydrogen', 'The Collection Snowboard: Hydrogen', 60000),
      senzaSku('var-hidden', 'The Hidden Snowboard', 224985),
    ]);
    expect(topProductsOf(acc.topProducts).map((r) => [r.variantId, r.sku, r.title, r.unitsSold])).toEqual([
      ['var-hidden', '—', 'The Hidden Snowboard', 1],
      ['var-hydrogen', '—', 'The Collection Snowboard: Hydrogen', 1],
    ]);
  });

  it('due varianti con lo STESSO nome e lo stesso SKU vuoto restano due righe: l’id le distingue', () => {
    const acc = aggregateSalesMovements([], maps);
    addOnlineSalesToAggregate(acc, [
      { ...senzaSku('var-1', 'Gemella', 1000), lines: [{ variantId: 'var-1', sku: '', productName: 'Gemella', quantity: 1, totalMinor: 1000 }] },
      { ...senzaSku('var-2', 'Gemella', 2000), lines: [{ variantId: 'var-2', sku: '', productName: 'Gemella', quantity: 2, totalMinor: 2000 }] },
    ]);
    expect(topProductsOf(acc.topProducts).map((r) => [r.variantId, r.title, r.unitsSold, r.revenueMinor])).toEqual([
      ['var-2', 'Gemella', 2, 2000],
      ['var-1', 'Gemella', 1, 1000],
    ]);
  });

  it('⛔ una riga SENZA variante non si fonde con nessuno: conta nei totali, non nella classifica', () => {
    const acc = aggregateSalesMovements([], maps);
    addOnlineSalesToAggregate(acc, [
      { ...senzaSku('var-x', 'Gemella', 1000), lines: [{ variantId: null, sku: '', productName: 'Gemella', quantity: 1, totalMinor: 1000 }] },
      senzaSku('var-1', 'Gemella', 500),
    ]);
    expect(acc.revenueMinor).toBe(1500);
    expect(acc.unitsSold).toBe(2);
    expect(topProductsOf(acc.topProducts).map((r) => [r.variantId, r.revenueMinor])).toEqual([['var-1', 500]]);
  });
});
