import { Injectable, NotFoundException } from '@nestjs/common';
import { DocumentType, type Prisma } from '@prisma/client';

import type { Paginated } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  fromPrismaSource,
  sourceDisplayLabel,
  toPrismaSource,
  type ApiSalesOrderSource,
} from '../sales-orders/sales-order.enum-mapper';
import { vatSnapshotDisplayLabel, vatSnapshotRatePercent } from '../vat/vat-snapshot.util';
import type { ListOnlineSalesQueryDto } from './dto/list-online-sales.query.dto';

export interface OnlineSaleRow {
  readonly id: string;
  readonly reference: string;
  readonly channel: ApiSalesOrderSource;
  readonly channelLabel: string;
  readonly salesOrderId: string;
  readonly orderNumber: string;
  readonly customerName: string;
  readonly orderPlacedAt: string;
  readonly fulfilledAt: string;
  readonly currency: string;
  readonly totalMinor: number;
  readonly paymentStatus: string;
  readonly inventoryStatus: string;
  readonly corrispettivoReference: string | null;
  readonly corrispettivoStatus: string | null;
  readonly refundedAt: string | null;
  /** Location di scarico principale (fase 3 §4). */
  readonly locationName: string | null;
  /** DDT vendita collegato alla vendita (fase 3 §4), se presente. */
  readonly ddtReference: string | null;
}

export interface OnlineSaleLineRow {
  readonly id: string;
  readonly lineNumber: number;
  readonly variantId: string | null;
  readonly sku: string;
  readonly barcode: string | null;
  readonly description: string;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly subtotalMinor: number;
  /** Aliquota % derivata dallo snapshot IVA congelato sulla riga (solo display). */
  readonly vatRatePercent: number | null;
  readonly taxMinor: number;
  readonly totalMinor: number;
  readonly locationId: string | null;
  readonly vatCodeId: string | null;
  /** Etichetta Codice IVA risolta (o solo aliquota se nessun codice ha fatto match). */
  readonly vatCodeLabel: string | null;
}

export interface OnlineSaleMovementRow {
  readonly id: string;
  readonly type: string;
  readonly quantity: number;
  readonly locationName: string;
  readonly createdAt: string;
}

export interface OnlineSaleDetail extends OnlineSaleRow {
  readonly externalOrderId: string;
  readonly externalFulfillmentId: string | null;
  readonly customerAddress: string | null;
  readonly locationName: string | null;
  readonly subtotalMinor: number;
  readonly discountMinor: number;
  readonly shippingMinor: number;
  readonly taxMinor: number;
  readonly lines: readonly OnlineSaleLineRow[];
  readonly movements: readonly OnlineSaleMovementRow[];
  readonly corrispettivo: {
    readonly id: string;
    readonly reference: string;
    readonly fiscalDate: string;
    readonly status: string;
  } | null;
  readonly linkedDocuments: readonly {
    readonly id: string;
    readonly type: string;
    readonly reference: string | null;
    readonly status: string;
  }[];
}

