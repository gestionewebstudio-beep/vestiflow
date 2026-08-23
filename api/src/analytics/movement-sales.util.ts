import { MovementOrigin, StockMovementType } from '@prisma/client';

import {
  movementRevenueMinor,
  type RevenueLineMaps,
  type SaleMovementLike,
} from './movement-sales-revenue.util';
import { toUtcIsoDate } from './report-period.util';

/** Canali del report: canale esterno online, negozio fisico, online manuale. */
export type ReportChannel = 'shopify' | 'pos' | 'online_manual';

export interface ProductAccumulator {
  sku: string;
  title: string;
  revenueMinor: number;
  unitsSold: number;
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
  sku: string,
  title: string,
  revenueMinor: number,
  unitsSold: number,
): void {
  const existing = map.get(sku);
  if (existing) {
    existing.revenueMinor += revenueMinor;
    existing.unitsSold += unitsSold;
    return;
  }
  map.set(sku, { sku, title, revenueMinor, unitsSold });
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
    const revenue = sign * movementRevenueMinor(movement, maps);
    const units = sign * movement.quantity;

    acc.revenueMinor += revenue;
    acc.unitsSold += units;
    // ⛔ Qui c'era un ramo `totalCostMinor !== null` che teneva fuori dal
    // margine i movimenti «senza costo», e un `costKnownRevenueMinor` che ne
    // misurava la copertura. Il costo congelato non è più nullable: zero è un
    // costo, e un movimento a costo zero entra nel margine come ogni altro.
    acc.costMinor += sign * movement.totalCostMinor;

    const channel = channelOfOrigin(movement.origin);
    if (channel) {
      acc.byChannel[channel].revenueMinor += revenue;
      acc.byChannel[channel].unitsSold += units;
    }

    addProductRow(acc.topProducts, movement.sku, movement.productName, revenue, units);

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

/** Top prodotti per ricavo (positivi), ordinati e limitati. */
export function topProductsOf(map: Map<string, ProductAccumulator>): readonly ProductAccumulator[] {
  return [...map.values()]
    .filter((row) => row.revenueMinor > 0)
    .sort((a, b) => b.revenueMinor - a.revenueMinor)
    .slice(0, 10);
}
