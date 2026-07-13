import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  DocumentStatus,
  DocumentType,
  MovementOrigin,
  Prisma,
  StockMovementType,
} from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { ChannelSyncFacade } from '../channels/channel-sync.facade';
import { DocumentSettingsService } from '../documents/document-settings.service';
import {
  formatDocumentReference,
  nextDocumentNumber,
} from '../documents/document-totals.util';
import { applyInventoryDelta } from '../inventory/inventory-level-delta.util';
import { assertUserCanAccessLocation } from '../inventory/user-location-scope.util';
import { PrismaService } from '../prisma/prisma.service';

import type { CreateStoreReturnDto } from './dto/create-store-return.dto';
import type { CreateStoreSaleDto } from './dto/create-store-sale.dto';

/** Esito della registrazione vendita/reso per la UI di cassa. */
export interface StoreSaleResult {
  readonly id: string;
  readonly reference: string;
  readonly documentDate: string;
  readonly totalMinor: number;
  readonly currency: string;
  readonly lines: readonly {
    readonly sku: string;
    readonly description: string;
    readonly quantity: number;
    readonly remainingAvailable: number;
  }[];
}

interface ResolvedVariant {
  readonly id: string;
  readonly sku: string;
  readonly barcode: string | null;
  readonly productName: string;
  readonly optionSummary: string;
  readonly vatRatePercent: number | null;
}

/**
 * Cassa negozio (fase 3 §7-§9): Vendita in negozio immediata non fiscale e
 * Reso vendita negozio. La vendita NON crea Ordine cliente né impegni: alla
 * conclusione crea il documento confermato + un movimento `sale` per riga
 * nella stessa transazione. Policy quantità post-audit §3: la disponibilità
 * insufficiente NON blocca mai la vendita (Giacenza/Disponibile possono
 * andare negative); l'avviso non bloccante è responsabilità della UI.
 */
@Injectable()
export class StoreSalesService {
  private readonly logger = new Logger(StoreSalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: DocumentSettingsService,
    private readonly channelSync: ChannelSyncFacade,
  ) {}

