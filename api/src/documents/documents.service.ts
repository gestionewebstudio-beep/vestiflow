import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AdjustmentDirection,
  DocumentStatus,
  DocumentType,
  Prisma,
  StockMovementType,
  SupplierOrderStatus,
  type Document,
  type DocumentLine,
} from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { ChannelSyncFacade } from '../channels/channel-sync.facade';
import type { Paginated } from '../common/dto/pagination.dto';
import { applyStockLoad, applyStockSale } from '../inventory/inventory-movement.util';
import { applyInventoryLotsFromDocumentLines } from '../inventory/inventory-lot.util';
import {
  applyInventorySerialsFromDocumentLines,
  assertSerialNumbersForDocumentLines,
  assertSerialNumbersForTransferLines,
  assertSerialNumbersForUnloadLines,
  consumeInventorySerialsFromDocumentLines,
  restoreConsumedSerialsForDocument,
  reverseInventorySerialsForDocument,
  reverseTransferInventorySerialsForDocument,
  transferInventorySerialsFromDocumentLines,
} from '../inventory/inventory-serial.util';
import { PrismaService } from '../prisma/prisma.service';
import { ACCOUNTANT_DOCUMENT_TYPES } from './accountant-document-types.constant';
import {
  buildGoodsReceiptMovementReason,
  syncGoodsReceiptLineMovements,
} from './document-goods-receipt-sync.util';
import {
  INVOICE_LINKABLE_RECEIPT_TYPES,
  documentTypeAdjustsStockOnConfirm,
  documentTypeLoadsStockOnConfirm,
  documentTypeTransfersStockOnConfirm,
  documentTypeUnloadsStockOnConfirm,
} from './document-stock.constants';
import {
  documentTypeDefaultLoadsStock,
  isProformaConvertTarget,
} from './document-type.util';
import {
  applyDocumentStockAdjustments,
  reconcileDocumentStockAdjustment,
  reverseDocumentStockAdjustment,
} from './document-stock-adjustment.util';
import {
  applyDocumentStockManualUnloads,
  reconcileDocumentStockManualUnload,
  reverseDocumentStockManualUnload,
} from './document-stock-manual-unload.util';
import {
  applyDocumentStockTransfers,
  reconcileDocumentStockTransfer,
  reverseDocumentStockTransfer,
} from './document-stock-transfer.util';
import {
  buildRevisionSummary,
  reconcileDocumentStockLoad,
  reconcileDocumentStockUnload,
  reverseDocumentStockLoad,
  reverseDocumentStockUnload,
} from './document-stock-reconcile.util';
import {
  applySupplierOrderReceipt,
  assertSupplierOrderReceiptQuantities,
  enrichReceiptLinesWithSupplierOrderLineIds,
  forceCloseSupplierOrder,
  reconcileSupplierOrderReceipt,
  reverseSupplierOrderReceipt,
} from './document-supplier-order.util';
import {
  applySupplierPriceUpdates,
  findSupplierPriceDiffs,
} from './document-supplier-price.util';
import { DocumentSettingsService } from './document-settings.service';
import { isFlowOnlyDocumentType, isInternalOnlyDocumentType } from './document-defaults';
import type { ResolvedDocumentTypeSetting } from './document-defaults';
import type { CreateGoodsReceiptFromSupplierOrderDto } from './dto/create-goods-receipt-from-supplier-order.dto';
import type { ConvertDocumentDto } from './dto/convert-document.dto';
import type { CreateDocumentDto, DocumentLineInputDto } from './dto/create-document.dto';
import type { ListDocumentsQueryDto } from './dto/list-documents.query.dto';
import type { RegisterExternalDto } from './dto/register-external.dto';
import type { MarkExternallyIssuedDto } from './dto/mark-externally-issued.dto';
import type { UpdateDocumentDto } from './dto/update-document.dto';

export type DocumentWithLines = Document & { lines: DocumentLine[] };

/** Fattura registrata collegata a un arrivo merce (display lista/dettaglio). */
export type LinkedPurchaseInvoiceInfo = {
  readonly id: string;
  readonly reference: string | null;
  readonly externalDocNumber: string | null;
  readonly externalDocDate: Date | null;
  readonly documentDate: Date;
  /** "Totali da verificare" (§15): l'arrivo è cambiato dopo il collegamento. */
  readonly totalsCheckPending: boolean;
};

/** Arrivo merce incluso in una registrazione fattura (dettaglio fattura). */
export type LinkedGoodsReceiptInfo = {
  readonly id: string;
  readonly number: number | null;
  readonly reference: string | null;
  readonly documentDate: Date;
  readonly causalText: string | null;
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly totalMinor: number;
};

/** Stato collegamento fattura di un arrivo merce (prompt §3): mai in stampa. */
export type GoodsReceiptLinkStatus = 'suspended' | 'linked' | 'cancelled';

export type DocumentListRow = Document & {
  lineCount: number;
  locationName: string | null;
  linkStatus: GoodsReceiptLinkStatus | null;
  linkedPurchaseInvoice: LinkedPurchaseInvoiceInfo | null;
};

export type DocumentDetail = DocumentWithLines & {
  blockAfterConfirm: boolean;
  salesOrder: { id: string; orderNumber: string } | null;
  linkedSupplierOrder: { id: string; reference: string } | null;
  linkedSupplierOrderLines: readonly LinkedSupplierOrderLineContext[];
  linkStatus: GoodsReceiptLinkStatus | null;
  linkedPurchaseInvoice: LinkedPurchaseInvoiceInfo | null;
  linkedGoodsReceipts: readonly LinkedGoodsReceiptInfo[];
};

export type LinkedSupplierOrderLineContext = {
  readonly id: string;
  readonly variantId: string;
  readonly sku: string;
  readonly orderedQuantity: number;
  readonly receivedQuantity: number;
};

/** Stati in cui il documento può essere modificato (§4), salvo blockAfterConfirm. */
const CONFIRMED_EDITABLE_STATUSES: readonly DocumentStatus[] = [
  DocumentStatus.confirmed,
  DocumentStatus.printed,
  DocumentStatus.sent,
] as const;

/**
 * Default neutri per le colonne IVA delle righe temporanee usate solo nella
 * riconciliazione stock (il flusso IVA completo vive nell'Arrivo merce).
 */
const EMPTY_LINE_VAT_FIELDS = {
  vatCodeId: null,
  vatSnapshot: null,
  enteredUnitCost: null,
  costEntryModeSnapshot: null,
  unitCostNet: null,
  unitCostGross: null,
  unitVatAmount: null,
  lineVatTotalMinor: 0,
  lineGrossTotalMinor: 0,
  supplierPayableLineMinor: 0,
  reverseChargeVatMinor: 0,
  nonDeductibleVatMinor: 0,
} as const;

interface ComputedLine {
  lineNumber: number;
  variantId: string | null;
  sku: string | null;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  discountPercent: number;
  vatRatePercent: number | null;
  lineTotalMinor: number;
  loadsStock: boolean;
  supplierOrderLineId: string | null;
  lotCode: string | null;
  lotExpiryDate: Date | null;
  serialNumbers: string[];
}

interface DocumentTotals {
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
}

/**
 * Dominio documentale (§2 piano funzionale). Step 2: alla conferma di arrivo
 * merce / DDT fornitore / fattura accompagnatoria genera carichi e movimenti.
 */
