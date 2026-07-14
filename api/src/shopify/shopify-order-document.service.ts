import { Injectable, Logger } from '@nestjs/common';
import {
  DocumentStatus,
  DocumentType,
  Prisma,
  SalesOrderFinancialStatus,
  type SalesOrder,
  type SalesOrderLine,
} from '@prisma/client';

import {
  clearShopifySaleMovementsForDocument,
  recordShopifySaleMovement,
} from '../inventory/shopify-sale-movement.util';
import { allocateProportional, deriveVatRatePercent } from '../order-reservations/online-sale-money.util';
import { PrismaService } from '../prisma/prisma.service';
import type { VatCodeWithNature } from '../vat/vat-codes.service';
import { findVatCodeForDerivedRate } from '../vat/vat-reverse-match.util';
import { buildUnmatchedRateSnapshot, buildVatCodeSnapshot } from '../vat/vat-snapshot.util';
import { defaultTypeSetting, type ResolvedDocumentTypeSetting } from '../documents/document-defaults';
import { resolveShopifyOrderLocationId } from './shopify-order-location.util';

interface SyncOrderDocumentInput {
  readonly tenantId: string;
  readonly salesOrderId: string;
  readonly shopifyOrderId: string;
  readonly orderPayload: Record<string, unknown>;
}

export interface ShopifyOrderDocumentBackfillResult {
  readonly candidates: number;
  readonly linked: number;
  readonly skipped: number;
  readonly failed: readonly { readonly orderId: string; readonly orderNumber: string; readonly message: string }[];
}

