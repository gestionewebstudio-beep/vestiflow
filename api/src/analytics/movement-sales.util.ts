import { DocumentType, MovementOrigin, SalesOrderSource, StockMovementType } from '@prisma/client';

import {
  movementRevenueMinor,
  type RevenueLineMaps,
  type SaleMovementLike,
} from './movement-sales-revenue.util';
import { toUtcIsoDate } from './report-period.util';

/** Canali del report: canale esterno online, negozio fisico, online manuale. */
export type ReportChannel = 'shopify' | 'pos' | 'online_manual';

/**
 * ⭐ L'IDENTITÀ di una riga di «Top prodotti» è la VARIANTE (`variantId`), non lo
 *    SKU né il titolo (proprietario, 13/09/2026). Misurato sul negozio: due prodotti
 *    diversi importati senza SKU portavano `—` come SKU di riga e si fondevano in una
 *    riga sola. SKU e titolo restano dati descrittivi — anche vuoti — e da soli non
 *    garantiscono l'identità: due varianti nel cestino con lo stesso nome restano due.
 *    L'id della variante è stabile: l'eliminazione definitiva è rifiutata a chi ha
 *    movimenti, e il cestino conserva l'id.
 *
 * ⛔ Nessun ripiego su SKU o titolo: una riga SENZA variante (possibile solo su una
 *    riga senza movimenti, dopo un'eliminazione definitiva) non ha identità di
 *    prodotto — conta nei totali e nei canali, non entra nella classifica.
 */
export interface ProductAccumulator {
  variantId: string;
  sku: string;
  title: string;
  revenueMinor: number;
  unitsSold: number;
}

/** L'identità e la descrizione di una riga, come arrivano da movimenti, vendite e rimborsi. */
export interface ProductRowIdentity {
  readonly variantId: string | null;
  readonly sku: string;
  readonly title: string;
}

export interface SalesAggregate {
  revenueMinor: number;
  costMinor: number;
  unitsSold: number;
  transactionCount: number;
  byChannel: Record<ReportChannel, { revenueMinor: number; unitsSold: number }>;
  topProducts: Map<string, ProductAccumulator>;
  /** Ricavo per giorno (ISO date → minor). Popolato solo con `dailyDates`. */
  daily: Map<string, number>;
}

/** Movimento nella forma che serve all'aggregazione del report vendite. */
export type AggregatableMovement = SaleMovementLike & {
  readonly origin: MovementOrigin;
  readonly sku: string;
  readonly totalCostMinor: number;
  readonly createdAt: Date;
  readonly productName: string;
};

/**
 * Canale del report per l'origine del movimento. Il canale esterno (Shopify o
 * TikTok) confluisce in un unico bucket 'shopify' (etichettato dalla UI): il
 * tenant ne usa uno solo, e il report li tratta come "il canale online".
 */
export function channelOfOrigin(origin: MovementOrigin): ReportChannel | null {
  switch (origin) {
    case MovementOrigin.shopify:
    case MovementOrigin.tiktok:
      return 'shopify';
    case MovementOrigin.vestiflow_pos:
      return 'pos';
    case MovementOrigin.vestiflow_online:
      return 'online_manual';
    default:
      return null;
  }
}

function emptySalesAggregate(dailyDates?: readonly string[]): SalesAggregate {
  return {
    revenueMinor: 0,
    costMinor: 0,
    unitsSold: 0,
    transactionCount: 0,
    byChannel: {
      shopify: { revenueMinor: 0, unitsSold: 0 },
      pos: { revenueMinor: 0, unitsSold: 0 },
      online_manual: { revenueMinor: 0, unitsSold: 0 },
    },
    topProducts: new Map(),
    daily: new Map(dailyDates ? dailyDates.map((date) => [date, 0]) : []),
  };
}

function addProductRow(
  map: Map<string, ProductAccumulator>,
  identita: ProductRowIdentity,
  revenueMinor: number,
  unitsSold: number,
): void {
  if (identita.variantId === null) {
    return;
  }
  const existing = map.get(identita.variantId);
  if (existing) {
    existing.revenueMinor += revenueMinor;
    existing.unitsSold += unitsSold;
    return;
  }
  map.set(identita.variantId, {
    variantId: identita.variantId,
    sku: identita.sku,
    title: identita.title,
    revenueMinor,
    unitsSold,
  });
}

