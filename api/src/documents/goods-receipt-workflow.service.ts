import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  DocumentStatus,
  DocumentType,
  Prisma,
  SupplierOrderStatus,
  type Document,
  type DocumentLine,
} from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { canManageDocumentType, viewableDocumentTypesFor } from '../auth/document-permission.util';
import { TenantPermission } from '../auth/tenant-permission.constants';
import { canViewPurchaseCosts, hasTenantPermission } from '../auth/user-permissions.util';
import { ChannelSyncFacade } from '../channels/channel-sync.facade';
import { applyInventoryLotsFromDocumentLines } from '../inventory/inventory-lot.util';
import { resolveReadableListLocationScope } from '../inventory/licensed-location-scope.util';
import { assertLocationInUserScope } from '../inventory/user-location-scope.util';
import {
  applyInventorySerialsFromDocumentLines,
  assertSerialNumbersForDocumentLines,
} from '../inventory/inventory-serial.util';
import { partyDisplayName } from '../common/party/party.util';
import { PrismaService } from '../prisma/prisma.service';
import { createQuickProductWithVariant } from '../products/quick-product-create.util';
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
import { applyArticlePriceUpdates } from './document-article-price.util';
import { applySupplierPriceUpdates } from './document-supplier-price.util';
import {
  buildDocumentNumberConflict,
  defaultCounterSeries,
  isDocumentNumberConflict,
  lockDocumentCounter,
  resolveDocumentNumber,
} from './document-numbering.util';
import {
  computeGoodsReceiptLines,
  computeGoodsReceiptTotals,
  type ComputedGoodsReceiptLine,
} from './goods-receipt-vat.util';
import { DocumentSettingsService } from './document-settings.service';
import { DocumentPriceModePreferenceService } from './document-price-mode-preference.service';
import { ExternalDocumentTypesService } from './external-document-types.service';
import {
  buildPurchaseInvoiceVatSummary,
  receiptVatBreakdown,
  type VatBreakdownEntry,
} from './purchase-invoice-vat-summary.util';
import { VatCodesService, type VatCodeWithNature } from '../vat/vat-codes.service';
import type { DocumentAddressDto } from './dto/document-transport.dto';
import type { SaveGoodsReceiptDto } from './dto/save-goods-receipt.dto';
import type { SavePurchaseInvoiceDto } from './dto/save-purchase-invoice.dto';

/** Tipi arrivo merce che richiedono il fornitore già alla creazione (§9.2). */
const SUPPLIER_REQUIRED_TYPES: readonly DocumentType[] = INVOICE_LINKABLE_RECEIPT_TYPES;

/**
 * Marcatore della spunta "Seguirà fattura" dell'Arrivo merce: il form la
 * persiste in billingCause con questo testo. Solo gli arrivi così marcati
 * sono includibili in una Registrazione fattura.
 */
const INVOICE_PENDING_BILLING_CAUSE = 'In attesa fattura';

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
  /** Quote IVA dell'arrivo: alimentano le righe per aliquota del form. */
  readonly vatBreakdown: readonly VatBreakdownEntry[];
}

export interface PurchaseInvoiceSaveResult {
  readonly document: Document & { lines: DocumentLine[] };
  readonly receiptsTotalMinor: number;
  readonly totalsMatch: boolean;
}

/**
 * Articolo creato atomicamente da una riga con `newProduct` (punto A).
 * `lineIndex` è la posizione della riga NEL PAYLOAD: il client la usa per
 * riadottare variantId/sku anche quando la riga non produce una riga
 * documento (creazione solo-anagrafica a quantità 0).
 */
export interface GoodsReceiptCreatedProduct {
  readonly lineIndex: number;
  readonly productId: string;
  readonly variantId: string;
  readonly sku: string | null;
  readonly barcode: string | null;
}

