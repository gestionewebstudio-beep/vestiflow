import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  SalesOrderFiscalStatus as PrismaFiscal,
  type SalesOrder,
} from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import type { Paginated } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { buildPlacedAtFilter } from '../sales-orders/sales-order-query.util';
import { API_SOURCE_ONLINE, API_SOURCE_POS } from '../sales-orders/sales-order.enum-mapper';
import { isRefundFinancialStatus } from './corrispettivi-fiscal.enum-mapper';
import { buildCorrispettiviWhere } from './corrispettivi-query.util';
import type { ListCorrispettiviQueryDto } from './dto/list-corrispettivi.query.dto';
import type { MarkCorrispettiviDeliveredDto } from './dto/mark-corrispettivi-delivered.dto';
import type { UpdateFiscalStatusDto } from './dto/update-fiscal-status.dto';

export interface CorrispettiviSummaryDto {
  readonly orderCount: number;
  readonly refundsCount: number;
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly shippingMinor: number;
  readonly discountMinor: number;
  readonly totalMinor: number;
  readonly taxableMinor: number;
  readonly pendingDeliveryCount: number;
}

export interface CorrispettiviDeliveryRow {
  readonly id: string;
  readonly periodFrom: Date;
  readonly periodTo: Date;
  readonly channelFilter: string;
  readonly orderCount: number;
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly shippingMinor: number;
  readonly totalMinor: number;
  readonly refundsCount: number;
  readonly note: string | null;
  readonly createdByName: string;
  readonly createdAt: Date;
}

export type CorrispettiviOrderRow = SalesOrder & {
  customer: { email: string | null } | null;
};

@Injectable()
export class CorrispettiviService {
  constructor(private readonly prisma: PrismaService) {}

  async listOrders(
    tenantId: string,
    query: ListCorrispettiviQueryDto,
  ): Promise<Paginated<CorrispettiviOrderRow>> {
    const where = buildCorrispettiviWhere(tenantId, query);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.salesOrder.findMany({
        where,
        include: { customer: { select: { party: { select: { email: true } } } } },
        orderBy: { placedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.salesOrder.count({ where }),
    ]);

    return {
      items: items.map(({ customer, ...order }) => ({
        ...order,
        customer: customer ? { email: customer.party.email } : null,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
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
    let pendingDeliveryCount = 0;

    for (const order of orders) {
      subtotalMinor += order.subtotalMinor;
      taxMinor += order.taxMinor;
      shippingMinor += order.shippingMinor;
      discountMinor += order.discountMinor;
      totalMinor += order.totalMinor;
      if (isRefundFinancialStatus(order.financialStatus)) {
        refundsCount += 1;
      }
      if (
        order.fiscalStatus === PrismaFiscal.pending_registration &&
        order.source === 'shopify_online'
      ) {
        pendingDeliveryCount += 1;
      }
    }

    const taxableMinor = Math.max(0, subtotalMinor - discountMinor);

    return {
      orderCount: orders.length,
      refundsCount,
      subtotalMinor,
      taxMinor,
      shippingMinor,
      discountMinor,
      totalMinor,
      taxableMinor,
      pendingDeliveryCount,
    };
  }

  async markDelivered(
    tenantId: string,
    user: UserProfileDto,
    dto: MarkCorrispettiviDeliveredDto,
  ): Promise<CorrispettiviDeliveryRow> {
    const placedAt = buildPlacedAtFilter(dto.placedFrom, dto.placedTo);
    if (!placedAt?.gte || !placedAt?.lte) {
      throw new BadRequestException('Periodo non valido');
    }

    const channel = dto.channel ?? API_SOURCE_ONLINE;
    const where = buildCorrispettiviWhere(tenantId, {
      placedFrom: dto.placedFrom,
      placedTo: dto.placedTo,
      ...(channel === API_SOURCE_ONLINE ? { onlineOnly: true } : {}),
      ...(channel === API_SOURCE_POS ? { posOnly: true } : {}),
      fiscalStatus: 'pending_registration',
    });

    const orders = await this.prisma.salesOrder.findMany({
      where,
      select: {
        id: true,
        subtotalMinor: true,
        taxMinor: true,
        shippingMinor: true,
        totalMinor: true,
        financialStatus: true,
      },
    });

    if (orders.length === 0) {
      throw new BadRequestException('Nessun ordine da consegnare nel periodo selezionato');
    }

    const summary = this.aggregateOrders(orders);
    const now = new Date();

    const periodFrom = placedAt.gte!;
    const periodTo = placedAt.lte!;

    const delivery = await this.prisma.$transaction(async (tx) => {
      await tx.salesOrder.updateMany({
        where: { id: { in: orders.map((o) => o.id) } },
        data: {
          fiscalStatus: PrismaFiscal.delivered_to_accountant,
          fiscalDeliveredAt: now,
        },
      });

      return tx.corrispettiviDelivery.create({
        data: {
          tenantId,
          periodFrom,
          periodTo,
          channelFilter: channel,
          orderCount: orders.length,
          subtotalMinor: summary.subtotalMinor,
          taxMinor: summary.taxMinor,
          shippingMinor: summary.shippingMinor,
          totalMinor: summary.totalMinor,
          refundsCount: summary.refundsCount,
          note: dto.note?.trim() || null,
          createdById: user.id,
          createdByName: user.displayName,
        },
      });
    });

    return delivery;
  }

  async listDeliveries(
    tenantId: string,
    page = 1,
    pageSize = 20,
  ): Promise<Paginated<CorrispettiviDeliveryRow>> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.corrispettiviDelivery.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.corrispettiviDelivery.count({ where: { tenantId } }),
    ]);

    return { items, total, page, pageSize };
  }

  async updateFiscalStatus(
    tenantId: string,
    orderId: string,
    dto: UpdateFiscalStatusDto,
  ): Promise<CorrispettiviOrderRow> {
    const existing = await this.prisma.salesOrder.findFirst({
      where: { id: orderId, tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Vendita non trovata');
    }

    const fiscalStatus = dto.fiscalStatus as PrismaFiscal;

    const updated = await this.prisma.salesOrder.update({
      where: { id: orderId },
      data: {
        fiscalStatus,
        fiscalNote: dto.fiscalNote?.trim() || null,
        ...(fiscalStatus === PrismaFiscal.delivered_to_accountant
          ? { fiscalDeliveredAt: new Date() }
          : {}),
      },
      include: { customer: { select: { party: { select: { email: true } } } } },
    });
    const { customer, ...rest } = updated;
    return { ...rest, customer: customer ? { email: customer.party.email } : null };
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