/**
 * Aggrega i movimenti di vendita in totali di report (funzione pura, §②/①b):
 * ricavo dalla riga collegata, costo CONGELATO dal movimento, reso in negativo.
 * Una transazione = un documento di vendita (non un movimento/riga).
 * `dailyDates` (ISO) abilita i bucket giornalieri; assente = nessun daily.
 */
export function aggregateSalesMovements(
  movements: readonly AggregatableMovement[],
  maps: RevenueLineMaps,
  dailyDates?: readonly string[],
): SalesAggregate {
  const acc = emptySalesAggregate(dailyDates);
  const saleDocuments = new Set<string>();

  for (const movement of movements) {
    const sign = movement.type === StockMovementType.return ? -1 : 1;
    // ⛔ Qui c'era un ramo `totalCostMinor !== null` che teneva fuori dal
    // margine i movimenti «senza costo», e un `costKnownRevenueMinor` che ne
    // misurava la copertura. Il costo congelato non è più nullable: zero è un
    // costo, e un movimento a costo zero entra nel margine come ogni altro.
    acc.costMinor += sign * movement.totalCostMinor;

    // ⭐ Il RESO ONLINE (rientro di una Vendita online) porta qui SOLO il costo:
    //    ricavo e pezzi della rettifica vengono dal rimborso persistito, alla sua
    //    data (`addOnlineRefundsToAggregate`). Contarli anche qui — com'era, al
    //    prezzo originale — sottrarrebbe il rientro due volte (13/09/2026).
    if (
      movement.type === StockMovementType.return &&
      movement.sourceDocumentType === DocumentType.online_sale
    ) {
      continue;
    }

    const revenue = sign * movementRevenueMinor(movement, maps);
    const units = sign * movement.quantity;

    acc.revenueMinor += revenue;
    acc.unitsSold += units;

    const channel = channelOfOrigin(movement.origin);
    if (channel) {
      acc.byChannel[channel].revenueMinor += revenue;
      acc.byChannel[channel].unitsSold += units;
    }

    addProductRow(
      acc.topProducts,
      { variantId: movement.variantId, sku: movement.sku, title: movement.productName },
      revenue,
      units,
    );

    if (movement.type !== StockMovementType.return && movement.sourceDocumentId) {
      saleDocuments.add(movement.sourceDocumentId);
    }

    if (dailyDates) {
      const date = toUtcIsoDate(movement.createdAt);
      if (acc.daily.has(date)) {
        acc.daily.set(date, (acc.daily.get(date) ?? 0) + revenue);
      }
    }
  }

  acc.transactionCount = saleDocuments.size;
  return acc;
}

/**
 * ⭐ Una Vendita online nella forma che serve al report (strada A, decisa dal
 *    proprietario il 12/09/2026): conta UNA volta, nel periodo della SUA data,
 *    con ricavo e pezzi delle sue righe e il COSTO congelato sui movimenti che
 *    l'hanno scaricata — anche se usciti in un altro mese. Le uscite fisiche
 *    restano consultabili per data del movimento, altrove: qui sono «vendute».
 */
export interface AggregatableOnlineSale {
  readonly id: string;
  readonly channel: ReportChannel;
  readonly fulfilledAt: Date;
  /** Σ `totalCostMinor` dei movimenti della Vendita nel perimetro: costo delle STESSE righe. */
  readonly costMinor: number;
  readonly lines: readonly {
    readonly variantId: string | null;
    readonly sku: string;
    readonly productName: string;
    readonly quantity: number;
    readonly totalMinor: number;
  }[];
}

/** Il canale del report per una Vendita online. */
export function channelOfSale(channel: SalesOrderSource): ReportChannel {
  switch (channel) {
    case SalesOrderSource.shopify_online:
    case SalesOrderSource.shopify_pos:
      return 'shopify';
    default:
      return 'online_manual';
  }
}

/**
 * Somma le Vendite online all'aggregato dei movimenti (funzione pura):
 * ricavo = totali di riga, pezzi = quantità di riga, UNA transazione per
 * Vendita, costo = quello congelato sui suoi movimenti. Il giorno è quello
 * della Vendita.
 */
