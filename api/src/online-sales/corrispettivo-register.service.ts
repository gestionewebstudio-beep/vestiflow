import { Injectable, NotFoundException } from '@nestjs/common';
import { CorrispettivoStatus, type Prisma } from '@prisma/client';

import type { Paginated } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  fromPrismaSource,
  sourceDisplayLabel,
  toPrismaSource,
  type ApiSalesOrderSource,
} from '../sales-orders/sales-order.enum-mapper';
import { vatSnapshotDisplayLabel, vatSnapshotRatePercent } from '../vat/vat-snapshot.util';
import type { ListCorrispettivoEntriesQueryDto } from './dto/list-corrispettivo-entries.query.dto';
import type { UpdateCorrispettivoEntryDto } from './dto/update-corrispettivo-entry.dto';

export interface CorrispettivoEntryRow {
  readonly id: string;
  readonly reference: string;
  readonly channel: ApiSalesOrderSource;
  readonly channelLabel: string;
  readonly onlineSaleId: string;
  readonly onlineSaleReference: string;
  readonly salesOrderId: string;
  readonly orderNumber: string;
  readonly operationalDate: string;
  readonly fiscalDate: string;
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly totalMinor: number;
  readonly discountMinor: number;
  readonly shippingMinor: number;
  readonly status: CorrispettivoStatus;
  readonly invoiceIssued: boolean;
  readonly excludedFromSummary: boolean;
  readonly exclusionReason: string | null;
  readonly adjustmentNote: string | null;
  readonly refundedAt: string | null;
}

/** Riga analitica della voce corrispettivo (fase 3 §5). */
export interface CorrispettivoEntryLineRow {
  readonly id: string;
  readonly lineNumber: number;
  readonly isShipping: boolean;
  readonly description: string;
  readonly quantity: number;
  readonly discountMinor: number;
  readonly subtotalMinor: number;
  /** Aliquota % derivata dallo snapshot IVA congelato sulla riga (solo display). */
  readonly vatRatePercent: number | null;
  readonly taxMinor: number;
  readonly totalMinor: number;
  readonly vatCodeId: string | null;
  /** Etichetta Codice IVA risolta (o solo aliquota se nessun codice ha fatto match). */
  readonly vatCodeLabel: string | null;
}

export interface CorrispettivoEntryDetail extends CorrispettivoEntryRow {
  readonly lines: readonly CorrispettivoEntryLineRow[];
}

export interface CorrispettivoRegisterSummary {
  readonly entryCount: number;
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly totalMinor: number;
  readonly shippingMinor: number;
  readonly excludedCount: number;
  /** Riepilogo per giorno (data fiscale). */
  readonly byDay: readonly {
    readonly date: string;
    readonly entryCount: number;
    readonly subtotalMinor: number;
    readonly taxMinor: number;
    readonly totalMinor: number;
  }[];
  /** Riepilogo per canale. */
  readonly byChannel: readonly {
    readonly channel: ApiSalesOrderSource;
    readonly channelLabel: string;
    readonly entryCount: number;
    readonly subtotalMinor: number;
    readonly taxMinor: number;
    readonly totalMinor: number;
  }[];
  /** Riepilogo per aliquota IVA (dalle righe). */
  readonly byVatRate: readonly {
    readonly vatRatePercent: number | null;
    readonly subtotalMinor: number;
    readonly taxMinor: number;
    readonly totalMinor: number;
  }[];
}

/**
 * Registro Corrispettivi interno (fase 2 §4–§5): voci generate dalle Vendite
 * online, con data fiscale distinta e modificabile e riepiloghi per giorno,
 * periodo, canale e aliquota IVA. NON è una trasmissione fiscale automatica:
 * è un registro operativo di supporto.
 */