@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: DocumentSettingsService,
    private readonly channelSync: ChannelSyncFacade,
  ) {}

  async list(
    tenantId: string,
    query: ListDocumentsQueryDto,
  ): Promise<Paginated<DocumentListRow>> {
    const where: Prisma.DocumentWhereInput = {
      tenantId,
      ...(query.types?.length
        ? { type: { in: query.types } }
        : query.type
          ? { type: query.type }
          : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            documentDate: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
      ...(query.search ? { OR: this.buildSearchClauses(query.search) } : {}),
      ...(query.supplierOrderId ? { supplierOrderId: query.supplierOrderId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.causal
        ? { causalText: { contains: query.causal, mode: 'insensitive' } }
        : {}),
      ...this.buildLinkStatusClause(query.linkStatus),
      ...(query.accountant ? { type: { in: [...ACCOUNTANT_DOCUMENT_TYPES] } } : {}),
      ...(query.pendingInvoice
        ? {
            type: DocumentType.sales_ddt,
            status: {
              in: [DocumentStatus.confirmed, DocumentStatus.printed, DocumentStatus.sent],
            },
            derivedDocuments: {
              none: {
                type: DocumentType.invoice_draft,
                status: { not: DocumentStatus.cancelled },
              },
            },
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        include: {
          _count: { select: { lines: true } },
          location: { select: { name: true } },
          purchaseInvoiceLinks: {
            where: { purchaseInvoice: { status: { not: DocumentStatus.cancelled } } },
            include: {
              purchaseInvoice: {
                select: {
                  id: true,
                  reference: true,
                  externalDocNumber: true,
                  externalDocDate: true,
                  documentDate: true,
                },
              },
            },
            take: 1,
          },
        },
        orderBy: [{ documentDate: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.document.count({ where }),
    ]);

    const items: DocumentListRow[] = rows.map(
      ({ _count, location, purchaseInvoiceLinks, ...doc }) => ({
        ...doc,
        lineCount: _count.lines,
        locationName: location?.name ?? null,
        ...this.resolveLinkInfo(doc, purchaseInvoiceLinks),
      }),
    );

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** Ricerca libera lista: numero, fornitore/cliente, causale, commento, fattura collegata, totale. */
  private buildSearchClauses(search: string): Prisma.DocumentWhereInput[] {
    const clauses: Prisma.DocumentWhereInput[] = [
      { reference: { contains: search, mode: 'insensitive' } },
      { supplierName: { contains: search, mode: 'insensitive' } },
      { customerName: { contains: search, mode: 'insensitive' } },
      { externalDocNumber: { contains: search, mode: 'insensitive' } },
      { causalText: { contains: search, mode: 'insensitive' } },
      { internalComment: { contains: search, mode: 'insensitive' } },
      {
        purchaseInvoiceLinks: {
          some: {
            purchaseInvoice: {
              status: { not: DocumentStatus.cancelled },
              OR: [
                { externalDocNumber: { contains: search, mode: 'insensitive' } },
                { reference: { contains: search, mode: 'insensitive' } },
              ],
            },
          },
        },
      },
    ];
    // Numero documento puro (es. "12") e totale (es. "1.234,50" o "1234.50").
    const numeric = search.trim().replace(/\s/g, '');
    if (/^\d+$/.test(numeric)) {
      clauses.push({ number: Number(numeric) });
    }
    if (/^\d+([.,]\d{1,2})?$/.test(numeric)) {
      const normalized = numeric.replace(',', '.');
      const totalMinor = Math.round(Number(normalized) * 100);
      if (Number.isFinite(totalMinor)) {
        clauses.push({ totalMinor });
      }
    }
    return clauses;
  }

  /** Filtro stato collegamento fattura (Arrivi merce, prompt §4). */
  private buildLinkStatusClause(
    linkStatus?: 'suspended' | 'linked' | 'cancelled',
  ): Prisma.DocumentWhereInput {
    if (!linkStatus) {
      return {};
    }
    if (linkStatus === 'cancelled') {
      return { status: DocumentStatus.cancelled };
    }
    if (linkStatus === 'linked') {
      return {
        status: { not: DocumentStatus.cancelled },
        purchaseInvoiceLinks: {
          some: { purchaseInvoice: { status: { not: DocumentStatus.cancelled } } },
        },
      };
    }
    return {
      status: { not: DocumentStatus.cancelled },
      purchaseInvoiceLinks: {
        none: { purchaseInvoice: { status: { not: DocumentStatus.cancelled } } },
      },
    };
  }

  /** Stato collegamento derivato (mai persistito: nessun drift possibile). */
  private resolveLinkInfo(
    doc: Pick<Document, 'type' | 'status'>,
    links: readonly {
      purchaseInvoice: Omit<LinkedPurchaseInvoiceInfo, 'totalsCheckPending'>;
      totalsCheckPending: boolean;
    }[],
  ): {
    linkStatus: GoodsReceiptLinkStatus | null;
    linkedPurchaseInvoice: LinkedPurchaseInvoiceInfo | null;
  } {
    if (!(INVOICE_LINKABLE_RECEIPT_TYPES as readonly string[]).includes(doc.type)) {
      return { linkStatus: null, linkedPurchaseInvoice: null };
    }
    if (doc.status === DocumentStatus.cancelled) {
      return { linkStatus: 'cancelled', linkedPurchaseInvoice: null };
    }
    const link = links[0];
    if (link) {
      return {
        linkStatus: 'linked',
        linkedPurchaseInvoice: {
          ...link.purchaseInvoice,
          totalsCheckPending: link.totalsCheckPending,
        },
      };
    }
    return { linkStatus: 'suspended', linkedPurchaseInvoice: null };
  }

  async getById(tenantId: string, id: string): Promise<DocumentDetail> {
    const doc = await this.prisma.document.findFirst({
      where: { id, tenantId },
      include: {
        lines: { orderBy: { lineNumber: 'asc' } },
        salesOrder: { select: { id: true, orderNumber: true } },
        supplierOrder: {
          select: {
            id: true,
            reference: true,
            lines: {
              select: {
                id: true,
                variantId: true,
                sku: true,
                orderedQuantity: true,
                receivedQuantity: true,
              },
            },
          },
        },
        // Arrivo merce → fattura registrata che lo include (stato collegamento).
        purchaseInvoiceLinks: {
          where: { purchaseInvoice: { status: { not: DocumentStatus.cancelled } } },
          include: {
            purchaseInvoice: {
              select: {
                id: true,
                reference: true,
                externalDocNumber: true,
                externalDocDate: true,
                documentDate: true,
              },
            },
          },
          take: 1,
        },
        // Registrazione fattura → arrivi merce inclusi (form di modifica).
        goodsReceiptLinks: {
          include: {
            goodsReceipt: {
              select: {
                id: true,
                number: true,
                reference: true,
                documentDate: true,
                causalText: true,
                subtotalMinor: true,
                taxMinor: true,
                totalMinor: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!doc) {
      throw new NotFoundException('Documento non trovato');
    }
    const setting = await this.settings.getResolved(tenantId, doc.type);
    const { salesOrder, supplierOrder, purchaseInvoiceLinks, goodsReceiptLinks, ...rest } = doc;
    const linkedSupplierOrderLines =
      supplierOrder?.lines.map((line) => ({
        id: line.id,
        variantId: line.variantId,
        sku: line.sku,
        orderedQuantity: line.orderedQuantity,
        receivedQuantity: line.receivedQuantity,
      })) ?? [];
    return {
      ...rest,
      blockAfterConfirm: setting.blockAfterConfirm,
      salesOrder: salesOrder ?? null,
      linkedSupplierOrder: supplierOrder
        ? { id: supplierOrder.id, reference: supplierOrder.reference }
        : null,
      linkedSupplierOrderLines,
      ...this.resolveLinkInfo(doc, purchaseInvoiceLinks),
      linkedGoodsReceipts: goodsReceiptLinks.map((link) => link.goodsReceipt),
    };
  }

  /** Differenze costo vs ultimo prezzo fornitore (§13) per dialog pre-conferma. */
  async listSupplierPriceDiffs(tenantId: string, documentId: string) {
    const doc = await this.getById(tenantId, documentId);
    if (!documentTypeLoadsStockOnConfirm(doc.type)) {
      return { items: [] as const, policy: 'never' as const };
    }
    const featureSettings = await this.prisma.tenantFeatureSettings.findUnique({
      where: { tenantId },
    });
    const policy = featureSettings?.updateSupplierPriceOnLoad ?? 'ask';
    const items = await this.prisma.$transaction((tx) =>
      findSupplierPriceDiffs(tx, tenantId, doc.supplierId, doc.lines),
    );
    return { items, policy };
  }

  /** Anteprima prossimo numero interno (non incrementa il numeratore). */
  async previewNextReference(
    tenantId: string,
    type: DocumentType,
    series?: string,
    year?: number,
  ): Promise<{ reference: string; previewNumber: number; series: string; year: number }> {
    const setting = await this.settings.getResolved(tenantId, type);
    if (!setting.enabled) {
      throw new UnprocessableEntityException(
        `Il tipo documento "${setting.printTitle}" non è abilitato per questa azienda.`,
      );
    }
    const resolvedSeries = (series ?? setting.defaultSeries).trim() || 'A';
    const resolvedYear = year ?? new Date().getFullYear();
    const sequence = await this.prisma.documentSequence.findUnique({
      where: {
        tenantId_type_series_year: {
          tenantId,
          type,
          series: resolvedSeries,
          year: resolvedYear,
        },
      },
    });
    const previewNumber = (sequence?.lastNumber ?? 0) + 1;
    const prefix = (setting.numberPrefix ?? 'DOC').trim() || 'DOC';
    return {
      reference: this.formatReference(prefix, resolvedYear, previewNumber),
      previewNumber,
      series: resolvedSeries,
      year: resolvedYear,
    };
  }

  async listRevisions(tenantId: string, documentId: string) {
    await this.getById(tenantId, documentId);
    return this.prisma.documentRevision.findMany({
      where: { tenantId, documentId },
      orderBy: { revisionNumber: 'desc' },
    });
  }

  async create(
    tenantId: string,
    dto: CreateDocumentDto,
    user?: UserProfileDto,
  ): Promise<DocumentWithLines> {
    if (isInternalOnlyDocumentType(dto.type)) {
      throw new UnprocessableEntityException(
        'Questo tipo documento è generato automaticamente dal sistema e non può essere creato manualmente.',
      );
    }
    if (isFlowOnlyDocumentType(dto.type)) {
      throw new UnprocessableEntityException(
        'Vendite e resi negozio si registrano dalla cassa (Vendita negozio), non dal registro documenti.',
      );
    }
    const setting = await this.settings.getResolved(tenantId, dto.type);
    if (!setting.enabled) {
      throw new UnprocessableEntityException(
        `Il tipo documento "${setting.printTitle}" non è abilitato per questa azienda.`,
      );
    }

    await this.assertCounterparties(tenantId, dto);
    if (dto.supplierOrderId) {
      await this.assertSupplierOrderReceivable(tenantId, dto.supplierOrderId);
    }

    const documentDate = new Date(dto.documentDate);
    const lines = this.computeLines(dto.lines ?? [], dto.type);
    const totals = this.computeTotals(
      lines,
      setting.pricesIncludeVat,
      dto.documentDiscountPercent ?? 0,
    );

    return this.prisma.document.create({
      data: {
        tenantId,
        type: dto.type,
        status: DocumentStatus.draft,
        series: (dto.series ?? setting.defaultSeries).trim() || 'A',
        year: documentDate.getFullYear(),
        documentDate,
        printTitle: setting.printTitle,
        notes: dto.notes ?? setting.defaultNotes,
        internalComment: dto.internalComment ?? null,
        supplierId: dto.supplierId ?? null,
        supplierName: await this.snapshotSupplierName(tenantId, dto.supplierId),
        customerId: dto.customerId ?? null,
        customerName: await this.snapshotCustomerName(tenantId, dto.customerId),
        locationId: dto.locationId ?? null,
        targetLocationId: dto.targetLocationId ?? null,
        adjustmentDirection: dto.adjustmentDirection ?? null,
        externalDocNumber: dto.externalDocNumber ?? null,
        externalDocDate: dto.externalDocDate ? new Date(dto.externalDocDate) : null,
        sourceDocumentId: dto.sourceDocumentId ?? null,
        supplierOrderId: dto.supplierOrderId ?? null,
        billingCause: dto.billingCause?.trim() || null,
        externalRef: dto.externalRef?.trim() || null,
        currency: dto.currency ?? 'EUR',
        pricesIncludeVat: setting.pricesIncludeVat,
        documentDiscountPercent: dto.documentDiscountPercent ?? 0,
        ...totals,
        createdById: user?.id ?? null,
        createdByName: user?.displayName ?? 'API',
        lines: { create: lines.map((line) => ({ ...line, tenantId })) },
      },
      include: { lines: { orderBy: { lineNumber: 'asc' } } },
    });
  }

  /** Crea bozza arrivo merce collegata a ordine fornitore (§10.1). */
  async createGoodsReceiptFromSupplierOrder(
    tenantId: string,
    supplierOrderId: string,
    dto: CreateGoodsReceiptFromSupplierOrderDto,
    user?: UserProfileDto,
  ): Promise<DocumentWithLines> {
    const order = await this.prisma.supplierOrder.findFirst({
      where: { id: supplierOrderId, tenantId },
      include: { lines: true },
    });
    if (!order) {
      throw new NotFoundException('Ordine fornitore non trovato');
    }
    await this.assertSupplierOrderReceivable(tenantId, supplierOrderId, order.status);

    if (!order.destinationLocationId) {
      throw new UnprocessableEntityException(
        'Impossibile registrare l\'arrivo: l\'ordine non ha una location di destinazione.',
      );
    }

    const receivableLines = order.lines.filter(
      (line) => line.orderedQuantity - line.receivedQuantity > 0,
    );
    if (receivableLines.length === 0) {
      throw new UnprocessableEntityException(
        'Nessuna quantità residua da ricevere su questo ordine fornitore.',
      );
    }

    const type = dto.type ?? DocumentType.goods_receipt;
    const createDto: CreateDocumentDto = {
      type,
      documentDate: dto.documentDate ?? new Date().toISOString(),
      supplierId: order.supplierId,
      locationId: order.destinationLocationId,
      supplierOrderId: order.id,
      currency: order.currency,
      internalComment: `Da ordine fornitore ${order.reference}`,
      lines: receivableLines.map((line) => ({
        variantId: line.variantId,
        sku: line.sku,
        description: line.sku,
        quantity: line.orderedQuantity - line.receivedQuantity,
        unitPriceMinor: line.unitCostMinor,
        loadsStock: true,
        supplierOrderLineId: line.id,
      })),
    };

    return this.create(tenantId, createDto, user);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateDocumentDto,
    user?: UserProfileDto,
  ): Promise<DocumentDetail> {
    const doc = await this.getById(tenantId, id);
    if (isFlowOnlyDocumentType(doc.type)) {
      throw new ConflictException(
        'Vendite e resi negozio non sono modificabili: registra un reso o una nuova vendita dalla cassa.',
      );
    }
    const isDraft = doc.status === DocumentStatus.draft;
    const isConfirmedEdit = CONFIRMED_EDITABLE_STATUSES.includes(doc.status);
    const reconcilesLoadStock =
      (isDraft || isConfirmedEdit) && documentTypeLoadsStockOnConfirm(doc.type);

    if (!isDraft && !isConfirmedEdit) {
      throw new ConflictException('Questo documento non può essere modificato.');
    }
    if (isConfirmedEdit && doc.blockAfterConfirm) {
      throw new ConflictException(
        'Modifica bloccata dalle impostazioni per questo tipo di documento.',
      );
    }

    await this.assertCounterparties(tenantId, {
      supplierId: dto.supplierId ?? undefined,
      customerId: dto.customerId ?? undefined,
      locationId: dto.locationId ?? undefined,
      targetLocationId: dto.targetLocationId ?? undefined,
    });

    const setting = await this.settings.getResolved(tenantId, doc.type);
    const documentDate = dto.documentDate ? new Date(dto.documentDate) : doc.documentDate;

    const lines = dto.lines !== undefined ? this.computeLines(dto.lines, doc.type) : null;

    if (lines) {
      const hasPerLineMovements =
        (await this.prisma.stockMovement.count({
          where: { tenantId, sourceDocumentId: id, sourceLineId: { not: null } },
        })) > 0;
      if (hasPerLineMovements) {
        throw new ConflictException(
          'Questo documento usa movimenti per riga: aggiornalo con «Salva documento» (arrivo merce), non con PATCH.',
        );
      }
    }

    const newLocationId = dto.locationId !== undefined ? dto.locationId : doc.locationId;
    const newTargetLocationId =
      dto.targetLocationId !== undefined ? dto.targetLocationId : doc.targetLocationId;
    const newAdjustmentDirection =
      dto.adjustmentDirection !== undefined ? dto.adjustmentDirection : doc.adjustmentDirection;
    const newInternalComment =
      dto.internalComment !== undefined ? dto.internalComment : doc.internalComment;

    const mergedLinesForValidation = (
      base: Document & { lines: DocumentLine[] },
    ): Document & { lines: DocumentLine[] } => ({
      ...base,
      locationId: newLocationId,
      targetLocationId: newTargetLocationId,
      adjustmentDirection: newAdjustmentDirection,
      internalComment: newInternalComment,
      customerId: dto.customerId !== undefined ? dto.customerId : base.customerId,
      supplierId: dto.supplierId !== undefined ? dto.supplierId : base.supplierId,
      lines:
        lines?.map((line, index) => ({
          ...line,
          id: `new-${index}`,
          documentId: doc.id,
          tenantId,
          linkedGoodsReceiptId: null,
          ...EMPTY_LINE_VAT_FIELDS,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        })) ?? base.lines,
    });

    if (reconcilesLoadStock) {
      const mergedForValidation = mergedLinesForValidation(doc);
      // In bozza consentiamo righe con Mag. attivo ma senza variantId (compilazione progressiva).
      if (isConfirmedEdit) {
        this.assertStockLoadDocument(mergedForValidation);
      }
      if (!newLocationId) {
        throw new UnprocessableEntityException(
          'Location di destinazione obbligatoria per documenti con carico magazzino.',
        );
      }
    }

    if (isConfirmedEdit && doc.type === DocumentType.sales_ddt) {
      this.assertStockUnloadDocument(mergedLinesForValidation(doc));
      if (!newLocationId) {
        throw new UnprocessableEntityException(
          'Location di origine obbligatoria per documenti con scarico magazzino.',
        );
      }
    }

    if (isConfirmedEdit && doc.type === DocumentType.manual_unload) {
      this.assertStockManualUnloadDocument(mergedLinesForValidation(doc));
    }

    if (isConfirmedEdit && documentTypeAdjustsStockOnConfirm(doc.type)) {
      this.assertStockAdjustmentDocument(mergedLinesForValidation(doc));
    }

    if (isConfirmedEdit && documentTypeTransfersStockOnConfirm(doc.type)) {
      this.assertStockTransferDocument(mergedLinesForValidation(doc));
    }

    const data: Prisma.DocumentUncheckedUpdateInput = {
      series: dto.series !== undefined ? dto.series.trim() || 'A' : doc.series,
      documentDate,
      year: documentDate.getFullYear(),
      supplierId: dto.supplierId !== undefined ? dto.supplierId : doc.supplierId,
      supplierName:
        dto.supplierId !== undefined
          ? await this.snapshotSupplierName(tenantId, dto.supplierId ?? undefined)
          : doc.supplierName,
      customerId: dto.customerId !== undefined ? dto.customerId : doc.customerId,
      customerName:
        dto.customerId !== undefined
          ? await this.snapshotCustomerName(tenantId, dto.customerId ?? undefined)
          : doc.customerName,
      locationId: dto.locationId !== undefined ? dto.locationId : doc.locationId,
      targetLocationId:
        dto.targetLocationId !== undefined ? dto.targetLocationId : doc.targetLocationId,
      adjustmentDirection:
        dto.adjustmentDirection !== undefined ? dto.adjustmentDirection : doc.adjustmentDirection,
      currency: dto.currency ?? doc.currency,
      notes: dto.notes !== undefined ? dto.notes : doc.notes,
      internalComment:
        dto.internalComment !== undefined ? dto.internalComment : doc.internalComment,
    };

    if (dto.billingCause !== undefined) {
      data.billingCause = dto.billingCause?.trim() || null;
    }
    if (dto.externalRef !== undefined) {
      data.externalRef = dto.externalRef?.trim() || null;
    }
    if (dto.documentDiscountPercent !== undefined) {
      data.documentDiscountPercent = dto.documentDiscountPercent;
    }

    if (dto.externalDocNumber !== undefined) {
      data.externalDocNumber = dto.externalDocNumber;
    }
    if (dto.externalDocDate !== undefined) {
      data.externalDocDate = dto.externalDocDate ? new Date(dto.externalDocDate) : null;
    }

    if (dto.supplierOrderId !== undefined) {
      if (!isDraft) {
        throw new ConflictException(
          'Impossibile collegare un ordine fornitore a un documento già confermato.',
        );
      }
      if (dto.supplierOrderId === null) {
        throw new UnprocessableEntityException(
          'La rimozione del collegamento ordine fornitore non è supportata.',
        );
      }
      if (doc.supplierOrderId && doc.supplierOrderId !== dto.supplierOrderId) {
        throw new ConflictException(
          'Questo documento è già collegato a un altro ordine fornitore.',
        );
      }
      await this.assertSupplierOrderReceivable(tenantId, dto.supplierOrderId);
      const order = await this.prisma.supplierOrder.findFirst({
        where: { id: dto.supplierOrderId, tenantId },
        select: { supplierId: true },
      });
      if (!order) {
        throw new NotFoundException('Ordine fornitore non trovato');
      }
      const effectiveSupplierId =
        dto.supplierId !== undefined ? dto.supplierId : doc.supplierId;
      if (effectiveSupplierId && order.supplierId !== effectiveSupplierId) {
        throw new UnprocessableEntityException(
          'L\'ordine fornitore selezionato appartiene a un altro fornitore.',
        );
      }
      data.supplierOrderId = dto.supplierOrderId;
    }

    if (lines) {
      const totals = this.computeTotals(
        lines,
        setting.pricesIncludeVat,
        dto.documentDiscountPercent ?? doc.documentDiscountPercent,
      );
      data.subtotalMinor = totals.subtotalMinor;
      data.taxMinor = totals.taxMinor;
      data.totalMinor = totals.totalMinor;
      data.lines = { create: lines.map((line) => ({ ...line, tenantId })) };
    } else if (dto.documentDiscountPercent !== undefined) {
      const totals = this.computeTotals(
        this.computeLines(
          doc.lines.map((line) => ({
            variantId: line.variantId ?? undefined,
            sku: line.sku ?? undefined,
            description: line.description,
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
            discountPercent: line.discountPercent,
            vatRatePercent: line.vatRatePercent ?? undefined,
            loadsStock: line.loadsStock,
            supplierOrderLineId: line.supplierOrderLineId ?? undefined,
            lotCode: line.lotCode ?? undefined,
            lotExpiryDate: line.lotExpiryDate?.toISOString(),
            serialNumbers: (line.serialNumbers as string[]) ?? [],
          })),
          doc.type,
        ),
        setting.pricesIncludeVat,
        dto.documentDiscountPercent,
      );
      data.subtotalMinor = totals.subtotalMinor;
      data.taxMinor = totals.taxMinor;
      data.totalMinor = totals.totalMinor;
    }

    const actor = {
      createdById: user?.id ?? null,
      createdByName: user?.displayName ?? 'API',
    };
    const syncTargets: Array<{ variantId: string; locationId: string }> = [];

    const updated = await this.prisma.$transaction(async (tx) => {
      let stockDeltas: readonly { sku: string; delta: number }[] = [];
      const oldLineIds = doc.lines.map((line) => line.id);

      if (isConfirmedEdit && lines && oldLineIds.length > 0) {
        if (documentTypeUnloadsStockOnConfirm(doc.type)) {
          await restoreConsumedSerialsForDocument(tx, tenantId, oldLineIds);
        }
        if (
          documentTypeTransfersStockOnConfirm(doc.type) &&
          doc.locationId &&
          doc.targetLocationId
        ) {
          await reverseTransferInventorySerialsForDocument(
            tx,
            tenantId,
            doc.locationId,
            doc.targetLocationId,
            oldLineIds,
          );
        }
        if (documentTypeAdjustsStockOnConfirm(doc.type) && doc.adjustmentDirection) {
          if (doc.adjustmentDirection === AdjustmentDirection.decrease) {
            await restoreConsumedSerialsForDocument(tx, tenantId, oldLineIds);
          } else {
            await reverseInventorySerialsForDocument(tx, tenantId, oldLineIds);
          }
        }
      }

      // Documenti con movimenti per-riga (nuovo flusso Arrivo merce): il sync
      // avviene DOPO il salvataggio righe, sui loro id definitivi.
      const hasLineMovements =
        reconcilesLoadStock &&
        (await tx.stockMovement.count({
          where: { tenantId, sourceDocumentId: id, sourceLineId: { not: null } },
        })) > 0;

      if (reconcilesLoadStock && doc.locationId && !hasLineMovements) {
        const newLinesComputed =
          lines ??
          doc.lines.map((line) => ({
            lineNumber: line.lineNumber,
            variantId: line.variantId,
            sku: line.sku,
            description: line.description,
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
            discountPercent: line.discountPercent,
            vatRatePercent: line.vatRatePercent,
            lineTotalMinor: line.lineTotalMinor,
            loadsStock: line.loadsStock,
            supplierOrderLineId: line.supplierOrderLineId ?? null,
            lotCode: line.lotCode ?? null,
            lotExpiryDate: line.lotExpiryDate ?? null,
            serialNumbers: line.serialNumbers,
          }));
        const reconcile = await reconcileDocumentStockLoad(tx, {
          tenantId,
          documentId: id,
          reference: doc.reference,
          oldLocationId: doc.locationId,
          newLocationId: newLocationId!,
          oldLines: doc.lines,
          newLines: newLinesComputed.map((line, index) => ({
            id: `tmp-${index}`,
            documentId: id,
            tenantId,
            lineNumber: line.lineNumber,
            variantId: line.variantId,
            sku: line.sku,
            description: line.description,
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
            discountPercent: line.discountPercent,
            vatRatePercent: line.vatRatePercent,
            lineTotalMinor: line.lineTotalMinor,
            loadsStock: line.loadsStock,
            supplierOrderLineId: line.supplierOrderLineId ?? null,
            lotCode: line.lotCode ?? null,
            lotExpiryDate: line.lotExpiryDate ?? null,
            serialNumbers: line.serialNumbers,
            linkedGoodsReceiptId: null,
            ...EMPTY_LINE_VAT_FIELDS,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
          })),
          actor,
        });
        stockDeltas = reconcile.deltas;
        const variantIds = new Set([
          ...doc.lines.map((l) => l.variantId).filter(Boolean),
          ...newLinesComputed.map((l) => l.variantId).filter(Boolean),
        ] as string[]);
        for (const variantId of variantIds) {
          syncTargets.push({ variantId, locationId: newLocationId! });
          if (doc.locationId !== newLocationId) {
            syncTargets.push({ variantId, locationId: doc.locationId });
          }
        }
      }

      // Il DDT collegato a Vendita online non ha movimenti propri (fase 2 §9):
      // nessuna riconciliazione scarico in modifica.
      if (
        isConfirmedEdit &&
        doc.type === DocumentType.sales_ddt &&
        !doc.onlineSaleId &&
        doc.locationId
      ) {
        const newLinesComputed =
          lines ??
          doc.lines.map((line) => ({
            lineNumber: line.lineNumber,
            variantId: line.variantId,
            sku: line.sku,
            description: line.description,
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
            discountPercent: line.discountPercent,
            vatRatePercent: line.vatRatePercent,
            lineTotalMinor: line.lineTotalMinor,
            loadsStock: line.loadsStock,
            supplierOrderLineId: line.supplierOrderLineId ?? null,
            lotCode: line.lotCode ?? null,
            lotExpiryDate: line.lotExpiryDate ?? null,
            serialNumbers: line.serialNumbers,
          }));
        const reconcile = await reconcileDocumentStockUnload(tx, {
          tenantId,
          documentId: id,
          reference: doc.reference,
          oldLocationId: doc.locationId,
          newLocationId: newLocationId!,
          oldLines: doc.lines,
          newLines: newLinesComputed.map((line, index) => ({
            id: `tmp-${index}`,
            documentId: id,
            tenantId,
            lineNumber: line.lineNumber,
            variantId: line.variantId,
            sku: line.sku,
            description: line.description,
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
            discountPercent: line.discountPercent,
            vatRatePercent: line.vatRatePercent,
            lineTotalMinor: line.lineTotalMinor,
            loadsStock: line.loadsStock,
            supplierOrderLineId: line.supplierOrderLineId ?? null,
            lotCode: line.lotCode ?? null,
            lotExpiryDate: line.lotExpiryDate ?? null,
            serialNumbers: line.serialNumbers,
            linkedGoodsReceiptId: null,
            ...EMPTY_LINE_VAT_FIELDS,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
          })),
          actor,
        });
        stockDeltas = reconcile.deltas;
        const variantIds = new Set([
          ...doc.lines.map((l) => l.variantId).filter(Boolean),
          ...newLinesComputed.map((l) => l.variantId).filter(Boolean),
        ] as string[]);
        for (const variantId of variantIds) {
          syncTargets.push({ variantId, locationId: newLocationId! });
          if (doc.locationId !== newLocationId) {
            syncTargets.push({ variantId, locationId: doc.locationId });
          }
        }
      }

      if (isConfirmedEdit && doc.type === DocumentType.manual_unload && doc.locationId) {
        const newLinesComputed =
          lines ??
          doc.lines.map((line) => ({
            lineNumber: line.lineNumber,
            variantId: line.variantId,
            sku: line.sku,
            description: line.description,
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
            discountPercent: line.discountPercent,
            vatRatePercent: line.vatRatePercent,
            lineTotalMinor: line.lineTotalMinor,
            loadsStock: line.loadsStock,
            supplierOrderLineId: line.supplierOrderLineId ?? null,
            lotCode: line.lotCode ?? null,
            lotExpiryDate: line.lotExpiryDate ?? null,
            serialNumbers: line.serialNumbers,
          }));
        const reconcile = await reconcileDocumentStockManualUnload(tx, {
          tenantId,
          documentId: id,
          reference: doc.reference,
          oldLocationId: doc.locationId,
          newLocationId: newLocationId!,
          oldLines: doc.lines,
          newLines: newLinesComputed.map((line, index) => ({
            id: `tmp-${index}`,
            documentId: id,
            tenantId,
            lineNumber: line.lineNumber,
            variantId: line.variantId,
            sku: line.sku,
            description: line.description,
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
            discountPercent: line.discountPercent,
            vatRatePercent: line.vatRatePercent,
            lineTotalMinor: line.lineTotalMinor,
            loadsStock: line.loadsStock,
            supplierOrderLineId: line.supplierOrderLineId ?? null,
            lotCode: line.lotCode ?? null,
            lotExpiryDate: line.lotExpiryDate ?? null,
            serialNumbers: line.serialNumbers,
            linkedGoodsReceiptId: null,
            ...EMPTY_LINE_VAT_FIELDS,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
          })),
          actor,
        });
        stockDeltas = reconcile.deltas;
        const variantIds = new Set([
          ...doc.lines.map((l) => l.variantId).filter(Boolean),
          ...newLinesComputed.map((l) => l.variantId).filter(Boolean),
        ] as string[]);
        for (const variantId of variantIds) {
          syncTargets.push({ variantId, locationId: newLocationId! });
          if (doc.locationId !== newLocationId) {
            syncTargets.push({ variantId, locationId: doc.locationId });
          }
        }
      }

      if (
        isConfirmedEdit &&
        documentTypeTransfersStockOnConfirm(doc.type) &&
        doc.locationId &&
        doc.targetLocationId
      ) {
        const newLinesComputed =
          lines ??
          doc.lines.map((line) => ({
            lineNumber: line.lineNumber,
            variantId: line.variantId,
            sku: line.sku,
            description: line.description,
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
            discountPercent: line.discountPercent,
            vatRatePercent: line.vatRatePercent,
            lineTotalMinor: line.lineTotalMinor,
            loadsStock: line.loadsStock,
            supplierOrderLineId: line.supplierOrderLineId ?? null,
            lotCode: line.lotCode ?? null,
            lotExpiryDate: line.lotExpiryDate ?? null,
            serialNumbers: line.serialNumbers,
          }));
        const reconcile = await reconcileDocumentStockTransfer(tx, {
          tenantId,
          documentId: id,
          reference: doc.reference,
          oldLocations: {
            originLocationId: doc.locationId,
            targetLocationId: doc.targetLocationId,
          },
          newLocations: {
            originLocationId: newLocationId!,
            targetLocationId: newTargetLocationId!,
          },
          oldLines: doc.lines,
          newLines: newLinesComputed.map((line, index) => ({
            id: `tmp-${index}`,
            documentId: id,
            tenantId,
            lineNumber: line.lineNumber,
            variantId: line.variantId,
            sku: line.sku,
            description: line.description,
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
            discountPercent: line.discountPercent,
            vatRatePercent: line.vatRatePercent,
            lineTotalMinor: line.lineTotalMinor,
            loadsStock: line.loadsStock,
            supplierOrderLineId: line.supplierOrderLineId ?? null,
            lotCode: line.lotCode ?? null,
            lotExpiryDate: line.lotExpiryDate ?? null,
            serialNumbers: line.serialNumbers,
            linkedGoodsReceiptId: null,
            ...EMPTY_LINE_VAT_FIELDS,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
          })),
          actor,
        });
        stockDeltas = reconcile.deltas;
        const variantIds = new Set([
          ...doc.lines.map((l) => l.variantId).filter(Boolean),
          ...newLinesComputed.map((l) => l.variantId).filter(Boolean),
        ] as string[]);
        for (const variantId of variantIds) {
          syncTargets.push({ variantId, locationId: newLocationId! });
          syncTargets.push({ variantId, locationId: newTargetLocationId! });
          if (doc.locationId !== newLocationId) {
            syncTargets.push({ variantId, locationId: doc.locationId });
          }
          if (doc.targetLocationId !== newTargetLocationId) {
            syncTargets.push({ variantId, locationId: doc.targetLocationId });
          }
        }
      }

      if (
        isConfirmedEdit &&
        documentTypeAdjustsStockOnConfirm(doc.type) &&
        doc.locationId &&
        doc.adjustmentDirection
      ) {
        const newLinesComputed =
          lines ??
          doc.lines.map((line) => ({
            lineNumber: line.lineNumber,
            variantId: line.variantId,
            sku: line.sku,
            description: line.description,
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
            discountPercent: line.discountPercent,
            vatRatePercent: line.vatRatePercent,
            lineTotalMinor: line.lineTotalMinor,
            loadsStock: line.loadsStock,
            supplierOrderLineId: line.supplierOrderLineId ?? null,
            lotCode: line.lotCode ?? null,
            lotExpiryDate: line.lotExpiryDate ?? null,
            serialNumbers: line.serialNumbers,
          }));
        const reconcile = await reconcileDocumentStockAdjustment(tx, {
          tenantId,
          documentId: id,
          reference: doc.reference,
          reason: newInternalComment?.trim() || 'Rettifica inventario',
          oldLocationId: doc.locationId,
          newLocationId: newLocationId!,
          oldDirection: doc.adjustmentDirection,
          newDirection: newAdjustmentDirection!,
          oldLines: doc.lines,
          newLines: newLinesComputed.map((line, index) => ({
            id: `tmp-${index}`,
            documentId: id,
            tenantId,
            lineNumber: line.lineNumber,
            variantId: line.variantId,
            sku: line.sku,
            description: line.description,
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
            discountPercent: line.discountPercent,
            vatRatePercent: line.vatRatePercent,
            lineTotalMinor: line.lineTotalMinor,
            loadsStock: line.loadsStock,
            supplierOrderLineId: line.supplierOrderLineId ?? null,
            lotCode: line.lotCode ?? null,
            lotExpiryDate: line.lotExpiryDate ?? null,
            serialNumbers: line.serialNumbers,
            linkedGoodsReceiptId: null,
            ...EMPTY_LINE_VAT_FIELDS,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
          })),
          actor,
        });
        stockDeltas = reconcile.deltas;
        const variantIds = new Set([
          ...doc.lines.map((l) => l.variantId).filter(Boolean),
          ...newLinesComputed.map((l) => l.variantId).filter(Boolean),
        ] as string[]);
        for (const variantId of variantIds) {
          syncTargets.push({ variantId, locationId: newLocationId! });
          if (doc.locationId !== newLocationId) {
            syncTargets.push({ variantId, locationId: doc.locationId });
          }
        }
      }

      if (reconcilesLoadStock && doc.supplierOrderId) {
        const newLinesForPo =
          lines?.map((line, index) => ({
            id: `new-${index}`,
            documentId: id,
            tenantId,
            lineNumber: line.lineNumber,
            variantId: line.variantId,
            sku: line.sku,
            description: line.description,
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
            discountPercent: line.discountPercent,
            vatRatePercent: line.vatRatePercent,
            lineTotalMinor: line.lineTotalMinor,
            loadsStock: line.loadsStock,
            supplierOrderLineId: line.supplierOrderLineId,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
          })) ?? doc.lines;
        await reconcileSupplierOrderReceipt(
          tx,
          doc.supplierOrderId,
          doc.lines,
          newLinesForPo,
          doc.locationId ?? undefined,
          tenantId,
        );
      }

      if (lines) {
        await tx.documentLine.deleteMany({ where: { documentId: id } });
      }

      const saved = await tx.document.update({
        where: { id },
        data,
        include: { lines: { orderBy: { lineNumber: 'asc' } } },
      });

      if (hasLineMovements && saved.locationId) {
        const reason = buildGoodsReceiptMovementReason({
          number: saved.number,
          reference: saved.reference,
          documentDate: saved.documentDate,
          causalText: saved.causalText,
        });
        const sync = await syncGoodsReceiptLineMovements(tx, {
          tenantId,
          documentId: id,
          documentType: saved.type,
          locationId: saved.locationId,
          reason,
          movementDate: saved.documentDate,
          lines: saved.lines,
          actor,
        });
        stockDeltas = sync.deltas;
        syncTargets.push(...sync.syncTargets);
      }

      if (isConfirmedEdit && lines && saved.lines.length > 0) {
        if (documentTypeUnloadsStockOnConfirm(saved.type) && saved.locationId) {
          await assertSerialNumbersForUnloadLines(tx, tenantId, saved.locationId, saved.lines);
          await consumeInventorySerialsFromDocumentLines(
            tx,
            tenantId,
            saved.locationId,
            saved.lines,
          );
        }
        if (
          documentTypeTransfersStockOnConfirm(saved.type) &&
          saved.locationId &&
          saved.targetLocationId
        ) {
          await assertSerialNumbersForTransferLines(tx, tenantId, saved.locationId, saved.lines);
          await transferInventorySerialsFromDocumentLines(
            tx,
            tenantId,
            saved.locationId,
            saved.targetLocationId,
            saved.lines,
          );
        }
        if (
          documentTypeAdjustsStockOnConfirm(saved.type) &&
          saved.locationId &&
          saved.adjustmentDirection
        ) {
          if (saved.adjustmentDirection === AdjustmentDirection.decrease) {
            await assertSerialNumbersForUnloadLines(tx, tenantId, saved.locationId, saved.lines);
            await consumeInventorySerialsFromDocumentLines(
              tx,
              tenantId,
              saved.locationId,
              saved.lines,
            );
          } else {
            await assertSerialNumbersForDocumentLines(tx, tenantId, saved.lines);
            await applyInventorySerialsFromDocumentLines(
              tx,
              tenantId,
              saved.locationId,
              saved.lines,
            );
          }
        }
      }

      if (isConfirmedEdit) {
        const contentChanged =
          lines !== null ||
          dto.notes !== undefined ||
          dto.supplierId !== undefined ||
          dto.locationId !== undefined ||
          dto.targetLocationId !== undefined ||
          dto.adjustmentDirection !== undefined ||
          dto.internalComment !== undefined ||
          dto.documentDate !== undefined;
        const summary = buildRevisionSummary(contentChanged, stockDeltas);
        await this.recordRevision(tx, tenantId, id, summary, actor);
      }

      return saved;
    });

    for (const entry of syncTargets) {
      try {
        await this.channelSync.pushInventoryLevels(tenantId, entry.variantId, [entry.locationId]);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Push inventario canale fallito';
        this.logger.warn(`Push inventario non riuscito (${tenantId}): ${message}`);
      }
    }

    const refreshed = await this.getById(tenantId, updated.id);
    return refreshed;
  }

  /** Conferma: bozza → confermato, assegna numero e (se arrivo merce) carica magazzino. */
  async confirm(
    tenantId: string,
    id: string,
    user?: UserProfileDto,
    options?: {
      readonly applySupplierPriceUpdates?: boolean;
      readonly closeLinkedSupplierOrder?: boolean;
    },
  ): Promise<DocumentWithLines> {
    const actorName = user?.displayName ?? 'API';
    const actorId = user?.id ?? null;

    const syncTargets: Array<{ variantId: string; locationId: string }> = [];

    const confirmed = await this.prisma.$transaction(async (tx) => {
      const doc = await tx.document.findFirst({
        where: { id, tenantId },
        include: { lines: { orderBy: { lineNumber: 'asc' } } },
      });
      if (!doc) {
        throw new NotFoundException('Documento non trovato');
      }
      if (isFlowOnlyDocumentType(doc.type)) {
        // Cassa negozio: creati già confermati con movimenti in transazione.
        throw new ConflictException('Le vendite e i resi negozio sono già registrati alla conclusione.');
      }
      if (doc.status !== DocumentStatus.draft) {
        throw new ConflictException('Solo i documenti in bozza possono essere confermati.');
      }
      if (doc.lines.length === 0) {
        throw new UnprocessableEntityException('Impossibile confermare un documento senza righe.');
      }

      let receiptLines = doc.lines;
      if (doc.supplierOrderId && documentTypeLoadsStockOnConfirm(doc.type)) {
        receiptLines = await enrichReceiptLinesWithSupplierOrderLineIds(
          tx,
          doc.supplierOrderId,
          doc.lines,
        );
      }

      if (documentTypeLoadsStockOnConfirm(doc.type)) {
        this.assertStockLoadDocument({ ...doc, lines: receiptLines });
      }
      if (doc.type === DocumentType.sales_ddt) {
        this.assertStockUnloadDocument(doc);
      }
      if (doc.type === DocumentType.manual_unload) {
        this.assertStockManualUnloadDocument(doc);
      }
      if (documentTypeAdjustsStockOnConfirm(doc.type)) {
        this.assertStockAdjustmentDocument(doc);
      }
      if (documentTypeTransfersStockOnConfirm(doc.type)) {
        this.assertStockTransferDocument(doc);
      }

      if (
        doc.supplierOrderId &&
        documentTypeLoadsStockOnConfirm(doc.type)
      ) {
        await assertSupplierOrderReceiptQuantities(tx, doc.supplierOrderId, receiptLines);
      }

      const featureSettings = await tx.tenantFeatureSettings.findUnique({ where: { tenantId } });
      const pricePolicy = featureSettings?.updateSupplierPriceOnLoad ?? 'ask';
      const shouldApplySupplierPrices =
        pricePolicy === 'always' ||
        (pricePolicy === 'ask' && options?.applySupplierPriceUpdates === true);

      const setting = await this.settings.getResolved(tenantId, doc.type);

      let number = doc.number;
      let reference = doc.reference;
      if (setting.autoNumbering && number == null) {
        number = await this.nextNumber(tx, tenantId, doc.type, doc.series, doc.year);
        reference = this.formatReference(setting.numberPrefix, doc.year, number);
      }

      if (documentTypeLoadsStockOnConfirm(doc.type)) {
        await assertSerialNumbersForDocumentLines(tx, tenantId, receiptLines);
        const stockAlreadyApplied =
          (await tx.stockMovement.count({
            where: { tenantId, externalRef: doc.id, type: StockMovementType.load },
          })) > 0;
        if (!stockAlreadyApplied) {
          const reason = reference
            ? `Arrivo merce ${reference}`
            : `Arrivo merce ${doc.type}`;
          for (const line of receiptLines) {
            if (!line.loadsStock || line.quantity <= 0 || !line.variantId) {
              continue;
            }
            const variant = await tx.productVariant.findFirst({
              where: { id: line.variantId, tenantId },
              select: { id: true, sku: true },
            });
            if (!variant) {
              throw new UnprocessableEntityException(
                `Variante non trovata per la riga ${line.lineNumber}.`,
              );
            }
            await applyStockLoad(tx, {
              tenantId,
              variantId: variant.id,
              sku: line.sku ?? variant.sku,
              locationId: doc.locationId!,
              quantity: line.quantity,
              reason,
              externalRef: doc.id,
              actor: { createdById: actorId, createdByName: actorName },
            });
            syncTargets.push({ variantId: variant.id, locationId: doc.locationId! });
          }
        }
        await applyInventoryLotsFromDocumentLines(
          tx,
          tenantId,
          doc.locationId!,
          receiptLines,
        );
        await applyInventorySerialsFromDocumentLines(
          tx,
          tenantId,
          doc.locationId!,
          receiptLines,
        );
        await applySupplierPriceUpdates(
          tx,
          tenantId,
          doc.supplierId,
          receiptLines,
          pricePolicy,
          shouldApplySupplierPrices,
        );

        if (doc.supplierOrderId && !stockAlreadyApplied) {
          await applySupplierOrderReceipt(
            tx,
            doc.supplierOrderId,
            receiptLines,
            doc.locationId!,
            tenantId,
          );
          if (options?.closeLinkedSupplierOrder) {
            await forceCloseSupplierOrder(tx, doc.supplierOrderId);
          }
        }
      }

      // Fase 2 §9: DDT collegato a una Vendita online che ha GIÀ scaricato il
      // magazzino ⇒ nessun movimento, nessun consumo impegni, nessun secondo
      // scarico. La scelta non è attivabile dall'utente: è forzata dal link.
      if (doc.type === DocumentType.sales_ddt && !doc.onlineSaleId) {
        const reason = reference ? `DDT vendita ${reference}` : `DDT vendita ${doc.type}`;
        await assertSerialNumbersForUnloadLines(tx, tenantId, doc.locationId!, doc.lines);
        for (const line of doc.lines) {
          if (!line.loadsStock || line.quantity <= 0 || !line.variantId) {
            continue;
          }
          const variant = await tx.productVariant.findFirst({
            where: { id: line.variantId, tenantId },
            select: { id: true, sku: true },
          });
          if (!variant) {
            throw new UnprocessableEntityException(
              `Variante non trovata per la riga ${line.lineNumber}.`,
            );
          }
          await applyStockSale(tx, {
            tenantId,
            variantId: variant.id,
            sku: line.sku ?? variant.sku,
            locationId: doc.locationId!,
            quantity: line.quantity,
            reason,
            externalRef: doc.id,
            actor: { createdById: actorId, createdByName: actorName },
          });
          syncTargets.push({ variantId: variant.id, locationId: doc.locationId! });
        }
        await consumeInventorySerialsFromDocumentLines(
          tx,
          tenantId,
          doc.locationId!,
          doc.lines,
        );
      }

      if (doc.type === DocumentType.manual_unload) {
        await assertSerialNumbersForUnloadLines(tx, tenantId, doc.locationId!, doc.lines);
        await applyDocumentStockManualUnloads(tx, {
          tenantId,
          documentId: doc.id,
          reference,
          locationId: doc.locationId!,
          reason: doc.internalComment?.trim() || 'Scarico manuale',
          lines: doc.lines,
          actor: { createdById: actorId, createdByName: actorName },
        });
        for (const line of doc.lines) {
          if (line.variantId && line.loadsStock && line.quantity > 0) {
            syncTargets.push({ variantId: line.variantId, locationId: doc.locationId! });
          }
        }
        await consumeInventorySerialsFromDocumentLines(
          tx,
          tenantId,
          doc.locationId!,
          doc.lines,
        );
      }

      if (documentTypeAdjustsStockOnConfirm(doc.type)) {
        if (doc.adjustmentDirection === AdjustmentDirection.decrease) {
          await assertSerialNumbersForUnloadLines(tx, tenantId, doc.locationId!, doc.lines);
        } else {
          await assertSerialNumbersForDocumentLines(tx, tenantId, doc.lines);
        }
        await applyDocumentStockAdjustments(tx, {
          tenantId,
          documentId: doc.id,
          reference,
          locationId: doc.locationId!,
          direction: doc.adjustmentDirection!,
          reason: doc.internalComment?.trim() || 'Rettifica inventario',
          lines: doc.lines,
          actor: { createdById: actorId, createdByName: actorName },
        });
        for (const line of doc.lines) {
          if (line.variantId && line.loadsStock && line.quantity > 0) {
            syncTargets.push({ variantId: line.variantId, locationId: doc.locationId! });
          }
        }
        if (doc.adjustmentDirection === AdjustmentDirection.decrease) {
          await consumeInventorySerialsFromDocumentLines(
            tx,
            tenantId,
            doc.locationId!,
            doc.lines,
          );
        } else {
          await applyInventorySerialsFromDocumentLines(
            tx,
            tenantId,
            doc.locationId!,
            doc.lines,
          );
        }
      }

      if (documentTypeTransfersStockOnConfirm(doc.type)) {
        await assertSerialNumbersForTransferLines(tx, tenantId, doc.locationId!, doc.lines);
        for (const line of doc.lines) {
          if (!line.loadsStock || line.quantity <= 0 || !line.variantId) {
            continue;
          }
          const variant = await tx.productVariant.findFirst({
            where: { id: line.variantId, tenantId },
            select: { id: true, sku: true },
          });
          if (!variant) {
            throw new UnprocessableEntityException(
              `Variante non trovata per la riga ${line.lineNumber}.`,
            );
          }
        }
        await applyDocumentStockTransfers(tx, {
          tenantId,
          documentId: doc.id,
          reference,
          locations: {
            originLocationId: doc.locationId!,
            targetLocationId: doc.targetLocationId!,
          },
          lines: doc.lines,
          actor: { createdById: actorId, createdByName: actorName },
        });
        for (const line of doc.lines) {
          if (line.variantId && line.loadsStock && line.quantity > 0) {
            syncTargets.push({ variantId: line.variantId, locationId: doc.locationId! });
            syncTargets.push({ variantId: line.variantId, locationId: doc.targetLocationId! });
          }
        }
        await transferInventorySerialsFromDocumentLines(
          tx,
          tenantId,
          doc.locationId!,
          doc.targetLocationId!,
          doc.lines,
        );
      }

      return tx.document.update({
        where: { id },
        data: {
          status: DocumentStatus.confirmed,
          number,
          reference,
          confirmedAt: new Date(),
        },
        include: { lines: { orderBy: { lineNumber: 'asc' } } },
      });
    });

    for (const entry of syncTargets) {
      try {
        await this.channelSync.pushInventoryLevels(tenantId, entry.variantId, [entry.locationId]);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Push inventario canale fallito';
        this.logger.warn(`Push inventario non riuscito (${tenantId}): ${message}`);
      }
    }

    return confirmed;
  }

  /** Converte una proforma in DDT vendita o bozza fattura (§9.1). */
  async convert(
    tenantId: string,
    id: string,
    dto: ConvertDocumentDto,
    user?: UserProfileDto,
  ): Promise<DocumentWithLines> {
    if (!isProformaConvertTarget(dto.targetType)) {
      throw new UnprocessableEntityException('Tipo di conversione non supportato.');
    }

    const source = await this.getById(tenantId, id);
    if (source.type !== DocumentType.proforma) {
      throw new ConflictException('Solo le proforme possono essere convertite con questa azione.');
    }
    if (source.status === DocumentStatus.cancelled) {
      throw new ConflictException('Impossibile convertire un documento annullato.');
    }
    if (source.lines.length === 0) {
      throw new UnprocessableEntityException('La proforma non ha righe da convertire.');
    }

    const targetSetting = await this.settings.getResolved(tenantId, dto.targetType);
    if (!targetSetting.enabled) {
      throw new UnprocessableEntityException(
        `Il tipo documento "${targetSetting.printTitle}" non è abilitato per questa azienda.`,
      );
    }

    const sourceRef = source.reference ?? `proforma ${source.id.slice(0, 8)}`;
    const conversionNote = `Convertito da ${sourceRef}`;

    let locationId = source.locationId ?? undefined;
    if (dto.targetType === DocumentType.sales_ddt && !locationId) {
      locationId = (await this.resolveDefaultSalesLocation(tenantId)) ?? undefined;
      if (!locationId) {
        throw new UnprocessableEntityException(
          'Impossibile creare il DDT vendita: configura almeno una location licenziata.',
        );
      }
    }

    const createDto: CreateDocumentDto = {
      type: dto.targetType,
      documentDate: source.documentDate.toISOString(),
      customerId: source.customerId ?? undefined,
      locationId,
      currency: source.currency,
      notes: source.notes ?? undefined,
      internalComment: source.internalComment
        ? `${source.internalComment}\n${conversionNote}`
        : conversionNote,
      sourceDocumentId: source.id,
      billingCause: source.billingCause ?? undefined,
      externalRef: source.reference ?? undefined,
      lines: source.lines.map((line) => ({
        variantId: line.variantId ?? undefined,
        sku: line.sku ?? undefined,
        description: line.description,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        discountPercent: line.discountPercent,
        vatRatePercent: line.vatRatePercent ?? undefined,
        loadsStock: dto.targetType === DocumentType.sales_ddt,
      })),
    };

    return this.create(tenantId, createDto, user);
  }

  async markPrinted(tenantId: string, id: string): Promise<DocumentWithLines> {
    return this.transition(tenantId, id, DocumentStatus.printed, [
      DocumentStatus.confirmed,
      DocumentStatus.sent,
      DocumentStatus.externally_registered,
    ]);
  }

  async markSent(tenantId: string, id: string): Promise<DocumentWithLines> {
    return this.transition(tenantId, id, DocumentStatus.sent, [
      DocumentStatus.confirmed,
      DocumentStatus.printed,
    ]);
  }

  /** Segna emissione fattura esterna su bozza fattura (§9.2, B6). */
  async markExternallyIssued(
    tenantId: string,
    id: string,
    dto: MarkExternallyIssuedDto,
  ): Promise<DocumentWithLines> {
    const doc = await this.getById(tenantId, id);
    if (doc.type !== DocumentType.invoice_draft) {
      throw new UnprocessableEntityException(
        'Solo le bozze fattura possono essere marcate come emesse esternamente.',
      );
    }
    if (
      doc.status !== DocumentStatus.confirmed &&
      doc.status !== DocumentStatus.printed &&
      doc.status !== DocumentStatus.sent
    ) {
      throw new ConflictException(
        'Solo documenti confermati, stampati o inviati possono essere marcati come emessi esternamente.',
      );
    }

    return this.prisma.document.update({
      where: { id },
      data: {
        externallyIssuedAt: new Date(),
        externalDocNumber: dto.externalDocNumber ?? doc.externalDocNumber,
        externalDocDate: dto.externalDocDate
          ? new Date(dto.externalDocDate)
          : doc.externalDocDate,
      },
      include: { lines: { orderBy: { lineNumber: 'asc' } } },
    });
  }

  async registerExternal(
    tenantId: string,
    id: string,
    dto: RegisterExternalDto,
  ): Promise<DocumentWithLines> {
    const doc = await this.getById(tenantId, id);
    if (
      doc.status !== DocumentStatus.confirmed &&
      doc.status !== DocumentStatus.printed &&
      doc.status !== DocumentStatus.sent
    ) {
      throw new ConflictException(
        'Solo documenti confermati, stampati o inviati possono essere registrati esternamente.',
      );
    }
    if (doc.type === DocumentType.invoice_draft && !doc.externallyIssuedAt) {
      throw new UnprocessableEntityException(
        'Registra prima l\'emissione esterna della fattura (mark-externally-issued).',
      );
    }
    return this.prisma.document.update({
      where: { id },
      data: {
        status: DocumentStatus.externally_registered,
        registrationDate: new Date(),
        externalDocNumber: dto.externalDocNumber ?? doc.externalDocNumber,
        externalDocDate: dto.externalDocDate ? new Date(dto.externalDocDate) : doc.externalDocDate,
        externalRef: dto.note ?? doc.externalRef,
      },
      include: { lines: { orderBy: { lineNumber: 'asc' } } },
    });
  }

  async cancel(
    tenantId: string,
    id: string,
    user?: UserProfileDto,
  ): Promise<DocumentDetail> {
    const doc = await this.getById(tenantId, id);
    if (isFlowOnlyDocumentType(doc.type)) {
      throw new ConflictException(
        'Le vendite negozio non si annullano: registra un Reso vendita negozio per il rientro della merce.',
      );
    }
    if (doc.status === DocumentStatus.cancelled) {
      throw new ConflictException('Il documento è già annullato.');
    }
    if (doc.linkStatus === 'linked') {
      throw new ConflictException(
        'Questo arrivo merce è collegato a una fattura registrata: scollegalo dalla fattura prima di annullarlo.',
      );
    }

    const actor = {
      createdById: user?.id ?? null,
      createdByName: user?.displayName ?? 'API',
    };
    const syncTargets: Array<{ variantId: string; locationId: string }> = [];
    const wasStockLoaded =
      doc.status !== DocumentStatus.draft &&
      documentTypeLoadsStockOnConfirm(doc.type) &&
      doc.locationId != null;
    // DDT collegato a Vendita online (fase 2 §9): non ha mai scaricato,
    // quindi l'annullamento non deve ricaricare nulla.
    const wasStockUnloaded =
      doc.status !== DocumentStatus.draft &&
      doc.type === DocumentType.sales_ddt &&
      doc.onlineSaleId == null &&
      doc.locationId != null;
    const wasManualUnloaded =
      doc.status !== DocumentStatus.draft &&
      doc.type === DocumentType.manual_unload &&
      doc.locationId != null;
    const wasStockAdjusted =
      doc.status !== DocumentStatus.draft &&
      documentTypeAdjustsStockOnConfirm(doc.type) &&
      doc.locationId != null &&
      doc.adjustmentDirection != null;
    const wasStockTransferred =
      doc.status !== DocumentStatus.draft &&
      documentTypeTransfersStockOnConfirm(doc.type) &&
      doc.locationId != null &&
      doc.targetLocationId != null;
    const wasSupplierOrderReceived =
      doc.status !== DocumentStatus.draft &&
      doc.supplierOrderId != null &&
      documentTypeLoadsStockOnConfirm(doc.type);

    await this.prisma.$transaction(async (tx) => {
      let stockDeltas: readonly { sku: string; delta: number }[] = [];
      if (wasStockLoaded) {
        const hasLineMovements =
          (await tx.stockMovement.count({
            where: { tenantId, sourceDocumentId: id },
          })) > 0;
        if (hasLineMovements) {
          // Nuovo modello (arrivo merce): i movimenti collegati alle righe
          // vengono rimossi e la giacenza torna alla situazione precedente.
          const sync = await syncGoodsReceiptLineMovements(tx, {
            tenantId,
            documentId: id,
            documentType: doc.type,
            locationId: doc.locationId,
            reason: '',
            lines: [],
            actor,
          });
          stockDeltas = sync.deltas;
          syncTargets.push(...sync.syncTargets);
        } else {
          const reversed = await reverseDocumentStockLoad(tx, {
            tenantId,
            documentId: id,
            reference: doc.reference,
            locationId: doc.locationId!,
            lines: doc.lines,
            actor,
          });
          stockDeltas = reversed.deltas;
          for (const line of doc.lines) {
            if (line.variantId && line.loadsStock) {
              syncTargets.push({ variantId: line.variantId, locationId: doc.locationId! });
            }
          }
        }
        const summary = buildRevisionSummary(false, stockDeltas, true);
        await this.recordRevision(tx, tenantId, id, summary, actor);
      }

      if (wasStockUnloaded) {
        const reversed = await reverseDocumentStockUnload(tx, {
          tenantId,
          documentId: id,
          reference: doc.reference,
          locationId: doc.locationId!,
          lines: doc.lines,
          actor,
        });
        stockDeltas = reversed.deltas;
        for (const line of doc.lines) {
          if (line.variantId && line.loadsStock) {
            syncTargets.push({ variantId: line.variantId, locationId: doc.locationId! });
          }
        }
        const summary = buildRevisionSummary(false, stockDeltas, true);
        await this.recordRevision(tx, tenantId, id, summary, actor);
        await restoreConsumedSerialsForDocument(
          tx,
          tenantId,
          doc.lines.map((line) => line.id),
        );
      }

      if (wasManualUnloaded) {
        const reversed = await reverseDocumentStockManualUnload(tx, {
          tenantId,
          documentId: id,
          reference: doc.reference,
          locationId: doc.locationId!,
          lines: doc.lines,
          actor,
        });
        stockDeltas = reversed.deltas;
        for (const line of doc.lines) {
          if (line.variantId && line.loadsStock) {
            syncTargets.push({ variantId: line.variantId, locationId: doc.locationId! });
          }
        }
        const summary = buildRevisionSummary(false, stockDeltas, true);
        await this.recordRevision(tx, tenantId, id, summary, actor);
        await restoreConsumedSerialsForDocument(
          tx,
          tenantId,
          doc.lines.map((line) => line.id),
        );
      }

      if (wasStockAdjusted) {
        const reversed = await reverseDocumentStockAdjustment(tx, {
          tenantId,
          documentId: id,
          reference: doc.reference,
          reason: doc.internalComment?.trim() || 'Rettifica inventario',
          locationId: doc.locationId!,
          direction: doc.adjustmentDirection!,
          lines: doc.lines,
          actor,
        });
        stockDeltas = reversed.deltas;
        for (const line of doc.lines) {
          if (line.variantId && line.loadsStock) {
            syncTargets.push({ variantId: line.variantId, locationId: doc.locationId! });
          }
        }
        const summary = buildRevisionSummary(false, stockDeltas, true);
        await this.recordRevision(tx, tenantId, id, summary, actor);
        if (doc.adjustmentDirection === AdjustmentDirection.decrease) {
          await restoreConsumedSerialsForDocument(
            tx,
            tenantId,
            doc.lines.map((line) => line.id),
          );
        } else {
          await reverseInventorySerialsForDocument(
            tx,
            tenantId,
            doc.lines.map((line) => line.id),
          );
        }
      }

      if (wasStockTransferred) {
        const reversed = await reverseDocumentStockTransfer(tx, {
          tenantId,
          documentId: id,
          reference: doc.reference,
          locations: {
            originLocationId: doc.locationId!,
            targetLocationId: doc.targetLocationId!,
          },
          lines: doc.lines,
          actor,
        });
        stockDeltas = reversed.deltas;
        for (const line of doc.lines) {
          if (line.variantId && line.loadsStock) {
            syncTargets.push({ variantId: line.variantId, locationId: doc.locationId! });
            syncTargets.push({ variantId: line.variantId, locationId: doc.targetLocationId! });
          }
        }
        const summary = buildRevisionSummary(false, stockDeltas, true);
        await this.recordRevision(tx, tenantId, id, summary, actor);
        await reverseTransferInventorySerialsForDocument(
          tx,
          tenantId,
          doc.locationId!,
          doc.targetLocationId!,
          doc.lines.map((line) => line.id),
        );
      }

      if (wasSupplierOrderReceived && doc.supplierOrderId) {
        await reverseSupplierOrderReceipt(
          tx,
          doc.supplierOrderId,
          doc.lines,
          doc.locationId ?? undefined,
          tenantId,
        );
      }

      if (wasStockLoaded) {
        await reverseInventorySerialsForDocument(
          tx,
          tenantId,
          doc.lines.map((line) => line.id),
        );
      }

      await tx.document.update({
        where: { id },
        data: { status: DocumentStatus.cancelled, cancelledAt: new Date() },
      });
    });

    for (const entry of syncTargets) {
      try {
        await this.channelSync.pushInventoryLevels(tenantId, entry.variantId, [entry.locationId]);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Push inventario canale fallito';
        this.logger.warn(`Push inventario non riuscito (${tenantId}): ${message}`);
      }
    }

    return this.getById(tenantId, id);
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const doc = await this.getById(tenantId, id);
    if (isFlowOnlyDocumentType(doc.type)) {
      throw new ConflictException(
        'Le vendite e i resi negozio non si eliminano: fanno parte dello storico movimenti.',
      );
    }
    const isFinalized =
      doc.status !== DocumentStatus.draft && doc.status !== DocumentStatus.cancelled;

    // Arrivi merce (nuovo flusso): eliminazione consentita anche da salvato,
    // con rimozione movimenti e ripristino giacenze (prompt §2.3 caso E).
    const isDeletableReceipt =
      documentTypeLoadsStockOnConfirm(doc.type) || doc.type === DocumentType.supplier_invoice;

    if (isFinalized && !isDeletableReceipt) {
      throw new ConflictException(
        'Solo i documenti in bozza o annullati possono essere eliminati.',
      );
    }
    if (doc.linkStatus === 'linked') {
      throw new ConflictException(
        'Questo arrivo merce è collegato a una fattura registrata: scollegalo dalla fattura prima di eliminarlo.',
      );
    }

    const actor = { createdById: null, createdByName: 'Sistema' };
    const syncTargets: Array<{ variantId: string; locationId: string }> = [];

    await this.prisma.$transaction(async (tx) => {
      if (isFinalized && documentTypeLoadsStockOnConfirm(doc.type)) {
        // Rimuove movimenti per-riga E movimenti legacy, stornando le giacenze.
        const sync = await syncGoodsReceiptLineMovements(tx, {
          tenantId,
          documentId: id,
          documentType: doc.type,
          locationId: doc.locationId,
          reason: '',
          lines: [],
          actor,
        });
        syncTargets.push(...sync.syncTargets);

        if (doc.supplierOrderId) {
          await reverseSupplierOrderReceipt(
            tx,
            doc.supplierOrderId,
            doc.lines,
            doc.locationId ?? undefined,
            tenantId,
          );
        }
        await reverseInventorySerialsForDocument(
          tx,
          tenantId,
          doc.lines.map((line) => line.id),
        );
      }
      await tx.document.delete({ where: { id } });
    });

    for (const entry of syncTargets) {
      try {
        await this.channelSync.pushInventoryLevels(tenantId, entry.variantId, [entry.locationId]);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Push inventario canale fallito';
        this.logger.warn(`Push inventario non riuscito (${tenantId}): ${message}`);
      }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async recordRevision(
    tx: Prisma.TransactionClient,
    tenantId: string,
    documentId: string,
    summary: string,
    actor: { createdById: string | null; createdByName: string },
  ): Promise<void> {
    const last = await tx.documentRevision.findFirst({
      where: { documentId },
      orderBy: { revisionNumber: 'desc' },
      select: { revisionNumber: true },
    });
    await tx.documentRevision.create({
      data: {
        tenantId,
        documentId,
        revisionNumber: (last?.revisionNumber ?? 0) + 1,
        summary,
        changedById: actor.createdById,
        changedByName: actor.createdByName,
      },
    });
  }

  private assertStockTransferDocument(doc: Document & { lines: DocumentLine[] }): void {
    const stockLines = doc.lines.filter((line) => line.loadsStock && line.quantity > 0);
    if (stockLines.length === 0) {
      throw new UnprocessableEntityException(
        'Aggiungi almeno una riga con variante e quantità maggiore di zero.',
      );
    }
    if (!doc.locationId) {
      throw new UnprocessableEntityException(
        'Seleziona la location di origine prima di confermare il trasferimento.',
      );
    }
    if (!doc.targetLocationId) {
      throw new UnprocessableEntityException(
        'Seleziona la location di destinazione prima di confermare il trasferimento.',
      );
    }
    if (doc.locationId === doc.targetLocationId) {
      throw new UnprocessableEntityException(
        'Origine e destinazione devono essere location diverse.',
      );
    }
    for (const line of stockLines) {
      if (!line.variantId) {
        throw new UnprocessableEntityException(
          `La riga ${line.lineNumber} trasferisce stock ma non ha una variante associata.`,
        );
      }
    }
  }

  private assertStockUnloadDocument(doc: Document & { lines: DocumentLine[] }): void {
    const stockLines = doc.lines.filter((line) => line.loadsStock && line.quantity > 0);
    if (stockLines.length === 0) {
      return;
    }
    if (!doc.customerId) {
      throw new UnprocessableEntityException(
        'Seleziona un cliente prima di confermare il DDT vendita.',
      );
    }
    if (!doc.locationId) {
      throw new UnprocessableEntityException(
        'Seleziona la location di origine prima di confermare.',
      );
    }
    for (const line of stockLines) {
      if (!line.variantId) {
        throw new UnprocessableEntityException(
          `La riga ${line.lineNumber} scarica magazzino ma non ha una variante associata.`,
        );
      }
    }
  }

  private assertStockManualUnloadDocument(doc: Document & { lines: DocumentLine[] }): void {
    const stockLines = doc.lines.filter((line) => line.loadsStock && line.quantity > 0);
    if (stockLines.length === 0) {
      throw new UnprocessableEntityException(
        'Aggiungi almeno una riga con variante e quantità maggiore di zero.',
      );
    }
    if (!doc.locationId) {
      throw new UnprocessableEntityException(
        'Seleziona la location di origine prima di confermare lo scarico.',
      );
    }
    if (!doc.internalComment?.trim()) {
      throw new UnprocessableEntityException(
        'Il motivo dello scarico (commento interno) è obbligatorio.',
      );
    }
    for (const line of stockLines) {
      if (!line.variantId) {
        throw new UnprocessableEntityException(
          `La riga ${line.lineNumber} scarica magazzino ma non ha una variante associata.`,
        );
      }
    }
  }

  private assertStockAdjustmentDocument(doc: Document & { lines: DocumentLine[] }): void {
    const stockLines = doc.lines.filter((line) => line.loadsStock && line.quantity > 0);
    if (stockLines.length === 0) {
      throw new UnprocessableEntityException(
        'Aggiungi almeno una riga con variante e quantità maggiore di zero.',
      );
    }
    if (!doc.locationId) {
      throw new UnprocessableEntityException(
        'Seleziona la location prima di confermare la rettifica.',
      );
    }
    if (!doc.adjustmentDirection) {
      throw new UnprocessableEntityException(
        'Seleziona la direzione della rettifica (aumento o diminuzione).',
      );
    }
    if (!doc.internalComment?.trim()) {
      throw new UnprocessableEntityException(
        'Il motivo della rettifica (commento interno) è obbligatorio.',
      );
    }
    for (const line of stockLines) {
      if (!line.variantId) {
        throw new UnprocessableEntityException(
          `La riga ${line.lineNumber} rettifica stock ma non ha una variante associata.`,
        );
      }
    }
  }

  private assertStockLoadDocument(doc: Document & { lines: DocumentLine[] }): void {
    const supplierRequiredTypes: readonly DocumentType[] = [
      DocumentType.goods_receipt,
      DocumentType.supplier_ddt,
      DocumentType.supplier_invoice_accompanying,
    ];
    if (
      (supplierRequiredTypes as readonly string[]).includes(doc.type) &&
      !doc.supplierId
    ) {
      throw new UnprocessableEntityException(
        'Seleziona un fornitore prima di confermare l\'arrivo merce.',
      );
    }
    if (!doc.locationId) {
      throw new UnprocessableEntityException(
        'Seleziona la location di destinazione prima di confermare.',
      );
    }
    const stockLines = doc.lines.filter((line) => line.loadsStock && line.quantity > 0);
    if (stockLines.length === 0) {
      throw new UnprocessableEntityException(
        'Aggiungi almeno una riga che carica magazzino con quantità maggiore di zero.',
      );
    }
    for (const line of stockLines) {
      if (!line.variantId) {
        throw new UnprocessableEntityException(
          `La riga ${line.lineNumber} carica magazzino ma non ha una variante associata.`,
        );
      }
    }
  }

  private async transition(
    tenantId: string,
    id: string,
    next: DocumentStatus,
    allowedFrom: readonly DocumentStatus[],
  ): Promise<DocumentWithLines> {
    const doc = await this.getById(tenantId, id);
    if (!allowedFrom.includes(doc.status)) {
      throw new ConflictException('Transizione di stato non consentita per questo documento.');
    }
    return this.prisma.document.update({
      where: { id },
      data: { status: next },
      include: { lines: { orderBy: { lineNumber: 'asc' } } },
    });
  }

  /** Prossimo numero progressivo (atomico via upsert) per serie/anno/tipo. */
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

  /** Prima location licenziata attiva (fallback DDT vendita da proforma). */
  private async resolveDefaultSalesLocation(tenantId: string): Promise<string | null> {
    const location = await this.prisma.location.findFirst({
      where: { tenantId, licensedInVf: true, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true },
    });
    return location?.id ?? null;
  }

  private computeLines(
    input: readonly DocumentLineInputDto[],
    documentType: DocumentType,
  ): ComputedLine[] {
    const defaultLoadsStock = documentTypeDefaultLoadsStock(documentType);
    return input.map((line, index) => {
      const quantity = line.quantity;
      const unitPriceMinor = line.unitPriceMinor ?? 0;
      const discountPercent = line.discountPercent ?? 0;
      const lineTotalMinor = Math.round(
        (quantity * unitPriceMinor * (100 - discountPercent)) / 100,
      );
      return {
        lineNumber: index + 1,
        variantId: line.variantId ?? null,
        sku: line.sku ?? null,
        description: line.description.trim(),
        quantity,
        unitPriceMinor,
        discountPercent,
        vatRatePercent: line.vatRatePercent ?? null,
        lineTotalMinor,
        loadsStock: line.loadsStock ?? defaultLoadsStock,
        supplierOrderLineId: line.supplierOrderLineId ?? null,
        lotCode: line.lotCode?.trim() || null,
        lotExpiryDate: line.lotExpiryDate ? new Date(line.lotExpiryDate) : null,
        serialNumbers: normalizeSerialNumbers(line.serialNumbers),
      };
    });
  }

  private async assertSupplierOrderReceivable(
    tenantId: string,
    supplierOrderId: string,
    status?: SupplierOrderStatus,
  ): Promise<void> {
    let resolvedStatus = status;
    if (resolvedStatus == null) {
      const order = await this.prisma.supplierOrder.findFirst({
        where: { id: supplierOrderId, tenantId },
        select: { status: true },
      });
      if (!order) {
        throw new NotFoundException('Ordine fornitore non trovato');
      }
      resolvedStatus = order.status;
    }
    if (
      resolvedStatus !== SupplierOrderStatus.sent &&
      resolvedStatus !== SupplierOrderStatus.partially_received
    ) {
      throw new ConflictException(
        'Solo ordini inviati o parzialmente ricevuti possono generare un arrivo merce.',
      );
    }
  }

  private computeTotals(
    lines: readonly ComputedLine[],
    pricesIncludeVat: boolean,
    documentDiscountPercent = 0,
  ): DocumentTotals {
    const lineSum = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
    const docDiscount = Math.min(100, Math.max(0, documentDiscountPercent));
    const docDiscountAmount = Math.round((lineSum * docDiscount) / 100);
    const discountedLineSum = lineSum - docDiscountAmount;

    const taxMinor = lines.reduce((sum, line) => {
      if (line.vatRatePercent == null || line.vatRatePercent === 0 || lineSum === 0) {
        return sum;
      }
      const lineShare = line.lineTotalMinor / lineSum;
      const discountedLineTotal = Math.round(discountedLineSum * lineShare);
      const rate = line.vatRatePercent;
      const tax = pricesIncludeVat
        ? discountedLineTotal - Math.round((discountedLineTotal * 100) / (100 + rate))
        : Math.round((discountedLineTotal * rate) / 100);
      return sum + tax;
    }, 0);

    if (pricesIncludeVat) {
      return {
        subtotalMinor: discountedLineSum - taxMinor,
        taxMinor,
        totalMinor: discountedLineSum,
      };
    }
    return {
      subtotalMinor: discountedLineSum,
      taxMinor,
      totalMinor: discountedLineSum + taxMinor,
    };
  }

  private async assertCounterparties(
    tenantId: string,
    dto: {
      supplierId?: string;
      customerId?: string;
      locationId?: string;
      targetLocationId?: string;
    },
  ): Promise<void> {
    if (dto.supplierId) {
      const found = await this.prisma.supplier.findFirst({
        where: { id: dto.supplierId, tenantId },
        select: { id: true },
      });
      if (!found) throw new NotFoundException('Fornitore non trovato');
    }
    if (dto.customerId) {
      const found = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, tenantId },
        select: { id: true },
      });
      if (!found) throw new NotFoundException('Cliente non trovato');
    }
    for (const locationId of [dto.locationId, dto.targetLocationId]) {
      if (!locationId) continue;
      const found = await this.prisma.location.findFirst({
        where: { id: locationId, tenantId },
        select: { id: true },
      });
      if (!found) throw new NotFoundException('Sede non trovata');
    }
  }

  private async snapshotSupplierName(
    tenantId: string,
    supplierId?: string,
  ): Promise<string | null> {
    if (!supplierId) return null;
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, tenantId },
      select: { name: true },
    });
    return supplier?.name ?? null;
  }

  private async snapshotCustomerName(
    tenantId: string,
    customerId?: string,
  ): Promise<string | null> {
    if (!customerId) return null;
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId },
      select: { firstName: true, lastName: true },
    });
    if (!customer) return null;
    return `${customer.firstName} ${customer.lastName}`.trim();
  }

  /** Espone la configurazione risolta per un tipo (usata dal controller settings). */
  resolveSetting(tenantId: string, type: DocumentType): Promise<ResolvedDocumentTypeSetting> {
    return this.settings.getResolved(tenantId, type);
  }
}

function normalizeSerialNumbers(input?: readonly string[]): string[] {
  if (!input?.length) {
    return [];
  }
  return input.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}
