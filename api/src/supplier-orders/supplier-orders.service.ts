import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  DocumentStatus,
  DocumentType,
  Prisma,
  SupplierOrderStatus,
  type PurchaseCostEntryMode,
  type Supplier,
  type SupplierOrder,
  type SupplierOrderLine,
} from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { resolveReadableListLocationScope } from '../inventory/licensed-location-scope.util';
import { assertLocationReadableInUserScope } from '../inventory/user-location-scope.util';
import { partyDisplayName } from '../common/party/party.util';
import { PrismaService } from '../prisma/prisma.service';
import type { Paginated } from '../common/dto/pagination.dto';
import { DocumentSettingsService } from '../documents/document-settings.service';
import { formatDocumentReference } from '../documents/document-totals.util';
import { nextDocumentNumber } from '../documents/document-numbering.util';
import { computeGoodsReceiptTotals } from '../documents/goods-receipt-vat.util';
import { computeVatLineAmounts } from '../vat/vat-line-calculation.util';
import { VatCodesService, type VatCodeWithNature } from '../vat/vat-codes.service';
import type {
  CreateSupplierOrderDto,
  CreateSupplierOrderLineDto,
} from './dto/create-supplier-order.dto';
import type { CreateSupplierDto } from './dto/create-supplier.dto';
import type { ListSupplierOrdersQueryDto } from './dto/list-supplier-orders.query.dto';
import type { UpdateSupplierOrderDto } from './dto/update-supplier-order.dto';
import { SuppliersService } from './suppliers.service';

export type SupplierOrderListRow = SupplierOrder & { lineCount: number; lines: [] };

/** Documento collegato (arrivo merce): il collegamento è visibile nell'ordine. */
export interface SupplierOrderLinkedDocument {
  readonly id: string;
  readonly type: DocumentType;
  readonly reference: string | null;
  readonly number: number | null;
  readonly documentDate: Date;
  readonly status: DocumentStatus;
}

export type SupplierOrderWithLines = SupplierOrder & {
  lines: SupplierOrderLine[];
  linkedDocuments?: SupplierOrderLinkedDocument[];
};

export interface SupplierOrderMeta {
  /** Anteprima prossimo riferimento dal numeratore supplier_order. */
  readonly nextReferencePreview: string;
}

interface ComputedOrderLine {
  readonly variantId: string;
  readonly sku: string;
  readonly description: string;
  readonly orderedQuantity: number;
  readonly unitCostMinor: number;
  readonly enteredUnitCostMinor: number;
  readonly discountPercent: number;
  readonly vatCodeId: string | null;
  readonly vatSnapshot: Prisma.InputJsonObject | null;
  readonly lineTotalMinor: number;
  readonly lineVatTotalMinor: number;
  readonly vatAffectsSupplierTotal: boolean;
  readonly effectiveRatePercent: number;
}

/**
 * Ordine fornitore (prompt 2026-07): documento SOLO commerciale — non incide
 * mai su giacenze o disponibilità. Nasce Confermato e diventa Concluso quando
 * viene incluso/agganciato a un Arrivo merce (collegamento visibile).
 * Numerazione propria dal numeratore documenti `supplier_order` (Numeratori).
 */