@Injectable()
export class CorrispettivoRegisterService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenantId: string,
    query: ListCorrispettivoEntriesQueryDto,
  ): Promise<Paginated<CorrispettivoEntryRow>> {
    const where = this.buildWhere(tenantId, query);
    const [total, entries] = await this.prisma.$transaction([
      this.prisma.corrispettivoEntry.count({ where }),
      this.prisma.corrispettivoEntry.findMany({
        where,
        include: {
          onlineSale: { select: { reference: true, orderNumber: true } },
        },
        orderBy: [{ fiscalDate: 'desc' }, { number: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      items: entries.map((entry) => this.toRow(entry)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /**
   * Riepiloghi sui filtri correnti. Le voci con `excludedFromSummary` non
   * concorrono ai totali (sono contate a parte in `excludedCount`).
   */
  async getSummary(
    tenantId: string,
    query: ListCorrispettivoEntriesQueryDto,
  ): Promise<CorrispettivoRegisterSummary> {
    const baseWhere = this.buildWhere(tenantId, query);
    const includedWhere: Prisma.CorrispettivoEntryWhereInput = {
      ...baseWhere,
      excludedFromSummary: false,
    };

    const [excludedCount, entries] = await this.prisma.$transaction([
      this.prisma.corrispettivoEntry.count({
        where: { ...baseWhere, excludedFromSummary: true },
      }),
      this.prisma.corrispettivoEntry.findMany({
        where: includedWhere,
        select: {
          id: true,
          channel: true,
          fiscalDate: true,
          subtotalMinor: true,
          taxMinor: true,
          totalMinor: true,
          shippingMinor: true,
        },
      }),
    ]);

    const totals = { subtotal: 0, tax: 0, total: 0, shipping: 0 };
    const byDay = new Map<
      string,
      { entryCount: number; subtotal: number; tax: number; total: number }
    >();
    const byChannel = new Map<
      ApiSalesOrderSource,
      { label: string; entryCount: number; subtotal: number; tax: number; total: number }
    >();

    for (const entry of entries) {
      totals.subtotal += entry.subtotalMinor;
      totals.tax += entry.taxMinor;
      totals.total += entry.totalMinor;
      totals.shipping += entry.shippingMinor;

      const day = entry.fiscalDate.toISOString().slice(0, 10);
      const dayAgg = byDay.get(day) ?? { entryCount: 0, subtotal: 0, tax: 0, total: 0 };
      dayAgg.entryCount += 1;
      dayAgg.subtotal += entry.subtotalMinor;
      dayAgg.tax += entry.taxMinor;
      dayAgg.total += entry.totalMinor;
      byDay.set(day, dayAgg);

      const channel = fromPrismaSource(entry.channel);
      const channelAgg = byChannel.get(channel) ?? {
        label: sourceDisplayLabel(entry.channel),
        entryCount: 0,
        subtotal: 0,
        tax: 0,
        total: 0,
      };
      channelAgg.entryCount += 1;
      channelAgg.subtotal += entry.subtotalMinor;
      channelAgg.tax += entry.taxMinor;
      channelAgg.total += entry.totalMinor;
      byChannel.set(channel, channelAgg);
    }

    // Nessuna colonna aliquota grezza persistita: l'aggregazione per aliquota
    // rilegge lo snapshot IVA congelato per riga e raggruppa in memoria (il
    // groupBy Prisma non filtra/raggruppa su campi JSON annidati).
    const vatLines =
      entries.length > 0
        ? await this.prisma.corrispettivoEntryLine.findMany({
            where: { tenantId, entryId: { in: entries.map((entry) => entry.id) } },
            select: { vatSnapshot: true, subtotalMinor: true, taxMinor: true, totalMinor: true },
          })
        : [];
    const vatRateAgg = new Map<
      number | null,
      { subtotalMinor: number; taxMinor: number; totalMinor: number }
    >();
    for (const line of vatLines) {
      const rate = vatSnapshotRatePercent(line.vatSnapshot);
      const agg = vatRateAgg.get(rate) ?? { subtotalMinor: 0, taxMinor: 0, totalMinor: 0 };
      agg.subtotalMinor += line.subtotalMinor;
      agg.taxMinor += line.taxMinor;
      agg.totalMinor += line.totalMinor;
      vatRateAgg.set(rate, agg);
    }

    return {
      entryCount: entries.length,
      subtotalMinor: totals.subtotal,
      taxMinor: totals.tax,
      totalMinor: totals.total,
      shippingMinor: totals.shipping,
      excludedCount,
      byDay: [...byDay.entries()]
        .sort(([a], [b]) => (a < b ? 1 : -1))
        .map(([date, agg]) => ({
          date,
          entryCount: agg.entryCount,
          subtotalMinor: agg.subtotal,
          taxMinor: agg.tax,
          totalMinor: agg.total,
        })),
      byChannel: [...byChannel.entries()].map(([channel, agg]) => ({
        channel,
        channelLabel: agg.label,
        entryCount: agg.entryCount,
        subtotalMinor: agg.subtotal,
        taxMinor: agg.tax,
        totalMinor: agg.total,
      })),
      byVatRate: [...vatRateAgg.entries()]
        .sort(([a], [b]) => (a ?? -1) - (b ?? -1))
        .map(([vatRatePercent, agg]) => ({
          vatRatePercent,
          subtotalMinor: agg.subtotalMinor,
          taxMinor: agg.taxMinor,
          totalMinor: agg.totalMinor,
        })),
    };
  }

  /** Dettaglio voce con righe analitiche (fase 3 §5). */
  async getDetail(tenantId: string, id: string): Promise<CorrispettivoEntryDetail> {
    const entry = await this.prisma.corrispettivoEntry.findFirst({
      where: { id, tenantId },
      include: {
        onlineSale: { select: { reference: true, orderNumber: true, salesOrderId: true } },
        lines: { orderBy: { lineNumber: 'asc' } },
      },
    });
    if (!entry) {
      throw new NotFoundException('Voce corrispettivo non trovata');
    }
    return {
      ...this.toRow(entry),
      lines: entry.lines.map((line) => ({
        id: line.id,
        lineNumber: line.lineNumber,
        isShipping: line.isShipping,
        description: line.description,
        quantity: line.quantity,
        discountMinor: line.discountMinor,
        subtotalMinor: line.subtotalMinor,
        vatRatePercent: vatSnapshotRatePercent(line.vatSnapshot),
        taxMinor: line.taxMinor,
        totalMinor: line.totalMinor,
        vatCodeId: line.vatCodeId,
        vatCodeLabel: vatSnapshotDisplayLabel(line.vatSnapshot),
      })),
    };
  }

  /** Aggiorna stato/data fiscale/esclusione (utenti autorizzati, §5). */
  async update(
    tenantId: string,
    id: string,
    dto: UpdateCorrispettivoEntryDto,
  ): Promise<CorrispettivoEntryRow> {
    const existing = await this.prisma.corrispettivoEntry.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Voce corrispettivo non trovata');
    }

    const data: Prisma.CorrispettivoEntryUpdateInput = {};
    if (dto.status !== undefined) {
      data.status = dto.status;
      if (dto.status === CorrispettivoStatus.refunded) {
        data.refundedAt = new Date();
      }
    }
    if (dto.fiscalDate !== undefined) {
      data.fiscalDate = new Date(`${dto.fiscalDate}T00:00:00Z`);
    }
    if (dto.invoiceIssued !== undefined) {
      data.invoiceIssued = dto.invoiceIssued;
      if (dto.invoiceIssued) {
        data.excludedFromSummary = true;
        data.status = CorrispettivoStatus.excluded_invoiced;
      }
    }
    if (dto.excludedFromSummary !== undefined) {
      data.excludedFromSummary = dto.excludedFromSummary;
    }
    if (dto.exclusionReason !== undefined) {
      data.exclusionReason = dto.exclusionReason?.trim() || null;
    }
    if (dto.adjustmentNote !== undefined) {
      data.adjustmentNote = dto.adjustmentNote?.trim() || null;
    }

    const updated = await this.prisma.corrispettivoEntry.update({
      where: { id },
      data,
      include: {
        onlineSale: { select: { reference: true, orderNumber: true } },
      },
    });
    return this.toRow(updated);
  }

  private buildWhere(
    tenantId: string,
    query: ListCorrispettivoEntriesQueryDto,
  ): Prisma.CorrispettivoEntryWhereInput {
    const where: Prisma.CorrispettivoEntryWhereInput = { tenantId };

    const channel = toPrismaSource(query.channel);
    if (channel) {
      where.channel = channel;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.fiscalFrom || query.fiscalTo) {
      where.fiscalDate = {
        ...(query.fiscalFrom ? { gte: new Date(`${query.fiscalFrom}T00:00:00Z`) } : {}),
        ...(query.fiscalTo ? { lte: new Date(`${query.fiscalTo}T00:00:00Z`) } : {}),
      };
    }
    if (query.invoiceIssued !== undefined) {
      where.invoiceIssued = query.invoiceIssued;
    }
    if (query.excludedFromSummary !== undefined) {
      where.excludedFromSummary = query.excludedFromSummary;
    }
    if (query.vatRatePercent !== undefined) {
      // Nessuna colonna aliquota grezza persistita: filtro sullo snapshot IVA
      // congelato per riga (§9), unica fonte stabile dell'aliquota effettiva.
      where.lines = {
        some: { vatSnapshot: { path: ['ratePercent'], equals: query.vatRatePercent } },
      };
    }
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { reference: { contains: search, mode: 'insensitive' } },
        { onlineSale: { orderNumber: { contains: search, mode: 'insensitive' } } },
        { onlineSale: { reference: { contains: search, mode: 'insensitive' } } },
      ];
    }
    return where;
  }

  private toRow(
    entry: Prisma.CorrispettivoEntryGetPayload<{
      include: { onlineSale: { select: { reference: true; orderNumber: true } } };
    }>,
  ): CorrispettivoEntryRow {
    return {
      id: entry.id,
      reference: entry.reference,
      channel: fromPrismaSource(entry.channel),
      channelLabel: sourceDisplayLabel(entry.channel),
      onlineSaleId: entry.onlineSaleId,
      onlineSaleReference: entry.onlineSale.reference,
      salesOrderId: entry.salesOrderId,
      orderNumber: entry.onlineSale.orderNumber,
      operationalDate: entry.operationalDate.toISOString(),
      fiscalDate: entry.fiscalDate.toISOString().slice(0, 10),
      subtotalMinor: entry.subtotalMinor,
      taxMinor: entry.taxMinor,
      totalMinor: entry.totalMinor,
      discountMinor: entry.discountMinor,
      shippingMinor: entry.shippingMinor,
      status: entry.status,
      invoiceIssued: entry.invoiceIssued,
      excludedFromSummary: entry.excludedFromSummary,
      exclusionReason: entry.exclusionReason,
      adjustmentNote: entry.adjustmentNote,
      refundedAt: entry.refundedAt?.toISOString() ?? null,
    };
  }
}
