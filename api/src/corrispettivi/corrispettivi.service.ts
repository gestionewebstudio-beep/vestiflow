import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  SalesOrderFiscalStatus as PrismaFiscal,
  SalesOrderFulfillmentStatus as PrismaFulfillment,
  SalesOrderRefundKind as PrismaRefundKind,
  type SalesOrder,
  type SalesOrderFinancialStatus,
  type SalesOrderFiscalStatus,
  type SalesOrderRefundKind,
  type SalesOrderSource,
} from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import type { Paginated } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { buildPlacedAtFilter } from '../sales-orders/sales-order-query.util';
import { API_SOURCE_ONLINE, API_SOURCE_POS } from '../sales-orders/sales-order.enum-mapper';
import { isRefundFinancialStatus } from './corrispettivi-fiscal.enum-mapper';
import { buildCorrispettiviRefundWhere, buildCorrispettiviWhere } from './corrispettivi-query.util';
import type { ListCorrispettiviQueryDto } from './dto/list-corrispettivi.query.dto';

export interface CorrispettiviSummaryDto {
  readonly orderCount: number;
  /** Ordini con stato «evaso» ma **senza data**: non conteggiabili, non nascosti. */
  readonly undatedFulfilmentCount: number;
  readonly refundsCount: number;
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly shippingMinor: number;
  readonly discountMinor: number;
  readonly totalMinor: number;
  readonly taxableMinor: number;
  // ── Rettifiche del periodo (specifica 08 §4) ────────────────────────────
  /** Quante rettifiche, annullamenti esclusi. */
  readonly refundCount: number;
  readonly refundTotalMinor: number;
  readonly refundTaxMinor: number;
  /** Annullamenti del periodo: contati per trasparenza, mai sottratti. */
  readonly cancellationCount: number;
  readonly cancellationTotalMinor: number;
  // ── Il numero che conta ─────────────────────────────────────────────────
  readonly netTotalMinor: number;
  readonly netTaxMinor: number;
  readonly netTaxableMinor: number;
}

export type CorrispettiviOrderRow = SalesOrder & {
  customer: { email: string | null } | null;
};

/**
 * Una riga del registro: o una vendita, o una rettifica.
 *
 * **Non è un'entità nuova**: è derivata da `sales_orders` e
 * `sales_order_refunds`, che restano le fonti. Serve perché il registro deve
 * poter essere **sommato a occhio** — il totale in fondo alla schermata si
 * ricostruisce dalla colonna, riga per riga, senza fidarsi di un riepilogo.
 *
 * Le rettifiche portano importi **negativi** apposta: è ciò che rende la
 * colonna sommabile e la riconciliazione verificabile da chi guarda.
 */
export type CorrispettiviRowKind = 'sale' | 'refund';

export interface CorrispettiviRegisterRow {
  /** Identità della riga nella lista (`sale:<id>` / `refund:<id>`). */
  readonly rowId: string;
  readonly kind: CorrispettiviRowKind;
  /** Sempre valorizzato: da qui si apre l'ordine, anche da una rettifica. */
  readonly salesOrderId: string;
  readonly orderNumber: string;
  /** Data con cui la riga entra nel registro: evasione, o data della rettifica. */
  readonly occurredAt: Date;
  readonly source: SalesOrderSource;
  readonly customerName: string;
  readonly customerEmail: string | null;
  readonly currency: string;
  readonly taxableMinor: number;
  readonly taxMinor: number;
  readonly totalMinor: number;
  /** Solo sulle vendite: una rettifica non ha stato di pagamento né fiscale. */
  readonly financialStatus: SalesOrderFinancialStatus | null;
  readonly fiscalStatus: SalesOrderFiscalStatus | null;
  /** Solo sulle rettifiche: che gesto è stato. */
  readonly refundKind: SalesOrderRefundKind | null;
  readonly note: string | null;
}

/**
 * Tetto alla fusione delle due sorgenti, dichiarato invece che scoperto.
 *
 * La lista unisce vendite e rettifiche e le ordina per data: farlo in SQL
 * richiederebbe una UNION scritta a mano, e per un registro che si consulta a
 * periodo — un mese, un trimestre — non ripaga. Oltre questa soglia però non si
 * tronca in silenzio: si chiede di restringere il periodo.
 */
const REGISTER_MERGE_CEILING = 5_000;

