import { Injectable } from '@nestjs/common';
import { DocumentType, Prisma, StockMovementType } from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { canViewPurchaseCosts } from '../auth/user-permissions.util';
import { maskCostSensitiveSummary } from './business-analytics-cost-mask.util';
import { onlineSalesChannelLabel } from '../common/tenant-channel-profile.util';
import {
  locationScopeToInventoryLevelFilter,
  locationScopeToMovementFilter,
  resolveOperationalLocationScope,
} from '../inventory/licensed-location-scope.util';
import { PrismaService } from '../prisma/prisma.service';
import type { BusinessAnalyticsQueryDto } from './dto/business-analytics-query.dto';
import type { BusinessAnalyticsSummaryDto } from './dto/business-analytics-summary.dto';
import {
  aggregateSalesMovements,
  topProductsOf,
  type AggregatableMovement,
  type SalesAggregate,
} from './movement-sales.util';
import type { RevenueLineMaps } from './movement-sales-revenue.util';
import {
  addOnlineRefundsToAggregate,
  addOnlineSalesToAggregate,
  channelOfSale,
  type AggregatableOnlineRefund,
  type AggregatableOnlineSale,
} from './movement-sales.util';
import { rettificaAmmessaWhere } from '../corrispettivi/corrispettivi-query.util';

/** Le sedi del perimetro, dal filtro dei movimenti; `null` = nessun filtro. */
function sediDelPerimetro(scope: Prisma.StockMovementWhereInput): ReadonlySet<string> | null {
  const filtro = scope.locationId;
  if (typeof filtro === 'string') {
    return new Set([filtro]);
  }
  if (filtro && typeof filtro === 'object' && 'in' in filtro && Array.isArray(filtro.in)) {
    return new Set(filtro.in as string[]);
  }
  return null;
}
import {
  enumeratePeriodDates,
  periodDateTimeRange,
  previousReportPeriod,
  resolveReportPeriod,
} from './report-period.util';

/**
 * Movimenti che il report del gestionale conta come vendite (§②): vendita al
 * banco e reso. `unload`/`adjustment`/`transfer` sono operazioni di magazzino,
 * non vendite, e restano fuori. Le vendite manuali (movimenti `sale` a mano)
 * oggi non esistono: includerle domani = aggiungere un tipo qui.
 *
 * ⭐ `online_sale` NON sta più qui (strada A, 12/09/2026): la Vendita online
 *    entra per la SUA data, una volta, con i suoi totali di riga — non movimento
 *    per movimento. Con una spedizione a cavallo di due mesi, un mese chiuso non
 *    cambiava più e la stessa Vendita contava in due mesi: ora conta una volta,
 *    nel periodo della Vendita. Il costo dei suoi movimenti la segue.
 */
const SALE_REPORT_MOVEMENT_TYPES: StockMovementType[] = [
  StockMovementType.sale,
  StockMovementType.return,
];

