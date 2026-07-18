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
  ReservationStatus,
  SalesOrderFulfillmentStatus,
  SalesOrderSource,
  type SalesOrder,
  type SalesOrderLine,
} from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { ChannelSyncFacade } from '../channels/channel-sync.facade';
import { partyDisplayName } from '../common/party/party.util';
import { DOCUMENT_STOCK_UNLOAD_TYPES } from '../documents/document-stock.constants';
import { DocumentSettingsService } from '../documents/document-settings.service';
import { formatDocumentReference, nextDocumentNumber } from '../documents/document-totals.util';
import { assertLocationInUserScope } from '../inventory/user-location-scope.util';
import { StockReservationService } from '../order-reservations/stock-reservation.service';
import { PrismaService } from '../prisma/prisma.service';
import type { VatCodeWithNature } from '../vat/vat-codes.service';
import type { SaveManualSalesOrderDto } from './dto/save-manual-sales-order.dto';
import {
  computeManualOrderLines,
  computeManualOrderTotals,
  isPersistableManualOrderLine,
  type ComputedManualOrderLine,
} from './manual-sales-order.util';

/** Impegno attivo dell'ordine, esposto al form per il calcolo disponibilità. */
export interface ManualOrderReservationRow {
  readonly variantId: string;
  readonly remainingQuantity: number;
}

export interface ManualSalesOrderSaveResult {
  readonly order: SalesOrder & { lines: SalesOrderLine[] };
  readonly reservations: readonly ManualOrderReservationRow[];
  /** Avvisi non bloccanti (§CONTROLLI): righe oltre la disponibilità reale. */
  readonly warnings: readonly string[];
}

export interface ManualSalesOrderMeta {
  /** Anteprima prossimo numero ordine (numeratore dedicato customer_order). */
  readonly nextReferencePreview: string;
  /**
   * Tipi di documento di scarico disponibili per "Concludi ordine": derivati
   * da DOCUMENT_STOCK_UNLOAD_TYPES — nuovi tipi futuri appaiono da soli.
   */
  readonly unloadDocumentTypes: readonly string[];
}

export interface ConcludeManualOrderResult {
  readonly documentId: string;
  readonly documentType: DocumentType;
}

/**
 * Ordine cliente manuale (source = manual) nel registro /app/sales.
 * Il salvataggio esegue in UN'UNICA transazione: testata, righe, totali e
 * allineamento impegni (StockReservationService, unico punto autorizzato a
 * variare la Impegnata). Gli ordini Shopify online/POS restano read-model
 * dei rispettivi connettori: questo servizio li rifiuta esplicitamente.
 */
@Injectable()
export class ManualSalesOrdersService {
  private readonly logger = new Logger(ManualSalesOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reservations: StockReservationService,
    private readonly documentSettings: DocumentSettingsService,
    private readonly channelSync: ChannelSyncFacade,
  ) {}

  async getMeta(tenantId: string): Promise<ManualSalesOrderMeta> {
    const year = new Date().getFullYear();
    const setting = await this.documentSettings.getResolved(
      tenantId,
      DocumentType.customer_order,
    );
    const sequence = await this.prisma.documentSequence.findUnique({
      where: {
        tenantId_type_series_year: {
          tenantId,
          type: DocumentType.customer_order,
          series: setting.defaultSeries,
          year,
        },
      },
    });
    const previewNumber = (sequence?.lastNumber ?? 0) + 1;
    return {
      nextReferencePreview: formatDocumentReference(setting.numberPrefix, year, previewNumber),
      unloadDocumentTypes: DOCUMENT_STOCK_UNLOAD_TYPES,
    };
  }