/** Read-model delle Vendite online (documento interno generato dal sistema). */
@Injectable()
export class OnlineSalesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenantId: string,
    query: ListOnlineSalesQueryDto,
  ): Promise<Paginated<OnlineSaleRow>> {
    const where = this.buildWhere(tenantId, query);
    const [total, sales] = await this.prisma.$transaction([
      this.prisma.onlineSale.count({ where }),
      this.prisma.onlineSale.findMany({
        where,
        include: {
          corrispettivo: { select: { reference: true, status: true } },
          location: { select: { name: true } },
          documents: { select: { type: true, reference: true } },
        },
        orderBy: { fulfilledAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      items: sales.map((sale) => this.toRow(sale)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getDetail(tenantId: string, id: string): Promise<OnlineSaleDetail> {
    const sale = await this.prisma.onlineSale.findFirst({
      where: { id, tenantId },
      include: {
        lines: { orderBy: { lineNumber: 'asc' } },
        corrispettivo: {
          select: { id: true, reference: true, fiscalDate: true, status: true },
        },
        location: { select: { name: true } },
        documents: {
          select: { id: true, type: true, reference: true, status: true },
        },
      },
    });
    if (!sale) {
      throw new NotFoundException('Vendita online non trovata');
    }

    const movements = await this.prisma.stockMovement.findMany({
      where: {
        tenantId,
        sourceDocumentType: DocumentType.online_sale,
        sourceDocumentId: sale.id,
      },
      include: { location: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return {
      ...this.toRow(sale),
      externalOrderId: sale.externalOrderId,
      externalFulfillmentId: sale.externalFulfillmentId,
      customerAddress: sale.customerAddress,
      locationName: sale.location?.name ?? null,
      subtotalMinor: sale.subtotalMinor,
      discountMinor: sale.discountMinor,
      shippingMinor: sale.shippingMinor,
      taxMinor: sale.taxMinor,
      lines: sale.lines.map((line) => ({
        id: line.id,
        lineNumber: line.lineNumber,
        variantId: line.variantId,
        sku: line.sku,
        barcode: line.barcode,
        description: line.description,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        subtotalMinor: line.subtotalMinor,
        vatRatePercent: vatSnapshotRatePercent(line.vatSnapshot),
        taxMinor: line.taxMinor,
        totalMinor: line.totalMinor,
        locationId: line.locationId,
        vatCodeId: line.vatCodeId,
        vatCodeLabel: vatSnapshotDisplayLabel(line.vatSnapshot),
      })),
      movements: movements.map((movement) => ({
        id: movement.id,
        type: movement.type,
        quantity: movement.quantity,
        locationName: movement.location.name,
        createdAt: movement.createdAt.toISOString(),
      })),
      corrispettivo: sale.corrispettivo
        ? {
            id: sale.corrispettivo.id,
            reference: sale.corrispettivo.reference,
            fiscalDate: sale.corrispettivo.fiscalDate.toISOString().slice(0, 10),
            status: sale.corrispettivo.status,
          }
        : null,
      linkedDocuments: sale.documents.map((doc) => ({
        id: doc.id,
        type: doc.type,
        reference: doc.reference,
        status: doc.status,
      })),
    };
  }

  /** Vendita online collegata a un ordine (null se non ancora evasa). */
  async findByOrder(
    tenantId: string,
    salesOrderId: string,
  ): Promise<OnlineSaleDetail | null> {
    const sale = await this.prisma.onlineSale.findFirst({
      where: { tenantId, salesOrderId },
      select: { id: true },
    });
    return sale ? this.getDetail(tenantId, sale.id) : null;
  }

  private buildWhere(
    tenantId: string,
    query: ListOnlineSalesQueryDto,
  ): Prisma.OnlineSaleWhereInput {
    const where: Prisma.OnlineSaleWhereInput = { tenantId };

    const channel = toPrismaSource(query.channel);
    if (channel) {
      where.channel = channel;
    }
    if (query.fulfilledFrom || query.fulfilledTo) {
      where.fulfilledAt = {
        ...(query.fulfilledFrom ? { gte: new Date(`${query.fulfilledFrom}T00:00:00Z`) } : {}),
        ...(query.fulfilledTo ? { lte: new Date(`${query.fulfilledTo}T23:59:59.999Z`) } : {}),
      };
    }
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { reference: { contains: search, mode: 'insensitive' } },
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { externalOrderId: { contains: search, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  private toRow(
    sale: Prisma.OnlineSaleGetPayload<{
      include: {
        corrispettivo: { select: { reference: true; status: true } };
        location: { select: { name: true } };
        documents: { select: { type: true; reference: true } };
      };
    }>,
  ): OnlineSaleRow {
    const ddt = sale.documents.find(
      (doc) => doc.type === DocumentType.sales_ddt && doc.reference,
    );
    return {
      id: sale.id,
      reference: sale.reference,
      channel: fromPrismaSource(sale.channel),
      channelLabel: sourceDisplayLabel(sale.channel),
      salesOrderId: sale.salesOrderId,
      orderNumber: sale.orderNumber,
      customerName: sale.customerName,
      orderPlacedAt: sale.orderPlacedAt.toISOString(),
      fulfilledAt: sale.fulfilledAt.toISOString(),
      currency: sale.currency,
      totalMinor: sale.totalMinor,
      paymentStatus: sale.paymentStatus,
      inventoryStatus: sale.inventoryStatus,
      corrispettivoReference: sale.corrispettivo?.reference ?? null,
      corrispettivoStatus: sale.corrispettivo?.status ?? null,
      refundedAt: sale.refundedAt?.toISOString() ?? null,
      locationName: sale.location?.name ?? null,
      ddtReference: ddt?.reference ?? null,
    };
  }
}