  async createSale(
    tenantId: string,
    dto: CreateStoreSaleDto,
    user: UserProfileDto,
  ): Promise<StoreSaleResult> {
    assertUserCanAccessLocation(user, dto.locationId);
    await this.assertLocationExists(tenantId, dto.locationId);

    const variants = await this.resolveVariants(
      tenantId,
      dto.lines.map((line) => line.variantId),
    );

    const customerName = dto.customerId
      ? await this.snapshotCustomerName(tenantId, dto.customerId)
      : null;

    const documentDate = dto.documentDate ? new Date(dto.documentDate) : new Date();
    const setting = await this.settings.getResolved(tenantId, DocumentType.store_sale);
    const actor = {
      createdById: user.id,
      createdByName: user.displayName?.trim() || 'Utente',
    };

    const created = await this.prisma.$transaction(async (tx) => {
      const year = documentDate.getFullYear();
      const series = setting.defaultSeries;
      const number = await nextDocumentNumber(
        tx,
        tenantId,
        DocumentType.store_sale,
        series,
        year,
      );
      const reference = formatDocumentReference(setting.numberPrefix, year, number);

      // Prezzi in cassa IVA inclusa: scorporo per i totali interni.
      const computedLines = dto.lines.map((line, index) => {
        const variant = variants.get(line.variantId)!;
        const discountPercent = line.discountPercent ?? 0;
        const grossTotal = Math.round(
          (line.quantity * line.unitPriceMinor * (100 - discountPercent)) / 100,
        );
        const vatRate = line.vatRatePercent ?? variant.vatRatePercent;
        const tax =
          vatRate && vatRate > 0
            ? grossTotal - Math.round((grossTotal * 100) / (100 + vatRate))
            : 0;
        return {
          lineNumber: index + 1,
          variantId: variant.id,
          sku: variant.sku,
          description: this.lineDescription(variant),
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          discountPercent,
          vatRatePercent: vatRate,
          lineTotalMinor: grossTotal,
          lineVatTotalMinor: tax,
          lineGrossTotalMinor: grossTotal,
          loadsStock: true,
        };
      });

      const totalMinor = computedLines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
      const taxMinor = computedLines.reduce((sum, line) => sum + line.lineVatTotalMinor, 0);

      const doc = await tx.document.create({
        data: {
          tenantId,
          type: DocumentType.store_sale,
          // Creato già confermato: la cassa non ha bozze (§7).
          status: DocumentStatus.confirmed,
          series,
          number,
          year,
          reference,
          documentDate,
          registrationDate: documentDate,
          printTitle: setting.printTitle,
          notes: dto.notes?.trim() || null,
          internalComment:
            'Registrazione interna della vendita. Lo scontrino fiscale viene emesso sulla cassa esterna.',
          customerId: dto.customerId ?? null,
          customerName,
          locationId: dto.locationId,
          paymentMethod: dto.paymentMethod,
          currency: 'EUR',
          subtotalMinor: totalMinor - taxMinor,
          taxMinor,
          totalMinor,
          pricesIncludeVat: true,
          confirmedAt: new Date(),
          createdById: actor.createdById,
          createdByName: actor.createdByName,
          lines: {
            create: computedLines.map((line) => ({ ...line, tenantId })),
          },
        },
        include: { lines: { orderBy: { lineNumber: 'asc' } } },
      });

      // Un movimento negativo per riga: Giacenza −, Disponibile −, Impegnata
      // invariata. UNIQUE (sourceDocumentType, sourceLineId) ⇒ niente doppi.
      // Nessuna guardia: la vendita si registra anche oltre la disponibile (§3).
      for (const line of doc.lines) {
        await applyInventoryDelta(tx, tenantId, line.variantId!, dto.locationId, -line.quantity);
        await tx.stockMovement.create({
          data: {
            tenantId,
            type: StockMovementType.sale,
            origin: MovementOrigin.vestiflow_pos,
            variantId: line.variantId!,
            sku: line.sku ?? '',
            locationId: dto.locationId,
            quantity: line.quantity,
            reason: `Vendita negozio ${reference}`,
            externalRef: doc.id,
            sourceDocumentType: DocumentType.store_sale,
            sourceDocumentId: doc.id,
            sourceLineId: line.id,
            createdById: actor.createdById,
            createdByName: actor.createdByName,
          },
        });
      }

      return doc;
    });

    this.pushInventoryAsync(
      tenantId,
      created.lines.map((line) => line.variantId!),
      dto.locationId,
    );

    return this.toResult(tenantId, dto.locationId, created);
  }

