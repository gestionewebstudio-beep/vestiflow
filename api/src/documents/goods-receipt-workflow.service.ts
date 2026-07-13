import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  DocumentStatus,
  DocumentType,
  Prisma,
  type Document,
  type DocumentLine,
} from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { ChannelSyncFacade } from '../channels/channel-sync.facade';
import { applyInventoryLotsFromDocumentLines } from '../inventory/inventory-lot.util';
import {
  applyInventorySerialsFromDocumentLines,
  assertSerialNumbersForDocumentLines,
} from '../inventory/inventory-serial.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildGoodsReceiptMovementReason,
  syncGoodsReceiptLineMovements,
} from './document-goods-receipt-sync.util';
import {
  DOCUMENT_STOCK_LOAD_TYPES,
  INVOICE_LINKABLE_RECEIPT_TYPES,
} from './document-stock.constants';
import {
  enrichReceiptLinesWithSupplierOrderLineIds,
  reconcileSupplierOrderReceipt,
} from './document-supplier-order.util';
import { applySupplierPriceUpdates } from './document-supplier-price.util';
import {
  formatDocumentReference,
  nextDocumentNumber,
} from './document-totals.util';
import {
  computeGoodsReceiptLines,
  computeGoodsReceiptTotals,
  type ComputedGoodsReceiptLine,
} from './goods-receipt-vat.util';
import { DocumentSettingsService } from './document-settings.service';
import { ExternalDocumentTypesService } from './external-document-types.service';
import { VatCodesService, type VatCodeWithNature } from '../vat/vat-codes.service';
import type { SaveGoodsReceiptDto } from './dto/save-goods-receipt.dto';
import type { SavePurchaseInvoiceDto } from './dto/save-purchase-invoice.dto';

/** Tipi arrivo merce che richiedono il fornitore già alla creazione (§9.2). */
const SUPPLIER_REQUIRED_TYPES: readonly DocumentType[] = INVOICE_LINKABLE_RECEIPT_TYPES;

export interface LinkableGoodsReceiptRow {
  readonly id: string;
  readonly number: number | null;
  readonly reference: string | null;
  readonly documentDate: Date;
  readonly causalText: string | null;
  readonly internalComment: string | null;
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly totalMinor: number;
  readonly currency: string;
  readonly locationName: string | null;
}

export interface PurchaseInvoiceSaveResult {
  readonly document: Document & { lines: DocumentLine[] };
  readonly receiptsTotalMinor: number;
  readonly totalsMatch: boolean;
}

const INVALID_LINE_MESSAGE = (lineNumber: number): string =>
  `La riga ${lineNumber} non può caricare il magazzino perché non è collegata a un ` +
  'articolo valido. Seleziona un articolo o crealo dalla riga.';

/**
 * Flusso "Salva documento" dell'Arrivo merce (prompt §2) e Registrazione
 * fattura (prompt §5-7). Il salvataggio dell'arrivo esegue in un'unica
 * transazione: testata, righe, totali, movimenti per riga e giacenze.
 */
@Injectable()
export class GoodsReceiptWorkflowService {
  private readonly logger = new Logger(GoodsReceiptWorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: DocumentSettingsService,
    private readonly channelSync: ChannelSyncFacade,
    private readonly externalTypes: ExternalDocumentTypesService,
    private readonly vatCodes: VatCodesService,
  ) {}

  // ── Arrivo merce: salvataggio unico ────────────────────────────────────────