@Injectable()
export class SupplierOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly suppliers: SuppliersService,
    private readonly documentSettings: DocumentSettingsService,
    private readonly vatCodes: VatCodesService,
  ) {}

  listSuppliers(tenantId: string): Promise<Supplier[]> {
    return this.suppliers.listAll(tenantId);
  }

  createSupplier(tenantId: string, dto: CreateSupplierDto): Promise<Supplier> {
    return this.suppliers.create(tenantId, dto);
  }

  /** Anteprima numerazione (numeratore dedicato supplier_order, come Ordine cliente). */
  async getMeta(tenantId: string): Promise<SupplierOrderMeta> {
    const setting = await this.documentSettings.getResolved(tenantId, DocumentType.supplier_order);
    const year = new Date().getFullYear();
    // Stesso criterio dell'assegnazione (massimo esistente + 1): l'anteprima
    // coincide col numero che l'ordine riceverà davvero.
    const previewNumber = await nextDocumentNumber({
      tx: this.prisma,
      tenantId,
      type: DocumentType.supplier_order,
      series: setting.defaultSeries,
      year,
      source: 'supplier_order',
      prefix: setting.numberPrefix,
    });
    return {
      nextReferencePreview: formatDocumentReference(setting.numberPrefix, year, previewNumber),
    };
  }

  /**
   * Crea un ordine fornitore Confermato: snapshot nome fornitore, SKU e
   * descrizione articolo, costi netto/ivato con sconto e Codice IVA, totali
   * calcolati server-side. NESSUN impatto su giacenze o disponibilità.
   */
  async create(
    tenantId: string,
    dto: CreateSupplierOrderDto,
    _user?: UserProfileDto,
  ): Promise<SupplierOrderWithLines> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, tenantId },
      include: { party: true },
    });
    if (!supplier) {
      throw new NotFoundException('Fornitore non trovato');
    }

    const setting = await this.documentSettings.getResolved(tenantId, DocumentType.supplier_order);
    if (!setting.enabled) {
      throw new UnprocessableEntityException(
        `Il tipo documento "${setting.printTitle}" non è abilitato per questa azienda.`,
      );
    }

    const costEntryMode = dto.costEntryMode ?? 'vat_excluded';
    const computedLines = await this.computeLines(tenantId, dto.lines, costEntryMode);
    const totals = computeGoodsReceiptTotals(computedLines, 0);
    const orderDate = dto.orderDate ? new Date(dto.orderDate) : new Date();

    return this.prisma.$transaction(async (tx) => {
      const year = orderDate.getFullYear();
      const number = await nextDocumentNumber({
        tx,
        tenantId,
        type: DocumentType.supplier_order,
        series: setting.defaultSeries,
        year,
        source: 'supplier_order',
        prefix: setting.numberPrefix,
      });
      const reference = formatDocumentReference(setting.numberPrefix, year, number);

      const order = await tx.supplierOrder.create({
        data: {
          tenantId,
          reference,
          supplierId: supplier.id,
          supplierName: partyDisplayName(supplier.party),
          status: SupplierOrderStatus.confirmed,
          currency: dto.currency ?? 'EUR',
          costEntryMode,
          orderDate,
          supplierReference: dto.supplierReference?.trim() || null,
          subtotalMinor: totals.subtotalMinor,
          taxMinor: totals.taxMinor,
          totalMinor: totals.totalMinor,
          expectedAt: dto.expectedAt ? new Date(dto.expectedAt) : null,
          lines: { create: computedLines.map((line) => this.toLineCreateData(line)) },
        },
        include: { lines: true },
      });
      return { ...order, linkedDocuments: [] };
    });
  }

  /** Aggiorna un ordine Confermato: righe sostituite, totali ricalcolati. */
  async update(
    tenantId: string,
    id: string,
    dto: UpdateSupplierOrderDto,
    user?: UserProfileDto,
  ): Promise<SupplierOrderWithLines> {
    const order = await this.getById(tenantId, id, user);
    if (order.status !== SupplierOrderStatus.confirmed) {
      throw new ConflictException(
        'Solo gli ordini confermati (non conclusi né annullati) possono essere modificati.',
      );
    }

    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId ?? order.supplierId, tenantId },
      include: { party: true },
    });
    if (!supplier) {
      throw new NotFoundException('Fornitore non trovato');
    }

    const costEntryMode = dto.costEntryMode ?? order.costEntryMode;
    const computedLines = await this.computeLines(tenantId, dto.lines, costEntryMode);
    const totals = computeGoodsReceiptTotals(computedLines, 0);

    return this.prisma.$transaction(async (tx) => {
      await tx.supplierOrderLine.deleteMany({ where: { orderId: id } });
      const updated = await tx.supplierOrder.update({
        where: { id },
        data: {
          supplierId: supplier.id,
          supplierName: partyDisplayName(supplier.party),
          currency: dto.currency ?? order.currency,
          costEntryMode,
          orderDate: dto.orderDate ? new Date(dto.orderDate) : order.orderDate,
          supplierReference:
            dto.supplierReference === undefined
              ? order.supplierReference
              : dto.supplierReference?.trim() || null,
          subtotalMinor: totals.subtotalMinor,
          taxMinor: totals.taxMinor,
          totalMinor: totals.totalMinor,
          expectedAt:
            dto.expectedAt === null
              ? null
              : dto.expectedAt
                ? new Date(dto.expectedAt)
                : order.expectedAt,
          lines: { create: computedLines.map((line) => this.toLineCreateData(line)) },
        },
        include: { lines: true },
      });
      return { ...updated, linkedDocuments: order.linkedDocuments ?? [] };
    });
  }

  /** Annulla un ordine Confermato (nessun effetto magazzino da stornare). */
  async cancel(
    tenantId: string,
    id: string,
    user?: UserProfileDto,
  ): Promise<SupplierOrderWithLines> {
    const order = await this.getById(tenantId, id, user);
    if (order.status !== SupplierOrderStatus.confirmed) {
      throw new ConflictException(
        'Solo gli ordini confermati possono essere annullati. Un ordine concluso resta collegato al suo arrivo merce.',
      );
    }
    const updated = await this.prisma.supplierOrder.update({
      where: { id },
      data: { status: SupplierOrderStatus.cancelled },
      include: { lines: true },
    });
    return { ...updated, linkedDocuments: order.linkedDocuments ?? [] };
  }

  /** Elimina definitivamente un ordine annullato (righe in cascade). */
  async delete(tenantId: string, id: string, user?: UserProfileDto): Promise<void> {
    const order = await this.getById(tenantId, id, user);
    if (order.status !== SupplierOrderStatus.cancelled) {
      throw new ConflictException('Solo gli ordini annullati possono essere eliminati.');
    }
    await this.prisma.supplierOrder.delete({ where: { id } });
  }

  async list(
    tenantId: string,
    query: ListSupplierOrdersQueryDto,
    user?: UserProfileDto,
  ): Promise<Paginated<SupplierOrderListRow>> {
    const locationScope = await resolveReadableListLocationScope(this.prisma, tenantId, user);
    if (locationScope === null) {
      return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
    }

    // Blocchi OR combinati in AND: scope sedi (gli ordini nuovi non hanno
    // sede — nessun effetto magazzino — e restano visibili a tutti; il
    // vincolo vale per i vecchi ordini con destinazione) + ricerca libera.
    const andBlocks: Prisma.SupplierOrderWhereInput[] = [];
    if (locationScope !== 'unrestricted') {
      andBlocks.push({
        OR: [
          { destinationLocationId: null },
          { destinationLocationId: { in: [...locationScope] } },
        ],
      });
    }
    if (query.search) {
      andBlocks.push({
        OR: [
          { reference: { contains: query.search, mode: 'insensitive' } },
          { supplierName: { contains: query.search, mode: 'insensitive' } },
          { supplierReference: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }

    const where: Prisma.SupplierOrderWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(andBlocks.length > 0 ? { AND: andBlocks } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.supplierOrder.findMany({
        where,
        include: { _count: { select: { lines: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.supplierOrder.count({ where }),
    ]);

    const items: SupplierOrderListRow[] = rows.map(({ _count, ...order }) => ({
      ...order,
      lineCount: _count.lines,
      lines: [],
    }));

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getById(
    tenantId: string,
    id: string,
    user?: UserProfileDto,
  ): Promise<SupplierOrderWithLines> {
    const order = await this.prisma.supplierOrder.findFirst({
      where: { id, tenantId },
      include: {
        lines: true,
        documents: {
          where: { status: { not: DocumentStatus.cancelled } },
          select: {
            id: true,
            type: true,
            reference: true,
            number: true,
            documentDate: true,
            status: true,
          },
          orderBy: { documentDate: 'desc' },
        },
      },
    });
    if (!order) {
      throw new NotFoundException('Ordine fornitore non trovato');
    }
    assertLocationReadableInUserScope(
      user,
      order.destinationLocationId,
      'Non sei autorizzato ad accedere a questo ordine fornitore.',
    );
    const { documents, ...rest } = order;
    return { ...rest, linkedDocuments: documents };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Risolve varianti (snapshot SKU/descrizione) e Codici IVA riga, poi calcola
   * netto/IVA/totale con lo stesso motore dell'Arrivo merce (switch
   * netto/ivato incluso).
   */
  private async computeLines(
    tenantId: string,
    lines: readonly CreateSupplierOrderLineDto[],
    costEntryMode: PurchaseCostEntryMode,
  ): Promise<ComputedOrderLine[]> {
    const variantIds = [...new Set(lines.map((line) => line.variantId))];
    const variants = await this.prisma.productVariant.findMany({
      where: { tenantId, id: { in: variantIds } },
      select: {
        id: true,
        sku: true,
        product: { select: { name: true } },
      },
    });
    const variantById = new Map(variants.map((variant) => [variant.id, variant]));
    for (const line of lines) {
      if (!variantById.has(line.variantId)) {
        throw new UnprocessableEntityException(`Variante non trovata: ${line.variantId}`);
      }
    }

    const vatCodeIds = [
      ...new Set(lines.map((line) => line.vatCodeId).filter((id): id is string => id != null)),
    ];
    const vatCodesById = new Map<string, VatCodeWithNature>();
    if (vatCodeIds.length > 0) {
      const found = await this.prisma.vatCode.findMany({
        where: { tenantId, id: { in: vatCodeIds }, deletedAt: null },
        include: { nature: true },
      });
      for (const vatCode of found) {
        vatCodesById.set(vatCode.id, vatCode);
      }
      this.assertPurchaseVatCodes(lines, vatCodesById);
    }

    return lines.map((line) => {
      const variant = variantById.get(line.variantId)!;
      const vatCode = line.vatCodeId ? vatCodesById.get(line.vatCodeId) : undefined;
      const vat = vatCode
        ? {
            ratePercent: Number(vatCode.ratePercent),
            nonDeductiblePercent: Number(vatCode.nonDeductiblePercent),
            calculationMode: vatCode.calculationMode,
            vatAffectsSupplierTotal: vatCode.vatAffectsSupplierTotal,
          }
        : {
            ratePercent: 0,
            nonDeductiblePercent: 0,
            calculationMode: 'standard' as const,
            vatAffectsSupplierTotal: false,
          };
      const discountPercent = line.discountPercent ?? 0;
      const amounts = computeVatLineAmounts({
        enteredUnitCostMinor: line.enteredUnitCostMinor,
        costEntryMode,
        quantity: line.orderedQuantity,
        discountPercent,
        vat,
      });
      return {
        variantId: line.variantId,
        sku: variant.sku ?? '',
        description: line.description?.trim() || variant.product.name,
        orderedQuantity: line.orderedQuantity,
        unitCostMinor: amounts.unitNetMinor,
        enteredUnitCostMinor: line.enteredUnitCostMinor,
        discountPercent,
        vatCodeId: vatCode?.id ?? null,
        vatSnapshot: vatCode ? this.vatCodes.buildSnapshot(vatCode) : null,
        lineTotalMinor: amounts.lineNetMinor,
        lineVatTotalMinor: amounts.lineVatMinor,
        vatAffectsSupplierTotal: vat.vatAffectsSupplierTotal,
        effectiveRatePercent: vat.ratePercent,
      };
    });
  }

  private toLineCreateData(
    line: ComputedOrderLine,
  ): Prisma.SupplierOrderLineCreateWithoutOrderInput {
    return {
      variantId: line.variantId,
      sku: line.sku,
      description: line.description,
      orderedQuantity: line.orderedQuantity,
      unitCostMinor: line.unitCostMinor,
      enteredUnitCostMinor: line.enteredUnitCostMinor,
      discountPercent: line.discountPercent,
      lineTotalMinor: line.lineTotalMinor,
      vatSnapshot: line.vatSnapshot ?? Prisma.DbNull,
      ...(line.vatCodeId ? { vatCode: { connect: { id: line.vatCodeId } } } : {}),
    };
  }

  /** Come l'Arrivo merce: i Codici IVA riga devono esistere, essere attivi e utilizzabili in acquisto. */
  private assertPurchaseVatCodes(
    lines: readonly CreateSupplierOrderLineDto[],
    vatCodesById: ReadonlyMap<string, VatCodeWithNature>,
  ): void {
    const lineNumberForVatCode = (vatCodeId: string): number => {
      const index = lines.findIndex((line) => line.vatCodeId === vatCodeId);
      return index >= 0 ? index + 1 : 1;
    };
    const requested = [
      ...new Set(lines.map((line) => line.vatCodeId).filter((id): id is string => id != null)),
    ];
    for (const vatCodeId of requested) {
      const vatCode = vatCodesById.get(vatCodeId);
      if (!vatCode) {
        throw new UnprocessableEntityException(
          `Riga ${lineNumberForVatCode(vatCodeId)}: il Codice IVA selezionato non esiste più. Scegli un altro codice.`,
        );
      }
      if (!vatCode.isActive) {
        throw new UnprocessableEntityException(
          `Riga ${lineNumberForVatCode(vatCodeId)}: il Codice IVA "${vatCode.code}" è disattivato. Scegli un codice attivo.`,
        );
      }
      if (vatCode.usageScope === 'sales') {
        throw new UnprocessableEntityException(
          `Riga ${lineNumberForVatCode(vatCodeId)}: il Codice IVA "${vatCode.code}" è riservato alle vendite e non è utilizzabile in acquisto.`,
        );
      }
    }
  }
}