  async createReturn(
    tenantId: string,
    dto: CreateStoreReturnDto,
    user: UserProfileDto,
  ): Promise<StoreSaleResult> {
    assertUserCanAccessLocation(user, dto.locationId);
    await this.assertLocationExists(tenantId, dto.locationId);

    const variants = await this.resolveVariants(
      tenantId,
      dto.lines.map((line) => line.variantId),
    );

    let saleReference: string | null = null;
    if (dto.saleDocumentId) {
      const sale = await this.prisma.document.findFirst({
        where: { id: dto.saleDocumentId, tenantId, type: DocumentType.store_sale },
        select: { reference: true },
      });
      if (!sale) {
        throw new NotFoundException('Vendita negozio origine non trovata.');
      }
      saleReference = sale.reference;
    }

    const documentDate = new Date();
    const setting = await this.settings.getResolved(tenantId, DocumentType.store_return);
    const actor = {
      createdById: user.id,
      createdByName: user.displayName?.trim() || 'Utente',
    };

    const created = await this.prisma.$transaction(async (tx) => {
      const year = documentDate.getFullYear();
      const series = setting.defaultSeries;
      const number = await nextDocumentNumber(
        tx,
        tenantId,
        DocumentType.store_return,
        series,
        year,
      );
      const reference = formatDocumentReference(setting.numberPrefix, year, number);

      const computedLines = dto.lines.map((line, index) => {
        const variant = variants.get(line.variantId)!;
        const unitPriceMinor = line.unitPriceMinor ?? 0;
        return {
          lineNumber: index + 1,
          variantId: variant.id,
          sku: variant.sku,
          description: `${this.lineDescription(variant)}${line.restockable ? '' : ' — non vendibile'}`,
          quantity: line.quantity,
          unitPriceMinor,
          lineTotalMinor: unitPriceMinor * line.quantity,
          lineGrossTotalMinor: unitPriceMinor * line.quantity,
          // loadsStock traccia lo stato vendibile: solo la merce che rientra
          // realmente tra le quantità disponibili genera il movimento (§9).
          loadsStock: line.restockable,
        };
      });

      const totalMinor = computedLines.reduce((sum, line) => sum + line.lineTotalMinor, 0);

      const doc = await tx.document.create({
        data: {
          tenantId,
          type: DocumentType.store_return,
          status: DocumentStatus.confirmed,
          series,
          number,
          year,
          reference,
          documentDate,
          registrationDate: documentDate,
          printTitle: setting.printTitle,
          notes: dto.notes?.trim() || null,
          internalComment: `Causale reso: ${dto.reason.trim()}`,
          locationId: dto.locationId,
          sourceDocumentId: dto.saleDocumentId ?? null,
          currency: 'EUR',
          subtotalMinor: totalMinor,
          taxMinor: 0,
          totalMinor,
          pricesIncludeVat: true,
          confirmedAt: new Date(),
          createdById: actor.createdById,
          createdByName: actor.createdByName,
          lines: {
            create: computedLines.map((line) => ({ ...line, tenantId })),
          },
        },
        include: { lines: { orderBy: { lineNumber: 'asc' } } },
      });

      const saleSuffix = saleReference ? ` — vendita ${saleReference}` : '';
      for (const line of doc.lines) {
        if (!line.loadsStock) {
          // Merce non vendibile: documentata ma NESSUN carico (§9).
          continue;
        }
        await applyInventoryDelta(tx, tenantId, line.variantId!, dto.locationId, line.quantity);
        await tx.stockMovement.create({
          data: {
            tenantId,
            type: StockMovementType.return,
            origin: MovementOrigin.vestiflow_pos,
            variantId: line.variantId!,
            sku: line.sku ?? '',
            locationId: dto.locationId,
            quantity: line.quantity,
            reason: `Reso vendita negozio ${reference}${saleSuffix}: ${dto.reason.trim()}`,
            externalRef: doc.id,
            sourceDocumentType: DocumentType.store_return,
            sourceDocumentId: doc.id,
            sourceLineId: line.id,
            createdById: actor.createdById,
            createdByName: actor.createdByName,
          },
        });
      }

      return doc;
    });

    this.pushInventoryAsync(
      tenantId,
      created.lines.filter((line) => line.loadsStock).map((line) => line.variantId!),
      dto.locationId,
    );

    return this.toResult(tenantId, dto.locationId, created);
  }