@Injectable()
export class CorrispettiviService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * L'elenco del registro: vendite e rettifiche nello stesso flusso, ordinate
   * per la data con cui entrano.
   *
   * Prima mostrava solo le vendite, e da quando il riepilogo sottrae le
   * rettifiche la schermata si contraddiceva: il totale diceva 95,00 e
   * l'elenco sotto ne mostrava 300,01. Un registro in cui la somma della
   * colonna non fa il totale in fondo non è consultabile.
   */
  async listOrders(
    tenantId: string,
    query: ListCorrispettiviQueryDto,
  ): Promise<Paginated<CorrispettiviRegisterRow>> {
    const rows = await this.buildRegisterRows(tenantId, query);
    const skip = (query.page - 1) * query.pageSize;

    return {
      items: rows.slice(skip, skip + query.pageSize),
      total: rows.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /**
   * Il dataset del registro, una volta sola.
   *
   * Lista ed export chiamano **questa**, e non due query che si assomigliano:
   * è ciò che impedisce il caso già visto una volta, in cui il riepilogo
   * conosceva le rettifiche e il file per il commercialista no. Una selezione,
   * un dataset — strutturale, non promesso in un commento.
   */
  async buildRegisterRows(
    tenantId: string,
    query: ListCorrispettiviQueryDto,
  ): Promise<CorrispettiviRegisterRow[]> {
    const where = buildCorrispettiviWhere(tenantId, query);
    const refundWhere = buildCorrispettiviRefundWhere(tenantId, query);

    // «Solo resi» significa le RETTIFICHE, non gli ordini che ne hanno una: in
    // un elenco che le contiene, mostrare la vendita al posto del reso sarebbe
    // la risposta alla domanda sbagliata. Il vecchio interruttore booleano
    // resta valido e coincide con `rowType: returns` + `refunds`.
    const rowType = query.rowType ?? (query.refundsOnly ? 'refunds_and_returns' : 'all');
    const wantsSales = rowType === 'all' || rowType === 'sales';
    const wantsRefunds = rowType !== 'sales';

    const [saleCount, refundCount] = await Promise.all([
      wantsSales ? this.prisma.salesOrder.count({ where }) : Promise.resolve(0),
      wantsRefunds
        ? this.prisma.salesOrderRefund.count({ where: refundWhere })
        : Promise.resolve(0),
    ]);

    if (saleCount + refundCount > REGISTER_MERGE_CEILING) {
      throw new BadRequestException(
        `Il periodo selezionato contiene ${saleCount + refundCount} righe: restringi le date per consultarlo.`,
      );
    }

    const [orders, refunds] = await Promise.all([
      wantsSales
        ? this.prisma.salesOrder.findMany({
            where,
            include: { customer: { select: { party: { select: { email: true } } } } },
          })
        : Promise.resolve([]),
      wantsRefunds
        ? this.prisma.salesOrderRefund.findMany({
            where: refundWhere,
            include: {
              order: {
                select: {
                  orderNumber: true,
                  source: true,
                  customerName: true,
                  customer: { select: { party: { select: { email: true } } } },
                },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    const rows: CorrispettiviRegisterRow[] = [
      ...orders.map((order) => ({
        rowId: `sale:${order.id}`,
        kind: 'sale' as const,
        salesOrderId: order.id,
        orderNumber: order.orderNumber,
        // Non nullo per costruzione: il filtro esclude i mai evasi.
        occurredAt: order.fulfilledAt ?? order.placedAt,
        source: order.source,
        customerName: order.customerName,
        customerEmail: order.customer?.party.email ?? null,
        currency: order.currency,
        taxableMinor: Math.max(0, order.totalMinor - order.taxMinor),
        taxMinor: order.taxMinor,
        totalMinor: order.totalMinor,
        financialStatus: order.financialStatus,
        fiscalStatus: order.fiscalStatus,
        refundKind: null,
        note: null,
      })),
      ...refunds.map((refund) => ({
        rowId: `refund:${refund.id}`,
        kind: 'refund' as const,
        salesOrderId: refund.salesOrderId,
        orderNumber: refund.order.orderNumber,
        occurredAt: refund.occurredAt,
        source: refund.order.source,
        customerName: refund.order.customerName,
        customerEmail: refund.order.customer?.party.email ?? null,
        currency: refund.currency,
        // Negativi: è ciò che rende sommabile la colonna.
        taxableMinor: -Math.max(0, refund.totalMinor - refund.taxMinor),
        taxMinor: -refund.taxMinor,
        totalMinor: -refund.totalMinor,
        financialStatus: null,
        fiscalStatus: null,
        refundKind: refund.kind,
        note: refund.note,
      })),
    ].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

    return rows;
  }

  async getSummary(
    tenantId: string,
    query: ListCorrispettiviQueryDto,
  ): Promise<CorrispettiviSummaryDto> {
    const where = buildCorrispettiviWhere(tenantId, query);
    const orders = await this.prisma.salesOrder.findMany({
      where,
      select: {
        subtotalMinor: true,
        taxMinor: true,
        shippingMinor: true,
        discountMinor: true,
        totalMinor: true,
        financialStatus: true,
        fiscalStatus: true,
        source: true,
      },
    });

    let refundsCount = 0;
    let subtotalMinor = 0;
    let taxMinor = 0;
    let shippingMinor = 0;
    let discountMinor = 0;
    let totalMinor = 0;

    for (const order of orders) {
      subtotalMinor += order.subtotalMinor;
      taxMinor += order.taxMinor;
      shippingMinor += order.shippingMinor;
      discountMinor += order.discountMinor;
      totalMinor += order.totalMinor;
      if (isRefundFinancialStatus(order.financialStatus)) {
        refundsCount += 1;
      }
    }

    // `subtotalMinor` arriva dal canale GIÀ al netto degli sconti di riga
    // (misurato: righe 120,00 − sconti 16,00 = subtotale 104,00). Sottrarli di
    // nuovo produceva un imponibile che non esiste — 88,00 su quell'ordine.
    const taxableMinor = Math.max(0, totalMinor - taxMinor);

    // Le rettifiche del periodo, alla LORO data e senza gli annullamenti.
    //
    // ⚠️ Il filtro per TIPO di riga si toglie di proposito: serve a guardare
    // l'elenco, non a ridefinire il corrispettivo del periodo. Filtrando
    // «Resi», il totale deve continuare a dire quanto si è incassato — non
    // −205,00, che è un numero senza significato e che qualcuno trascriverebbe.
    const refunds = await this.prisma.salesOrderRefund.findMany({
      where: buildCorrispettiviRefundWhere(tenantId, { ...query, rowType: undefined }),
      select: { totalMinor: true, taxMinor: true },
    });
    const refundTotalMinor = refunds.reduce((sum, refund) => sum + refund.totalMinor, 0);
    const refundTaxMinor = refunds.reduce((sum, refund) => sum + refund.taxMinor, 0);

    // Gli annullamenti si contano e non si sottraggono: la vendita che
    // annullano non è mai entrata nel registro (specifica 08 §4).
    const cancellations = await this.prisma.salesOrderRefund.findMany({
      where: {
        ...buildCorrispettiviRefundWhere(tenantId, { ...query, rowType: undefined }),
        kind: PrismaRefundKind.cancellation,
      },
      select: { totalMinor: true },
    });

    // Evasi senza data: fuori dal conteggio perché non databili, ma dichiarati.
    // Un registro fiscale non fa sparire niente in silenzio.
    const undatedFulfilmentCount = await this.prisma.salesOrder.count({
      where: {
        tenantId,
        fulfilledAt: null,
        fulfillmentStatus: PrismaFulfillment.fulfilled,
      },
    });

    return {
      orderCount: orders.length,
      undatedFulfilmentCount,
      refundsCount,
      subtotalMinor,
      taxMinor,
      shippingMinor,
      discountMinor,
      totalMinor,
      taxableMinor,
      refundCount: refunds.length,
      refundTotalMinor,
      refundTaxMinor,
      cancellationCount: cancellations.length,
      cancellationTotalMinor: cancellations.reduce((sum, row) => sum + row.totalMinor, 0),
      netTotalMinor: totalMinor - refundTotalMinor,
      netTaxMinor: taxMinor - refundTaxMinor,
      netTaxableMinor: Math.max(0, totalMinor - refundTotalMinor - (taxMinor - refundTaxMinor)),
    };

  }

  private aggregateOrders(
    orders: readonly {
      subtotalMinor: number;
      taxMinor: number;
      shippingMinor: number;
      totalMinor: number;
      financialStatus: SalesOrder['financialStatus'];
    }[],
  ): {
    subtotalMinor: number;
    taxMinor: number;
    shippingMinor: number;
    totalMinor: number;
    refundsCount: number;
  } {
    let subtotalMinor = 0;
    let taxMinor = 0;
    let shippingMinor = 0;
    let totalMinor = 0;
    let refundsCount = 0;

    for (const order of orders) {
      subtotalMinor += order.subtotalMinor;
      taxMinor += order.taxMinor;
      shippingMinor += order.shippingMinor;
      totalMinor += order.totalMinor;
      if (isRefundFinancialStatus(order.financialStatus)) {
        refundsCount += 1;
      }
    }

    return { subtotalMinor, taxMinor, shippingMinor, totalMinor, refundsCount };
  }
}