export interface GoodsReceiptSaveResult {
  readonly document: Document & { lines: DocumentLine[] };
  readonly createdProducts: readonly GoodsReceiptCreatedProduct[];
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
    private readonly priceModePreference: DocumentPriceModePreferenceService,
  ) {}

  // ── Arrivo merce: salvataggio unico ────────────────────────────────────────

  /**
   * Salvataggio con rete di protezione sul numero: se nel frattempo un altro
   * operatore ha preso quel progressivo, il vincolo unico del database blocca
   * la scrittura e qui l'errore diventa un conflitto leggibile, col primo
   * numero libero da proporre in maschera.
   */
  async saveGoodsReceipt(
    tenantId: string,
    dto: SaveGoodsReceiptDto,
    user?: UserProfileDto,
  ): Promise<GoodsReceiptSaveResult> {
    // Il gate della rotta chiede «gestisci arrivo merce», ma questo salvataggio
    // accetta anche `manual_load` e `initial_load`, che sono famiglia
    // `adjustment`: senza questo controllo chi ha il solo arrivo merce creava
    // carichi manuali, e i movimenti di magazzino che ne derivano, con un
    // permesso che non gli era stato dato. Il tipo lo decide il corpo della
    // richiesta, quindi va verificato qui — prima di ogni effetto.
    this.assertTypeManageable(dto.type, user);
    // Stessa ragione, altro oggetto: le righe possono portare `newProduct`, e
    // quel campo crea un articolo a catalogo — nome, prezzo, costo, Codice IVA
    // e accodamento della pubblicazione sui canali. Con quantità 0 non nasce
    // nemmeno una riga documento: è creazione di anagrafica pura, che dalla sua
    // rotta propria chiede `catalog.manage`. Senza questo controllo bastava un
    // arrivo merce per popolare il catalogo senza quel permesso.
    this.assertNewProductsManageable(dto, user);
    try {
      const result = await this.saveGoodsReceiptInner(tenantId, dto, user);
      // ⚠️ Qui la modalità COSTO veniva ricordata come preferenza
      // dell'operatore, infilandola nella tabella dei PREZZI attraverso un
      // ponte costo↔prezzo. Rimosso il 16/08/2026: i costi partono sempre
      // netti. Non era solo un nome fuorviante — era l'unica ragione per cui
      // `user_document_price_mode_preferences` conteneva anche modalità di
      // acquisto, e reggeva soltanto perché i tipi delle due famiglie non si
      // sovrappongono. Il primo tipo buono per entrambe l'avrebbe rotta in
      // silenzio.
      return result;
    } catch (error) {
      await this.throwNumberConflict(
        error,
        tenantId,
        dto.type,
        dto.series,
        dto.documentDate,
        dto.number ?? null,
        dto.locationId ?? null,
      );
      throw error;
    }
  }

  /**
   * Conflitto sul numero → 409 con il numero rifiutato e il primo libero della
   * serie. `requestedNumber` è il protocollo che la testata ha imposto: senza,
   * il messaggio nominerebbe all'operatore un numero che non ha digitato.
   */
  private async throwNumberConflict(
    error: unknown,
    tenantId: string,
    type: DocumentType,
    series: string | null | undefined,
    documentDate: string,
    requestedNumber: number | null,
    locationId?: string | null,
  ): Promise<never | void> {
    if (!isDocumentNumberConflict(error)) {
      return;
    }
    const setting = await this.settings.getResolved(tenantId, type);
    // ⚠️ La serie si risolve ESATTAMENTE come nella scrittura, sede compresa.
    // Qui passava la serie grezza del DTO: con la testata che non ne sceglie
    // una, il documento veniva scritto sotto il predefinito e il «prossimo
    // libero» dell'avviso si calcolava sulla partizione «senza serie» — cioè
    // proponeva all'operatore un numero che gli avrebbe dato un SECONDO
    // conflitto. Trovato il 13/08/2026 simulando due operatori che salvano
    // insieme; gli altri tre servizi gemelli risolvevano già.
    const resolvedSeries =
      series !== undefined
        ? (series ?? '').trim() || null
        : await defaultCounterSeries(this.prisma, tenantId, type, locationId);
    throw new ConflictException(
      await buildDocumentNumberConflict({
        tx: this.prisma,
        tenantId,
        type,
        series: resolvedSeries,
        source: 'document',
        prefix: setting.numberPrefix,
        requestedNumber,
        // Il primo libero da proporre si calcola sulla data del documento
        // (§2), non su oggi: altrimenti l'avviso suggerirebbe il numero giusto
        // per un'altra giornata.
        documentDate: new Date(documentDate),
      }),
    );
  }

  /**
   * Stessa forma di `DocumentsService.assertDocumentTypeManageable`: senza
   * utente in contesto (chiamate interne, lavori di sistema) non si decide
   * nulla qui — l'autorizzazione l'ha già data chi ha avviato l'operazione.
   */
  private assertTypeManageable(type: DocumentType, user?: UserProfileDto): void {
    if (!user) {
      return;
    }
    if (!canManageDocumentType(user, type)) {
      throw new ForbiddenException('Non hai il permesso di gestire questo tipo di documento.');
    }
  }

  /**
   * Creazione articolo dalla riga (`newProduct`): il permesso è quello del
   * catalogo, non quello del documento. Vale solo per le righe che creano
   * davvero — una riga già collegata a una variante può riportare `newProduct`
   * di ritorno dal client (riadozione di variantId/sku dopo il primo
   * salvataggio) e non deve trasformare una modifica in un rifiuto.
   * Senza utente in contesto non si decide: le chiamate interne e i lavori di
   * sistema sono già stati autorizzati a monte.
   */
  private assertNewProductsManageable(dto: SaveGoodsReceiptDto, user?: UserProfileDto): void {
    if (!user) {
      return;
    }
    const createsProducts = (dto.lines ?? []).some((line) => !line.variantId && line.newProduct);
    if (!createsProducts) {
      return;
    }
    if (!hasTenantPermission(user, TenantPermission.CatalogManage)) {
      throw new ForbiddenException(
        'Non hai il permesso di creare articoli a catalogo: seleziona un articolo esistente.',
      );
    }
  }

  /**
   * Arrivi merce inclusi in una registrazione fattura: il permesso è quello
   * della famiglia `goods_receipt`, che la rotta della fattura non chiede.
   * Basta la famiglia dell'arrivo merce perché gli unici tipi collegabili sono
   * `INVOICE_LINKABLE_RECEIPT_TYPES` (oggi il solo `goods_receipt`) e il
   * controllo più sotto rifiuta ogni altro tipo: se un giorno quella costante
   * accogliesse altri tipi, questo controllo va esteso alle loro famiglie.
   * Senza utente in contesto non si decide (chiamate interne, lavori di sistema).
   */
  private assertLinkedReceiptsManageable(
    goodsReceiptIds: readonly string[] | undefined,
    user?: UserProfileDto,
  ): void {
    if (!user || !goodsReceiptIds || goodsReceiptIds.length === 0) {
      return;
    }
    if (!canManageDocumentType(user, DocumentType.goods_receipt)) {
      throw new ForbiddenException(
        'Non hai il permesso di gestire gli arrivi merce da collegare alla fattura.',
      );
    }
  }

  private async saveGoodsReceiptInner(
    tenantId: string,
    dto: SaveGoodsReceiptDto,
    user?: UserProfileDto,
  ): Promise<GoodsReceiptSaveResult> {
    if (!(DOCUMENT_STOCK_LOAD_TYPES as readonly string[]).includes(dto.type)) {
      throw new UnprocessableEntityException(
        'Questo salvataggio è riservato ai documenti di arrivo merce / carico.',
      );
    }

    const setting = await this.settings.getResolved(tenantId, dto.type);

    if ((SUPPLIER_REQUIRED_TYPES as readonly string[]).includes(dto.type) && !dto.supplierId) {
      throw new UnprocessableEntityException(
        "Seleziona un fornitore prima di salvare l'arrivo merce.",
      );
    }

    await this.assertSupplier(tenantId, dto.supplierId);
    await this.assertLocation(tenantId, dto.locationId);
    // La sede di destinazione (creazione, o nuova sede su modifica) deve
    // essere nello scope dell'utente: titolare/hasAllLocationsAccess sempre
    // ammessi, altrimenti solo le sedi esplicitamente assegnate.
    if (user && dto.locationId) {
      assertLocationInUserScope(user, dto.locationId, 'write');
    }

    // Codici IVA delle righe: risolti una volta, validati per tenant (§9).
    // Include anche i Codici IVA dei nuovi articoli (creazione atomica, punto A).
    const costEntryMode = dto.purchaseCostEntryMode ?? 'vat_excluded';
    const requestedVatCodeIds = [
      ...new Set(
        (dto.lines ?? []).map((line) => line.vatCodeId).filter((id): id is string => id != null),
      ),
    ];
    const newProductVatCodeIds = [
      ...new Set(
        (dto.lines ?? [])
          .map((line) => line.newProduct?.vatCodeId)
          .filter((id): id is string => id != null),
      ),
    ];
    const allVatCodeIds = [...new Set([...requestedVatCodeIds, ...newProductVatCodeIds])];
    const vatCodesById = new Map<string, VatCodeWithNature>();
    if (allVatCodeIds.length > 0) {
      const found = await this.prisma.vatCode.findMany({
        where: { tenantId, id: { in: allVatCodeIds }, deletedAt: null },
        include: { nature: true },
      });
      for (const vatCode of found) {
        vatCodesById.set(vatCode.id, vatCode);
      }
      this.assertPurchaseVatCodes(dto, requestedVatCodeIds, vatCodesById);
      for (const vatCodeId of newProductVatCodeIds) {
        if (!vatCodesById.has(vatCodeId)) {
          throw new UnprocessableEntityException(
            'Il Codice IVA del nuovo articolo non esiste più. Scegli un altro codice.',
          );
        }
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

    // Punto B: un nuovo articolo dichiarato non gestito a magazzino non
    // carica mai giacenza — la riga resta solo economica, senza movimento.
    for (const line of computedLines) {
      if (line.newProduct?.managesStock === false) {
        line.loadsStock = false;
      }
    }

    // Punto B: varianti già a catalogo di prodotti non gestiti a magazzino
    // → carico forzato a false lato server, qualunque cosa dica il client.
    const linkedVariantIds = [
      ...new Set(
        computedLines.map((line) => line.variantId).filter((id): id is string => id != null),
      ),
    ];
    const knownVariants = linkedVariantIds.length
      ? await this.prisma.productVariant.findMany({
          where: { tenantId, id: { in: linkedVariantIds } },
          select: { id: true, product: { select: { managesStock: true } } },
        })
      : [];
    const managesStockByVariantId = new Map(
      knownVariants.map((variant) => [variant.id, variant.product.managesStock ?? true]),
    );
    for (const line of computedLines) {
      if (line.variantId && managesStockByVariantId.get(line.variantId) === false) {
        line.loadsStock = false;
      }
    }

    // Validazione righe che caricano magazzino (§2.8): errori chiari, mai
    // tecnici. Le righe con `newProduct` sono valide anche senza variante:
    // l'articolo nasce DENTRO la transazione (punto A).
    const stockLines = computedLines.filter((line) => line.loadsStock && line.quantity > 0);
    if (stockLines.length > 0) {
      if (!dto.locationId) {
        throw new UnprocessableEntityException(
          'Seleziona il magazzino di destinazione: serve per caricare la giacenza delle righe.',
        );
      }
      for (const line of stockLines) {
        if (!line.variantId && !line.newProduct?.name.trim()) {
          throw new UnprocessableEntityException(INVALID_LINE_MESSAGE(line.lineNumber));
        }
        if (line.variantId && !managesStockByVariantId.has(line.variantId)) {
          throw new UnprocessableEntityException(INVALID_LINE_MESSAGE(line.lineNumber));
        }
      }
    }

    const documentDate = new Date(dto.documentDate);
    const actor = {
      createdById: user?.id ?? null,
      createdByName: user?.displayName ?? 'API',
    };

    // Tipo documento controparte: validato per tenant e fotografato in snapshot
    // (lo storico resta leggibile anche se il tipo viene rinominato, §13).
    //
    // La lettura vede ANCHE i tipi eliminati, ed e' voluto: eliminare un tipo lo
    // toglie dalle tendine, non dai documenti che lo portano. Con `getById`
    // (che filtra i cancellati) riaprire e risalvare un vecchio arrivo merce
    // darebbe 404 — e prima ancora, sotto, azzererebbe id e snapshot insieme,
    // cancellando dall'elenco la dicitura «DDT 145 del 08/05/2026».
    const externalDocumentType = dto.externalDocumentTypeId
      ? await this.externalTypes.findByIdIncludingDeleted(tenantId, dto.externalDocumentTypeId)
      : null;
    if (dto.externalDocumentTypeId && !externalDocumentType) {
      throw new NotFoundException('Tipo documento controparte non trovato');
    }

    let syncTargets: readonly { variantId: string; locationId: string }[] = [];
    const createdProducts: GoodsReceiptCreatedProduct[] = [];

    // Costo d'acquisto del nuovo articolo: dato riservato a
    // `catalog.view_purchase_costs`, stessa regola della maschera articolo e
    // dell'importazione CSV (chi non lo vede non lo scrive). Senza di questo
    // il campo mascherato altrove rientrava a catalogo dalla riga documento.
    // Senza utente in contesto non si decide: le chiamate interne conservano
    // il costo che hanno calcolato.
    const canWriteCosts = !user || canViewPurchaseCosts(user);

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
          dto.supplierOrderId !== undefined &&
          existing.supplierOrderId &&
          dto.supplierOrderId !== existing.supplierOrderId
        ) {
          throw new ConflictException(
            'Questo documento è già collegato a un altro ordine fornitore.',
          );
        }
        // Modifica di un arrivo merce esistente: l'utente deve poter operare
        // anche sulla sede attuale del documento (non solo sulla nuova),
        // altrimenti potrebbe alterare un documento fuori dal proprio scope
        // limitandosi a non cambiarne la location.
        if (user && existing.locationId) {
          assertLocationInUserScope(user, existing.locationId, 'write');
        }
      }

      // Mappa «Includi documento»: l'Arrivo merce può includere solo ordini
      // fornitore Confermati. Un ordine già Concluso è agganciato a un altro
      // arrivo; il documento già collegato allo STESSO ordine resta valido.
      if (dto.supplierOrderId && dto.supplierOrderId !== existing?.supplierOrderId) {
        const linkedOrder = await tx.supplierOrder.findFirst({
          where: { id: dto.supplierOrderId, tenantId },
          select: { status: true },
        });
        if (!linkedOrder) {
          throw new NotFoundException('Ordine fornitore non trovato');
        }
        if (linkedOrder.status !== SupplierOrderStatus.confirmed) {
          throw new ConflictException(
            'Solo ordini fornitore confermati (non ancora conclusi) possono essere agganciati a un arrivo merce.',
          );
        }
      }

      const supplierName = await this.snapshotSupplierName(tx, tenantId, dto.supplierId);
      const series =
        dto.series !== undefined
          ? (dto.series ?? '').trim() || null
          : existing
            ? existing.series
            : await defaultCounterSeries(tx, tenantId, dto.type, dto.locationId ?? null);
      const year = documentDate.getFullYear();

      // Numero interno progressivo assegnato al primo salvataggio (§9.1-9.2).
      // Il numero si assegna SEMPRE al primo salvataggio: qui il documento
      // nasce già confermato, e senza numero finiva in elenco come «Serie A
      // (non numerato)». Se l'operatore ne ha imposto uno dalla testata si usa
      // quello, altrimenti il primo libero della serie.
      let number = existing?.number ?? null;
      let reference = existing?.reference ?? null;
      if (number == null) {
        const requestedNumber = dto.number && dto.number > 0 ? dto.number : null;
        if (requestedNumber == null) {
          // Numero automatico: il lock serializza gli operatori sullo stesso
          // contatore, così il secondo legge un massimo aggiornato invece di
          // scoprire la collisione dal vincolo unico a lavoro finito. Si
          // rilascia al commit (o al rollback) di questa transazione.
          // Un numero imposto dalla testata non passa di qui: non legge alcun
          // massimo, e il conflitto lì è l'informazione utile all'operatore.
          await lockDocumentCounter(tx, { tenantId, type: dto.type, series });
        }
        const assigned = await resolveDocumentNumber({
          tx,
          tenantId,
          type: dto.type,
          series,
          source: 'document',
          prefix: setting.numberPrefix,
          requestedNumber,
          documentDate,
        });
        number = assigned.number;
        reference = assigned.reference;
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
        // Se il DTO non porta il tipo, il documento tiene il proprio: un client
        // che non conosce il campo non deve poter cancellare uno snapshot.
        ...(dto.externalDocumentTypeId === undefined
          ? {
              externalDocumentTypeId: existing?.externalDocumentTypeId ?? null,
              externalDocumentTypeSnapshot: existing?.externalDocumentTypeSnapshot ?? null,
            }
          : {
              externalDocumentTypeId: externalDocumentType?.id ?? null,
              externalDocumentTypeSnapshot: externalDocumentType?.shortLabel ?? null,
            }),
        externalDocNumber: dto.externalDocNumber?.trim() || null,
        externalDocDate: dto.externalDocDate ? new Date(dto.externalDocDate) : null,
        notes: dto.notes ?? existing?.notes ?? setting.defaultNotes,
        internalComment: dto.internalComment?.trim() || null,
        billingCause: dto.billingCause?.trim() || null,
        paymentMethod: dto.paymentMethod?.trim() || null,
        supplierOrderId: dto.supplierOrderId ?? existing?.supplierOrderId ?? null,
        currency: dto.currency ?? existing?.currency ?? 'EUR',
        // Documento di ACQUISTO: il prezzo di vendita non c’entra, e la
        // modalità che conta è quella del costo, qui sotto. Prima veniva dal
        // default per tipo documento, che per questi tipi valeva comunque
        // sempre `false`.
        pricesIncludeVat: false,
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

      // ── Creazione atomica articoli (punto A): Product + variante tecnica
      // nascono NELLA STESSA transazione di testata, righe e movimenti. Se un
      // passo successivo fallisce, il rollback non lascia anagrafiche orfane.
      const registryOnlyIndexes = new Set<number>();
      for (let index = 0; index < computedLines.length; index += 1) {
        const line = computedLines[index] as ComputedGoodsReceiptLine;
        if (line.variantId || !line.newProduct) {
          continue;
        }
        const created = await createQuickProductWithVariant(tx, tenantId, {
          name: line.newProduct.name,
          sku: line.newProduct.sku ?? line.sku,
          barcode: line.newProduct.barcode,
          sellingPriceMinor: line.newProduct.sellingPriceMinor,
          compareAtPriceMinor: line.newProduct.compareAtPriceMinor,
          purchasePriceMinor: canWriteCosts ? line.newProduct.purchasePriceMinor : null,
          vatCodeId: line.newProduct.vatCodeId,
          managesStock: line.newProduct.managesStock,
          currency: dto.currency ?? existing?.currency ?? 'EUR',
          unitOfMeasure: line.newProduct.unitOfMeasure,
        });
        createdProducts.push({
          lineIndex: index,
          productId: created.productId,
          variantId: created.variantId,
          sku: created.sku,
          barcode: created.barcode,
        });
        line.variantId = created.variantId;
        line.sku = created.sku;
        if (!created.managesStock) {
          line.loadsStock = false;
        }
        // Solo-anagrafica (punto A): quantità 0 al salvataggio esplicito →
        // l'articolo nasce, ma nessuna riga documento viene scritta.
        if (line.quantity <= 0) {
          registryOnlyIndexes.add(index);
        }
      }

      const persistedLines: ComputedGoodsReceiptLine[] = [];
      const persistedLineIds: (string | null)[] = [];
      for (let index = 0; index < computedLines.length; index += 1) {
        if (registryOnlyIndexes.has(index)) {
          continue;
        }
        persistedLines.push(computedLines[index] as ComputedGoodsReceiptLine);
        persistedLineIds.push(lineIds[index] ?? null);
      }
      // Rinumerazione progressiva dopo l'esclusione delle righe solo-anagrafica.
      for (let index = 0; index < persistedLines.length; index += 1) {
        (persistedLines[index] as ComputedGoodsReceiptLine).lineNumber = index + 1;
      }

      // ── Upsert righe per id: preservare l'id riga è ciò che consente di
      // aggiornare il movimento collegato invece di duplicarlo (§2.3-2.4).
      const existingLineIds = new Set((existing?.lines ?? []).map((line) => line.id));
      const incomingIds = new Set(
        persistedLineIds.filter((id): id is string => id != null && existingLineIds.has(id)),
      );

      await tx.documentLine.deleteMany({
        where: { documentId, id: { notIn: [...incomingIds] } },
      });

      for (let index = 0; index < persistedLines.length; index += 1) {
        const line = persistedLines[index] as ComputedGoodsReceiptLine;
        const lineId = persistedLineIds[index];
        const data = {
          lineNumber: line.lineNumber,
          variantId: line.variantId,
          sku: line.sku,
          description: line.description,
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          discountPercent: line.discountPercent,
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
          unitOfMeasure: line.unitOfMeasure,
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
        // L'aggancio marca l'ordine fornitore Concluso (prompt 2026-07).
        const oldLinesForOrder =
          existing && existing.status !== DocumentStatus.draft ? existing.lines : [];
        await reconcileSupplierOrderReceipt(tx, supplierOrderId, oldLinesForOrder, savedLines);
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
        dto.updateArticleCost === true,
      );

      // Prezzi di anagrafica (fetta 2). Spunta accesa di default: senza, i
      // campi sono in sola lettura in maschera e qui non arriva niente.
      // La politica Shopify è quella dell'anagrafica prodotti, riusata.
      const updateArticlePrices = dto.updateArticlePrices !== false;
      if (updateArticlePrices) {
        await applyArticlePriceUpdates(
          tx,
          tenantId,
          (dto.lines ?? []).map((line) => ({
            variantId: line.variantId ?? null,
            sellingPriceMinor: line.sellingPriceMinor,
            shopifyPriceMinor: line.shopifyPriceMinor,
          })),
          { updateArticlePrices },
        );
      }

      if (existing && sync.deltas.length > 0) {
        await this.recordRevision(tx, tenantId, documentId, sync.deltas, actor);
      }

      // "Totali da verificare" (§15): se i totali di un arrivo già collegato
      // a una fattura registrata cambiano, il collegamento viene marcato in
      // modo persistente finché la fattura non viene ricontrollata.
      const totalsChanged =
        existing != null &&
        (existing.subtotalMinor !== totals.subtotalMinor ||
          existing.taxMinor !== totals.taxMinor ||
          existing.totalMinor !== totals.totalMinor);
      if (totalsChanged) {
        await tx.purchaseInvoiceGoodsReceiptLink.updateMany({
          where: {
            goodsReceiptId: documentId,
            purchaseInvoice: { status: { not: DocumentStatus.cancelled } },
          },
          data: { totalsCheckPending: true },
        });
      }

      return tx.document.findFirstOrThrow({
        where: { id: documentId, tenantId },
        include: { lines: { orderBy: { lineNumber: 'asc' } } },
      });
    });

    await this.pushInventory(tenantId, syncTargets);
    // Push canali dei nuovi articoli SOLO dopo il commit (mai in transazione):
    // se il salvataggio fosse fallito non esisterebbe nulla da pubblicare.
    for (const created of createdProducts) {
      this.channelSync.enqueueProductPush(tenantId, created.productId);
    }
    return { document: saved, createdProducts };
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

  /**
   * Arrivi merce includibili in una registrazione fattura (§5.1, §9.6):
   * solo quelli con la spunta "Seguirà fattura" attiva nel documento.
   */
  async listLinkableGoodsReceipts(
    tenantId: string,
    supplierId: string,
    excludeInvoiceId?: string,
    user?: UserProfileDto,
  ): Promise<LinkableGoodsReceiptRow[]> {
    // Il lookup espone testate di arrivo merce complete di totali: vale la
    // stessa regola del registro — famiglie consultabili e sedi leggibili.
    const viewableTypes = user ? viewableDocumentTypesFor(user) : null;
    const linkableTypes = viewableTypes
      ? INVOICE_LINKABLE_RECEIPT_TYPES.filter((type) => viewableTypes.includes(type))
      : [...INVOICE_LINKABLE_RECEIPT_TYPES];
    if (linkableTypes.length === 0) {
      return [];
    }
    const locationScope = await resolveReadableListLocationScope(this.prisma, tenantId, user);
    if (locationScope === null) {
      return [];
    }

    const rows = await this.prisma.document.findMany({
      where: {
        tenantId,
        supplierId,
        type: { in: linkableTypes },
        ...(locationScope === 'unrestricted'
          ? {}
          : { OR: [{ locationId: null }, { locationId: { in: [...locationScope] } }] }),
        status: { notIn: [DocumentStatus.draft, DocumentStatus.cancelled] },
        totalMinor: { gt: 0 },
        billingCause: INVOICE_PENDING_BILLING_CAUSE,
        purchaseInvoiceLinks: {
          none: {
            purchaseInvoice: {
              status: { not: DocumentStatus.cancelled },
              ...(excludeInvoiceId ? { id: { not: excludeInvoiceId } } : {}),
            },
          },
        },
      },
      include: {
        location: { select: { name: true } },
        lines: {
          select: { lineTotalMinor: true, lineVatTotalMinor: true, vatSnapshot: true },
        },
      },
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
      vatBreakdown: receiptVatBreakdown(row),
    }));
  }

  /**
   * Salva la registrazione fattura (§5-6): crea/aggiorna il documento
   * supplier_invoice, le righe riepilogative e i collegamenti agli arrivi.
   * NON genera mai movimenti di magazzino.
   */
  /**
   * Come l'arrivo merce: il conflitto sul protocollo diventa un 409 leggibile,
   * con il primo numero libero. Senza questa rete il P2002 del vincolo unico
   * risaliva grezzo — nessun filtro globale lo mappa — e la maschera, che il
   * dialogo del conflitto ce l'ha, mostrava un errore imprevisto senza dire
   * quale numero fosse libero.
   */
  async savePurchaseInvoice(
    tenantId: string,
    dto: SavePurchaseInvoiceDto,
    user?: UserProfileDto,
  ): Promise<PurchaseInvoiceSaveResult> {
    // Il gate della rotta chiede «gestisci registrazione fattura», ma il corpo
    // può portare `goodsReceiptIds`: collegarli agisce su documenti di un'ALTRA
    // famiglia — li marca fatturati (togliendoli dalla lista dei collegabili),
    // ne azzera il flag «Totali da verificare», e toglierli dall'elenco li
    // riporta Sospesi. Senza questo controllo chi registra le fatture cambiava
    // lo stato degli arrivi merce senza averne il permesso.
    //
    // Sta PRIMA del try, non dentro: un permesso negato non è un conflitto di
    // numerazione, e non deve passare per la diagnosi che traduce l'errore.
    this.assertLinkedReceiptsManageable(dto.goodsReceiptIds, user);
    try {
      return await this.savePurchaseInvoiceInner(tenantId, dto, user);
    } catch (error) {
      await this.throwNumberConflict(
        error,
        tenantId,
        DocumentType.supplier_invoice,
        dto.series,
        dto.documentDate,
        dto.number ?? null,
      );
      throw error;
    }
  }

  private async savePurchaseInvoiceInner(
    tenantId: string,
    dto: SavePurchaseInvoiceDto,
    user?: UserProfileDto,
  ): Promise<PurchaseInvoiceSaveResult> {
    const setting = await this.settings.getResolved(tenantId, DocumentType.supplier_invoice);
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
            lines: {
              select: { lineTotalMinor: true, lineVatTotalMinor: true, vatSnapshot: true },
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

    const receiptsTotal = receipts.reduce((sum, receipt) => sum + receipt.totalMinor, 0);

    // Righe per aliquota IVA dagli arrivi inclusi + righe manuali del form.
    const vatSummaryLines = buildPurchaseInvoiceVatSummary(receipts);
    const manualLines = dto.manualLines ?? [];
    const linesNet =
      vatSummaryLines.reduce((sum, line) => sum + line.netMinor, 0) +
      manualLines.reduce((sum, line) => sum + line.netMinor, 0);
    const linesVat =
      vatSummaryLines.reduce((sum, line) => sum + line.vatMinor, 0) +
      manualLines.reduce((sum, line) => sum + line.vatMinor, 0);

    // Totali sempre derivati dalle righe; fallback ai totali del payload solo
    // per registrazioni senza righe (compatibilità con vecchi client).
    const hasLines = vatSummaryLines.length > 0 || manualLines.length > 0;
    const subtotalMinor = hasLines ? linesNet : (dto.subtotalMinor ?? 0);
    const taxMinor = hasLines ? linesVat : (dto.taxMinor ?? 0);
    const totalMinor = hasLines ? linesNet + linesVat : (dto.totalMinor ?? 0);

    // Scadenze di pagamento: il residuo "Ancora da saldare" è denormalizzato.
    const installments = dto.installments ?? [];
    const settledMinor = installments
      .filter((installment) => installment.settled === true)
      .reduce((sum, installment) => sum + installment.amountMinor, 0);
    const outstandingMinor = Math.max(0, totalMinor - settledMinor);

    const documentDate = new Date(dto.documentDate);
    const actor = {
      createdById: user?.id ?? null,
      createdByName: user?.displayName ?? 'API',
    };

    // Tipo del documento ricevuto dal fornitore, risolto fuori dalla
    // transazione. `resolveForWrite` vede anche i tipi eliminati, ed è voluto:
    // eliminare un tipo lo toglie dalle tendine, non dalle registrazioni che lo
    // portano — risalvare una vecchia fattura darebbe altrimenti 404, e la
    // dicitura «Fatt. 145 del 08/05/2026» sparirebbe dall'elenco.
    //
    // `undefined` resta distinto da `null`: il primo significa «il client non
    // conosce il campo» e lascia in pace ciò che è già scritto, il secondo è
    // una cancellazione voluta dall'operatore.
    const resolvedExternalType =
      dto.externalDocumentTypeId !== undefined
        ? await this.externalTypes.resolveForWrite(tenantId, dto.externalDocumentTypeId)
        : null;

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
      // Serie scelta in testata; in mancanza resta quella del documento o quella
      // del contatore predefinito.
      //
      // **Senza sede, e non è una dimenticanza** (§1-bis): la Registrazione
      // fattura fornitore non ha il campo Sede, perché la fattura è intestata
      // all'azienda — una sola partita IVA, un solo registro acquisti — e una
      // sola fattura può coprire arrivi merce di sedi diverse. Restano quindi
      // disponibili i contatori senza sede, che per la regola valgono ovunque.
      const series =
        dto.series !== undefined
          ? (dto.series ?? '').trim() || null
          : existing
            ? existing.series
            : await defaultCounterSeries(tx, tenantId, DocumentType.supplier_invoice, null);
      const year = documentDate.getFullYear();

      let number = existing?.number ?? null;
      let reference = existing?.reference ?? null;
      // Protocollo assente (nuovo documento), imposto a mano o serie cambiata:
      // si (ri)assegna. Un numero imposto non sposta il progressivo di serie.
      const protocolChanged = dto.number != null && dto.number !== number;
      const seriesChanged = existing != null && series !== existing.series;
      if (number == null || protocolChanged || seriesChanged) {
        const requestedNumber = dto.number && dto.number > 0 ? dto.number : null;
        if (requestedNumber == null) {
          // Protocollo automatico: stesso lock dell'arrivo merce, preso prima di
          // leggere il massimo e dentro questa transazione. Il protocollo
          // imposto a mano non lo prende: non legge il massimo, e un suo
          // conflitto va mostrato all'operatore, non risolto in silenzio.
          await lockDocumentCounter(tx, { tenantId, type: DocumentType.supplier_invoice, series });
        }
        const assigned = await resolveDocumentNumber({
          tx,
          tenantId,
          type: DocumentType.supplier_invoice,
          series,
          source: 'document',
          prefix: setting.numberPrefix,
          requestedNumber,
          // Qui la data serve più che altrove: registrare oggi una fattura di
          // due settimane fa è il caso normale, non l'eccezione. Senza, il
          // numero usciva dal massimo «a oggi» mentre la testata proponeva
          // quello della data della fattura (§2).
          documentDate,
        });
        number = assigned.number;
        reference = assigned.reference;
      }

      const headerData = {
        series,
        year,
        number,
        reference,
        status: DocumentStatus.confirmed,
        confirmedAt: existing?.confirmedAt ?? new Date(),
        // Data registrazione: default oggi, modificabile dal form.
        registrationDate: dto.registrationDate
          ? new Date(dto.registrationDate)
          : (existing?.registrationDate ?? new Date()),
        documentDate,
        printTitle: setting.printTitle,
        supplierId: dto.supplierId,
        supplierName,
        externalDocNumber: dto.externalDocNumber?.trim() || null,
        // La data della fattura è la Data documento: lo snapshot esterno resta
        // allineato per le etichette "Fattura forn. n. X del …".
        externalDocDate: dto.externalDocDate ? new Date(dto.externalDocDate) : documentDate,
        ...(resolvedExternalType ?? {
          externalDocumentTypeId: existing?.externalDocumentTypeId ?? null,
          externalDocumentTypeSnapshot: existing?.externalDocumentTypeSnapshot ?? null,
        }),
        notes: dto.notes ?? existing?.notes ?? setting.defaultNotes,
        internalComment: dto.internalComment?.trim() || null,
        paymentMethod: dto.paymentMethod?.trim() || null,
        recipientAddress: purchaseInvoiceAddressToJson(
          dto.recipientAddress,
          existing?.recipientAddress,
        ),
        currency: dto.currency ?? existing?.currency ?? 'EUR',
        // Fattura fornitore: documento di acquisto, come sopra.
        pricesIncludeVat: false,
        subtotalMinor,
        taxMinor,
        totalMinor,
        outstandingMinor,
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

      // Righe registrazione: gruppi per aliquota IVA dagli arrivi inclusi
      // (con riferimento automatico) seguiti dalle righe manuali del form.
      await tx.documentLine.deleteMany({ where: { documentId } });
      const sortedReceipts = [...receipts].sort(
        (a, b) => a.documentDate.getTime() - b.documentDate.getTime(),
      );
      const lineRows = [
        ...vatSummaryLines.map((line) => ({
          description: line.description,
          netMinor: line.netMinor,
          ratePercent: line.ratePercent,
          vatMinor: line.vatMinor,
          lineSource: 'vat_summary',
        })),
        ...manualLines.map((line) => ({
          description: line.description.trim(),
          netMinor: line.netMinor,
          ratePercent: line.vatRatePercent,
          vatMinor: line.vatMinor,
          lineSource: 'manual',
        })),
      ];
      if (lineRows.length > 0) {
        await tx.documentLine.createMany({
          data: lineRows.map((line, index) => ({
            tenantId,
            documentId,
            lineNumber: index + 1,
            description: line.description,
            quantity: 1,
            unitPriceMinor: line.netMinor,
            discountPercent: 0,
            lineTotalMinor: line.netMinor,
            lineVatTotalMinor: line.vatMinor,
            lineGrossTotalMinor: line.netMinor + line.vatMinor,
            vatSnapshot: { ratePercent: line.ratePercent } as Prisma.InputJsonObject,
            loadsStock: false,
            lineSource: line.lineSource,
          })),
        });
      }

      // Scadenze di pagamento: la lista viene sostituita integralmente.
      await tx.documentPaymentInstallment.deleteMany({ where: { documentId } });
      if (installments.length > 0) {
        await tx.documentPaymentInstallment.createMany({
          data: installments.map((installment, index) => ({
            tenantId,
            documentId,
            position: index + 1,
            dueDate: new Date(installment.dueDate),
            amountMinor: installment.amountMinor,
            settled: installment.settled === true,
            settledAt: installment.settledAt ? new Date(installment.settledAt) : null,
          })),
        });
      }

      // Collegamenti fattura ↔ arrivi (§6-7): rimuovere un arrivo dalla fattura
      // lo riporta Sospeso; giacenze e movimenti NON vengono toccati.
      await tx.purchaseInvoiceGoodsReceiptLink.deleteMany({
        where: {
          purchaseInvoiceId: documentId,
          goodsReceiptId: {
            notIn: receiptIds.length ? receiptIds : ['00000000-0000-0000-0000-000000000000'],
          },
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
            // La fattura è stata ricontrollata: il flag §15 si azzera.
            totalsCheckPending: false,
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
      totalsMatch: receiptsTotal === totalMinor,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Validazione Codici IVA riga (§9): devono esistere per il tenant, essere
   * attivi e utilizzabili in acquisto. Il messaggio indica la prima riga
   * coinvolta, mai dettagli tecnici.
   */
  private assertPurchaseVatCodes(
    dto: SaveGoodsReceiptDto,
    requestedVatCodeIds: readonly string[],
    vatCodesById: ReadonlyMap<string, VatCodeWithNature>,
  ): void {
    const lineNumberForVatCode = (vatCodeId: string): number => {
      const index = (dto.lines ?? []).findIndex((line) => line.vatCodeId === vatCodeId);
      return index >= 0 ? index + 1 : 1;
    };
    for (const vatCodeId of requestedVatCodeIds) {
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

  private async pushInventory(
    tenantId: string,
    targets: readonly { variantId: string; locationId: string }[],
  ): Promise<void> {
    const unique = new Map(targets.map((t) => [`${t.variantId}::${t.locationId}`, t]));
    for (const target of unique.values()) {
      try {
        await this.channelSync.pushInventoryLevels(tenantId, target.variantId, [target.locationId]);
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
      select: { party: true },
    });
    if (!supplier) return null;
    return partyDisplayName(supplier.party) || null;
  }
}

/**
 * Snapshot indirizzo fornitore → Json documento: campi vuoti esclusi; payload
 * assente = conserva lo snapshot esistente (mirror di addressToJson del
 * dominio documenti, qui in versione standalone per la registrazione fattura).
 */
function purchaseInvoiceAddressToJson(
  address: DocumentAddressDto | undefined,
  existing: Prisma.JsonValue | null | undefined,
): Prisma.InputJsonObject | typeof Prisma.DbNull {
  if (address === undefined) {
    return existing && typeof existing === 'object' && !Array.isArray(existing)
      ? (existing as Prisma.InputJsonObject)
      : Prisma.DbNull;
  }
  const fields: Record<string, string | undefined> = {
    name: address.name,
    address: address.address,
    zip: address.zip,
    city: address.city,
    province: address.province,
    country: address.country,
    fiscalCode: address.fiscalCode,
    vatNumber: address.vatNumber,
  };
  const entries = Object.entries(fields)
    .filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()))
    .map(([key, value]) => [key, value.trim()]);
  return entries.length > 0
    ? (Object.fromEntries(entries) as Prisma.InputJsonObject)
    : Prisma.DbNull;
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