  /** Vendite negozio recenti per collegare un reso (ricerca per riferimento). */
  async listRecentSales(
    tenantId: string,
    search: string | undefined,
    user: UserProfileDto,
  ): Promise<
    readonly {
      id: string;
      reference: string | null;
      documentDate: Date;
      totalMinor: number;
      customerName: string | null;
      lines: readonly {
        variantId: string | null;
        sku: string | null;
        description: string;
        quantity: number;
        unitPriceMinor: number;
      }[];
    }[]
  > {
    const docs = await this.prisma.document.findMany({
      where: {
        tenantId,
        type: DocumentType.store_sale,
        ...(user.assignedLocationId ? { locationId: user.assignedLocationId } : {}),
        ...(search
          ? {
              OR: [
                { reference: { contains: search, mode: 'insensitive' } },
                { customerName: { contains: search, mode: 'insensitive' } },
                { lines: { some: { sku: { contains: search, mode: 'insensitive' } } } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        reference: true,
        documentDate: true,
        totalMinor: true,
        customerName: true,
        lines: {
          select: {
            variantId: true,
            sku: true,
            description: true,
            quantity: true,
            unitPriceMinor: true,
          },
          orderBy: { lineNumber: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return docs;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async assertLocationExists(tenantId: string, locationId: string): Promise<void> {
    const location = await this.prisma.location.findFirst({
      where: { id: locationId, tenantId, isActive: true, licensedInVf: true },
      select: { id: true },
    });
    if (!location) {
      throw new NotFoundException('Location non trovata o non operativa.');
    }
  }

  private async resolveVariants(
    tenantId: string,
    variantIds: readonly string[],
  ): Promise<Map<string, ResolvedVariant>> {
    const unique = [...new Set(variantIds)];
    const rows = await this.prisma.productVariant.findMany({
      where: { tenantId, id: { in: unique } },
      select: {
        id: true,
        sku: true,
        barcode: true,
        optionValues: true,
        product: { select: { name: true, defaultVatRatePercent: true } },
      },
    });
    const map = new Map<string, ResolvedVariant>(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          sku: row.sku,
          barcode: row.barcode,
          productName: row.product.name,
          optionSummary: this.optionSummary(row.optionValues),
          vatRatePercent: row.product.defaultVatRatePercent,
        },
      ]),
    );
    const missing = unique.filter((id) => !map.has(id));
    if (missing.length > 0) {
      throw new NotFoundException('Una o più varianti non sono state trovate.');
    }
    return map;
  }

  private optionSummary(optionValues: Prisma.JsonValue): string {
    if (!Array.isArray(optionValues)) {
      return '';
    }
    const parts = optionValues
      .map((entry) =>
        entry && typeof entry === 'object' && 'value' in entry
          ? String((entry as { value: unknown }).value)
          : null,
      )
      .filter((value): value is string => !!value);
    return parts.join(' / ');
  }

  private lineDescription(variant: ResolvedVariant): string {
    return variant.optionSummary
      ? `${variant.productName} — ${variant.optionSummary}`
      : variant.productName;
  }

  private pushInventoryAsync(
    tenantId: string,
    variantIds: readonly string[],
    locationId: string,
  ): void {
    for (const variantId of new Set(variantIds)) {
      void Promise.resolve(
        this.channelSync.pushInventoryLevels(tenantId, variantId, [locationId]),
      ).catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'Push inventario canali fallito';
        this.logger.warn(`Push inventario post-vendita negozio (${tenantId}): ${message}`);
      });
    }
  }

  private async toResult(
    tenantId: string,
    locationId: string,
    doc: {
      id: string;
      reference: string | null;
      documentDate: Date;
      totalMinor: number;
      currency: string;
      lines: readonly {
        variantId: string | null;
        sku: string | null;
        description: string;
        quantity: number;
      }[];
    },
  ): Promise<StoreSaleResult> {
    const variantIds = doc.lines
      .map((line) => line.variantId)
      .filter((id): id is string => id != null);
    const levels = await this.prisma.inventoryLevel.findMany({
      where: { tenantId, locationId, variantId: { in: variantIds } },
      select: { variantId: true, available: true },
    });
    const availableByVariant = new Map(
      levels.map((level) => [level.variantId, level.available]),
    );

    return {
      id: doc.id,
      reference: doc.reference ?? '',
      documentDate: doc.documentDate.toISOString(),
      totalMinor: doc.totalMinor,
      currency: doc.currency,
      lines: doc.lines.map((line) => ({
        sku: line.sku ?? '',
        description: line.description,
        quantity: line.quantity,
        remainingAvailable: line.variantId
          ? (availableByVariant.get(line.variantId) ?? 0)
          : 0,
      })),
    };
  }

  private async snapshotCustomerName(
    tenantId: string,
    customerId: string,
  ): Promise<string | null> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId },
      select: { firstName: true, lastName: true, email: true },
    });
    if (!customer) {
      throw new NotFoundException('Cliente non trovato.');
    }
    const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim();
    return name || customer.email || null;
  }
}