export function addOnlineSalesToAggregate(
  acc: SalesAggregate,
  sales: readonly AggregatableOnlineSale[],
): SalesAggregate {
  for (const sale of sales) {
    let revenue = 0;
    let units = 0;
    for (const line of sale.lines) {
      revenue += line.totalMinor;
      units += line.quantity;
      addProductRow(
        acc.topProducts,
        { variantId: line.variantId, sku: line.sku, title: line.productName },
        line.totalMinor,
        line.quantity,
      );
    }
    acc.revenueMinor += revenue;
    acc.unitsSold += units;
    acc.costMinor += sale.costMinor;
    acc.transactionCount += 1;
    acc.byChannel[sale.channel].revenueMinor += revenue;
    acc.byChannel[sale.channel].unitsSold += units;
    const date = toUtcIsoDate(sale.fulfilledAt);
    if (acc.daily.has(date)) {
      acc.daily.set(date, (acc.daily.get(date) ?? 0) + revenue);
    }
  }
  return acc;
}

/**
 * ⭐ Una RETTIFICA del canale nella forma che serve al report: il rimborso
 *    persistito (`sales_order_refunds`), alla SUA data, con l'importo vero e i
 *    pezzi delle sue righe. Ammissibilità del Registro (`rettificaAmmessaWhere`):
 *    reso, rimborso, annullamento parziale di un ordine evaso.
 *
 * **I pezzi** (proprietario, 13/09/2026): una riga rimborsata CON quantità toglie
 * quei pezzi dai venduti netti qualunque sia il `restock_type` — `cancel` (mai
 * usciti), `return` (usciti e rientrati), `no_restock` (usciti e non rientrati):
 * il cliente non li paga più, e i venduti netti sono una grandezza economica, non
 * un'uscita fisica. Un rimborso SENZA righe (spedizione, rettifica di importo)
 * toglie valore e nessun pezzo. Il costo non passa di qui: lo dicono i movimenti
 * (scarico, rientro), che non si ricalcolano.
 */
export interface AggregatableOnlineRefund {
  readonly id: string;
  readonly channel: ReportChannel;
  readonly occurredAt: Date;
  /** L'importo del rimborso, spedizione e rettifiche comprese. */
  readonly totalMinor: number;
  readonly lines: readonly {
    readonly variantId: string | null;
    readonly sku: string;
    readonly productName: string;
    readonly quantity: number;
    /** Il valore della riga rimborsata (lordo), per il prodotto. */
    readonly amountMinor: number;
  }[];
}

/**
 * Sottrae le rettifiche del canale all'aggregato (funzione pura): importo e
 * pezzi alla data del rimborso, per canale e per prodotto. Nessuna transazione
 * in più: la vendita è già contata. Il costo resta quello dei movimenti.
 */
export function addOnlineRefundsToAggregate(
  acc: SalesAggregate,
  refunds: readonly AggregatableOnlineRefund[],
): SalesAggregate {
  for (const refund of refunds) {
    let units = 0;
    for (const line of refund.lines) {
      units += line.quantity;
      addProductRow(
        acc.topProducts,
        { variantId: line.variantId, sku: line.sku, title: line.productName },
        -line.amountMinor,
        -line.quantity,
      );
    }
    acc.revenueMinor -= refund.totalMinor;
    acc.unitsSold -= units;
    acc.byChannel[refund.channel].revenueMinor -= refund.totalMinor;
    acc.byChannel[refund.channel].unitsSold -= units;
    const date = toUtcIsoDate(refund.occurredAt);
    if (acc.daily.has(date)) {
      acc.daily.set(date, (acc.daily.get(date) ?? 0) - refund.totalMinor);
    }
  }
  return acc;
}

/** Top prodotti per ricavo (positivi), ordinati e limitati. */
export function topProductsOf(map: Map<string, ProductAccumulator>): readonly ProductAccumulator[] {
  return [...map.values()]
    .filter((row) => row.revenueMinor > 0)
    .sort((a, b) => b.revenueMinor - a.revenueMinor)
    .slice(0, 10);
}
