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
import { DocumentPriceModePreferenceService } from '../documents/document-price-mode-preference.service';
import { formatDocumentReference } from '../documents/document-totals.util';
import {
  buildDocumentNumberConflict,
  defaultCounterSeries,
  isDocumentNumberConflict,
  lockDocumentCounter,
  nextDocumentNumber,
} from '../documents/document-numbering.util';
import { computeGoodsReceiptTotals } from '../documents/goods-receipt-vat.util';
import { ExternalDocumentTypesService } from '../documents/external-document-types.service';
import {
  computeVatLineAmounts,
  entryIncludesVat,
  netFromGrossExact,
} from '../vat/vat-line-calculation.util';
import { toStorableMinor } from '../common/money.util';
import { VatCodesService, type VatCodeWithNature } from '../vat/vat-codes.service';
import type {
  CreateSupplierOrderDto,
  CreateSupplierOrderLineDto,
} from './dto/create-supplier-order.dto';
import type { CreateSupplierDto } from './dto/create-supplier.dto';
import type { ListSupplierOrdersQueryDto } from './dto/list-supplier-orders.query.dto';
import type { UpdateSupplierOrderDto } from './dto/update-supplier-order.dto';
import { SuppliersService } from './suppliers.service';
import { parseSupplierOrderSort } from './supplier-orders-sort.util';
import { pageWindow } from '../common/dto/unpaged.util';

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
  /** Fotografia dell'unità di misura al momento dell'ordine. */
  readonly unitOfMeasure: string | null;
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
    private readonly priceModePreference: DocumentPriceModePreferenceService,
    private readonly externalTypes: ExternalDocumentTypesService,
  ) {}

  listSuppliers(tenantId: string): Promise<Supplier[]> {
    return this.suppliers.listAll(tenantId);
  }

  createSupplier(tenantId: string, dto: CreateSupplierDto): Promise<Supplier> {
    return this.suppliers.create(tenantId, dto);
  }

  // Qui viveva `getMeta`, l'anteprima del prossimo riferimento mostrata in coda
  // al titolo della maschera. Calcolava il numero SENZA la sede e SENZA la data
  // del documento, cioè con una regola diversa da quella che lo assegna (§2):
  // in testata il campo Numero ne diceva uno, il sottotitolo un altro, e il
  // secondo era quello che l'operatore leggeva per primo. Il numero vero è uno
  // solo, e sta in testata — non serviva un'anteprima accanto.

  /**
   * Crea un ordine fornitore Confermato: snapshot nome fornitore, SKU e
   * descrizione articolo, costi netto/ivato con sconto e Codice IVA, totali
   * calcolati server-side. NESSUN impatto su giacenze o disponibilità.
   */
  async create(
    tenantId: string,
    dto: CreateSupplierOrderDto,
    user?: UserProfileDto,
  ): Promise<SupplierOrderWithLines> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, tenantId },
      include: { party: true },
    });
    if (!supplier) {
      throw new NotFoundException('Fornitore non trovato');
    }

    const setting = await this.documentSettings.getResolved(tenantId, DocumentType.supplier_order);

    const costEntryMode = dto.costEntryMode ?? 'vat_excluded';
    const computedLines = await this.computeLines(tenantId, dto.lines, costEntryMode);
    // Lo zero fisso che stava qui non era una regola: era il campo che mancava.
    // Il calcolo accetta lo sconto documento da sempre — è condiviso con
    // l'arrivo merce — e da 11/08/2026 l'ordine fornitore ha dove tenerlo.
    const documentDiscountPercent = dto.documentDiscountPercent ?? 0;
    const totals = computeGoodsReceiptTotals(computedLines, documentDiscountPercent);
    const orderDate = dto.orderDate ? new Date(dto.orderDate) : new Date();
    // Serie scelta in testata; assente = la predefinita del tipo. Il campo
    // vuoto è una scelta legittima («Senza serie»), quindi si distingue
    // `undefined` (non passato) da stringa vuota (passato e vuoto).
    const requestedSeries =
      dto.series !== undefined ? (dto.series ?? '').trim() || null : undefined;
    const requestedNumber = dto.number && dto.number > 0 ? dto.number : null;

    const result = await this.prisma
      .$transaction(async (tx) => {
        const series =
          requestedSeries !== undefined
            ? requestedSeries
            : await defaultCounterSeries(
                tx,
                tenantId,
                DocumentType.supplier_order,
                dto.destinationLocationId ?? null,
              );
        // Serializza gli operatori sullo stesso contatore: senza lock due
        // creazioni simultanee leggono lo stesso massimo e il secondo si becca il
        // vincolo unico a lavoro finito. Il lock è transazionale (si rilascia al
        // commit o al rollback) e va preso PRIMA della lettura.
        await lockDocumentCounter(tx, { tenantId, type: DocumentType.supplier_order, series });
        // Numero imposto dalla testata: si scrive com'è, e il vincolo unico fa
        // da giudice. Senza, lo assegna il server prendendo il primo libero.
        const number =
          requestedNumber ??
          (await nextDocumentNumber({
            tx,
            tenantId,
            type: DocumentType.supplier_order,
            series,
            source: 'supplier_order',
            documentDate: orderDate,
            prefix: setting.numberPrefix,
          }));
        const reference = formatDocumentReference(setting.numberPrefix, series, number);

        const order = await tx.supplierOrder.create({
          data: {
            tenantId,
            reference,
            series,
            number,
            supplierId: supplier.id,
            supplierName: partyDisplayName(supplier.party),
            status: SupplierOrderStatus.confirmed,
            currency: dto.currency ?? 'EUR',
            costEntryMode,
            orderDate,
            // Sede di destinazione della merce (§1-bis). La colonna esisteva
            // già, nullable e con la sua chiave esterna: fino al 13/08/2026
            // nessuno ci scriveva.
            destinationLocationId: dto.destinationLocationId ?? null,
            supplierReference: dto.supplierReference?.trim() || null,
            documentDiscountPercent: new Prisma.Decimal(documentDiscountPercent),
            subtotalMinor: totals.subtotalMinor,
            taxMinor: totals.taxMinor,
            totalMinor: totals.totalMinor,
            expectedAt: dto.expectedAt ? new Date(dto.expectedAt) : null,
            lines: {
              create: computedLines.map((line, i) => this.toLineCreateData(line, i + 1)),
            },
          },
          include: { lines: { orderBy: { lineNumber: 'asc' } } },
        });
        return { ...order, linkedDocuments: [] };
      })
      .catch(async (error: unknown) => {
        await this.throwNumberConflict(
          error,
          tenantId,
          requestedSeries,
          requestedNumber,
          orderDate,
          dto.destinationLocationId ?? null,
        );
        throw error;
      });

    // ⚠️ Come nell'Arrivo merce: qui la modalità costo veniva ricordata nella
    // tabella dei prezzi, attraverso il ponte costo↔prezzo. Rimosso il
    // 16/08/2026 — l'ordine fornitore parte sempre netto, e il selettore
    // resta sul documento.

    return result;
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
    // Non passato = quello che l'ordine aveva. Un aggiornamento parziale non
    // deve azzerare uno sconto che nessuno ha toccato.
    const documentDiscountPercent =
      dto.documentDiscountPercent ?? Number(order.documentDiscountPercent);
    const totals = computeGoodsReceiptTotals(computedLines, documentDiscountPercent);
    // Serie e numero in modifica. **In modifica il numero è del documento**, non
    // una proposta: se il client lo manda va scritto, e cambiando serie va
    // riscritto anche il riferimento, o l'ordine resterebbe con il numero della
    // serie vecchia sotto la serie nuova.
    //
    // Il DTO li accettava già mentre `update` non li leggeva: l'operatore
    // cambiava serie su un ordine salvato e non succedeva niente, senza un
    // messaggio. Trovato da una verifica adversariale, non da una prova —
    // nessuna prova copriva un campo che il servizio ignorava.
    const seriesChanged = dto.series !== undefined;
    const numberChanged = dto.number !== undefined && dto.number !== order.number;
    const nextSeries = seriesChanged ? (dto.series ?? '').trim() || null : order.series;
    const nextNumber = numberChanged ? (dto.number ?? null) : order.number;
    const numberingChanged = seriesChanged || numberChanged;
    const numberingSetting = numberingChanged
      ? await this.documentSettings.getResolved(tenantId, DocumentType.supplier_order)
      : null;

    return this.prisma
      .$transaction(async (tx) => {
        await tx.supplierOrderLine.deleteMany({ where: { orderId: id } });
        const updated = await tx.supplierOrder.update({
          where: { id },
          data: {
            supplierId: supplier.id,
            supplierName: partyDisplayName(supplier.party),
            currency: dto.currency ?? order.currency,
            costEntryMode,
            // Il riferimento leggibile si ricompone da prefisso, serie e numero:
            // è derivato, non un dato a sé.
            ...(numberingChanged && numberingSetting
              ? {
                  series: nextSeries,
                  number: nextNumber,
                  reference: formatDocumentReference(
                    numberingSetting.numberPrefix,
                    nextSeries,
                    nextNumber ?? order.number ?? 0,
                  ),
                }
              : {}),
            orderDate: dto.orderDate ? new Date(dto.orderDate) : order.orderDate,
            // Sede di destinazione (§1-bis): assente non la tocca, `null` la
            // toglie. Stessa forma di `supplierReference` qui sotto.
            destinationLocationId:
              dto.destinationLocationId === undefined
                ? order.destinationLocationId
                : (dto.destinationLocationId ?? null),
            supplierReference:
              dto.supplierReference === undefined
                ? order.supplierReference
                : dto.supplierReference?.trim() || null,
            documentDiscountPercent: new Prisma.Decimal(documentDiscountPercent),
            subtotalMinor: totals.subtotalMinor,
            taxMinor: totals.taxMinor,
            totalMinor: totals.totalMinor,
            expectedAt:
              dto.expectedAt === null
                ? null
                : dto.expectedAt
                  ? new Date(dto.expectedAt)
                  : order.expectedAt,
            lines: {
              create: computedLines.map((line, i) => this.toLineCreateData(line, i + 1)),
            },
          },
          include: { lines: { orderBy: { lineNumber: 'asc' } } },
        });
        return { ...updated, linkedDocuments: order.linkedDocuments ?? [] };
      })
      .catch(async (error: unknown) => {
        await this.throwNumberConflict(
          error,
          tenantId,
          seriesChanged ? nextSeries : undefined,
          numberChanged ? nextNumber : null,
          dto.orderDate ? new Date(dto.orderDate) : order.orderDate,
          dto.destinationLocationId ?? order.destinationLocationId,
        );
        throw error;
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
      include: { lines: { orderBy: { lineNumber: 'asc' } } },
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

  /**
   * Il filtro dell'elenco, in **un posto solo**.
   *
   * ⛔ Estratto il 20/08/2026 perché l'export ne ha bisogno identico: se
   * l'elenco e l'export costruissero due `where`, l'operatore che esporta «il
   * risultato filtrato» (`14` §5.3) potrebbe ricevere righe diverse da quelle
   * che sta guardando — e non se ne accorgerebbe, perché il file lo apre dopo.
   *
   * `null` = nessuna sede leggibile: chi chiama restituisce l'insieme vuoto.
   */
  private async buildListWhere(
    tenantId: string,
    query: ListSupplierOrdersQueryDto,
    user?: UserProfileDto,
  ): Promise<Prisma.SupplierOrderWhereInput | null> {
    const locationScope = await resolveReadableListLocationScope(this.prisma, tenantId, user);
    if (locationScope === null) {
      return null;
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

    // Il periodo si applica alla DATA ORDINE, che è quella che l'elenco
    // mostra: filtrare su `createdAt` darebbe un intervallo che non
    // corrisponde alla colonna letta. Estremi inclusivi: `dateTo` copre
    // l'intera giornata.
    const orderDate =
      query.dateFrom || query.dateTo
        ? {
            ...(query.dateFrom ? { gte: new Date(`${query.dateFrom}T00:00:00.000Z`) } : {}),
            ...(query.dateTo ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) } : {}),
          }
        : undefined;

    return {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(orderDate ? { orderDate } : {}),
      ...(andBlocks.length > 0 ? { AND: andBlocks } : {}),
    };
  }

  /**
   * Le righe che l'export deve produrre (`14` §5.3).
   *
   * ```text
   * nessun id  → tutto il risultato dei filtri, senza pagina
   * con id     → soltanto quelli
   * ```
   *
   * ⛔ **Gli id NON scavalcano il filtro di sicurezza**: restano dentro lo
   * stesso `where` di tenant e sedi leggibili. Un elenco di id arriva dal
   * client, e un client può mandarne di qualunque tenant — accettarli così
   * com'è renderebbe l'export una via d'uscita dai permessi.
   *
   * ⚠️ Nessuna paginazione, ed è il punto: il client ha in mano UNA pagina, non
   * il risultato. Un export servito dalle righe caricate darebbe le prime venti
   * di centoventisette senza dirlo.
   */
  async listAllForExport(
    tenantId: string,
    query: ListSupplierOrdersQueryDto,
    user?: UserProfileDto,
    ids?: readonly string[],
  ): Promise<readonly SupplierOrderListRow[]> {
    const base = await this.buildListWhere(tenantId, query, user);
    if (base === null) {
      return [];
    }
    const where: Prisma.SupplierOrderWhereInput =
      ids && ids.length > 0 ? { AND: [base, { id: { in: [...ids] } }] } : base;

    const rows = await this.prisma.supplierOrder.findMany({
      where,
      include: { _count: { select: { lines: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(({ _count, ...order }) => ({ ...order, lineCount: _count.lines, lines: [] }));
  }

  async list(
    tenantId: string,
    query: ListSupplierOrdersQueryDto,
    user?: UserProfileDto,
  ): Promise<Paginated<SupplierOrderListRow>> {
    const where = await this.buildListWhere(tenantId, query, user);
    if (where === null) {
      return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.supplierOrder.findMany({
        where,
        include: { _count: { select: { lines: true } } },
        orderBy: parseSupplierOrderSort(query.sort),
        ...pageWindow(query),
      }),
      this.prisma.supplierOrder.count({ where }),
    ]);

    const items: SupplierOrderListRow[] = rows.map(({ _count, ...order }) => ({
      ...order,
      lineCount: _count.lines,
      lines: [],
    }));

    // ⛔ Nessun tetto sulle righe (deciso il 21/08/2026): con `all` si
    // consegna tutto il risultato del filtro, e a contenerlo è il PERIODO —
    // l'elenco si apre sugli ultimi 30 giorni.
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
        lines: { orderBy: { lineNumber: 'asc' } },
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
  /**
   * Numero già occupato: risponde 409 col conflitto, nella stessa forma degli
   * altri documenti — così la maschera riusa la modale che ha già («Usa nuovo
   * numero / Mantieni attuale / Annulla») senza un secondo formato da imparare.
   */
  private async throwNumberConflict(
    error: unknown,
    tenantId: string,
    series: string | null | undefined,
    requestedNumber: number | null,
    documentDate: Date,
    // La serie si risolve come nella scrittura, sede compresa (§1-bis): il
    // «prossimo libero» dell'avviso si calcola su una partizione, e sbagliarla
    // propone un numero che darà un secondo conflitto.
    locationId?: string | null,
  ): Promise<void> {
    if (!isDocumentNumberConflict(error)) {
      return;
    }
    const setting = await this.documentSettings.getResolved(tenantId, DocumentType.supplier_order);
    const resolvedSeries =
      series !== undefined
        ? series
        : await defaultCounterSeries(
            this.prisma,
            tenantId,
            DocumentType.supplier_order,
            locationId,
          );
    throw new ConflictException(
      await buildDocumentNumberConflict({
        tx: this.prisma,
        tenantId,
        type: DocumentType.supplier_order,
        series: resolvedSeries,
        source: 'supplier_order',
        prefix: setting.numberPrefix,
        requestedNumber,
        // La data governa il primo libero (§2): senza, l'avviso proporrebbe il
        // numero giusto per OGGI e non per la data del documento — cioè
        // scriverebbe in testata un numero calcolato con una regola diversa da
        // quella che ha appena assegnato quello rifiutato.
        documentDate,
      }),
    );
  }

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
        product: { select: { name: true, unitOfMeasure: true } },
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
      // Il costo unitario NETTO è il valore canonico della riga: è da lui che il
      // campo si ridisegna alla riapertura, quindi deve conservare la coda dello
      // scorporo. `amounts.unitNetMinor` la perde perché arrotonda al centesimo
      // — giusto per gli importi che si mostrano, sbagliato per quello che si
      // memorizza: 5,02 ivati al 22% tornerebbero 5,01 (§sei decimali).
      //
      // Il motore condiviso NON si tocca: lo usano anche Arrivo merce e Vendita
      // al banco, e cambiarlo sposterebbe in silenzio ogni documento già
      // registrato. Cambia solo da dove nasce questo singolo valore; imponibile
      // e imposta di riga restano quelli che il motore ha calcolato.
      const unitCostMinor = entryIncludesVat(costEntryMode, vat)
        ? toStorableMinor(netFromGrossExact(line.enteredUnitCostMinor, vat.ratePercent))
        : toStorableMinor(line.enteredUnitCostMinor);
      return {
        variantId: line.variantId,
        sku: variant.sku ?? '',
        description: line.description?.trim() || variant.product.name,
        orderedQuantity: line.orderedQuantity,
        unitCostMinor,
        enteredUnitCostMinor: toStorableMinor(line.enteredUnitCostMinor),
        discountPercent,
        vatCodeId: vatCode?.id ?? null,
        vatSnapshot: vatCode ? this.vatCodes.buildSnapshot(vatCode) : null,
        // Se la riga non la porta vale quella dell'articolo: è il valore che la
        // maschera propone come default, e fotografarlo qui evita che una riga
        // salvata oggi cambi unità perché domani l'anagrafica cambia.
        unitOfMeasure: line.unitOfMeasure?.trim() || variant.product.unitOfMeasure || null,
        lineTotalMinor: amounts.lineNetMinor,
        lineVatTotalMinor: amounts.lineVatMinor,
        vatAffectsSupplierTotal: vat.vatAffectsSupplierTotal,
        effectiveRatePercent: vat.ratePercent,
      };
    });
  }

  /**
   * `position` e' l'indice della riga nel payload, 1-based: l'ordine in cui le
   * righe arrivano E' l'ordine del documento. Va scritto, perche' senza il
   * database le restituisce come gli pare — di norma per inserimento, ma senza
   * nessuna garanzia.
   */
  private toLineCreateData(
    line: ComputedOrderLine,
    position: number,
  ): Prisma.SupplierOrderLineCreateWithoutOrderInput {
    return {
      lineNumber: position,
      variantId: line.variantId,
      sku: line.sku,
      description: line.description,
      orderedQuantity: line.orderedQuantity,
      // Colonne NUMERIC: passano da Prisma.Decimal, altrimenti il float arriva
      // al driver con la sua approssimazione binaria al posto del valore esatto.
      unitCostMinor: new Prisma.Decimal(line.unitCostMinor),
      enteredUnitCostMinor: new Prisma.Decimal(line.enteredUnitCostMinor),
      discountPercent: new Prisma.Decimal(line.discountPercent),
      lineTotalMinor: line.lineTotalMinor,
      unitOfMeasure: line.unitOfMeasure,
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