  async saveGoodsReceipt(
    tenantId: string,
    dto: SaveGoodsReceiptDto,
    user?: UserProfileDto,
  ): Promise<Document & { lines: DocumentLine[] }> {
    if (!(DOCUMENT_STOCK_LOAD_TYPES as readonly string[]).includes(dto.type)) {
      throw new UnprocessableEntityException(
        'Questo salvataggio è riservato ai documenti di arrivo merce / carico.',
      );
    }

    const setting = await this.settings.getResolved(tenantId, dto.type);
    if (!setting.enabled) {
      throw new UnprocessableEntityException(
        `Il tipo documento "${setting.printTitle}" non è abilitato per questa azienda.`,
      );
    }

    if ((SUPPLIER_REQUIRED_TYPES as readonly string[]).includes(dto.type) && !dto.supplierId) {
      throw new UnprocessableEntityException(
        'Seleziona un fornitore prima di salvare l\'arrivo merce.',
      );
    }

    await this.assertSupplier(tenantId, dto.supplierId);
    await this.assertLocation(tenantId, dto.locationId);

    // Codici IVA delle righe: risolti una volta, validati per tenant (§9).
    const costEntryMode = dto.purchaseCostEntryMode ?? 'vat_excluded';
    const requestedVatCodeIds = [
      ...new Set(
        (dto.lines ?? [])
          .map((line) => line.vatCodeId)
          .filter((id): id is string => id != null),
      ),
    ];
    const vatCodesById = new Map<string, VatCodeWithNature>();
    if (requestedVatCodeIds.length > 0) {
      const found = await this.prisma.vatCode.findMany({
        where: { tenantId, id: { in: requestedVatCodeIds }, deletedAt: null },
        include: { nature: true },
      });
      for (const vatCode of found) {
        vatCodesById.set(vatCode.id, vatCode);
      }
    }

    const computedLines = computeGoodsReceiptLines({
      lines: dto.lines ?? [],
      documentType: dto.type,
      costEntryMode,
      vatCodesById,
      buildSnapshot: (vatCode) => this.vatCodes.buildSnapshot(vatCode),
    });
    const lineIds = (dto.lines ?? []).map((line) => line.id ?? null);
    const totals = computeGoodsReceiptTotals(computedLines, dto.documentDiscountPercent ?? 0);

    // Validazione righe che caricano magazzino (§2.8): errori chiari, mai tecnici.
    const stockLines = computedLines.filter((line) => line.loadsStock && line.quantity > 0);
    if (stockLines.length > 0) {
      if (!dto.locationId) {
        throw new UnprocessableEntityException(
          'Seleziona il magazzino di destinazione: serve per caricare la giacenza delle righe.',
        );
      }
      for (const line of stockLines) {
        if (!line.variantId) {
          throw new UnprocessableEntityException(INVALID_LINE_MESSAGE(line.lineNumber));
        }
      }
      const variantIds = [...new Set(stockLines.map((line) => line.variantId as string))];
      const found = await this.prisma.productVariant.findMany({
        where: { tenantId, id: { in: variantIds } },
        select: { id: true },
      });
      if (found.length !== variantIds.length) {
        const foundIds = new Set(found.map((variant) => variant.id));
        const missingLine = stockLines.find(
          (line) => line.variantId && !foundIds.has(line.variantId),
        );
        throw new UnprocessableEntityException(
          INVALID_LINE_MESSAGE(missingLine?.lineNumber ?? 1),
        );
      }
    }

    const documentDate = new Date(dto.documentDate);
    const actor = {
      createdById: user?.id ?? null,
      createdByName: user?.displayName ?? 'API',
    };

    // Tipo documento fornitore: validato per tenant e fotografato in snapshot
    // (lo storico resta leggibile anche se il tipo viene rinominato, §13).
    const externalDocumentType = dto.externalDocumentTypeId
      ? await this.externalTypes.getById(tenantId, dto.externalDocumentTypeId)
      : null;

    const featureSettings = await this.prisma.tenantFeatureSettings.findUnique({
      where: { tenantId },
    });
    const pricePolicy = featureSettings?.updateSupplierPriceOnLoad ?? 'ask';
    const shouldApplySupplierPrices =
      pricePolicy === 'always' ||
      (pricePolicy === 'ask' && dto.applySupplierPriceUpdates === true);

    let syncTargets: readonly { variantId: string; locationId: string }[] = [];

    const saved = await this.prisma.$transaction(async (tx) => {
      let existing: (Document & { lines: DocumentLine[] }) | null = null;
      if (dto.id) {
        existing = await tx.document.findFirst({
          where: { id: dto.id, tenantId },
          include: { lines: { orderBy: { lineNumber: 'asc' } } },
        });
        if (!existing) {
          throw new NotFoundException('Documento non trovato');
        }
        if (existing.status === DocumentStatus.cancelled) {
          throw new ConflictException('Il documento è annullato e non può essere modificato.');
        }
        if (existing.type !== dto.type) {
          throw new ConflictException(
            'Il tipo documento non può essere cambiato dopo il salvataggio.',
          );
        }
        if (
          setting.blockAfterConfirm &&
          existing.status !== DocumentStatus.draft
        ) {
          throw new ConflictException(
            'Modifica bloccata dalle impostazioni per questo tipo di documento.',
          );
        }
        if (
          dto.supplierOrderId !== undefined &&
          existing.supplierOrderId &&
          dto.supplierOrderId !== existing.supplierOrderId
        ) {
          throw new ConflictException(
            'Questo documento è già collegato a un altro ordine fornitore.',
          );
        }
      }

      const supplierName = await this.snapshotSupplierName(tx, tenantId, dto.supplierId);
      const series = (dto.series ?? existing?.series ?? setting.defaultSeries).trim() || 'A';
      const year = documentDate.getFullYear();

      // Numero interno progressivo assegnato al primo salvataggio (§9.1-9.2).
      let number = existing?.number ?? null;
      let reference = existing?.reference ?? null;
      if (number == null && setting.autoNumbering) {
        number = await nextDocumentNumber(tx, tenantId, dto.type, series, year);
        reference = formatDocumentReference(setting.numberPrefix, year, number);
      }

      const headerData = {
        series,
        year,
        number,
        reference,
        status: DocumentStatus.confirmed,
        confirmedAt: existing?.confirmedAt ?? new Date(),
        documentDate,
        printTitle: setting.printTitle,
        supplierId: dto.supplierId ?? null,
        supplierName,
        locationId: dto.locationId ?? null,
        causalText: dto.causalText?.trim() || null,
        causalGenerationMode: dto.causalGenerationMode ?? null,
        causalTemplateSnapshot: dto.causalTemplateSnapshot?.trim() || null,
        externalDocumentTypeId: externalDocumentType?.id ?? null,
        externalDocumentTypeSnapshot: externalDocumentType?.shortLabel ?? null,
        externalDocNumber: dto.externalDocNumber?.trim() || null,
        externalDocDate: dto.externalDocDate ? new Date(dto.externalDocDate) : null,
        notes: dto.notes ?? existing?.notes ?? setting.defaultNotes,
        internalComment: dto.internalComment?.trim() || null,
        billingCause: dto.billingCause?.trim() || null,
        supplierOrderId: dto.supplierOrderId ?? existing?.supplierOrderId ?? null,
        currency: dto.currency ?? existing?.currency ?? 'EUR',
        pricesIncludeVat: setting.pricesIncludeVat,
        purchaseCostEntryMode: costEntryMode,
        documentDiscountPercent: dto.documentDiscountPercent ?? 0,
        subtotalMinor: totals.subtotalMinor,
        taxMinor: totals.taxMinor,
        totalMinor: totals.totalMinor,
      } satisfies Prisma.DocumentUncheckedUpdateInput;

      let documentId: string;
      if (existing) {
        await tx.document.update({ where: { id: existing.id }, data: headerData });
        documentId = existing.id;
      } else {
        const created = await tx.document.create({
          data: {
            ...headerData,
            tenantId,
            type: dto.type,
            createdById: actor.createdById,
            createdByName: actor.createdByName,
          } as Prisma.DocumentUncheckedCreateInput,
        });
        documentId = created.id;
      }

      // ── Upsert righe per id: preservare l'id riga è ciò che consente di
      // aggiornare il movimento collegato invece di duplicarlo (§2.3-2.4).
      const existingLineIds = new Set((existing?.lines ?? []).map((line) => line.id));
      const incomingIds = new Set(
        lineIds.filter((id): id is string => id != null && existingLineIds.has(id)),
      );

      await tx.documentLine.deleteMany({
        where: { documentId, id: { notIn: [...incomingIds] } },
      });

      for (let index = 0; index < computedLines.length; index += 1) {
        const line = computedLines[index] as ComputedGoodsReceiptLine;
        const lineId = lineIds[index];
        const data = {
          lineNumber: line.lineNumber,
          variantId: line.variantId,
          sku: line.sku,
          description: line.description,
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          discountPercent: line.discountPercent,
          vatRatePercent: line.vatRatePercent,
          lineTotalMinor: line.lineTotalMinor,
          vatCodeId: line.vatCodeId,
          vatSnapshot: line.vatSnapshot ?? Prisma.DbNull,
          enteredUnitCost: line.enteredUnitCost,
          costEntryModeSnapshot: line.costEntryModeSnapshot,
          unitCostNet: line.unitCostNet,
          unitCostGross: line.unitCostGross,
          unitVatAmount: line.unitVatAmount,
          lineVatTotalMinor: line.lineVatTotalMinor,
          lineGrossTotalMinor: line.lineGrossTotalMinor,
          supplierPayableLineMinor: line.supplierPayableLineMinor,
          reverseChargeVatMinor: line.reverseChargeVatMinor,
          nonDeductibleVatMinor: line.nonDeductibleVatMinor,
          loadsStock: line.loadsStock,
          supplierOrderLineId: line.supplierOrderLineId,
          lotCode: line.lotCode,
          lotExpiryDate: line.lotExpiryDate,
          serialNumbers: line.serialNumbers,
        };
        if (lineId && incomingIds.has(lineId)) {
          await tx.documentLine.update({ where: { id: lineId }, data });
        } else {
          await tx.documentLine.create({ data: { ...data, tenantId, documentId } });
        }
      }

      let savedLines = await tx.documentLine.findMany({
        where: { documentId },
        orderBy: { lineNumber: 'asc' },
      });

      // Collegamento righe ordine fornitore per variante (se non già collegate).
      const supplierOrderId = dto.supplierOrderId ?? existing?.supplierOrderId ?? null;
      if (supplierOrderId) {
        const enriched = await enrichReceiptLinesWithSupplierOrderLineIds(
          tx,
          supplierOrderId,
          savedLines,
        );
        for (const line of enriched) {
          const original = savedLines.find((saved) => saved.id === line.id);
          if (original && original.supplierOrderLineId !== line.supplierOrderLineId) {
            await tx.documentLine.update({
              where: { id: line.id },
              data: { supplierOrderLineId: line.supplierOrderLineId },
            });
          }
        }
        savedLines = enriched;

        // Il ricevuto ordine era applicato solo alla conferma nel vecchio flusso:
        // per i documenti mai confermati (bozze legacy) si parte da zero.
        const oldLinesForOrder =
          existing && existing.status !== DocumentStatus.draft ? existing.lines : [];
        await reconcileSupplierOrderReceipt(
          tx,
          supplierOrderId,
          oldLinesForOrder,
          savedLines,
          dto.locationId ?? undefined,
          tenantId,
        );
      }

      // ── Sync movimenti per riga (§2.3): un movimento per riga, mai duplicati.
      const reason = buildGoodsReceiptMovementReason({
        number,
        reference,
        documentDate,
        causalText: dto.causalText?.trim() || null,
      });
      const sync = await syncGoodsReceiptLineMovements(tx, {
        tenantId,
        documentId,
        documentType: dto.type,
        locationId: dto.locationId ?? null,
        reason,
        movementDate: documentDate,
        lines: savedLines,
        actor,
      });
      syncTargets = sync.syncTargets;

      // Lotti e seriali solo per le righe che hanno generato un movimento nuovo.
      const createdLines = savedLines.filter((line) => sync.createdLineIds.includes(line.id));
      if (createdLines.length > 0 && dto.locationId) {
        await assertSerialNumbersForDocumentLines(tx, tenantId, createdLines);
        await applyInventoryLotsFromDocumentLines(tx, tenantId, dto.locationId, createdLines);
        await applyInventorySerialsFromDocumentLines(tx, tenantId, dto.locationId, createdLines);
      }

      await applySupplierPriceUpdates(
        tx,
        tenantId,
        dto.supplierId ?? null,
        savedLines,
        pricePolicy,
        shouldApplySupplierPrices,
      );

      if (existing && sync.deltas.length > 0) {
        await this.recordRevision(tx, tenantId, documentId, sync.deltas, actor);
      }

      return tx.document.findFirstOrThrow({
        where: { id: documentId, tenantId },
        include: { lines: { orderBy: { lineNumber: 'asc' } } },
      });
    });

    await this.pushInventory(tenantId, syncTargets);
    return saved;
  }