  /** Impegni attivi dell'ordine (per la Q.tà disponibile in modifica). */
  async listActiveReservations(
    tenantId: string,
    orderId: string,
  ): Promise<readonly ManualOrderReservationRow[]> {
    const rows = await this.prisma.stockReservation.findMany({
      where: { tenantId, salesOrderId: orderId, status: ReservationStatus.active },
      select: { variantId: true, remainingQuantity: true },
    });
    return rows.map((row) => ({
      variantId: row.variantId,
      remainingQuantity: row.remainingQuantity,
    }));
  }

  async save(
    tenantId: string,
    dto: SaveManualSalesOrderDto,
    user?: UserProfileDto,
  ): Promise<ManualSalesOrderSaveResult> {
    const status = dto.status ?? 'confirmed';

    // Righe con quantità 0 o senza prodotto non sono salvabili (regola già
    // stabilita per Arrivo merce, coerente qui): si scartano in silenzio.
    // Un ordine può però esistere con la SOLA testata (cliente + location):
    // le righe sono opzionali; gli impegni scattano quando arriveranno.
    const persistableLines = dto.lines.filter(isPersistableManualOrderLine);

    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, tenantId },
      include: { party: true },
    });
    if (!customer) {
      throw new UnprocessableEntityException('Seleziona un cliente valido per salvare l\'ordine.');
    }

    if (!dto.locationId) {
      throw new UnprocessableEntityException(
        'Seleziona la location di origine per salvare l\'ordine.',
      );
    }
    const location = await this.prisma.location.findFirst({
      where: { id: dto.locationId, tenantId },
      select: { id: true },
    });
    if (!location) {
      throw new UnprocessableEntityException('La location selezionata non esiste più.');
    }
    if (user) {
      assertLocationInUserScope(user, dto.locationId, 'write');
    }

    // Varianti collegate: validate per tenant; Tipo/gestione magazzino decide
    // se la riga PUÒ impegnare (i Servizi non hanno giacenza né Impegnata).
    const variantIds = [
      ...new Set(
        persistableLines.map((line) => line.variantId).filter((id): id is string => Boolean(id)),
      ),
    ];
    const variants = variantIds.length
      ? await this.prisma.productVariant.findMany({
          where: { tenantId, id: { in: variantIds } },
          select: {
            id: true,
            sku: true,
            product: { select: { managesStock: true, kind: true } },
          },
        })
      : [];
    const variantById = new Map(variants.map((variant) => [variant.id, variant]));
    for (const line of persistableLines) {
      if (line.variantId && !variantById.has(line.variantId)) {
        throw new UnprocessableEntityException(
          'Una riga fa riferimento a un articolo non più presente a catalogo.',
        );
      }
    }

    // Codici IVA riga: risolti una volta e fotografati in snapshot (§9).
    const vatCodeIds = [
      ...new Set(
        persistableLines.map((line) => line.vatCodeId).filter((id): id is string => Boolean(id)),
      ),
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
      for (const vatCodeId of vatCodeIds) {
        if (!vatCodesById.has(vatCodeId)) {
          throw new UnprocessableEntityException(
            'Il Codice IVA di una riga non esiste più. Scegli un altro codice.',
          );
        }
      }
    }

    const documentDiscountPercent = dto.documentDiscountPercent ?? 0;
    const computedLines = computeManualOrderLines(persistableLines, vatCodesById);
    const totals = computeManualOrderTotals(computedLines, documentDiscountPercent);

    // Impegno effettivo: segue la spunta della riga, MA mai per prodotti che
    // non gestiscono magazzino (Servizi/non gestiti: niente Impegnata).
    const effectiveCommits = (line: ComputedManualOrderLine): boolean => {
      if (!line.commitsStock || !line.variantId || line.quantity <= 0) {
        return false;
      }
      const variant = variantById.get(line.variantId);
      return variant?.product.managesStock !== false;
    };

    const customerName = partyDisplayName(customer.party) || 'Cliente';
    const documentDate = new Date(dto.documentDate);
    const setting = await this.documentSettings.getResolved(
      tenantId,
      DocumentType.customer_order,
    );

    const syncTargets = new Set<string>();

    const { saved, warnings } = await this.prisma.$transaction(async (tx) => {
      let existing: (SalesOrder & { lines: SalesOrderLine[] }) | null = null;
      if (dto.id) {
        existing = await tx.salesOrder.findFirst({
          where: { id: dto.id, tenantId },
          include: { lines: true },
        });
        if (!existing) {
          throw new NotFoundException('Ordine cliente non trovato');
        }
        if (existing.source !== SalesOrderSource.manual) {
          throw new ConflictException(
            'Solo gli ordini di origine Manuale sono modificabili da questa maschera.',
          );
        }
        // Modifica su sede già assegnata: deve restare nello scope utente.
        if (user && existing.locationId) {
          assertLocationInUserScope(user, existing.locationId, 'write');
        }
      }

      // Ordine evaso (anche parzialmente) da un documento di scarico: la
      // riapertura in modifica è consentita (prompt DDT — l'avviso «collegato
      // a un DDT» vive nella maschera), ma gli impegni consumati NON vengono
      // né ricreati né rilasciati: lo scarico reale è già del documento.
      const isSettled =
        Boolean(existing?.fulfilledAt) ||
        existing?.fulfillmentStatus === SalesOrderFulfillmentStatus.partially_fulfilled;

      // Numero assegnato al primo salvataggio (numeratore dedicato §2.3).
      let orderNumber = existing?.orderNumber ?? null;
      if (!orderNumber) {
        const year = documentDate.getFullYear();
        const number = await nextDocumentNumber(
          tx,
          tenantId,
          DocumentType.customer_order,
          setting.defaultSeries,
          year,
        );
        orderNumber = formatDocumentReference(setting.numberPrefix, year, number);
      }

      const cancelledAt =
        status === 'cancelled' ? (existing?.cancelledAt ?? new Date()) : null;

      const headerData = {
        orderNumber,
        source: SalesOrderSource.manual,
        customerId: customer.id,
        customerName,
        locationId: dto.locationId ?? null,
        externalRef: dto.externalRef?.trim() || null,
        expectedDeliveryDate: dto.expectedDeliveryDate
          ? new Date(dto.expectedDeliveryDate)
          : null,
        notes: dto.notes?.trim() || null,
        paymentTerms: dto.paymentTerms?.trim() || null,
        documentDiscountPercent,
        placedAt: documentDate,
        subtotalMinor: totals.subtotalMinor,
        taxMinor: totals.taxMinor,
        totalMinor: totals.totalMinor,
        discountMinor: totals.discountMinor,
        cancelledAt,
      };

      const order = existing
        ? await tx.salesOrder.update({ where: { id: existing.id }, data: headerData })
        : await tx.salesOrder.create({ data: { tenantId, ...headerData } });

      // Righe: update per id (idempotenza impegni), create per le nuove,
      // delete per le rimosse — il sync impegni rilascia le loro prenotazioni.
      const existingLineIds = new Set((existing?.lines ?? []).map((line) => line.id));
      const seenLineIds = new Set<string>();
      const savedLineIdByIndex = new Map<number, string>();

      for (const line of computedLines) {
        const lineData = {
          variantId: line.variantId,
          sku: line.sku,
          barcode: line.barcode,
          title: line.title,
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          discount: line.discount,
          totalMinor: line.totalMinor,
          lineNumber: line.lineNumber,
          vatCodeId: line.vatCodeId,
          vatSnapshot: line.vatSnapshot ?? Prisma.DbNull,
          lineVatTotalMinor: line.lineVatTotalMinor,
          commitsStock: line.commitsStock,
          unitOfMeasure: line.unitOfMeasure,
        };
        if (line.id && existingLineIds.has(line.id)) {
          await tx.salesOrderLine.update({ where: { id: line.id }, data: lineData });
          seenLineIds.add(line.id);
          savedLineIdByIndex.set(line.lineNumber, line.id);
        } else {
          const created = await tx.salesOrderLine.create({
            data: { orderId: order.id, ...lineData },
          });
          seenLineIds.add(created.id);
          savedLineIdByIndex.set(line.lineNumber, created.id);
        }
      }
      const removedLineIds = [...existingLineIds].filter((id) => !seenLineIds.has(id));
      if (removedLineIds.length > 0) {
        await tx.salesOrderLine.deleteMany({ where: { id: { in: removedLineIds } } });
      }

      // Variazioni disponibilità da spingere ai canali (Shopify §DISPONIBILITÀ).
      for (const reservation of existing
        ? await tx.stockReservation.findMany({
            where: { tenantId, salesOrderId: order.id, status: ReservationStatus.active },
            select: { variantId: true, locationId: true },
          })
        : []) {
        syncTargets.add(`${reservation.variantId}:${reservation.locationId}`);
      }

      // Impegni: Confermato → allineati alle righe con spunta ON; Annullato →
      // tutti rilasciati. Ricalcolo atomico nella stessa transazione (§DISPONIBILITÀ).
      // Ordini evasi (isSettled): impegni consumati intoccati.
      if (isSettled) {
        // Nessuna variazione impegni: lo scarico è già del documento collegato.
      } else if (status === 'confirmed' && dto.locationId) {
        const reservationLines = computedLines.filter(effectiveCommits).map((line) => ({
          salesOrderLineId: savedLineIdByIndex.get(line.lineNumber)!,
          variantId: line.variantId!,
          sku: line.sku || variantById.get(line.variantId!)?.sku || '',
          quantity: line.quantity,
        }));
        await this.reservations.syncOrderReservationsTx(tx, {
          tenantId,
          salesOrderId: order.id,
          channel: SalesOrderSource.manual,
          locationId: dto.locationId,
          externalOrderRef: orderNumber,
          lines: reservationLines,
        });
        for (const line of reservationLines) {
          syncTargets.add(`${line.variantId}:${dto.locationId}`);
        }
      } else {
        await this.reservations.releaseOrderReservationsTx(tx, {
          tenantId,
          salesOrderId: order.id,
          note: status === 'cancelled' ? 'Ordine cliente annullato' : 'Righe senza impegno',
        });
      }

      // Controllo disponibilità NON bloccante (§CONTROLLI): dopo il ricalcolo,
      // una disponibilità negativa segnala righe oltre la giacenza reale.
      const warningMessages: string[] = [];
      if (!isSettled && status === 'confirmed' && dto.locationId) {
        const requestedByVariant = new Map<string, number>();
        for (const line of computedLines.filter(effectiveCommits)) {
          requestedByVariant.set(
            line.variantId!,
            (requestedByVariant.get(line.variantId!) ?? 0) + line.quantity,
          );
        }
        if (requestedByVariant.size > 0) {
          const levels = await tx.inventoryLevel.findMany({
            where: {
              tenantId,
              locationId: dto.locationId,
              variantId: { in: [...requestedByVariant.keys()] },
            },
            select: { variantId: true, available: true },
          });
          const availableByVariant = new Map(
            levels.map((level) => [level.variantId, level.available]),
          );
          for (const line of computedLines.filter(effectiveCommits)) {
            const available = availableByVariant.get(line.variantId!) ?? 0;
            if (available < 0) {
              const requested = requestedByVariant.get(line.variantId!) ?? line.quantity;
              const residual = Math.max(0, requested + available);
              warningMessages.push(
                `Riga ${line.lineNumber} (${line.sku || line.title}): richiesti ${line.quantity}, disponibili solo ${residual}.`,
              );
            }
          }
        }
      }

      const savedOrder = await tx.salesOrder.findUniqueOrThrow({
        where: { id: order.id },
        include: { lines: { orderBy: { lineNumber: 'asc' } } },
      });
      return { saved: savedOrder, warnings: warningMessages };
    });

    await this.pushInventoryTargets(tenantId, syncTargets);

    const reservations = await this.listActiveReservations(tenantId, saved.id);
    this.logger.log(
      `Ordine cliente ${saved.orderNumber} salvato (${tenantId}): stato ${status}, ${saved.lines.length} righe`,
    );
    return { order: saved, reservations, warnings };
  }

  /**
   * "Concludi ordine": genera il documento di scarico scelto, precompilato con
   * le righe dell'ordine (prodotti, quantità, prezzi scontati, IVA), in bozza.
   * L'utente lo verifica e lo salva; alla CONFERMA dello scarico l'ordine passa
   * a Concluso (hook in DocumentsService.confirm: impegni → scarichi reali).
   */
  async conclude(
    tenantId: string,
    orderId: string,
    documentType: string,
    user?: UserProfileDto,
  ): Promise<ConcludeManualOrderResult> {
    if (!(DOCUMENT_STOCK_UNLOAD_TYPES as readonly string[]).includes(documentType)) {
      throw new UnprocessableEntityException(
        'Tipo documento di scarico non disponibile in VestiFlow.',
      );
    }
    const type = documentType as DocumentType;

    const order = await this.prisma.salesOrder.findFirst({
      where: { id: orderId, tenantId },
      include: { lines: { orderBy: { lineNumber: 'asc' } } },
    });
    if (!order) {
      throw new NotFoundException('Ordine cliente non trovato');
    }
    if (order.source !== SalesOrderSource.manual) {
      throw new ConflictException('Solo gli ordini manuali si concludono da questa maschera.');
    }
    if (order.cancelledAt) {
      throw new ConflictException('Un ordine annullato non può essere concluso.');
    }
    if (order.fulfilledAt) {
      throw new ConflictException('Ordine già concluso.');
    }
    if (order.documentId) {
      const linked = await this.prisma.document.findFirst({
        where: { id: order.documentId, tenantId },
        select: { id: true, status: true, type: true },
      });
      if (linked && linked.status !== DocumentStatus.cancelled) {
        // Documento di scarico già generato e ancora attivo: si riusa quello.
        return { documentId: linked.id, documentType: linked.type };
      }
    }
    if (!order.locationId) {
      throw new UnprocessableEntityException(
        'Assegna la location di origine all\'ordine prima di concluderlo.',
      );
    }
    if (user) {
      assertLocationInUserScope(user, order.locationId, 'write');
    }

    const setting = await this.documentSettings.getResolved(tenantId, type);
    const actorName = user?.displayName ?? 'API';

    const document = await this.prisma.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          tenantId,
          type,
          status: DocumentStatus.draft,
          series: setting.defaultSeries,
          year: new Date().getFullYear(),
          documentDate: new Date(),
          customerId: order.customerId,
          customerName: order.customerName,
          locationId: order.locationId,
          notes: order.notes,
          internalComment: `Generato da Concludi ordine ${order.orderNumber}`,
          externalRef: order.externalRef,
          currency: order.currency,
          subtotalMinor: order.subtotalMinor,
          taxMinor: order.taxMinor,
          totalMinor: order.totalMinor,
          // Lo sconto extra documento dell'ordine viaggia con lo scarico:
          // i totali di testata restano coerenti con le righe precompilate.
          documentDiscountPercent: order.documentDiscountPercent,
          createdById: user?.id ?? null,
          createdByName: actorName,
          lines: {
            create: order.lines.map((line, index) => ({
              tenantId,
              lineNumber: index + 1,
              variantId: line.variantId,
              sku: line.sku || null,
              description: line.title,
              quantity: line.quantity,
              // Prezzo unitario SCONTATO (cascata esatta già applicata alla
              // riga ordine): il documento di scarico eredita i prezzi reali.
              unitPriceMinor:
                line.quantity > 0 ? Math.round(line.totalMinor / line.quantity) : 0,
              discountPercent: 0,
              lineTotalMinor: line.totalMinor,
              vatCodeId: line.vatCodeId,
              vatSnapshot: line.vatSnapshot ?? Prisma.DbNull,
              lineVatTotalMinor: line.lineVatTotalMinor,
              lineGrossTotalMinor: line.totalMinor + line.lineVatTotalMinor,
              // Le righe che non impegnano (Servizi/eccezioni) non scaricano.
              loadsStock: line.commitsStock && Boolean(line.variantId),
            })),
          },
        },
        select: { id: true, type: true },
      });

      await tx.salesOrder.update({
        where: { id: order.id },
        data: { documentId: created.id },
      });

      return created;
    });

    this.logger.log(
      `Concludi ordine ${order.orderNumber}: creato ${type} ${document.id} (${tenantId})`,
    );
    return { documentId: document.id, documentType: document.type };
  }

  /**
   * «Forzare lo stato a Concluso?» (prompt DDT §LOGICA MAGAZZINO): un ordine
   * Parzialmente concluso — evaso da un DDT che non copre tutti i prodotti —
   * viene chiuso d'ufficio. Gli eventuali impegni residui vengono rilasciati
   * (merce mai spedita: torna disponibile, nessun movimento di magazzino).
   */
  async forceConclude(
    tenantId: string,
    orderId: string,
    user?: UserProfileDto,
  ): Promise<void> {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: orderId, tenantId },
      select: {
        id: true,
        orderNumber: true,
        source: true,
        cancelledAt: true,
        fulfilledAt: true,
        fulfillmentStatus: true,
        locationId: true,
      },
    });
    if (!order) {
      throw new NotFoundException('Ordine cliente non trovato');
    }
    if (order.source !== SalesOrderSource.manual) {
      throw new ConflictException('Solo gli ordini manuali si concludono da questa maschera.');
    }
    if (order.cancelledAt) {
      throw new ConflictException('Un ordine annullato non può essere concluso.');
    }
    if (order.fulfilledAt) {
      return; // Già concluso: forzatura idempotente.
    }
    if (order.fulfillmentStatus !== SalesOrderFulfillmentStatus.partially_fulfilled) {
      throw new ConflictException(
        'Solo un ordine Parzialmente concluso può essere forzato a Concluso.',
      );
    }
    if (user && order.locationId) {
      assertLocationInUserScope(user, order.locationId, 'write');
    }

    const syncTargets = new Set<string>();
    await this.prisma.$transaction(async (tx) => {
      const active = await tx.stockReservation.findMany({
        where: { tenantId, salesOrderId: order.id, status: ReservationStatus.active },
        select: { variantId: true, locationId: true },
      });
      await this.reservations.releaseOrderReservationsTx(tx, {
        tenantId,
        salesOrderId: order.id,
        note: `Stato forzato a Concluso (ordine ${order.orderNumber})`,
      });
      for (const reservation of active) {
        syncTargets.add(`${reservation.variantId}:${reservation.locationId}`);
      }
      await tx.salesOrder.update({
        where: { id: order.id },
        data: {
          fulfilledAt: new Date(),
          fulfillmentStatus: SalesOrderFulfillmentStatus.fulfilled,
        },
      });
    });
    await this.pushInventoryTargets(tenantId, syncTargets);
    this.logger.log(`Ordine cliente ${order.orderNumber} forzato a Concluso (${tenantId})`);
  }

  private async pushInventoryTargets(
    tenantId: string,
    targets: ReadonlySet<string>,
  ): Promise<void> {
    for (const target of targets) {
      const [variantId, locationId] = target.split(':');
      if (!variantId || !locationId) {
        continue;
      }
      try {
        await this.channelSync.pushInventoryLevels(tenantId, variantId, [locationId]);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Push inventario canale fallito';
        this.logger.warn(`Push inventario non riuscito (${tenantId}): ${message}`);
      }
    }
  }
}