@Injectable()
export class BusinessAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(
    tenantId: string,
    query: BusinessAnalyticsQueryDto,
    user?: UserProfileDto,
  ): Promise<BusinessAnalyticsSummaryDto> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { channelProfile: true },
    });

    const period = resolveReportPeriod(query);
    const prevPeriod = previousReportPeriod(period);
    const scope = await resolveOperationalLocationScope(
      this.prisma,
      tenantId,
      user,
      query.locationId,
    );

    if (!scope) {
      return this.emptySummary(period, prevPeriod);
    }

    const showPurchaseCosts = canViewPurchaseCosts(user);
    const currentRange = periodDateTimeRange(period);
    const previousRange = periodDateTimeRange(prevPeriod);
    const movementScope = locationScopeToMovementFilter(scope);
    const inventoryScope = locationScopeToInventoryLevelFilter(scope);

    const [current, previous, inventoryAgg, lowStockCount] = await Promise.all([
      this.aggregateMovementSales(tenantId, currentRange, movementScope, period),
      this.aggregateMovementSales(tenantId, previousRange, movementScope),
      this.aggregateInventoryValuation(tenantId, inventoryScope),
      this.prisma.inventoryLevel.count({
        where: {
          tenantId,
          ...inventoryScope,
          available: { lte: this.prisma.inventoryLevel.fields.minThreshold },
        },
      }),
    ]);

    const changePercent =
      previous.revenueMinor > 0
        ? Math.round(
            ((current.revenueMinor - previous.revenueMinor) / previous.revenueMinor) * 1000,
          ) / 10
        : null;

    const margin = this.buildMargin(current);
    const stockMargin =
      inventoryAgg.stockCostMinor !== null
        ? {
            stockMarginMinor: inventoryAgg.stockValueMinor - inventoryAgg.stockCostMinor,
            stockMarginPercent:
              inventoryAgg.stockValueMinor > 0
                ? Math.round(
                    ((inventoryAgg.stockValueMinor - inventoryAgg.stockCostMinor) /
                      inventoryAgg.stockValueMinor) *
                      1000,
                  ) / 10
                : null,
          }
        : { stockMarginMinor: null, stockMarginPercent: null };

    const avgDailyRevenueMinor =
      period.dayCount > 0 ? Math.round(current.revenueMinor / period.dayCount) : 0;
    const projectedMonthRevenueMinor = avgDailyRevenueMinor * this.daysInCurrentMonth();
    const avgDailyUnits = period.dayCount > 0 ? current.unitsSold / period.dayCount : 0;
    const daysOfCover =
      avgDailyUnits > 0 ? Math.round(inventoryAgg.availableUnits / avgDailyUnits) : null;

    const onlineLabel = onlineSalesChannelLabel(tenant?.channelProfile ?? null);
    const shopifyMinor = current.byChannel.shopify.revenueMinor;
    const manualMinor =
      current.byChannel.pos.revenueMinor + current.byChannel.online_manual.revenueMinor;

    const channels: BusinessAnalyticsSummaryDto['channels'] = [
      {
        channel: 'shopify',
        label: 'Shopify',
        revenueMinor: current.byChannel.shopify.revenueMinor,
        unitsSold: current.byChannel.shopify.unitsSold,
      },
      {
        channel: 'pos',
        label: 'Negozio fisico',
        revenueMinor: current.byChannel.pos.revenueMinor,
        unitsSold: current.byChannel.pos.unitsSold,
      },
      {
        channel: 'online_manual',
        label: onlineLabel,
        revenueMinor: current.byChannel.online_manual.revenueMinor,
        unitsSold: current.byChannel.online_manual.unitsSold,
      },
    ].filter((row) => row.revenueMinor !== 0 || row.unitsSold !== 0);

    const summary: BusinessAnalyticsSummaryDto = {
      currencyCode: 'EUR',
      period: { from: period.from, to: period.to, dayCount: period.dayCount },
      previousPeriod: {
        from: prevPeriod.from,
        to: prevPeriod.to,
        dayCount: prevPeriod.dayCount,
      },
      revenue: {
        totalMinor: current.revenueMinor,
        shopifyMinor,
        manualMinor,
        previousTotalMinor: previous.revenueMinor,
        changePercent,
      },
      sales: {
        transactionCount: current.transactionCount,
        unitsSold: current.unitsSold,
        avgTicketMinor:
          current.transactionCount > 0
            ? Math.round(current.revenueMinor / current.transactionCount)
            : null,
      },
      margin,
      inventory: {
        stockValueMinor: inventoryAgg.stockValueMinor,
        stockCostMinor: inventoryAgg.stockCostMinor,
        stockMarginMinor: stockMargin.stockMarginMinor,
        stockMarginPercent: stockMargin.stockMarginPercent,
        availableUnits: inventoryAgg.availableUnits,
        lowStockCount,
      },
      forecast: {
        avgDailyRevenueMinor,
        projectedMonthRevenueMinor,
        daysOfCover,
      },
      channels,
      topProducts: topProductsOf(current.topProducts),
      dailyRevenue: enumeratePeriodDates(period.from, period.to).map((date) => ({
        date,
        revenueMinor: current.daily.get(date) ?? 0,
      })),
    };
    return showPurchaseCosts ? summary : maskCostSensitiveSummary(summary);
  }

  /**
   * Report vendite dai MOVIMENTI (§②): carica i movimenti di vendita/reso e le
   * righe collegate, poi aggrega (funzione pura). Costo CONGELATO dal movimento,
   * ricavo dalla riga di vendita (§①b).
   */
  private async aggregateMovementSales(
    tenantId: string,
    range: { gte: Date; lte: Date },
    movementScope: Prisma.StockMovementWhereInput,
    period?: ReturnType<typeof resolveReportPeriod>,
  ): Promise<SalesAggregate> {
    const rows = await this.prisma.stockMovement.findMany({
      where: {
        tenantId,
        ...movementScope,
        type: { in: SALE_REPORT_MOVEMENT_TYPES },
        createdAt: range,
      },
      select: {
        type: true,
        origin: true,
        quantity: true,
        sku: true,
        variantId: true,
        totalCostMinor: true,
        sourceDocumentType: true,
        sourceDocumentId: true,
        sourceLineId: true,
        createdAt: true,
        variant: { select: { product: { select: { name: true } } } },
      },
    });

    const movements: AggregatableMovement[] = rows.map((row) => ({
      type: row.type,
      origin: row.origin,
      quantity: row.quantity,
      sku: row.sku,
      variantId: row.variantId,
      totalCostMinor: row.totalCostMinor,
      sourceDocumentType: row.sourceDocumentType,
      sourceDocumentId: row.sourceDocumentId,
      sourceLineId: row.sourceLineId,
      createdAt: row.createdAt,
      productName: row.variant.product.name,
    }));

    const maps = await this.loadRevenueLineMaps(tenantId, movements);
    const dailyDates = period ? enumeratePeriodDates(period.from, period.to) : undefined;
    const aggregate = aggregateSalesMovements(movements, maps, dailyDates);
    const [vendite, rettifiche] = await Promise.all([
      this.loadOnlineSales(tenantId, range, movementScope),
      this.loadOnlineRefunds(tenantId, range, movementScope),
    ]);
    return addOnlineRefundsToAggregate(addOnlineSalesToAggregate(aggregate, vendite), rettifiche);
  }

  /**
   * ⭐ Le RETTIFICHE del canale del periodo, per data del rimborso: le stesse
   *    righe che il Registro sottrae (`rettificaAmmessaWhere`, `docs/08` §3-bis),
   *    riusate così come sono persistite — importo dal rimborso, pezzi dalle sue
   *    righe, SKU e prodotto dalla riga d'ordine collegata. Il perimetro di sede
   *    è quello della Vendita online dell'ordine (l'uscita): senza sede, fuori,
   *    come le righe di vendita senza sede.
   */
  private async loadOnlineRefunds(
    tenantId: string,
    range: { gte: Date; lte: Date },
    movementScope: Prisma.StockMovementWhereInput,
  ): Promise<AggregatableOnlineRefund[]> {
    const sediAmmesse = sediDelPerimetro(movementScope);
    const rimborsi = await this.prisma.salesOrderRefund.findMany({
      where: { tenantId, occurredAt: range, ...rettificaAmmessaWhere() },
      select: {
        id: true,
        occurredAt: true,
        totalMinor: true,
        order: { select: { source: true, onlineSale: { select: { locationId: true } } } },
        lines: {
          select: {
            quantity: true,
            subtotalMinor: true,
            taxMinor: true,
            // La riga d'ordine: SKU e titolo sono la fotografia di allora, come
            // sulle righe della Vendita online.
            line: { select: { variantId: true, sku: true, title: true } },
          },
        },
      },
    });
    return rimborsi
      .filter((rimborso) => {
        const sede = rimborso.order.onlineSale?.locationId ?? null;
        return sediAmmesse === null || (sede !== null && sediAmmesse.has(sede));
      })
      .map((rimborso) => ({
        id: rimborso.id,
        channel: channelOfSale(rimborso.order.source),
        occurredAt: rimborso.occurredAt,
        totalMinor: rimborso.totalMinor,
        lines: rimborso.lines.map((line) => ({
          variantId: line.line?.variantId ?? null,
          sku: line.line?.sku ?? '',
          productName: line.line?.title ?? line.line?.sku ?? '',
          quantity: line.quantity,
          amountMinor: line.subtotalMinor + line.taxMinor,
        })),
      }));
  }

  /**
   * ⭐ Le Vendite online del periodo, per data della Vendita (strada A).
   *    Il perimetro di sede vale riga per riga — la sede di uscita della riga,
   *    poi quella di testata — come valeva sui movimenti; una riga senza sede
   *    resta fuori, com'era (non aveva un movimento). Il costo è la somma dei
   *    `totalCostMinor` congelati sui movimenti della Vendita nel perimetro,
   *    qualunque sia la loro data: sono le STESSE righe del ricavo.
   */
  private async loadOnlineSales(
    tenantId: string,
    range: { gte: Date; lte: Date },
    movementScope: Prisma.StockMovementWhereInput,
  ): Promise<AggregatableOnlineSale[]> {
    const sediAmmesse = sediDelPerimetro(movementScope);
    const sales = await this.prisma.onlineSale.findMany({
      where: { tenantId, fulfilledAt: range },
      select: {
        id: true,
        channel: true,
        fulfilledAt: true,
        locationId: true,
        lines: {
          select: {
            variantId: true,
            sku: true,
            quantity: true,
            totalMinor: true,
            locationId: true,
            variant: { select: { product: { select: { name: true } } } },
          },
        },
      },
    });
    if (sales.length === 0) {
      return [];
    }
    const costi = await this.prisma.stockMovement.groupBy({
      by: ['sourceDocumentId'],
      where: {
        tenantId,
        ...movementScope,
        type: StockMovementType.online_sale,
        sourceDocumentType: DocumentType.online_sale,
        sourceDocumentId: { in: sales.map((sale) => sale.id) },
      },
      _sum: { totalCostMinor: true },
    });
    const costoPerVendita = new Map(
      costi.map((riga) => [riga.sourceDocumentId as string, riga._sum.totalCostMinor ?? 0]),
    );
    return sales.flatMap((sale) => {
      const lines = sale.lines
        .filter((line) => {
          const sede = line.locationId ?? sale.locationId;
          return sede !== null && (sediAmmesse === null || sediAmmesse.has(sede));
        })
        .map((line) => ({
          variantId: line.variantId,
          sku: line.sku,
          productName: line.variant?.product.name ?? line.sku,
          quantity: line.quantity,
          totalMinor: line.totalMinor,
        }));
      return lines.length === 0
        ? []
        : [
            {
              id: sale.id,
              channel: channelOfSale(sale.channel),
              fulfilledAt: sale.fulfilledAt,
              costMinor: costoPerVendita.get(sale.id) ?? 0,
              lines,
            },
          ];
    });
  }

  /**
   * Precarica in batch le righe da cui deriva il ricavo dei movimenti: righe
   * documento (POS/DDT), righe vendita online e — per i resi online senza riga
   * propria — la riga di vendita originale per variante (§①b + reso online).
   */
  private async loadRevenueLineMaps(
    tenantId: string,
    movements: readonly AggregatableMovement[],
  ): Promise<RevenueLineMaps> {
    const documentLineIds: string[] = [];
    const onlineSaleLineIds: string[] = [];

    // Il reso online non ha riga e non porta ricavo da qui: la sua rettifica è il
    // rimborso persistito (`loadOnlineRefunds`). Qui c'era la lettura del prezzo
    // originale per stimarlo.
    for (const movement of movements) {
      if (movement.sourceLineId) {
        if (movement.sourceDocumentType === DocumentType.online_sale) {
          onlineSaleLineIds.push(movement.sourceLineId);
        } else {
          documentLineIds.push(movement.sourceLineId);
        }
      }
    }

    const uniq = (values: readonly string[]): string[] => [...new Set(values)];

    const [documentLines, onlineSaleLines] = await Promise.all([
      documentLineIds.length > 0
        ? this.prisma.documentLine.findMany({
            where: { tenantId, id: { in: uniq(documentLineIds) } },
            // Ricavo LORDO: la riga porta l'imponibile in `lineTotalMinor` e il
            // lordo qui. Prima si leggeva l'imponibile, che in cassa conteneva
            // il lordo — il report resta sullo stesso numero, ora dal campo che
            // lo dichiara.
            select: { id: true, lineGrossTotalMinor: true },
          })
        : Promise.resolve([]),
      onlineSaleLineIds.length > 0
        ? this.prisma.onlineSaleLine.findMany({
            where: { tenantId, id: { in: uniq(onlineSaleLineIds) } },
            select: { id: true, totalMinor: true },
          })
        : Promise.resolve([]),
    ]);

    return {
      documentLineTotal: new Map(documentLines.map((line) => [line.id, line.lineGrossTotalMinor])),
      onlineSaleLineTotal: new Map(onlineSaleLines.map((line) => [line.id, line.totalMinor])),
    };
  }

  private emptySummary(
    period: ReturnType<typeof resolveReportPeriod>,
    previousPeriod: ReturnType<typeof previousReportPeriod>,
  ): BusinessAnalyticsSummaryDto {
    return {
      currencyCode: 'EUR',
      period: { from: period.from, to: period.to, dayCount: period.dayCount },
      previousPeriod: {
        from: previousPeriod.from,
        to: previousPeriod.to,
        dayCount: previousPeriod.dayCount,
      },
      revenue: {
        totalMinor: 0,
        shopifyMinor: 0,
        manualMinor: 0,
        previousTotalMinor: 0,
        changePercent: null,
      },
      sales: { transactionCount: 0, unitsSold: 0, avgTicketMinor: null },
      margin: { grossMinor: null, grossPercent: null },
      inventory: {
        stockValueMinor: 0,
        stockCostMinor: null,
        stockMarginMinor: null,
        stockMarginPercent: null,
        availableUnits: 0,
        lowStockCount: 0,
      },
      forecast: {
        avgDailyRevenueMinor: 0,
        projectedMonthRevenueMinor: 0,
        daysOfCover: null,
      },
      channels: [],
      topProducts: [],
      dailyRevenue: enumeratePeriodDates(period.from, period.to).map((date) => ({
        date,
        revenueMinor: 0,
      })),
    };
  }

  /**
   * Valorizzazione magazzino: usa il costo VARIANTE CORRENTE (§③ — dice quanto
   * vale il magazzino oggi, quindi il costo attuale è quello giusto). Non passa
   * al costo di riferimento dell'articolo.
   */
  private async aggregateInventoryValuation(
    tenantId: string,
    inventoryScope: Prisma.InventoryLevelWhereInput,
  ): Promise<{
    stockValueMinor: number;
    stockCostMinor: number | null;
    availableUnits: number;
  }> {
    const levels = await this.prisma.inventoryLevel.findMany({
      where: { tenantId, ...inventoryScope },
      select: {
        available: true,
        variant: {
          select: { sellingPriceMinor: true, purchasePriceMinor: true },
        },
      },
    });

    // ⭐ **La somma si fa in `Decimal`, e si arrotonda UNA VOLTA alla fine.**
    //
    // ⛔ Qui c'era `Number(...)` prima di moltiplicare e sommare, con accanto un
    // commento che diceva «si somma il valore esatto e si arrotonda una volta
    // sola, alla fine». Erano false entrambe le cose: una somma in virgola
    // mobile non è esatta, e un arrotondamento finale non esisteva affatto —
    // `stockValueMinor` e `stockCostMinor` uscivano con la loro coda e venivano
    // sottratti fra loro per ottenere il margine di magazzino.
    //
    // Con prezzi e costi a sei decimali su centinaia di varianti l'errore di
    // arrotondamento binario si accumula riga per riga, ed è proprio la
    // grandezza in cui si nota: un margine è una DIFFERENZA fra due totali
    // grandi e vicini.
    let stockValue = new Prisma.Decimal(0);
    let stockCost = new Prisma.Decimal(0);
    let availableUnits = 0;

    for (const level of levels) {
      const qty = Math.max(0, level.available);
      availableUnits += level.available;
      stockValue = stockValue.plus(new Prisma.Decimal(level.variant.sellingPriceMinor).times(qty));
      // ⛔ Qui c'era un ramo `purchasePriceMinor === null` che marcava
      // `missingCost` e teneva la variante fuori dal costo di magazzino. Il
      // costo non è più nullable: una variante senza costo vale zero, e zero
      // partecipa alla somma come qualunque altro costo.
      stockCost = stockCost.plus(new Prisma.Decimal(level.variant.purchasePriceMinor).times(qty));
    }

    // Il valore di magazzino è un importo monetario: qui esce, e qui si
    // arrotonda al centesimo. Una volta sola, sul totale.
    const stockCostMinor = Math.round(stockCost.toNumber());
    return {
      stockValueMinor: Math.round(stockValue.toNumber()),
      // `null` qui resta solo per il mascheramento permessi, che lo imposta a
      // valle: il calcolo produce sempre un numero.
      stockCostMinor,
      availableUnits,
    };
  }

  /**
   * ⛔ Qui c'era `costCoveragePercent` — la quota di fatturato di cui si
   * conosceva il costo — e un ramo che restituiva `null` quando quella quota
   * era zero. Esistevano solo perché il costo congelato poteva essere NULL.
   * Ora un costo non valorizzato **vale zero**, quindi ogni vendita ha un
   * costo e il margine si calcola sempre sull'intero fatturato.
   *
   * ⚠️ `null` resta il valore del MASCHERAMENTO: chi non ha «Visualizza costi
   * d'acquisto» riceve `grossMinor: null` da `maskCostSensitiveSummary`, e
   * quello significa «non visibile», non «costo assente».
   */
  private buildMargin(current: SalesAggregate): BusinessAnalyticsSummaryDto['margin'] {
    if (current.revenueMinor <= 0) {
      return { grossMinor: null, grossPercent: null };
    }

    const grossMinor = current.revenueMinor - current.costMinor;
    const grossPercent = Math.round((grossMinor / current.revenueMinor) * 1000) / 10;

    return { grossMinor, grossPercent };
  }

  private daysInCurrentMonth(reference: Date = new Date()): number {
    const year = reference.getUTCFullYear();
    const month = reference.getUTCMonth();
    return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  }
}