  /**
   * Rimuove tutti i movimenti collegati alle righe del documento riportando le
   * giacenze alla situazione precedente (§2.3 caso E). Usato da annullamento
   * ed eliminazione dell'Arrivo merce. Da chiamare DENTRO una transazione.
   */
  async removeAllLineMovements(
    tx: Prisma.TransactionClient,
    tenantId: string,
    doc: Document,
  ): Promise<readonly { variantId: string; locationId: string }[]> {
    const sync = await syncGoodsReceiptLineMovements(tx, {
      tenantId,
      documentId: doc.id,
      documentType: doc.type,
      locationId: doc.locationId,
      reason: '',
      lines: [],
      actor: { createdById: null, createdByName: 'Sistema' },
    });
    return sync.syncTargets;
  }

  // ── Registrazione fattura ──────────────────────────────────────────────────

  /** Arrivi merce includibili in una registrazione fattura (§5.1, §9.6). */
  async listLinkableGoodsReceipts(
    tenantId: string,
    supplierId: string,
    excludeInvoiceId?: string,
  ): Promise<LinkableGoodsReceiptRow[]> {
    const rows = await this.prisma.document.findMany({
      where: {
        tenantId,
        supplierId,
        type: { in: [...INVOICE_LINKABLE_RECEIPT_TYPES] },
        status: { notIn: [DocumentStatus.draft, DocumentStatus.cancelled] },
        totalMinor: { gt: 0 },
        purchaseInvoiceLinks: {
          none: {
            purchaseInvoice: {
              status: { not: DocumentStatus.cancelled },
              ...(excludeInvoiceId ? { id: { not: excludeInvoiceId } } : {}),
            },
          },
        },
      },
      include: { location: { select: { name: true } } },
      orderBy: [{ documentDate: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return rows.map((row) => ({
      id: row.id,
      number: row.number,
      reference: row.reference,
      documentDate: row.documentDate,
      causalText: row.causalText,
      internalComment: row.internalComment,
      subtotalMinor: row.subtotalMinor,
      taxMinor: row.taxMinor,
      totalMinor: row.totalMinor,
      currency: row.currency,
      locationName: row.location?.name ?? null,
    }));
  }

  /**
   * Salva la registrazione fattura (§5-6): crea/aggiorna il documento
   * supplier_invoice, le righe riepilogative e i collegamenti agli arrivi.
   * NON genera mai movimenti di magazzino.
   */
  async savePurchaseInvoice(
    tenantId: string,
    dto: SavePurchaseInvoiceDto,
    user?: UserProfileDto,
  ): Promise<PurchaseInvoiceSaveResult> {
    const setting = await this.settings.getResolved(tenantId, DocumentType.supplier_invoice);
    if (!setting.enabled) {
      throw new UnprocessableEntityException(
        `Il tipo documento "${setting.printTitle}" non è abilitato per questa azienda.`,
      );
    }
    await this.assertSupplier(tenantId, dto.supplierId);

    const receiptIds = [...new Set(dto.goodsReceiptIds ?? [])];
    const receipts = receiptIds.length
      ? await this.prisma.document.findMany({
          where: { tenantId, id: { in: receiptIds } },
          include: {
            purchaseInvoiceLinks: {
              where: { purchaseInvoice: { status: { not: DocumentStatus.cancelled } } },
              select: { purchaseInvoiceId: true },
            },
          },
        })
      : [];

    if (receipts.length !== receiptIds.length) {
      throw new NotFoundException('Uno degli arrivi merce selezionati non esiste più.');
    }
    for (const receipt of receipts) {
      if (!(INVOICE_LINKABLE_RECEIPT_TYPES as readonly string[]).includes(receipt.type)) {
        throw new UnprocessableEntityException(
          'Si possono includere solo documenti di arrivo merce.',
        );
      }
      if (receipt.supplierId !== dto.supplierId) {
        throw new UnprocessableEntityException(
          'Gli arrivi merce inclusi devono appartenere allo stesso fornitore della fattura.',
        );
      }
      if (receipt.status === DocumentStatus.cancelled) {
        throw new UnprocessableEntityException(
          'Un arrivo merce annullato non può essere collegato a una fattura.',
        );
      }
      const linkedElsewhere = receipt.purchaseInvoiceLinks.some(
        (link) => link.purchaseInvoiceId !== dto.id,
      );
      if (linkedElsewhere) {
        throw new ConflictException(
          `L'arrivo merce ${receipt.reference ?? receipt.id} è già collegato a un'altra fattura registrata.`,
        );
      }
    }

    const receiptsSubtotal = receipts.reduce((sum, receipt) => sum + receipt.subtotalMinor, 0);
    const receiptsTax = receipts.reduce((sum, receipt) => sum + receipt.taxMinor, 0);
    const receiptsTotal = receipts.reduce((sum, receipt) => sum + receipt.totalMinor, 0);

    const documentDate = new Date(dto.documentDate);
    const actor = {
      createdById: user?.id ?? null,
      createdByName: user?.displayName ?? 'API',
    };

    const document = await this.prisma.$transaction(async (tx) => {
      let existing: (Document & { lines: DocumentLine[] }) | null = null;
      if (dto.id) {
        existing = await tx.document.findFirst({
          where: { id: dto.id, tenantId, type: DocumentType.supplier_invoice },
          include: { lines: { orderBy: { lineNumber: 'asc' } } },
        });
        if (!existing) {
          throw new NotFoundException('Registrazione fattura non trovata');
        }
        if (existing.status === DocumentStatus.cancelled) {
          throw new ConflictException('La registrazione è annullata e non può essere modificata.');
        }
      }

      const supplierName = await this.snapshotSupplierName(tx, tenantId, dto.supplierId);
      const series = (existing?.series ?? setting.defaultSeries).trim() || 'A';
      const year = documentDate.getFullYear();

      let number = existing?.number ?? null;
      let reference = existing?.reference ?? null;
      if (number == null && setting.autoNumbering) {
        number = await nextDocumentNumber(
          tx,
          tenantId,
          DocumentType.supplier_invoice,
          series,
          year,
        );
        reference = formatDocumentReference(setting.numberPrefix, year, number);
      }

      const headerData = {
        series,
        year,
        number,
        reference,
        status: DocumentStatus.confirmed,
        confirmedAt: existing?.confirmedAt ?? new Date(),
        registrationDate: existing?.registrationDate ?? new Date(),
        documentDate,
        printTitle: setting.printTitle,
        supplierId: dto.supplierId,
        supplierName,
        externalDocNumber: dto.externalDocNumber?.trim() || null,
        externalDocDate: dto.externalDocDate ? new Date(dto.externalDocDate) : null,
        notes: dto.notes ?? existing?.notes ?? setting.defaultNotes,
        internalComment: dto.internalComment?.trim() || null,
        currency: dto.currency ?? existing?.currency ?? 'EUR',
        pricesIncludeVat: setting.pricesIncludeVat,
        subtotalMinor: dto.subtotalMinor ?? receiptsSubtotal,
        taxMinor: dto.taxMinor ?? receiptsTax,
        totalMinor: dto.totalMinor,
      } satisfies Prisma.DocumentUncheckedUpdateInput;

      let documentId: string;
      if (existing) {
        await tx.document.update({ where: { id: existing.id }, data: headerData });
        documentId = existing.id;
      } else {
        const created = await tx.document.create({
          data: {
            ...headerData,
            tenantId,
            type: DocumentType.supplier_invoice,
            createdById: actor.createdById,
            createdByName: actor.createdByName,
          } as Prisma.DocumentUncheckedCreateInput,
        });
        documentId = created.id;
      }

      // Righe riepilogative: una per ogni arrivo incluso (§5.2), mai le righe articolo.
      await tx.documentLine.deleteMany({ where: { documentId } });
      const sortedReceipts = [...receipts].sort(
        (a, b) => a.documentDate.getTime() - b.documentDate.getTime(),
      );
      for (let index = 0; index < sortedReceipts.length; index += 1) {
        const receipt = sortedReceipts[index];
        if (!receipt) {
          continue;
        }
        await tx.documentLine.create({
          data: {
            tenantId,
            documentId,
            lineNumber: index + 1,
            description: buildReceiptSummaryDescription(receipt),
            quantity: 1,
            unitPriceMinor: receipt.totalMinor,
            discountPercent: 0,
            vatRatePercent: null,
            lineTotalMinor: receipt.totalMinor,
            loadsStock: false,
            linkedGoodsReceiptId: receipt.id,
          },
        });
      }

      // Collegamenti fattura ↔ arrivi (§6-7): rimuovere un arrivo dalla fattura
      // lo riporta Sospeso; giacenze e movimenti NON vengono toccati.
      await tx.purchaseInvoiceGoodsReceiptLink.deleteMany({
        where: {
          purchaseInvoiceId: documentId,
          goodsReceiptId: { notIn: receiptIds.length ? receiptIds : ['00000000-0000-0000-0000-000000000000'] },
        },
      });
      for (const receipt of sortedReceipts) {
        await tx.purchaseInvoiceGoodsReceiptLink.upsert({
          where: {
            purchaseInvoiceId_goodsReceiptId: {
              purchaseInvoiceId: documentId,
              goodsReceiptId: receipt.id,
            },
          },
          create: {
            tenantId,
            purchaseInvoiceId: documentId,
            goodsReceiptId: receipt.id,
            linkedNetMinor: receipt.subtotalMinor,
            linkedVatMinor: receipt.taxMinor,
            linkedGrossMinor: receipt.totalMinor,
          },
          update: {
            linkedNetMinor: receipt.subtotalMinor,
            linkedVatMinor: receipt.taxMinor,
            linkedGrossMinor: receipt.totalMinor,
          },
        });
      }

      return tx.document.findFirstOrThrow({
        where: { id: documentId, tenantId },
        include: { lines: { orderBy: { lineNumber: 'asc' } } },
      });
    });

    return {
      document,
      receiptsTotalMinor: receiptsTotal,
      totalsMatch: receiptsTotal === dto.totalMinor,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async pushInventory(
    tenantId: string,
    targets: readonly { variantId: string; locationId: string }[],
  ): Promise<void> {
    const unique = new Map(targets.map((t) => [`${t.variantId}::${t.locationId}`, t]));
    for (const target of unique.values()) {
      try {
        await this.channelSync.pushInventoryLevels(tenantId, target.variantId, [
          target.locationId,
        ]);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Push inventario canale fallito';
        this.logger.warn(`Push inventario non riuscito (${tenantId}): ${message}`);
      }
    }
  }

  private async recordRevision(
    tx: Prisma.TransactionClient,
    tenantId: string,
    documentId: string,
    deltas: readonly { readonly sku: string; readonly delta: number }[],
    actor: { createdById: string | null; createdByName: string },
  ): Promise<void> {
    const parts = deltas.map((d) => `${d.sku} ${d.delta > 0 ? '+' : ''}${d.delta}`);
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
        summary: `Salvataggio documento (giacenza: ${parts.join(', ')})`,
        changedById: actor.createdById,
        changedByName: actor.createdByName,
      },
    });
  }

  private async assertSupplier(tenantId: string, supplierId?: string): Promise<void> {
    if (!supplierId) return;
    const found = await this.prisma.supplier.findFirst({
      where: { id: supplierId, tenantId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Fornitore non trovato');
  }

  private async assertLocation(tenantId: string, locationId?: string): Promise<void> {
    if (!locationId) return;
    const found = await this.prisma.location.findFirst({
      where: { id: locationId, tenantId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Sede non trovata');
  }

  private async snapshotSupplierName(
    tx: Prisma.TransactionClient,
    tenantId: string,
    supplierId?: string | null,
  ): Promise<string | null> {
    if (!supplierId) return null;
    const supplier = await tx.supplier.findFirst({
      where: { id: supplierId, tenantId },
      select: { name: true },
    });
    return supplier?.name ?? null;
  }
}

/** Descrizione riga riepilogativa: "Arrivo merce n. 3 del 11/07/2026 - DDT 145 del 08/05/2026". */
export function buildReceiptSummaryDescription(receipt: {
  readonly number: number | null;
  readonly reference: string | null;
  readonly documentDate: Date;
  readonly causalText: string | null;
}): string {
  const dateLabel = receipt.documentDate.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const identifier = receipt.number != null ? String(receipt.number) : (receipt.reference ?? '—');
  const base = `Arrivo merce n. ${identifier} del ${dateLabel}`;
  const causal = receipt.causalText?.trim();
  return causal ? `${base} - ${causal}` : base;
}