@Injectable()
export class ShopifyOrderDocumentService {
  private readonly logger = new Logger(ShopifyOrderDocumentService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crea o aggiorna il DDT vendita collegato a un ordine Shopify e registra
   * movimenti di audit (origin shopify) senza alterare le giacenze locali.
   */
  async syncFromShopifyOrder(input: SyncOrderDocumentInput): Promise<string | null> {
    const setting = await this.resolveTypeSetting(input.tenantId, DocumentType.sales_ddt);
    if (!setting.enabled) {
      this.logger.debug(
        `DDT vendita disabilitato per tenant ${input.tenantId}; skip documento ordine Shopify.`,
      );
      return null;
    }

    const order = await this.prisma.salesOrder.findFirst({
      where: { id: input.salesOrderId, tenantId: input.tenantId },
      include: { lines: true },
    });
    if (!order) {
      return null;
    }

    const stockLines = order.lines.filter(
      (line) => line.variantId && line.quantity > 0,
    );
    if (stockLines.length === 0) {
      return null;
    }

    const locationId = await resolveShopifyOrderLocationId(
      this.prisma,
      input.tenantId,
      input.orderPayload,
    );
    if (!locationId) {
      this.logger.debug(
        `Nessuna location VF per ordine Shopify ${order.orderNumber}; documento non creato.`,
      );
      return null;
    }

    const cancelled = this.isOrderCancelled(order);

    // Fase 2 §9: se la Vendita online ha già scaricato il magazzino, il DDT
    // NON crea movimenti (nemmeno di audit), non consuma impegni e mostra il
    // riferimento alla Vendita online. La scelta non è modificabile.
    const onlineSale = await this.prisma.onlineSale.findFirst({
      where: { tenantId: input.tenantId, salesOrderId: order.id },
      select: { id: true, reference: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const documentId = await this.upsertSalesDocument(tx, {
        tenantId: input.tenantId,
        order,
        shopifyOrderId: input.shopifyOrderId,
        locationId,
        setting,
        cancelled,
        onlineSale,
      });

      if (!documentId) {
        return null;
      }

      if (order.documentId !== documentId) {
        await tx.salesOrder.update({
          where: { id: order.id },
          data: { documentId },
        });
      }

      if (cancelled || onlineSale) {
        // Nessun movimento dal DDT: annullato, oppure lo scarico è già stato
        // effettuato dalla Vendita online collegata (movimenti online_sale).
        await clearShopifySaleMovementsForDocument(tx, input.tenantId, documentId, []);
        return documentId;
      }

      const variantIdsToKeep: string[] = [];
      const reason = `Vendita Shopify ${order.orderNumber}`;

      for (const line of stockLines) {
        if (!line.variantId) {
          continue;
        }
        variantIdsToKeep.push(line.variantId);
        await recordShopifySaleMovement(tx, {
          tenantId: input.tenantId,
          variantId: line.variantId,
          sku: line.sku,
          locationId,
          quantity: line.quantity,
          documentId,
          reason,
        });
      }

      await clearShopifySaleMovementsForDocument(
        tx,
        input.tenantId,
        documentId,
        variantIdsToKeep,
      );

      return documentId;
    });
  }

  /**
   * Collega DDT vendita e movimenti agli ordini Shopify già importati prima dello step 8.
   * Usa payload vuoto: la location è la prima sede licenziata del tenant.
   */
  async backfillUnlinkedOrders(options: {
    readonly tenantId?: string;
    readonly dryRun: boolean;
  }): Promise<ShopifyOrderDocumentBackfillResult> {
    const orders = await this.prisma.salesOrder.findMany({
      where: {
        shopifyOrderId: { not: null },
        documentId: null,
        ...(options.tenantId ? { tenantId: options.tenantId } : {}),
      },
      select: {
        id: true,
        tenantId: true,
        shopifyOrderId: true,
        orderNumber: true,
      },
      orderBy: { placedAt: 'asc' },
    });

    if (options.dryRun) {
      return { candidates: orders.length, linked: 0, skipped: 0, failed: [] };
    }

    let linked = 0;
    let skipped = 0;
    const failed: ShopifyOrderDocumentBackfillResult['failed'][number][] = [];

    for (const order of orders) {
      if (!order.shopifyOrderId) {
        skipped += 1;
        continue;
      }
      try {
        const documentId = await this.syncFromShopifyOrder({
          tenantId: order.tenantId,
          salesOrderId: order.id,
          shopifyOrderId: order.shopifyOrderId,
          orderPayload: {},
        });
        if (documentId) {
          linked += 1;
        } else {
          skipped += 1;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Errore imprevisto';
        failed.push({ orderId: order.id, orderNumber: order.orderNumber, message });
        this.logger.warn(
          `Backfill documento fallito per ordine ${order.orderNumber} (${order.id}): ${message}`,
        );
      }
    }

    return { candidates: orders.length, linked, skipped, failed };
  }

  private async upsertSalesDocument(
    tx: Prisma.TransactionClient,
    params: {
      readonly tenantId: string;
      readonly order: SalesOrder & { lines: SalesOrderLine[] };
      readonly shopifyOrderId: string;
      readonly locationId: string;
      readonly setting: ResolvedDocumentTypeSetting;
      readonly cancelled: boolean;
      readonly onlineSale: { id: string; reference: string } | null;
    },
  ): Promise<string | null> {
    const { order, tenantId, shopifyOrderId, locationId, setting, cancelled, onlineSale } =
      params;
    const stockLines = order.lines.filter((line) => line.quantity > 0);
    if (stockLines.length === 0) {
      return null;
    }

    // Aliquota per riga: nessun dettaglio IVA per riga dal canale, quindi si
    // alloca proporzionalmente l'imposta ordine (stessa tecnica di
    // OnlineSaleFulfillmentService.computeSaleLines) e si tenta una
    // corrispondenza inversa con un Codice IVA attivo vendita/entrambi del
    // tenant. Nessuna voce fittizia se non c'è corrispondenza (§ reverse-match).
    const weights = stockLines.map((line) => line.totalMinor);
    if (order.shippingMinor > 0) {
      weights.push(order.shippingMinor);
    }
    const taxShares = allocateProportional(order.taxMinor, weights);
    const salesVatCodes: VatCodeWithNature[] = await tx.vatCode.findMany({
      where: { tenantId, deletedAt: null, isActive: true, usageScope: { in: ['sales', 'both'] } },
      include: { nature: true },
    });

    const documentLines = stockLines.map((line, index) => {
      const lineTax = taxShares[index] ?? 0;
      const lineSubtotal = line.totalMinor - lineTax;
      const vatRatePercent = deriveVatRatePercent(lineSubtotal, lineTax);
      const matched = findVatCodeForDerivedRate(vatRatePercent, salesVatCodes);
      const vatSnapshot =
        matched != null
          ? buildVatCodeSnapshot(matched)
          : vatRatePercent != null
            ? buildUnmatchedRateSnapshot(vatRatePercent)
            : null;
      return {
        lineNumber: index + 1,
        variantId: line.variantId,
        sku: line.sku,
        description: line.title,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        discountPercent: 0,
        lineTotalMinor: line.totalMinor,
        vatCodeId: matched?.id ?? null,
        vatSnapshot,
        loadsStock: false,
      };
    });

    const totals = {
      subtotalMinor: order.subtotalMinor,
      taxMinor: order.taxMinor,
      totalMinor: order.totalMinor,
    };

    const internalComment = onlineSale
      ? `Generato automaticamente da ordine Shopify ${order.orderNumber}. La movimentazione del magazzino è già stata effettuata dalla Vendita online collegata (${onlineSale.reference}).`
      : `Generato automaticamente da ordine Shopify ${order.orderNumber}`;
    const targetStatus = cancelled ? DocumentStatus.cancelled : DocumentStatus.confirmed;

    if (order.documentId) {
      const existing = await tx.document.findFirst({
        where: { id: order.documentId, tenantId },
        select: { id: true, status: true, number: true, reference: true, series: true, year: true },
      });
      if (!existing) {
        await tx.salesOrder.update({
          where: { id: order.id },
          data: { documentId: null },
        });
      } else {
        await tx.documentLine.deleteMany({ where: { documentId: existing.id } });
        await tx.document.update({
          where: { id: existing.id },
          data: {
            documentDate: order.placedAt,
            year: order.placedAt.getFullYear(),
            customerId: order.customerId,
            customerName: order.customerName,
            locationId,
            externalRef: shopifyOrderId,
            onlineSaleId: onlineSale?.id ?? null,
            currency: order.currency,
            ...totals,
            internalComment,
            status: targetStatus,
            cancelledAt: cancelled ? new Date() : null,
            lines: {
              create: documentLines.map((line) => ({ ...line, tenantId, vatSnapshot: line.vatSnapshot ?? Prisma.DbNull })),
            },
          },
        });
        return existing.id;
      }
    }

    const documentDate = order.placedAt;
    const year = documentDate.getFullYear();
    const series = setting.defaultSeries.trim() || 'A';

    let number: number | null = null;
    let reference: string | null = null;
    if (setting.autoNumbering) {
      number = await this.nextNumber(tx, tenantId, DocumentType.sales_ddt, series, year);
      reference = this.formatReference(setting.numberPrefix, year, number);
    }

    const created = await tx.document.create({
      data: {
        tenantId,
        type: DocumentType.sales_ddt,
        status: targetStatus,
        series,
        number,
        year,
        reference,
        documentDate,
        printTitle: setting.printTitle,
        notes: setting.defaultNotes,
        internalComment,
        customerId: order.customerId,
        customerName: order.customerName,
        locationId,
        externalRef: shopifyOrderId,
        onlineSaleId: onlineSale?.id ?? null,
        currency: order.currency,
        pricesIncludeVat: setting.pricesIncludeVat,
        ...totals,
        confirmedAt: cancelled ? null : new Date(),
        cancelledAt: cancelled ? new Date() : null,
        createdByName: 'Shopify',
        lines: {
          create: documentLines.map((line) => ({ ...line, tenantId, vatSnapshot: line.vatSnapshot ?? Prisma.DbNull })),
        },
      },
      select: { id: true },
    });

    return created.id;
  }

  private resolveTypeSetting(
    tenantId: string,
    type: DocumentType,
  ): Promise<ResolvedDocumentTypeSetting> {
    return this.prisma.documentTypeSetting
      .findUnique({ where: { tenantId_type: { tenantId, type } } })
      .then((stored) => {
        const defaults = defaultTypeSetting(type);
        if (!stored) {
          return defaults;
        }
        return {
          type,
          enabled: stored.enabled,
          printTitle: stored.printTitle?.trim() || defaults.printTitle,
          autoNumbering: stored.autoNumbering,
          numberPrefix: stored.numberPrefix?.trim() || defaults.numberPrefix,
          defaultSeries: stored.defaultSeries || defaults.defaultSeries,
          blockAfterConfirm: stored.blockAfterConfirm,
          pricesIncludeVat: stored.pricesIncludeVat,
          defaultNotes: stored.defaultNotes ?? null,
        };
      });
  }

  private isOrderCancelled(order: SalesOrder): boolean {
    return (
      order.financialStatus === SalesOrderFinancialStatus.voided ||
      order.financialStatus === SalesOrderFinancialStatus.refunded
    );
  }

  private async nextNumber(
    tx: Prisma.TransactionClient,
    tenantId: string,
    type: DocumentType,
    series: string,
    year: number,
  ): Promise<number> {
    const sequence = await tx.documentSequence.upsert({
      where: { tenantId_type_series_year: { tenantId, type, series, year } },
      create: { tenantId, type, series, year, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });
    return sequence.lastNumber;
  }

  private formatReference(prefix: string, year: number, number: number): string {
    return `${prefix}-${year}-${String(number).padStart(4, '0')}`;
  }
}
