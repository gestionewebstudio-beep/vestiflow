import {
  ConflictException,
  ForbiddenException,
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
  ReservationStatus,
  SalesOrderFulfillmentStatus,
  SalesOrderSource,
  SupplierOrderStatus,
  type Document,
  type DocumentLine,
  type DocumentPaymentInstallment,
} from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import {
  canManageDocumentType,
  canViewDocumentType,
  intersectViewableDocumentTypes,
  viewableDocumentTypesFor,
} from '../auth/document-permission.util';
import { ChannelSyncFacade } from '../channels/channel-sync.facade';
import type { Paginated } from '../common/dto/pagination.dto';
import { partyDisplayName } from '../common/party/party.util';
import { applyStockSale } from '../inventory/inventory-movement.util';
import {
  assertLocationInUserScope,
  assertLocationReadableInUserScope,
} from '../inventory/user-location-scope.util';
import { StockReservationService } from '../order-reservations/stock-reservation.service';
import { resolveReadableListLocationScope } from '../inventory/licensed-location-scope.util';
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
import type { VatCodeWithNature } from '../vat/vat-codes.service';
import { lineVatFromNetExact } from '../vat/vat-line-calculation.util';
import { buildVatCodeSnapshot, vatSnapshotRatePercent } from '../vat/vat-snapshot.util';
import { ACCOUNTANT_DOCUMENT_TYPES } from './accountant-document-types.constant';
import { receiptVatBreakdown, type VatBreakdownEntry } from './purchase-invoice-vat-summary.util';
import { syncGoodsReceiptLineMovements } from './document-goods-receipt-sync.util';
import {
  buildAdjustmentMovementReason,
  syncAdjustmentLineMovements,
} from './document-stock-adjustment-sync.util';
import {
  buildTransferMovementReason,
  syncTransferLineMovements,
} from './document-stock-transfer-sync.util';
import {
  INVOICE_LINKABLE_RECEIPT_TYPES,
  documentTypeAdjustsStockOnConfirm,
  documentTypeLoadsStockOnConfirm,
  documentTypeTransfersStockOnConfirm,
  documentTypeUnloadsStockOnConfirm,
  invoiceAccompanyingUnloadsStock,
} from './document-stock.constants';
import {
  documentNumberingType,
  documentTypeDefaultLoadsStock,
  isProformaConvertTarget,
  isSalesDdtConvertTarget,
} from './document-type.util';
import {
  buildDocumentNumberConflict,
  defaultCounterSeries,
  isDocumentNumberConflict,
  nextDocumentNumber,
} from './document-numbering.util';
import { formatDocumentReference } from './document-totals.util';
import {
  reconcileDocumentStockAdjustment,
  reverseDocumentStockAdjustment,
} from './document-stock-adjustment.util';
import {
  applyDocumentStockManualUnloads,
  reconcileDocumentStockManualUnload,
} from './document-stock-manual-unload.util';
import {
  reconcileDocumentStockTransfer,
  reverseDocumentStockTransfer,
} from './document-stock-transfer.util';
import {
  buildRevisionSummary,
  reconcileDocumentStockUnload,
  reverseDocumentStockLoad,
  reverseDocumentStockUnload,
} from './document-stock-reconcile.util';
import { loadStockLineVariantsOrThrow } from './document-line-variants.util';
import { reverseSupplierOrderReceipt } from './document-supplier-order.util';
import { findSupplierPriceDiffs } from './document-supplier-price.util';
import { DocumentSettingsService } from './document-settings.service';
import { DocumentPriceModePreferenceService } from './document-price-mode-preference.service';
import {
  isDedicatedWorkflowDocumentType,
  isFlowOnlyDocumentType,
  isInternalOnlyDocumentType,
} from './document-defaults';
import type { ResolvedDocumentTypeSetting } from './document-defaults';
import type { ConvertDocumentDto } from './dto/convert-document.dto';
import type { CreateDocumentDto, DocumentLineInputDto } from './dto/create-document.dto';
import type { DocumentAddressDto } from './dto/document-transport.dto';
import type { ListDocumentOperatorsQueryDto } from './dto/list-document-operators.query.dto';
import type { ListDocumentsQueryDto } from './dto/list-documents.query.dto';
import type { RegisterExternalDto } from './dto/register-external.dto';
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
  /** Quote IVA dell'arrivo: alimentano le righe per aliquota del form. */
  readonly vatBreakdown: readonly VatBreakdownEntry[];
};

/** Stato collegamento fattura di un arrivo merce (prompt §3): mai in stampa. */
export type GoodsReceiptLinkStatus = 'suspended' | 'linked' | 'cancelled';

export type DocumentListRow = Document & {
  lineCount: number;
  locationName: string | null;
  /** Codice interno del fornitore (anagrafica), per la colonna «Cod. soggetto». */
  supplierCode: string | null;
  /** Codice interno del cliente (anagrafica): «Cod. soggetto» sui documenti di vendita. */
  customerCode: string | null;
  linkStatus: GoodsReceiptLinkStatus | null;
  linkedPurchaseInvoice: LinkedPurchaseInvoiceInfo | null;
};

/** Ordine cliente agganciato a un DDT vendita (aggancio 1:N, prompt DDT). */
export type LinkedSalesOrderInfo = {
  readonly id: string;
  readonly orderNumber: string;
  readonly cancelledAt: Date | null;
  readonly fulfilledAt: Date | null;
  readonly fulfillmentStatus: SalesOrderFulfillmentStatus;
};

/** Documento d'origine o generato da una conversione (nato-da / ha-generato). */
export type ConvertedDocumentRef = {
  readonly id: string;
  readonly type: DocumentType;
  readonly reference: string | null;
  readonly series: string | null;
  readonly number: number | null;
  readonly status: DocumentStatus;
};

export type DocumentDetail = DocumentWithLines & {
  salesOrder: { id: string; orderNumber: string } | null;
  /** Conversione: documento da cui nasce (proforma/DDT) e documenti generati. */
  sourceDocument: ConvertedDocumentRef | null;
  derivedDocuments: readonly ConvertedDocumentRef[];
  /** Ordini cliente agganciati (DDT vendita può includerne più di uno). */
  linkedSalesOrders: readonly LinkedSalesOrderInfo[];
  linkedSupplierOrder: { id: string; reference: string } | null;
  linkedSupplierOrderLines: readonly LinkedSupplierOrderLineContext[];
  linkStatus: GoodsReceiptLinkStatus | null;
  linkedPurchaseInvoice: LinkedPurchaseInvoiceInfo | null;
  linkedGoodsReceipts: readonly LinkedGoodsReceiptInfo[];
  /** Scadenze di pagamento (Registrazione fattura fornitore). */
  paymentInstallments: readonly DocumentPaymentInstallment[];
  /** DDT vendita agganciati alla fattura («Riferimento DDT»). */
  linkedSalesDdts: readonly LinkedSalesDdtInfo[];
};

/** DDT vendita agganciato a una fattura (riferimento documentale). */
export type LinkedSalesDdtInfo = {
  readonly id: string;
  readonly number: number | null;
  readonly reference: string | null;
  readonly documentDate: Date;
};

export type LinkedSupplierOrderLineContext = {
  readonly id: string;
  readonly variantId: string;
  readonly sku: string;
  readonly orderedQuantity: number;
  readonly receivedQuantity: number;
};

/** Stati in cui un documento confermato può essere modificato (§4), previo sblocco. */
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
  lineSource: null,
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
  /// Dual-write: rispecchia il Codice IVA risolto (o l'aliquota legacy se
  /// nessun Codice IVA è stato risolto). §Piano IVA fase 2.
  vatRatePercent: number | null;
  lineTotalMinor: number;
  /**
   * Imponibile di riga PRIMA dell'arrotondamento: serve solo a calcolare
   * l'imposta (§sei decimali). Non si persiste — la colonna e' intera, e
   * quello che si memorizza e' `lineTotalMinor`.
   */
  lineNetExactMinor: number;
  vatCodeId: string | null;
  vatSnapshot: Prisma.InputJsonObject | null;
  loadsStock: boolean;
  /** Riga «documento collegato»: separatore informativo, fuori dai totali. */
  isReference: boolean;
  supplierOrderLineId: string | null;
  lotCode: string | null;
  lotExpiryDate: Date | null;
  serialNumbers: string[];
}

/** Contesto di risoluzione Codice IVA riga, precaricato una volta per documento. */
interface LineVatContext {
  readonly vatCodesById: ReadonlyMap<string, VatCodeWithNature>;
  readonly productDefaultByVariantId: ReadonlyMap<string, string | null>;
  readonly fallbackDefaultVatCodeId: string | null;
}

interface DocumentTotals {
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
}

/**
 * Dominio documentale (§2 piano funzionale). Step 2: alla conferma di un
 * documento di carico (arrivo merce, carico manuale, carico iniziale) genera
 * carichi e movimenti.
 */
@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: DocumentSettingsService,
    private readonly channelSync: ChannelSyncFacade,
    private readonly stockReservations: StockReservationService,
    private readonly priceModePreference: DocumentPriceModePreferenceService,
  ) {}

  async list(
    tenantId: string,
    query: ListDocumentsQueryDto,
    user?: UserProfileDto,
  ): Promise<Paginated<DocumentListRow>> {
    const locationScope = await resolveReadableListLocationScope(this.prisma, tenantId, user);
    if (locationScope === null) {
      return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
    }

    // Matrice permessi documenti (§sezioni+documenti): il registro restituisce
    // solo i tipi delle famiglie che l'utente può consultare. Filtro nel where,
    // in AND con l'eventuale filtro tipi richiesto dal client: non basta la UI.
    // `user` assente = chiamata interna, nessuna restrizione.
    const viewableTypes = user ? viewableDocumentTypesFor(user) : null;
    if (viewableTypes !== null && viewableTypes.length === 0) {
      return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
    }

    // Il filtro location dell'utente e la ricerca libera usano entrambi una
    // clausola OR: vanno composti in AND separati per non sovrascriversi
    // (un solo `OR` per livello nel `where` di Prisma).
    const andClauses: Prisma.DocumentWhereInput[] = [];
    if (query.search) {
      andClauses.push({ OR: this.buildSearchClauses(query.search) });
    }
    if (locationScope !== 'unrestricted') {
      // I documenti senza sede (fatture, corrispettivi, ecc.) restano sempre
      // visibili: lo scope si applica solo ai documenti con locationId valorizzato.
      andClauses.push({
        OR: [{ locationId: null }, { locationId: { in: [...locationScope] } }],
      });
    }
    if (viewableTypes !== null) {
      andClauses.push({ type: { in: [...viewableTypes] } });
    }

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
      ...(query.supplierOrderId ? { supplierOrderId: query.supplierOrderId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.causal ? { causalText: { contains: query.causal, mode: 'insensitive' } } : {}),
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
      ...(query.createdById ? { createdById: query.createdById } : {}),
      ...(query.externalDocumentTypeId
        ? { externalDocumentTypeId: query.externalDocumentTypeId }
        : {}),
      ...this.buildLinkStatusClause(query.linkStatus),
      // Stato saldo (Registrazioni fattura): residuo denormalizzato sul documento.
      ...(query.settlement === 'pending'
        ? { outstandingMinor: { gt: 0 } }
        : query.settlement === 'settled'
          ? { outstandingMinor: { lte: 0 } }
          : {}),
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
      ...(andClauses.length > 0 ? { AND: andClauses } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        include: {
          _count: { select: { lines: true } },
          location: { select: { name: true } },
          supplier: { select: { code: true } },
          customer: { select: { code: true } },
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
      ({ _count, location, supplier, customer, purchaseInvoiceLinks, ...doc }) => ({
        ...doc,
        lineCount: _count.lines,
        locationName: location?.name ?? null,
        supplierCode: supplier?.code ?? null,
        customerCode: customer?.code ?? null,
        ...this.resolveLinkInfo(doc, purchaseInvoiceLinks),
      }),
    );

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /**
   * Operatori che hanno creato almeno un documento dei tipi indicati, per il
   * filtro «Operatore» delle pagine elenco. Usa lo snapshot `createdByName`
   * salvato sul documento: resta corretto anche per utenti poi rinominati o
   * disattivati, che altrimenti sparirebbero dalla tendina lasciando
   * documenti non filtrabili.
   */
  async listOperators(
    tenantId: string,
    query: ListDocumentOperatorsQueryDto,
    user?: UserProfileDto,
  ): Promise<Array<{ id: string; name: string }>> {
    const locationScope = await resolveReadableListLocationScope(this.prisma, tenantId, user);
    if (locationScope === null) {
      return [];
    }
    // Il filtro tipi arriva dal client: si interseca con le famiglie
    // consultabili, altrimenti il filtro «Operatore» rivelerebbe chi firma
    // documenti che l'utente non può vedere.
    const allowedTypes = user
      ? intersectViewableDocumentTypes(user, query.types)
      : (query.types ?? null);
    if (allowedTypes !== null && allowedTypes.length === 0) {
      return [];
    }

    const rows = await this.prisma.document.findMany({
      where: {
        tenantId,
        createdById: { not: null },
        ...(allowedTypes ? { type: { in: [...allowedTypes] } } : {}),
        ...(locationScope !== 'unrestricted'
          ? { OR: [{ locationId: null }, { locationId: { in: [...locationScope] } }] }
          : {}),
      },
      select: { createdById: true, createdByName: true },
      distinct: ['createdById'],
      orderBy: { createdByName: 'asc' },
    });

    return rows
      .filter(
        (row): row is { createdById: string; createdByName: string } => row.createdById != null,
      )
      .map((row) => ({ id: row.createdById, name: row.createdByName }));
  }

  /**
   * Verifica di lettura per l'apertura diretta di un documento per id
   * (delegata all'helper condiviso): documenti senza locationId (fatture,
   * corrispettivi, ecc.) non sono soggetti a questo controllo.
   */
  private assertDocumentLocationReadable(
    user: UserProfileDto | undefined,
    locationId: string | null,
  ): void {
    assertLocationReadableInUserScope(
      user,
      locationId,
      'Non sei autorizzato ad accedere a questo documento.',
    );
  }

  /**
   * Matrice permessi documenti: le mutazioni richiedono «Gestisci» sulla
   * famiglia del tipo. `user` assente (chiamate interne) passa: i flussi di
   * sistema non sono azioni operatore.
   */
  private assertDocumentTypeManageable(
    user: UserProfileDto | undefined,
    type: DocumentType,
  ): void {
    if (!user) {
      return;
    }
    if (!canManageDocumentType(user, type)) {
      throw new ForbiddenException('Non hai il permesso di gestire questo tipo di documento.');
    }
  }

  /**
   * Aggancio e sgancio degli Ordini cliente inclusi (`includedSalesOrderIds`):
   * il corpo della richiesta sposta l'operazione sulla famiglia «ordine
   * cliente», che né il gate di rotta («gestisci almeno una famiglia») né
   * `assertDocumentTypeManageable` (la sola famiglia del documento salvato)
   * coprono. Senza questa guardia chi gestisce i soli DDT vendita poteva
   * agganciare l'ordine di un altro: alla conferma ne vengono CONSUMATI gli
   * impegni di magazzino e l'ordine passa a evaso. E poteva fare il contrario
   * mandando un elenco VUOTO su un DDT che ne aveva — l'ordine viene RIAPERTO
   * e gli impegni ricreati — senza nemmeno conoscere un id.
   * `user` assente = chiamata interna: l'autorizzazione l'ha già data chi ha
   * avviato l'operazione.
   */
  private assertIncludedSalesOrdersManageable(
    user: UserProfileDto | undefined,
    requestedOrderIds: readonly string[] | undefined,
    linkedOrderCount: number,
  ): void {
    if (!user || requestedOrderIds === undefined) {
      return;
    }
    // Elenco vuoto su un documento che non ha ordini agganciati: il
    // salvataggio non tocca alcun ordine, non c'è nulla da autorizzare.
    if (requestedOrderIds.length === 0 && linkedOrderCount === 0) {
      return;
    }
    // La famiglia `sales_order` ha `customer_order` come tipo documento.
    if (!canManageDocumentType(user, DocumentType.customer_order)) {
      throw new ForbiddenException(
        'Non hai il permesso di gestire gli ordini cliente: non puoi agganciarli o sganciarli da questo documento.',
      );
    }
  }

  /**
   * Gate di SCRITTURA per le mutazioni di un documento legato a una sede:
   * l'utente deve poter operare sulla sede del documento (e, per i
   * trasferimenti, la destinazione segue la regola 'transferDestination').
   * Documenti senza locationId (fatture, corrispettivi, ecc.) passano sempre.
   */
  private assertDocumentLocationWritable(
    user: UserProfileDto | undefined,
    doc: Pick<Document, 'locationId' | 'targetLocationId'>,
  ): void {
    if (!user) {
      return;
    }
    if (doc.locationId) {
      assertLocationInUserScope(user, doc.locationId, 'write');
    }
    if (doc.targetLocationId) {
      assertLocationInUserScope(user, doc.targetLocationId, 'transferDestination');
    }
  }

  /**
   * Gate riusabile dai controller (es. allegati): carica il documento con lo
   * scope di lettura dell'utente e applica i due gate di scrittura — la
   * famiglia del tipo e la sede. Senza il primo, chi gestisce una sola
   * famiglia potrebbe caricare ed ELIMINARE gli allegati di ogni altra
   * (il gate di rotta chiede solo «gestisce almeno una famiglia»).
   */
  async assertWritableById(
    tenantId: string,
    id: string,
    user: UserProfileDto | undefined,
  ): Promise<DocumentDetail> {
    const doc = await this.getById(tenantId, id, user);
    this.assertDocumentTypeManageable(user, doc.type);
    this.assertDocumentLocationWritable(user, doc);
    return doc;
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

  async getById(tenantId: string, id: string, user?: UserProfileDto): Promise<DocumentDetail> {
    const doc = await this.prisma.document.findFirst({
      where: { id, tenantId },
      include: {
        lines: { orderBy: { lineNumber: 'asc' } },
        // Conversione: documento d'origine (nato-da) e derivati non annullati (ha-generato).
        sourceDocument: {
          select: {
            id: true,
            type: true,
            reference: true,
            series: true,
            number: true,
            status: true,
          },
        },
        derivedDocuments: {
          where: { status: { not: DocumentStatus.cancelled } },
          select: {
            id: true,
            type: true,
            reference: true,
            series: true,
            number: true,
            status: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        salesOrders: {
          select: {
            id: true,
            orderNumber: true,
            cancelledAt: true,
            fulfilledAt: true,
            fulfillmentStatus: true,
          },
          orderBy: { createdAt: 'asc' },
        },
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
                lines: {
                  select: { lineTotalMinor: true, lineVatTotalMinor: true, vatSnapshot: true },
                },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        // Fattura → DDT vendita agganciati («Riferimento DDT»).
        ddtLinks: {
          include: {
            salesDdt: {
              select: {
                id: true,
                number: true,
                reference: true,
                documentDate: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        // Scadenze di pagamento (Registrazione fattura fornitore).
        paymentInstallments: { orderBy: { position: 'asc' } },
      },
    });
    if (!doc) {
      throw new NotFoundException('Documento non trovato');
    }
    this.assertDocumentLocationReadable(user, doc.locationId);
    // Matrice permessi documenti: la famiglia del tipo decide chi lo apre
    // (`user` assente = chiamata interna, passa).
    if (user && !canViewDocumentType(user, doc.type)) {
      throw new ForbiddenException('Accesso negato al documento.');
    }
    const {
      salesOrders = [],
      supplierOrder,
      purchaseInvoiceLinks,
      goodsReceiptLinks,
      ddtLinks = [],
      ...rest
    } = doc;
    const linkedSupplierOrderLines =
      supplierOrder?.lines.map((line) => ({
        id: line.id,
        variantId: line.variantId,
        sku: line.sku,
        orderedQuantity: line.orderedQuantity,
        receivedQuantity: line.receivedQuantity,
      })) ?? [];
    const firstSalesOrder = salesOrders[0];
    return {
      ...rest,
      salesOrder: firstSalesOrder
        ? { id: firstSalesOrder.id, orderNumber: firstSalesOrder.orderNumber }
        : null,
      linkedSalesOrders: salesOrders,
      linkedSupplierOrder: supplierOrder
        ? { id: supplierOrder.id, reference: supplierOrder.reference }
        : null,
      linkedSupplierOrderLines,
      ...this.resolveLinkInfo(doc, purchaseInvoiceLinks),
      linkedGoodsReceipts: goodsReceiptLinks.map(({ goodsReceipt }) => {
        const { lines: receiptLines, ...receipt } = goodsReceipt;
        return {
          ...receipt,
          vatBreakdown: receiptVatBreakdown({ ...receipt, lines: receiptLines }),
        };
      }),
      linkedSalesDdts: ddtLinks.map(({ salesDdt }) => salesDdt),
    };
  }

  /** Differenze costo vs ultimo prezzo fornitore (§13) per dialog pre-conferma. */
  async listSupplierPriceDiffs(tenantId: string, documentId: string, user?: UserProfileDto) {
    const doc = await this.getById(tenantId, documentId, user);
    if (!documentTypeLoadsStockOnConfirm(doc.type)) {
      return { items: [] as const };
    }
    const items = await this.prisma.$transaction((tx) =>
      findSupplierPriceDiffs(tx, tenantId, doc.supplierId, doc.lines),
    );
    return { items };
  }

  /** Anteprima prossimo numero interno (non incrementa il numeratore). */
  async previewNextReference(
    tenantId: string,
    type: DocumentType,
    series?: string | null,
  ): Promise<{ reference: string; previewNumber: number; series: string | null }> {
    const setting = await this.settings.getResolved(tenantId, type);
    // Serie scelta in testata (se passata) o quella del contatore predefinito.
    const resolvedSeries =
      series !== undefined
        ? (series ?? '').trim() || null
        : await defaultCounterSeries(this.prisma, tenantId, type);
    // Stessa chiave (e stesso prefisso) usati dalla conferma: l'anteprima di
    // una Fattura accompagnatoria legge il progressivo condiviso della Fattura.
    const numberingType = documentNumberingType(type);
    const numberingSetting =
      numberingType === type ? setting : await this.settings.getResolved(tenantId, numberingType);
    // Stesso criterio dell'assegnazione (massimo esistente + 1): l'anteprima
    // mostra davvero il numero che il documento riceverà.
    const previewNumber = await nextDocumentNumber({
      tx: this.prisma,
      tenantId,
      type: numberingType,
      series: resolvedSeries,
      source: 'document',
    });
    const prefix = (numberingSetting.numberPrefix ?? 'DOC').trim() || 'DOC';
    return {
      reference: this.formatReference(prefix, resolvedSeries, previewNumber),
      previewNumber,
      series: resolvedSeries,
    };
  }

  async listRevisions(tenantId: string, documentId: string, user?: UserProfileDto) {
    await this.getById(tenantId, documentId, user);
    return this.prisma.documentRevision.findMany({
      where: { tenantId, documentId },
      orderBy: { revisionNumber: 'desc' },
    });
  }

  /**
   * Creazione documento generica (POST /documents), usata dal registro
   * documenti per i tipi non gestiti da un flusso dedicato. I tipi con un
   * flusso dedicato (cassa negozio, arrivo merce/carico) sono bloccati qui:
   * usa `createDocumentRecord` internamente per i pochi casi legittimi di
   * creazione interna (es. bozza arrivo merce da ordine fornitore).
   */
  async create(
    tenantId: string,
    dto: CreateDocumentDto,
    user?: UserProfileDto,
  ): Promise<DocumentWithLines> {
    this.assertDocumentTypeManageable(user, dto.type);
    // Un documento nuovo non ha ordini agganciati: conta solo ciò che il corpo
    // chiede di agganciare (il «Concludi ordine» arriva proprio da qui).
    this.assertIncludedSalesOrdersManageable(user, dto.includedSalesOrderIds, 0);
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
    if (isDedicatedWorkflowDocumentType(dto.type)) {
      throw new UnprocessableEntityException(
        'Arrivi merce e documenti di carico si registrano con «Salva documento» (Arrivo merce), non dal registro documenti generico.',
      );
    }
    return this.createDocumentRecord(tenantId, dto, user);
  }

  /**
   * Logica di creazione effettiva, senza i controlli sui tipi riservati a un
   * flusso dedicato: da usare SOLO per creazioni interne al dominio che non
   * passano dall'endpoint pubblico generico (es. bozza arrivo merce da
   * ordine fornitore, che l'utente completa e conferma con il flusso
   * dedicato `GoodsReceiptWorkflowService.saveGoodsReceipt`).
   */
  private async createDocumentRecord(
    tenantId: string,
    dto: CreateDocumentDto,
    user?: UserProfileDto,
  ): Promise<DocumentWithLines> {
    const setting = await this.settings.getResolved(tenantId, dto.type);

    await this.assertCounterparties(tenantId, dto);
    if (dto.supplierOrderId) {
      await this.assertSupplierOrderReceivable(tenantId, dto.supplierOrderId);
    }

    // Modalità prezzo del documento (netto/ivato): come l'operatore stava
    // guardando i prezzi, per ritrovare il documento come l'aveva compilato.
    // Non entra nei totali: le righe portano il netto, l'imposta si calcola.
    const pricesIncludeVat = dto.pricesIncludeVat ?? setting.pricesIncludeVat;

    const documentDate = new Date(dto.documentDate);
    const vatContext = await this.buildLineVatContext(tenantId, dto.supplierId, dto.lines ?? []);
    const lines = this.computeLines(dto.lines ?? [], dto.type, vatContext);
    const totals = this.computeTotals(lines, dto.documentDiscountPercent ?? 0);

    const supplierName = await this.snapshotSupplierName(tenantId, dto.supplierId);
    // Cliente da anagrafica (snapshot) oppure testo libero solo-stampa
    // (prompt Scarico manuale): il testo libero NON crea record in anagrafica.
    const customerName =
      (await this.snapshotCustomerName(tenantId, dto.customerId)) ??
      (dto.customerName?.trim() || null);

    // Nascita-confermato (Fase 3): il documento si crea e si conferma in
    // un'unica transazione. `syncTargets` raccoglie i push inventario a valle.
    const syncTargets: Array<{ variantId: string; locationId: string }> = [];
    const confirmed = await this.prisma
      .$transaction(async (tx) => {
        // Numero imposto dalla testata: si assegna subito (il vincolo unico lo
        // verifica). Senza numero lo assegna la conferma in-transazione,
        // prendendo il primo libero della serie.
        const series =
          dto.series !== undefined
            ? (dto.series ?? '').trim() || null
            : await defaultCounterSeries(tx, tenantId, dto.type);
        const requestedNumber = dto.number && dto.number > 0 ? dto.number : null;
        const numberingSetting =
          documentNumberingType(dto.type) === dto.type
            ? setting
            : await this.settings.getResolved(tenantId, documentNumberingType(dto.type));

        const created = await tx.document.create({
          data: {
            tenantId,
            type: dto.type,
            status: DocumentStatus.draft,
            series,
            number: requestedNumber,
            reference: requestedNumber
              ? this.formatReference(numberingSetting.numberPrefix, series, requestedNumber)
              : null,
            year: documentDate.getFullYear(),
            documentDate,
            printTitle: setting.printTitle,
            notes: dto.notes ?? setting.defaultNotes,
            internalComment: dto.internalComment ?? null,
            supplierId: dto.supplierId ?? null,
            supplierName,
            customerId: dto.customerId ?? null,
            customerName,
            locationId: dto.locationId ?? null,
            targetLocationId: dto.targetLocationId ?? null,
            adjustmentDirection: dto.adjustmentDirection ?? null,
            externalDocNumber: dto.externalDocNumber ?? null,
            externalDocDate: dto.externalDocDate ? new Date(dto.externalDocDate) : null,
            sourceDocumentId: dto.sourceDocumentId ?? null,
            supplierOrderId: dto.supplierOrderId ?? null,
            billingCause: dto.billingCause?.trim() || null,
            externalRef: dto.externalRef?.trim() || null,
            paymentTerms: dto.paymentTerms?.trim() || null,
            paymentMethod: dto.paymentMethod?.trim() || null,
            expectedDeliveryDate: dto.expectedDeliveryDate
              ? new Date(dto.expectedDeliveryDate)
              : null,
            // Fattura: dati pagamento in testata.
            paymentDueDate: dto.paymentDueDate ? new Date(dto.paymentDueDate) : null,
            iban: dto.iban?.trim() || null,
            // DDT vendita: testata operativa (prompt DDT).
            followedBySalesDoc: dto.followedBySalesDoc ?? false,
            transportCausal: dto.transportCausal?.trim() || null,
            transportStartAt: dto.transportStartAt ? new Date(dto.transportStartAt) : null,
            transportPort: dto.transportPort ?? null,
            transportCarrier: dto.transportCarrier?.trim() || null,
            transportPackagesCount: dto.transportPackagesCount ?? null,
            transportWeight: dto.transportWeight?.trim() || null,
            transportGoodsAspect: dto.transportGoodsAspect?.trim() || null,
            transportShippingCode: dto.transportShippingCode?.trim() || null,
            transportTrackingCode: dto.transportTrackingCode?.trim() || null,
            recipientAddress: this.addressToJson(dto.recipientAddress),
            destinationAddress: this.addressToJson(dto.destinationAddress),
            currency: dto.currency ?? 'EUR',
            pricesIncludeVat,
            documentDiscountPercent: dto.documentDiscountPercent ?? 0,
            ...totals,
            createdById: user?.id ?? null,
            createdByName: user?.displayName ?? 'API',
            lines: { create: lines.map((line) => this.toLineCreateData(line, tenantId)) },
          },
          include: { lines: { orderBy: { lineNumber: 'asc' } } },
        });

        if (dto.linkedSalesDdtIds !== undefined) {
          await this.syncLinkedSalesDdtsTx(tx, tenantId, created.id, dto.linkedSalesDdtIds);
        }

        if (dto.includedSalesOrderIds !== undefined) {
          await this.syncIncludedSalesOrdersTx(
            tx,
            tenantId,
            created,
            dto.includedSalesOrderIds,
            user,
          );
        }

        // Conferma nella STESSA transazione: numero + effetti magazzino per tipo
        // + conclusione ordini agganciati + status confermato. L'aggancio ordini
        // (sopra) precede la conferma, che li porta a Concluso.
        return this.confirmDocumentTx(tx, tenantId, created.id, user, syncTargets, created);
      })
      .catch(async (error: unknown) => {
        // Numero imposto già preso: 409 con il primo libero da proporre.
        await this.throwNumberConflict(error, tenantId, dto.type, dto.series);
        throw error;
      });

    // Push inventario ai canali (Shopify/TikTok) a valle del commit: la sync
    // legge la giacenza, quindi va fatta dopo che la transazione è chiusa.
    for (const entry of syncTargets) {
      try {
        await this.channelSync.pushInventoryLevels(tenantId, entry.variantId, [entry.locationId]);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Push inventario canale fallito';
        this.logger.warn(`Push inventario non riuscito (${tenantId}): ${message}`);
      }
    }

    // Ricorda la modalità prezzo scelta dall'operatore per questo tipo (solo se
    // esplicitata dal form): la creazione successiva la ripropone.
    if (user?.id && dto.pricesIncludeVat !== undefined) {
      await this.priceModePreference
        .remember(tenantId, user.id, dto.type, dto.pricesIncludeVat)
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'preferenza non salvata';
          this.logger.warn(`Modalità prezzo non memorizzata (${tenantId}): ${message}`);
        });
    }

    return confirmed;
  }

  /**
   * Conflitto sul numero documento → 409 col primo numero libero della serie.
   * Il vincolo unico del database resta l'unica verità: due operatori che
   * salvano lo stesso numero non possono duplicarlo, uno dei due sceglie se
   * prendere il numero proposto.
   */
  private async throwNumberConflict(
    error: unknown,
    tenantId: string,
    type: DocumentType,
    series: string | null | undefined,
  ): Promise<void> {
    if (!isDocumentNumberConflict(error)) {
      return;
    }
    const setting = await this.settings.getResolved(tenantId, type);
    const resolvedSeries =
      series !== undefined
        ? (series ?? '').trim() || null
        : await defaultCounterSeries(this.prisma, tenantId, type);
    throw new ConflictException(
      await buildDocumentNumberConflict({
        tx: this.prisma,
        tenantId,
        type,
        series: resolvedSeries,
        source: 'document',
        prefix: setting.numberPrefix,
      }),
    );
  }

  /**
   * Snapshot indirizzo (intestatario/destinazione DDT): normalizza i campi
   * compilati e restituisce DbNull quando l'indirizzo è vuoto.
   */
  private addressToJson(
    address: DocumentAddressDto | null | undefined,
  ): Prisma.InputJsonObject | typeof Prisma.DbNull {
    if (!address) {
      return Prisma.DbNull;
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

  /**
   * Allinea gli ordini cliente agganciati a un DDT vendita («Includi
   * documento», prompt DDT §LOGICA MAGAZZINO): aggancia i nuovi inclusi,
   * sgancia (e riapre, se già evasi da questo documento) quelli rimossi.
   * Restituisce i target inventario da sincronizzare verso i canali.
   */
  /**
   * Aggancio «Riferimento DDT» della fattura: sostituisce integralmente i link
   * esistenti con quelli richiesti. È un collegamento SOLO documentale — non
   * crea né annulla movimenti di magazzino. L'effetto indiretto è sulla
   * Fattura accompagnatoria, che smette di scaricare le giacenze quando un DDT
   * è agganciato (le ha già scaricate il DDT).
   *
   * Accetta solo DDT vendita del tenant non annullati; un id che non rispetta
   * questi vincoli è un errore esplicito, non un link scartato in silenzio.
   */
  private async syncLinkedSalesDdtsTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    invoiceId: string,
    ddtIds: readonly string[],
  ): Promise<void> {
    const uniqueIds = [...new Set(ddtIds)];

    if (uniqueIds.length > 0) {
      const found = await tx.document.findMany({
        where: {
          id: { in: uniqueIds },
          tenantId,
          type: DocumentType.sales_ddt,
          cancelledAt: null,
        },
        select: { id: true },
      });
      if (found.length !== uniqueIds.length) {
        throw new UnprocessableEntityException(
          'Uno o più DDT indicati non esistono, non sono DDT vendita o sono annullati.',
        );
      }
    }

    await tx.invoiceSalesDdtLink.deleteMany({ where: { tenantId, invoiceId } });
    if (uniqueIds.length > 0) {
      await tx.invoiceSalesDdtLink.createMany({
        data: uniqueIds.map((salesDdtId) => ({ tenantId, invoiceId, salesDdtId })),
      });
    }
  }

  private async syncIncludedSalesOrdersTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    doc: Pick<Document, 'id' | 'type'>,
    orderIds: readonly string[],
    user?: UserProfileDto,
  ): Promise<Array<{ variantId: string; locationId: string }>> {
    const uniqueIds = [...new Set(orderIds)];
    // DDT vendita e Fattura accompagnatoria concludono un ordine cliente
    // agganciandolo (la fattura accompagnatoria via «Concludi ordine»): alla
    // conferma l'impegno dell'OC viene rilasciato e il documento scarica al
    // suo posto. Gli altri tipi non agganciano ordini.
    const canAttachOrders =
      doc.type === DocumentType.sales_ddt || doc.type === DocumentType.invoice_accompanying;
    if (!canAttachOrders) {
      if (uniqueIds.length > 0) {
        throw new UnprocessableEntityException(
          'Solo DDT vendita e fattura accompagnatoria possono agganciare ordini cliente.',
        );
      }
      return [];
    }

    const current = await tx.salesOrder.findMany({
      where: { tenantId, documentId: doc.id },
      select: { id: true, orderNumber: true, locationId: true },
    });
    const currentIds = new Set(current.map((order) => order.id));
    const syncTargets: Array<{ variantId: string; locationId: string }> = [];

    const toLink = uniqueIds.filter((candidate) => !currentIds.has(candidate));

    // Ordini da agganciare e documenti già collegati in due query invece che
    // due per ordine. La validazione resta in ordine di `toLink`, così il
    // primo errore segnalato è lo stesso di prima.
    const ordersToLink = await tx.salesOrder.findMany({
      where: { id: { in: toLink }, tenantId },
      select: {
        id: true,
        orderNumber: true,
        source: true,
        cancelledAt: true,
        documentId: true,
        locationId: true,
      },
    });
    const orderById = new Map(ordersToLink.map((order) => [order.id, order]));
    const toUnlink = current.filter((order) => !uniqueIds.includes(order.id));

    // Gli impegni di magazzino stanno sulla sede dell'ORDINE, non su quella del
    // documento: agganciarlo li consuma là, sganciarlo li ricrea là. Senza
    // questo controllo un operatore assegnato alla sola sede A muoveva le
    // giacenze della sede B passando dal documento — la stessa porta che
    // «Concludi ordine» (ManualSalesOrdersService) sbarra già. Gli ordini che
    // restano agganciati non si toccano, quindi non si controllano.
    if (user) {
      for (const order of [...ordersToLink, ...toUnlink]) {
        if (order.locationId) {
          assertLocationInUserScope(user, order.locationId, 'write');
        }
      }
    }

    const linkedDocumentIds = [
      ...new Set(
        ordersToLink
          .map((order) => order.documentId)
          .filter((id): id is string => Boolean(id) && id !== doc.id),
      ),
    ];
    const linkedDocuments =
      linkedDocumentIds.length > 0
        ? await tx.document.findMany({
            where: { id: { in: linkedDocumentIds }, tenantId },
            select: { id: true, status: true, reference: true },
          })
        : [];
    const documentById = new Map(linkedDocuments.map((document) => [document.id, document]));

    for (const orderId of toLink) {
      const order = orderById.get(orderId);
      if (!order) {
        throw new UnprocessableEntityException('Un ordine cliente incluso non esiste più.');
      }
      if (order.source !== SalesOrderSource.manual) {
        throw new UnprocessableEntityException(
          `L'ordine ${order.orderNumber} non è un ordine manuale: non può essere agganciato al documento.`,
        );
      }
      if (order.cancelledAt) {
        throw new UnprocessableEntityException(
          `L'ordine ${order.orderNumber} è annullato: non può essere agganciato al documento.`,
        );
      }
      if (order.documentId && order.documentId !== doc.id) {
        const other = documentById.get(order.documentId);
        if (other && other.status !== DocumentStatus.cancelled) {
          throw new ConflictException(
            `L'ordine ${order.orderNumber} è già agganciato a un altro documento${
              other.reference ? ` (${other.reference})` : ''
            }.`,
          );
        }
      }
      await tx.salesOrder.update({ where: { id: order.id }, data: { documentId: doc.id } });
    }

    for (const removed of toUnlink) {
      const reopenTargets = await this.reopenManualOrderRecordTx(
        tx,
        tenantId,
        removed.id,
        `Ordine sganciato dal DDT vendita`,
      );
      syncTargets.push(...reopenTargets);
      await tx.salesOrder.update({ where: { id: removed.id }, data: { documentId: null } });
    }

    return syncTargets;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateDocumentDto,
    user?: UserProfileDto,
  ): Promise<DocumentDetail> {
    const doc = await this.getById(tenantId, id, user);
    this.assertDocumentTypeManageable(user, doc.type);
    // Anche l'elenco VUOTO va autorizzato quando il documento ha già ordini
    // agganciati: è quello il salvataggio che li sgancia e li riapre.
    this.assertIncludedSalesOrdersManageable(
      user,
      dto.includedSalesOrderIds,
      doc.linkedSalesOrders.length,
    );
    this.assertDocumentLocationWritable(user, doc);
    if (isFlowOnlyDocumentType(doc.type)) {
      throw new ConflictException(
        'Vendite e resi negozio non sono modificabili: registra un reso o una nuova vendita dalla cassa.',
      );
    }
    // Percorso unico Arrivo merce: la famiglia carico si modifica SOLO con
    // «Salva documento» (goods-receipt/save), mai col PATCH generico — vale
    // anche per le bozze (es. residui storici), altrimenti si aggirano le
    // validazioni e lo scope location del flusso dedicato.
    if (isDedicatedWorkflowDocumentType(doc.type)) {
      throw new ConflictException(
        'Gli arrivi merce si modificano con «Salva documento» (Arrivo merce), non dal registro documenti generico.',
      );
    }
    const isDraft = doc.status === DocumentStatus.draft;
    const isConfirmedEdit = CONFIRMED_EDITABLE_STATUSES.includes(doc.status);

    if (!isDraft && !isConfirmedEdit) {
      throw new ConflictException('Questo documento non può essere modificato.');
    }

    await this.assertCounterparties(tenantId, {
      supplierId: dto.supplierId ?? undefined,
      customerId: dto.customerId ?? undefined,
      locationId: dto.locationId ?? undefined,
      targetLocationId: dto.targetLocationId ?? undefined,
    });

    const setting = await this.settings.getResolved(tenantId, doc.type);
    const documentDate = dto.documentDate ? new Date(dto.documentDate) : doc.documentDate;

    const effectiveSupplierIdForVat =
      dto.supplierId !== undefined ? dto.supplierId : doc.supplierId;
    const lines =
      dto.lines !== undefined
        ? this.computeLines(
            dto.lines,
            doc.type,
            await this.buildLineVatContext(tenantId, effectiveSupplierIdForVat, dto.lines),
          )
        : null;

    if (lines) {
      const hasPerLineMovements =
        (await this.prisma.stockMovement.count({
          where: { tenantId, sourceDocumentId: id, sourceLineId: { not: null } },
        })) > 0;
      if (hasPerLineMovements) {
        throw new ConflictException(
          'Questo documento usa movimenti per riga: aggiornalo dal suo flusso dedicato, non con PATCH.',
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
          // Anteprima: la riga calcolata prende la forma della colonna.
          unitPriceMinor: new Prisma.Decimal(line.unitPriceMinor),
          discountPercent: new Prisma.Decimal(line.discountPercent),
          id: `new-${index}`,
          documentId: doc.id,
          tenantId,
          isReference: line.isReference === true,
          linkedGoodsReceiptId: null,
          ...EMPTY_LINE_VAT_FIELDS,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        })) ?? base.lines,
    });

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

    const effectiveSeries =
      dto.series !== undefined ? (dto.series ?? '').trim() || null : doc.series;
    const data: Prisma.DocumentUncheckedUpdateInput = {
      series: effectiveSeries,
      documentDate,
      year: documentDate.getFullYear(),
      supplierId: dto.supplierId !== undefined ? dto.supplierId : doc.supplierId,
      supplierName:
        dto.supplierId !== undefined
          ? await this.snapshotSupplierName(tenantId, dto.supplierId ?? undefined)
          : doc.supplierName,
      customerId: dto.customerId !== undefined ? dto.customerId : doc.customerId,
      customerName: await this.resolveUpdatedCustomerName(tenantId, doc, dto),
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
    if (dto.paymentTerms !== undefined) {
      data.paymentTerms = dto.paymentTerms?.trim() || null;
    }
    if (dto.paymentMethod !== undefined) {
      data.paymentMethod = dto.paymentMethod?.trim() || null;
    }
    if (dto.expectedDeliveryDate !== undefined) {
      data.expectedDeliveryDate = dto.expectedDeliveryDate
        ? new Date(dto.expectedDeliveryDate)
        : null;
    }
    // Fattura: dati pagamento in testata.
    if (dto.paymentDueDate !== undefined) {
      data.paymentDueDate = dto.paymentDueDate ? new Date(dto.paymentDueDate) : null;
    }
    if (dto.iban !== undefined) {
      data.iban = dto.iban?.trim() || null;
    }
    // DDT vendita: testata operativa (prompt DDT §TESTATA/§TRASPORTO/§INDIRIZZI).
    if (dto.followedBySalesDoc !== undefined) {
      data.followedBySalesDoc = dto.followedBySalesDoc;
    }
    if (dto.transportCausal !== undefined) {
      data.transportCausal = dto.transportCausal?.trim() || null;
    }
    if (dto.transportStartAt !== undefined) {
      data.transportStartAt = dto.transportStartAt ? new Date(dto.transportStartAt) : null;
    }
    if (dto.transportPort !== undefined) {
      data.transportPort = dto.transportPort ?? null;
    }
    if (dto.transportCarrier !== undefined) {
      data.transportCarrier = dto.transportCarrier?.trim() || null;
    }
    if (dto.transportPackagesCount !== undefined) {
      data.transportPackagesCount = dto.transportPackagesCount ?? null;
    }
    if (dto.transportWeight !== undefined) {
      data.transportWeight = dto.transportWeight?.trim() || null;
    }
    if (dto.transportGoodsAspect !== undefined) {
      data.transportGoodsAspect = dto.transportGoodsAspect?.trim() || null;
    }
    if (dto.transportShippingCode !== undefined) {
      data.transportShippingCode = dto.transportShippingCode?.trim() || null;
    }
    if (dto.transportTrackingCode !== undefined) {
      data.transportTrackingCode = dto.transportTrackingCode?.trim() || null;
    }
    if (dto.recipientAddress !== undefined) {
      data.recipientAddress = this.addressToJson(dto.recipientAddress);
    }
    if (dto.destinationAddress !== undefined) {
      data.destinationAddress = this.addressToJson(dto.destinationAddress);
    }
    if (dto.documentDiscountPercent !== undefined) {
      data.documentDiscountPercent = dto.documentDiscountPercent;
    }

    // Numero imposto in testata: si riscrive solo quando cambia davvero, così
    // un salvataggio che non tocca il numero non rischia il vincolo unico.
    if (dto.number !== undefined && dto.number !== doc.number) {
      const numberingType = documentNumberingType(doc.type);
      const numberingSetting =
        numberingType === doc.type
          ? setting
          : await this.settings.getResolved(tenantId, numberingType);
      data.number = dto.number;
      data.reference = this.formatReference(
        numberingSetting.numberPrefix,
        effectiveSeries,
        dto.number,
      );
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
      const effectiveSupplierId = dto.supplierId !== undefined ? dto.supplierId : doc.supplierId;
      if (effectiveSupplierId && order.supplierId !== effectiveSupplierId) {
        throw new UnprocessableEntityException(
          "L'ordine fornitore selezionato appartiene a un altro fornitore.",
        );
      }
      data.supplierOrderId = dto.supplierOrderId;
    }

    if (lines) {
      const totals = this.computeTotals(
        lines,
        dto.documentDiscountPercent ?? Number(doc.documentDiscountPercent),
      );
      data.subtotalMinor = totals.subtotalMinor;
      data.taxMinor = totals.taxMinor;
      data.totalMinor = totals.totalMinor;
      data.lines = { create: lines.map((line) => this.toLineCreateData(line, tenantId)) };
    } else if (dto.documentDiscountPercent !== undefined) {
      const totals = this.computeTotals(
        this.computeLines(
          doc.lines.map((line) => ({
            variantId: line.variantId ?? undefined,
            sku: line.sku ?? undefined,
            description: line.description,
            quantity: line.quantity,
            unitPriceMinor: Number(line.unitPriceMinor),
            discountPercent: Number(line.discountPercent),
            vatRatePercent: vatSnapshotRatePercent(line.vatSnapshot) ?? undefined,
            loadsStock: line.loadsStock,
            isReference: line.isReference === true,
            supplierOrderLineId: line.supplierOrderLineId ?? undefined,
            lotCode: line.lotCode ?? undefined,
            lotExpiryDate: line.lotExpiryDate?.toISOString(),
            serialNumbers: (line.serialNumbers as string[]) ?? [],
          })),
          doc.type,
        ),
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

    const updateTx = this.prisma.$transaction(async (tx) => {
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

      // Principio per Trasferimento/Rettifica (§ post-audit): una volta
      // che il documento ha movimenti per riga (creati da confirm() o dal
      // salvataggio dedicato POST transfer|adjustment/save), il PATCH generico
      // NON deve più riconciliare in modo aggregato — bypassato esattamente
      // come per l'arrivo merce, mirror del gate sopra.
      const hasTransferLineMovements =
        documentTypeTransfersStockOnConfirm(doc.type) &&
        (await tx.stockMovement.count({
          where: { tenantId, sourceDocumentId: id, sourceLineId: { not: null } },
        })) > 0;
      const hasAdjustmentLineMovements =
        documentTypeAdjustsStockOnConfirm(doc.type) &&
        (await tx.stockMovement.count({
          where: { tenantId, sourceDocumentId: id, sourceLineId: { not: null } },
        })) > 0;

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
            unitPriceMinor: new Prisma.Decimal(line.unitPriceMinor),
            discountPercent: Number(line.discountPercent),
            vatRatePercent: vatSnapshotRatePercent(line.vatSnapshot),
            lineTotalMinor: line.lineTotalMinor,
            loadsStock: line.loadsStock,
            // Riga tecnica per il ricalcolo movimenti: mai un riferimento.
            isReference: false,
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
            unitPriceMinor: new Prisma.Decimal(line.unitPriceMinor),
            discountPercent: new Prisma.Decimal(line.discountPercent),
            vatRatePercent: line.vatRatePercent,
            lineTotalMinor: line.lineTotalMinor,
            loadsStock: line.loadsStock,
            isReference: line.isReference === true,
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
        // Scarico manuale diretto: riconciliazione a delta SENZA movimenti
        // (deroga documentata in document-stock-manual-unload.util) — evita
        // la doppia sottrazione quando l'operatore risalva il documento.
        const newLinesComputed =
          lines ??
          doc.lines.map((line) => ({
            lineNumber: line.lineNumber,
            variantId: line.variantId,
            sku: line.sku,
            description: line.description,
            quantity: line.quantity,
            unitPriceMinor: new Prisma.Decimal(line.unitPriceMinor),
            discountPercent: Number(line.discountPercent),
            vatRatePercent: vatSnapshotRatePercent(line.vatSnapshot),
            lineTotalMinor: line.lineTotalMinor,
            loadsStock: line.loadsStock,
            isReference: line.isReference === true,
            supplierOrderLineId: line.supplierOrderLineId ?? null,
            lotCode: line.lotCode ?? null,
            lotExpiryDate: line.lotExpiryDate ?? null,
            serialNumbers: line.serialNumbers,
          }));
        const reconcile = await reconcileDocumentStockManualUnload(tx, {
          tenantId,
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
            unitPriceMinor: new Prisma.Decimal(line.unitPriceMinor),
            discountPercent: new Prisma.Decimal(line.discountPercent),
            vatRatePercent: line.vatRatePercent,
            lineTotalMinor: line.lineTotalMinor,
            loadsStock: line.loadsStock,
            isReference: line.isReference === true,
            supplierOrderLineId: line.supplierOrderLineId ?? null,
            lotCode: line.lotCode ?? null,
            lotExpiryDate: line.lotExpiryDate ?? null,
            serialNumbers: line.serialNumbers,
            linkedGoodsReceiptId: null,
            ...EMPTY_LINE_VAT_FIELDS,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
          })),
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
        doc.targetLocationId &&
        !hasTransferLineMovements
      ) {
        const newLinesComputed =
          lines ??
          doc.lines.map((line) => ({
            lineNumber: line.lineNumber,
            variantId: line.variantId,
            sku: line.sku,
            description: line.description,
            quantity: line.quantity,
            unitPriceMinor: new Prisma.Decimal(line.unitPriceMinor),
            discountPercent: Number(line.discountPercent),
            vatRatePercent: vatSnapshotRatePercent(line.vatSnapshot),
            lineTotalMinor: line.lineTotalMinor,
            loadsStock: line.loadsStock,
            isReference: line.isReference === true,
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
            unitPriceMinor: new Prisma.Decimal(line.unitPriceMinor),
            discountPercent: new Prisma.Decimal(line.discountPercent),
            vatRatePercent: line.vatRatePercent,
            lineTotalMinor: line.lineTotalMinor,
            loadsStock: line.loadsStock,
            isReference: line.isReference === true,
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
        doc.adjustmentDirection &&
        !hasAdjustmentLineMovements
      ) {
        const newLinesComputed =
          lines ??
          doc.lines.map((line) => ({
            lineNumber: line.lineNumber,
            variantId: line.variantId,
            sku: line.sku,
            description: line.description,
            quantity: line.quantity,
            unitPriceMinor: new Prisma.Decimal(line.unitPriceMinor),
            discountPercent: Number(line.discountPercent),
            vatRatePercent: vatSnapshotRatePercent(line.vatSnapshot),
            lineTotalMinor: line.lineTotalMinor,
            loadsStock: line.loadsStock,
            isReference: line.isReference === true,
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
            unitPriceMinor: new Prisma.Decimal(line.unitPriceMinor),
            discountPercent: new Prisma.Decimal(line.discountPercent),
            vatRatePercent: line.vatRatePercent,
            lineTotalMinor: line.lineTotalMinor,
            loadsStock: line.loadsStock,
            isReference: line.isReference === true,
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

      if (lines) {
        await tx.documentLine.deleteMany({ where: { documentId: id } });
      }

      const saved = await tx.document.update({
        where: { id },
        data,
        include: { lines: { orderBy: { lineNumber: 'asc' } } },
      });

      // Aggancio DDT della fattura: allineato a ogni salvataggio che lo dichiara.
      if (dto.linkedSalesDdtIds !== undefined) {
        await this.syncLinkedSalesDdtsTx(tx, tenantId, saved.id, dto.linkedSalesDdtIds);
      }

      // Aggancio ordini cliente inclusi (DDT vendita, prompt DDT §LOGICA
      // MAGAZZINO): allineato a ogni salvataggio che dichiara l'elenco.
      if (dto.includedSalesOrderIds !== undefined) {
        const includeTargets = await this.syncIncludedSalesOrdersTx(
          tx,
          tenantId,
          saved,
          dto.includedSalesOrderIds,
          user,
        );
        syncTargets.push(...includeTargets);
        // Documento già confermato: i nuovi ordini agganciati vengono evasi
        // subito (impegni rilasciati, stato aggiornato) — lo scarico reale è
        // già gestito dalla riconciliazione righe sopra.
        if (isConfirmedEdit && saved.type === DocumentType.sales_ddt) {
          const concludeTargets = await this.concludeLinkedManualOrderTx(tx, tenantId, saved.id);
          syncTargets.push(...concludeTargets);
        }
      }

      if (isConfirmedEdit && lines && saved.lines.length > 0) {
        // Solo DDT vendita: lo scarico manuale diretto non gestisce seriali
        // (deroga prompt Scarico manuale — nessun movimento, nessun consumo).
        if (saved.type === DocumentType.sales_ddt && saved.locationId) {
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

    const updated = await updateTx.catch(async (error: unknown) => {
      // Numero imposto già preso: 409 con il primo libero da proporre.
      await this.throwNumberConflict(error, tenantId, doc.type, dto.series ?? doc.series);
      throw error;
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

  /**
   * Conferma di una bozza (numero + effetti stock del tipo + confermato).
   * Con la nascita-confermato (Fase 3) nessun documento nasce bozza, quindi non
   * è più esposta via endpoint: resta come punto d'ingresso testato di
   * `confirmDocumentTx`, la stessa logica che la creazione born-confirmed esegue
   * in transazione. Rimuovibile spostando quei test sulla creazione.
   */
  async confirm(tenantId: string, id: string, user?: UserProfileDto): Promise<DocumentWithLines> {
    const syncTargets: Array<{ variantId: string; locationId: string }> = [];
    const confirmed = await this.prisma.$transaction((tx) =>
      this.confirmDocumentTx(tx, tenantId, id, user, syncTargets),
    );
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

  /**
   * Effetti di conferma (numero + movimenti per tipo + conclusione ordini +
   * status confermato), eseguiti NELLA transazione del salvataggio: un
   * documento nasce confermato in un'unica transazione, senza un passaggio
   * successivo. `syncTargets` raccoglie i push inventario da fare a valle.
   */
  private async confirmDocumentTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    id: string,
    user: UserProfileDto | undefined,
    syncTargets: Array<{ variantId: string; locationId: string }>,
    // Nascita-confermato: il documento appena creato è passato qui direttamente,
    // così la conferma non lo rilegge (stessa transazione, stesso record).
    preloaded?: DocumentWithLines,
  ): Promise<DocumentWithLines> {
    const actorName = user?.displayName ?? 'API';
    const actorId = user?.id ?? null;
    const doc =
      preloaded ??
      (await tx.document.findFirst({
        where: { id, tenantId },
        include: { lines: { orderBy: { lineNumber: 'asc' } } },
      }));
    if (!doc) {
      throw new NotFoundException('Documento non trovato');
    }
    this.assertDocumentLocationWritable(user, doc);
    if (isFlowOnlyDocumentType(doc.type)) {
      // Cassa negozio: creati già confermati con movimenti in transazione.
      throw new ConflictException(
        'Le vendite e i resi negozio sono già registrati alla conclusione.',
      );
    }
    // Percorso unico Arrivo merce: la conferma dal registro generico
    // eseguirebbe un motore di carico parallelo (aggregato) invece del sync
    // per riga del flusso dedicato — vietato anche per le bozze residue.
    if (isDedicatedWorkflowDocumentType(doc.type)) {
      throw new ConflictException(
        'Gli arrivi merce si confermano con «Salva documento» (Arrivo merce), non dal registro documenti generico.',
      );
    }
    if (doc.status !== DocumentStatus.draft) {
      throw new ConflictException('Solo i documenti in bozza possono essere confermati.');
    }
    if (doc.lines.length === 0) {
      throw new UnprocessableEntityException('Impossibile confermare un documento senza righe.');
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

    let number = doc.number;
    let reference = doc.reference;
    if (number == null) {
      // Un documento confermato riceve sempre un numero: senza riferimento non
      // è uno stato utile. Fino alla conferma resta senza numero (bozza).
      // Prefisso preso dal tipo che possiede il numeratore: la Fattura
      // accompagnatoria eredita quello della Fattura, così le due serie
      // condivise producono riferimenti omogenei (FT-2026-0001, 0002…).
      const numberingSetting = await this.settings.getResolved(
        tenantId,
        documentNumberingType(doc.type),
      );
      number = await this.nextNumber(tx, tenantId, doc.type, doc.series);
      reference = this.formatReference(numberingSetting.numberPrefix, doc.series, number);
    }

    // Fase 2 §9: DDT collegato a una Vendita online che ha GIÀ scaricato il
    // magazzino ⇒ nessun movimento, nessun consumo impegni, nessun secondo
    // scarico. La scelta non è attivabile dall'utente: è forzata dal link.
    // Scarico alla conferma dei documenti di vendita che movimentano.
    // La Fattura accompagnatoria rientra qui solo SENZA DDT agganciato:
    // con un DDT la merce è già uscita e un secondo scarico duplicherebbe
    // il movimento (giacenze in negativo per la stessa merce).
    const accompanyingUnloads =
      doc.type === DocumentType.invoice_accompanying &&
      invoiceAccompanyingUnloadsStock(
        await tx.invoiceSalesDdtLink.count({ where: { tenantId, invoiceId: doc.id } }),
      );

    if (accompanyingUnloads) {
      this.assertStockUnloadDocument(doc);
    }

    if ((doc.type === DocumentType.sales_ddt && !doc.onlineSaleId) || accompanyingUnloads) {
      const label =
        doc.type === DocumentType.invoice_accompanying ? 'Fattura accompagnatoria' : 'DDT vendita';
      const reason = reference ? `${label} ${reference}` : `${label} ${doc.type}`;
      await assertSerialNumbersForUnloadLines(tx, tenantId, doc.locationId!, doc.lines);
      const variantsById = await loadStockLineVariantsOrThrow(tx, tenantId, doc.lines);
      for (const line of doc.lines) {
        if (!line.loadsStock || line.quantity <= 0 || !line.variantId) {
          continue;
        }
        const variant = variantsById.get(line.variantId)!;
        await applyStockSale(tx, {
          tenantId,
          variantId: variant.id,
          sku: line.sku ?? variant.sku ?? '',
          locationId: doc.locationId!,
          quantity: line.quantity,
          reason,
          externalRef: doc.id,
          actor: { createdById: actorId, createdByName: actorName },
        });
        syncTargets.push({ variantId: variant.id, locationId: doc.locationId! });
      }
      await consumeInventorySerialsFromDocumentLines(tx, tenantId, doc.locationId!, doc.lines);
    }

    if (doc.type === DocumentType.manual_unload) {
      // Scarico manuale diretto (prompt Scarico manuale): la giacenza viene
      // sottratta SENZA creare movimenti né consumare seriali — deroga
      // documentata in document-stock-manual-unload.util. Quantità oltre la
      // giacenza ammesse: l'avviso non bloccante è responsabilità della UI.
      await applyDocumentStockManualUnloads(tx, {
        tenantId,
        locationId: doc.locationId!,
        lines: doc.lines,
      });
      for (const line of doc.lines) {
        if (line.variantId && line.loadsStock && line.quantity > 0) {
          syncTargets.push({ variantId: line.variantId, locationId: doc.locationId! });
        }
      }
    }

    if (documentTypeAdjustsStockOnConfirm(doc.type)) {
      if (doc.adjustmentDirection === AdjustmentDirection.decrease) {
        await assertSerialNumbersForUnloadLines(tx, tenantId, doc.locationId!, doc.lines);
      } else {
        await assertSerialNumbersForDocumentLines(tx, tenantId, doc.lines);
      }
      // Movimenti per riga (mirror arrivo merce): un movimento per riga con
      // sourceLineId, mai aggregato per variante.
      const adjustmentReason = buildAdjustmentMovementReason({
        reference,
        reason: doc.internalComment?.trim() || 'Rettifica inventario',
      });
      const adjustmentSync = await syncAdjustmentLineMovements(tx, {
        tenantId,
        documentId: doc.id,
        documentType: doc.type,
        locationId: doc.locationId!,
        direction: doc.adjustmentDirection!,
        reason: adjustmentReason,
        lines: doc.lines,
        actor: { createdById: actorId, createdByName: actorName },
      });
      syncTargets.push(...adjustmentSync.syncTargets);
      if (doc.adjustmentDirection === AdjustmentDirection.decrease) {
        await consumeInventorySerialsFromDocumentLines(tx, tenantId, doc.locationId!, doc.lines);
      } else {
        await applyInventorySerialsFromDocumentLines(tx, tenantId, doc.locationId!, doc.lines);
      }
    }

    // §CONCLUDI ORDINE: la conferma del documento di scarico generato da un
    // Ordine cliente manuale trasforma gli impegni in scarichi reali —
    // Impegnata torna a 0, ordine Concluso, nella STESSA transazione.
    if (documentTypeUnloadsStockOnConfirm(doc.type)) {
      const concludeTargets = await this.concludeLinkedManualOrderTx(tx, tenantId, doc.id);
      syncTargets.push(...concludeTargets);
    }

    if (documentTypeTransfersStockOnConfirm(doc.type)) {
      await assertSerialNumbersForTransferLines(tx, tenantId, doc.locationId!, doc.lines);
      // Verifica che ogni riga a stock abbia la sua variante nel tenant.
      await loadStockLineVariantsOrThrow(tx, tenantId, doc.lines);
      // Movimenti per riga (mirror arrivo merce): un movimento per riga con
      // sourceLineId, mai aggregato per variante.
      const transferReason = buildTransferMovementReason({ reference });
      const transferSync = await syncTransferLineMovements(tx, {
        tenantId,
        documentId: doc.id,
        documentType: doc.type,
        originLocationId: doc.locationId!,
        targetLocationId: doc.targetLocationId!,
        reason: transferReason,
        lines: doc.lines,
        actor: { createdById: actorId, createdByName: actorName },
      });
      syncTargets.push(...transferSync.syncTargets);
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
  }

  /**
   * Converte un documento vendita in un altro tipo (proforma → DDT/bozza
   * fattura; DDT → bozza fattura/proforma): il form di destinazione si apre
   * precompilato da questo prefill e crea il documento solo al salvataggio.
   */
  async convertPrefill(
    tenantId: string,
    id: string,
    dto: ConvertDocumentDto,
    user?: UserProfileDto,
  ): Promise<CreateDocumentDto> {
    return this.buildConversionDto(tenantId, id, dto, user);
  }

  private async buildConversionDto(
    tenantId: string,
    id: string,
    dto: ConvertDocumentDto,
    user?: UserProfileDto,
  ): Promise<CreateDocumentDto> {
    const source = await this.getById(tenantId, id, user);
    this.assertDocumentLocationWritable(user, source);
    const isProformaSource = source.type === DocumentType.proforma;
    const isSalesDdtSource = source.type === DocumentType.sales_ddt;
    if (!isProformaSource && !isSalesDdtSource) {
      throw new ConflictException(
        'Solo proforme e DDT vendita possono essere convertiti con questa azione.',
      );
    }
    if (isProformaSource && !isProformaConvertTarget(dto.targetType)) {
      throw new UnprocessableEntityException('Tipo di conversione non supportato.');
    }
    if (isSalesDdtSource && !isSalesDdtConvertTarget(dto.targetType)) {
      throw new UnprocessableEntityException(
        'Dal DDT vendita si possono generare solo Bozza fattura o Proforma.',
      );
    }
    if (source.status === DocumentStatus.cancelled) {
      throw new ConflictException('Impossibile convertire un documento annullato.');
    }
    if (source.lines.length === 0) {
      throw new UnprocessableEntityException('Il documento non ha righe da convertire.');
    }

    const sourceRef =
      source.reference ??
      `${isSalesDdtSource ? 'DDT vendita' : 'proforma'} ${source.id.slice(0, 8)}`;
    const conversionNote = isSalesDdtSource
      ? `Generato da ${sourceRef}`
      : `Convertito da ${sourceRef}`;

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
      // Il documento generato eredita la modalità prezzo dell'origine: guardati
      // affiancati devono mostrare gli stessi importi.
      pricesIncludeVat: source.pricesIncludeVat,
      notes: source.notes ?? undefined,
      internalComment: source.internalComment
        ? `${source.internalComment}\n${conversionNote}`
        : conversionNote,
      sourceDocumentId: source.id,
      billingCause: source.billingCause ?? undefined,
      externalRef: source.reference ?? undefined,
      // Dal DDT il documento generato eredita pagamento e indirizzi di testata.
      paymentTerms: source.paymentTerms ?? undefined,
      paymentMethod: source.paymentMethod ?? undefined,
      recipientAddress: (source.recipientAddress as DocumentAddressDto | null) ?? undefined,
      destinationAddress: (source.destinationAddress as DocumentAddressDto | null) ?? undefined,
      lines: source.lines.map((line) => ({
        variantId: line.variantId ?? undefined,
        sku: line.sku ?? undefined,
        description: line.description,
        quantity: line.quantity,
        unitPriceMinor: Number(line.unitPriceMinor),
        discountPercent: Number(line.discountPercent),
        vatRatePercent: vatSnapshotRatePercent(line.vatSnapshot) ?? undefined,
        loadsStock: dto.targetType === DocumentType.sales_ddt,
      })),
    };

    return createDto;
  }

  /**
   * «Inviata al commercialista»: unica azione di ciclo di vita fiscale, esposta
   * dall'interfaccia su Fattura, Fattura accompagnatoria e Proforma. Gli stati
   * stampato/inviato non sono più raggiungibili ma restano accettati in ingresso
   * per i documenti storici che li hanno già.
   */
  async registerExternal(
    tenantId: string,
    id: string,
    dto: RegisterExternalDto,
    user?: UserProfileDto,
  ): Promise<DocumentWithLines> {
    const doc = await this.getById(tenantId, id, user);
    this.assertDocumentTypeManageable(user, doc.type);
    this.assertDocumentLocationWritable(user, doc);
    if (
      doc.status !== DocumentStatus.confirmed &&
      doc.status !== DocumentStatus.printed &&
      doc.status !== DocumentStatus.sent
    ) {
      throw new ConflictException(
        'Solo documenti confermati, stampati o inviati possono essere registrati esternamente.',
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

  async cancel(tenantId: string, id: string, user?: UserProfileDto): Promise<DocumentDetail> {
    const doc = await this.getById(tenantId, id, user);
    this.assertDocumentTypeManageable(user, doc.type);
    this.assertDocumentLocationWritable(user, doc);
    // Annullare un documento con ordini agganciati li RIAPRE e ne ricrea gli
    // impegni di magazzino: è un'azione sulla famiglia «ordine cliente», non
    // solo su questo documento. Senza, il permesso sui DDT bastava a rimettere
    // in gioco ordini che l'operatore non può nemmeno consultare.
    this.assertIncludedSalesOrdersManageable(user, [], doc.linkedSalesOrders.length);
    if (isFlowOnlyDocumentType(doc.type)) {
      throw new ConflictException(
        'Le vendite negozio non si annullano: registra un Reso vendita negozio per il rientro della merce.',
      );
    }
    // Scarico manuale diretto (prompt Scarico manuale): niente annullamento —
    // il documento si elimina dall'elenco e le giacenze già scalate NON
    // vengono ripristinate (scelta esplicita, deroga documentata).
    if (doc.type === DocumentType.manual_unload) {
      throw new ConflictException(
        "Gli scarichi manuali non si annullano: elimina il documento dall'elenco. Le giacenze già scalate non vengono ripristinate.",
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

      if (wasStockAdjusted) {
        // Mirror arrivo merce: se il documento ha (o ha avuto) movimenti
        // collegati, la rimozione passa dal sync per riga — che storna anche
        // gli eventuali movimenti legacy aggregati — invece del reverse
        // aggregato "una tantum".
        const hasAnyMovements =
          (await tx.stockMovement.count({
            where: { tenantId, sourceDocumentId: id },
          })) > 0;
        if (hasAnyMovements) {
          const sync = await syncAdjustmentLineMovements(tx, {
            tenantId,
            documentId: id,
            documentType: doc.type,
            locationId: doc.locationId!,
            direction: doc.adjustmentDirection!,
            reason: '',
            lines: [],
            actor,
          });
          stockDeltas = sync.deltas;
          syncTargets.push(...sync.syncTargets);
        } else {
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
        // Mirror arrivo merce: se il documento ha (o ha avuto) movimenti
        // collegati, la rimozione passa dal sync per riga — che storna anche
        // gli eventuali movimenti legacy aggregati — invece del reverse
        // aggregato "una tantum".
        const hasAnyMovements =
          (await tx.stockMovement.count({
            where: { tenantId, sourceDocumentId: id },
          })) > 0;
        if (hasAnyMovements) {
          const sync = await syncTransferLineMovements(tx, {
            tenantId,
            documentId: id,
            documentType: doc.type,
            originLocationId: doc.locationId,
            targetLocationId: doc.targetLocationId,
            reason: '',
            lines: [],
            actor,
          });
          stockDeltas = sync.deltas;
          syncTargets.push(...sync.syncTargets);
        } else {
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
        // L'annullo dell'arrivo merce riapre l'ordine fornitore (Concluso →
        // Confermato) se non restano altri arrivi attivi agganciati.
        await reverseSupplierOrderReceipt(tx, doc.supplierOrderId, doc.lines, doc.id);
      }

      // Ordine cliente manuale concluso da questo scarico: l'annullamento del
      // documento riporta l'ordine a Confermato e rifà gli impegni (la merce
      // ricaricata torna assegnata all'ordine, Disponibile coerente).
      if (wasStockUnloaded) {
        const reopenTargets = await this.reopenLinkedManualOrderTx(tx, tenantId, doc.id);
        syncTargets.push(...reopenTargets);
      }

      // Simmetria con l'eliminazione: annullare il documento fa cadere il
      // collegamento con TUTTI gli ordini cliente agganciati (anche non
      // conclusi), che tornano così disponibili e includibili. Dopo il reopen,
      // che ha bisogno del documentId per ritrovarli.
      await tx.salesOrder.updateMany({
        where: { tenantId, documentId: doc.id },
        data: { documentId: null },
      });

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

    return this.getById(tenantId, id, user);
  }

  async delete(tenantId: string, id: string, user?: UserProfileDto): Promise<void> {
    const doc = await this.getById(tenantId, id, user);
    this.assertDocumentTypeManageable(user, doc.type);
    this.assertDocumentLocationWritable(user, doc);
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

    // Scarico manuale diretto (prompt Scarico manuale): il documento resta in
    // elenco finché l'operatore non lo elimina; l'eliminazione è definitiva
    // SOLO sul documento — le giacenze già scalate NON vengono ripristinate.
    const isDeletableManualUnload = doc.type === DocumentType.manual_unload;

    // Preventivo: eliminabile anche da confermato (viene salvato già confermato,
    // il numero PRE è assegnato al salvataggio). Non muove mai il magazzino,
    // quindi l'eliminazione è sicura e non ripristina nulla.
    const isDeletableQuote = doc.type === DocumentType.quote;

    if (isFinalized && !isDeletableReceipt && !isDeletableManualUnload && !isDeletableQuote) {
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
          await reverseSupplierOrderReceipt(tx, doc.supplierOrderId, doc.lines, doc.id);
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
        'Seleziona un cliente prima di confermare il documento.',
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
    // Niente motivo obbligatorio: la maschera tipo DDT (prompt Scarico
    // manuale) non prevede il commento interno come campo richiesto.
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

  private async transition(
    tenantId: string,
    id: string,
    next: DocumentStatus,
    allowedFrom: readonly DocumentStatus[],
    user?: UserProfileDto,
  ): Promise<DocumentWithLines> {
    const doc = await this.getById(tenantId, id, user);
    this.assertDocumentLocationWritable(user, doc);
    if (!allowedFrom.includes(doc.status)) {
      throw new ConflictException('Transizione di stato non consentita per questo documento.');
    }
    return this.prisma.document.update({
      where: { id },
      data: { status: next },
      include: { lines: { orderBy: { lineNumber: 'asc' } } },
    });
  }

  /**
   * Prossimo numero progressivo (atomico via upsert) per serie/anno/tipo.
   *
   * La chiave usa `documentNumberingType`, non il tipo grezzo: le fatture di
   * vendita (Fattura e Fattura accompagnatoria) condividono un unico
   * progressivo, quindi incrementano la stessa riga di DocumentSequence.
   */
  private async nextNumber(
    tx: Prisma.TransactionClient,
    tenantId: string,
    type: DocumentType,
    series: string | null,
  ): Promise<number> {
    return nextDocumentNumber({ tx, tenantId, type, series, source: 'document' });
  }

  private formatReference(prefix: string, series: string | null, number: number): string {
    return formatDocumentReference(prefix, series, number);
  }

  /**
   * Conclude gli Ordini cliente manuali collegati a questo documento di
   * scarico (§CONCLUDI ORDINE + prompt DDT §LOGICA MAGAZZINO): consuma gli
   * impegni attivi (Impegnata → 0, la Giacenza è già scesa con lo scarico) e
   * aggiorna lo stato. Se il documento non copre tutte le quantità previste
   * dall'ordine, lo stato diventa «Parzialmente concluso»
   * (fulfillmentStatus = partial); a copertura piena l'ordine è Concluso.
   * No-op per documenti non collegati o collegati a ordini di canale.
   */
  private async concludeLinkedManualOrderTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    documentId: string,
  ): Promise<Array<{ variantId: string; locationId: string }>> {
    const orders = await tx.salesOrder.findMany({
      where: {
        tenantId,
        documentId,
        source: SalesOrderSource.manual,
        fulfilledAt: null,
        cancelledAt: null,
      },
      include: { lines: { orderBy: { lineNumber: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    if (orders.length === 0) {
      return [];
    }

    // Copertura del documento: quantità per variante delle righe articolo.
    // Allocazione sequenziale sugli ordini: la stessa quantità non può
    // "evadere" due ordini contemporaneamente.
    const docLines = await tx.documentLine.findMany({
      where: { documentId },
      select: { variantId: true, quantity: true },
    });
    const remainingByVariant = new Map<string, number>();
    for (const line of docLines) {
      if (line.variantId && line.quantity > 0) {
        remainingByVariant.set(
          line.variantId,
          (remainingByVariant.get(line.variantId) ?? 0) + line.quantity,
        );
      }
    }

    // Impegni attivi di tutti gli ordini in una query: sono disgiunti per
    // ordine e consumarne uno non tocca gli altri (consumeReservationTx agisce
    // sul singolo id), quindi leggerli in anticipo non cambia nulla.
    const activeReservations = await tx.stockReservation.findMany({
      where: {
        tenantId,
        salesOrderId: { in: orders.map((order) => order.id) },
        status: ReservationStatus.active,
      },
    });
    const reservationsByOrder = new Map<string, typeof activeReservations>();
    for (const reservation of activeReservations) {
      const key = reservation.salesOrderId;
      if (!key) {
        continue;
      }
      const bucket = reservationsByOrder.get(key);
      if (bucket) {
        bucket.push(reservation);
      } else {
        reservationsByOrder.set(key, [reservation]);
      }
    }

    const syncTargets: Array<{ variantId: string; locationId: string }> = [];
    for (const order of orders) {
      // Impegno rilasciato: il documento scarica le giacenze al posto dell'OC.
      const active = reservationsByOrder.get(order.id) ?? [];
      for (const reservation of active) {
        await this.stockReservations.consumeReservationTx(
          tx,
          reservation,
          `Evaso con documento di scarico (ordine ${order.orderNumber})`,
        );
        syncTargets.push({
          variantId: reservation.variantId,
          locationId: reservation.locationId,
        });
      }

      let fullyCovered = true;
      for (const line of order.lines) {
        if (!line.variantId || line.quantity <= 0) {
          continue;
        }
        const remaining = remainingByVariant.get(line.variantId) ?? 0;
        const allocated = Math.min(remaining, line.quantity);
        remainingByVariant.set(line.variantId, remaining - allocated);
        if (allocated < line.quantity) {
          fullyCovered = false;
        }
      }

      await tx.salesOrder.update({
        where: { id: order.id },
        data: fullyCovered
          ? {
              fulfilledAt: new Date(),
              fulfillmentStatus: SalesOrderFulfillmentStatus.fulfilled,
            }
          : { fulfillmentStatus: SalesOrderFulfillmentStatus.partially_fulfilled },
      });
      this.logger.log(
        `Ordine cliente ${order.orderNumber} ${
          fullyCovered ? 'concluso' : 'parzialmente concluso'
        } (${tenantId})`,
      );
    }
    return syncTargets;
  }

  /**
   * Riapre gli Ordini cliente manuali evasi (anche parzialmente) da questo
   * scarico quando il documento viene annullato: l'ordine torna Confermato e
   * gli impegni vengono ricreati dalle righe con spunta "Impegna magazzino".
   */
  private async reopenLinkedManualOrderTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    documentId: string,
  ): Promise<Array<{ variantId: string; locationId: string }>> {
    const orders = await tx.salesOrder.findMany({
      where: {
        tenantId,
        documentId,
        source: SalesOrderSource.manual,
        cancelledAt: null,
        OR: [
          { fulfilledAt: { not: null } },
          { fulfillmentStatus: SalesOrderFulfillmentStatus.partially_fulfilled },
        ],
      },
      select: { id: true },
    });
    const syncTargets: Array<{ variantId: string; locationId: string }> = [];
    for (const order of orders) {
      const targets = await this.reopenManualOrderRecordTx(
        tx,
        tenantId,
        order.id,
        'Scarico annullato: ordine riaperto',
      );
      syncTargets.push(...targets);
    }
    return syncTargets;
  }

  /**
   * Riapre un singolo Ordine cliente manuale evaso (o parzialmente evaso):
   * stato di nuovo Confermato, impegni consumati ripristinati e riallineati
   * alle righe. No-op se l'ordine non risulta evaso.
   */
  private async reopenManualOrderRecordTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    orderId: string,
    note: string,
  ): Promise<Array<{ variantId: string; locationId: string }>> {
    const order = await tx.salesOrder.findFirst({
      where: { id: orderId, tenantId, source: SalesOrderSource.manual, cancelledAt: null },
      include: { lines: { orderBy: { lineNumber: 'asc' } } },
    });
    if (!order || !order.locationId) {
      return [];
    }
    const wasFulfilled =
      order.fulfilledAt != null ||
      order.fulfillmentStatus === SalesOrderFulfillmentStatus.partially_fulfilled;
    if (!wasFulfilled) {
      return [];
    }

    await tx.salesOrder.update({
      where: { id: order.id },
      data: {
        fulfilledAt: null,
        fulfillmentStatus: SalesOrderFulfillmentStatus.unfulfilled,
      },
    });

    const variantIds = [
      ...new Set(
        order.lines.map((line) => line.variantId).filter((id): id is string => Boolean(id)),
      ),
    ];
    const variants = variantIds.length
      ? await tx.productVariant.findMany({
          where: { tenantId, id: { in: variantIds } },
          select: { id: true, product: { select: { managesStock: true } } },
        })
      : [];
    const managesStockByVariantId = new Map(
      variants.map((variant) => [variant.id, variant.product.managesStock ?? true]),
    );

    // Gli impegni consumati alla conclusione tornano attivi (il sync da solo
    // non riapre mai un impegno consumato), poi si riallineano alle righe.
    await this.stockReservations.restoreConsumedOrderReservationsTx(tx, {
      tenantId,
      salesOrderId: order.id,
      note: `${note} (${order.orderNumber})`,
    });

    const reservationLines = order.lines
      .filter(
        (line) =>
          line.commitsStock &&
          line.quantity > 0 &&
          line.variantId &&
          managesStockByVariantId.get(line.variantId) !== false,
      )
      .map((line) => ({
        salesOrderLineId: line.id,
        variantId: line.variantId!,
        sku: line.sku,
        quantity: line.quantity,
      }));
    await this.stockReservations.syncOrderReservationsTx(tx, {
      tenantId,
      salesOrderId: order.id,
      channel: SalesOrderSource.manual,
      locationId: order.locationId,
      externalOrderRef: order.orderNumber,
      lines: reservationLines,
    });

    this.logger.log(`Ordine cliente ${order.orderNumber} riaperto (${tenantId})`);
    return reservationLines.map((line) => ({
      variantId: line.variantId,
      locationId: order.locationId!,
    }));
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
    vatContext?: LineVatContext,
  ): ComputedLine[] {
    const defaultLoadsStock = documentTypeDefaultLoadsStock(documentType);
    return input.map((line, index) => {
      const quantity = line.quantity;
      const unitPriceMinor = line.unitPriceMinor ?? 0;
      const discountPercent = line.discountPercent ?? 0;
      const lineNetExactMinor = (quantity * unitPriceMinor * (100 - discountPercent)) / 100;
      const lineTotalMinor = Math.round(lineNetExactMinor);

      // Risoluzione Codice IVA (§Piano IVA fase 2): (1) vatCodeId esplicito
      // sulla riga (origine documento o override manuale, entrambi vincono
      // sempre), (2) Codice IVA predefinito dell'articolo, (3) predefinito
      // fornitore (acquisto) o predefinito aziendale altrimenti. Se nessun
      // Codice IVA si risolve, resta il fallback legacy (aliquota grezza).
      let vatCodeId: string | null = null;
      let vatSnapshot: Prisma.InputJsonObject | null = null;
      let vatRatePercent = line.vatRatePercent ?? null;
      if (vatContext) {
        const explicitId = line.vatCodeId ?? null;
        const productDefaultId = line.variantId
          ? (vatContext.productDefaultByVariantId.get(line.variantId) ?? null)
          : null;
        const resolvedId = explicitId ?? productDefaultId ?? vatContext.fallbackDefaultVatCodeId;
        const vatCode = resolvedId ? (vatContext.vatCodesById.get(resolvedId) ?? null) : null;
        if (vatCode) {
          vatCodeId = vatCode.id;
          vatSnapshot = buildVatCodeSnapshot(vatCode);
          vatRatePercent = Math.round(Number(vatCode.ratePercent));
        }
      }

      return {
        lineNumber: index + 1,
        variantId: line.variantId ?? null,
        sku: line.sku ?? null,
        description: line.description.trim(),
        quantity,
        unitPriceMinor,
        discountPercent,
        vatRatePercent,
        lineTotalMinor,
        lineNetExactMinor,
        vatCodeId,
        vatSnapshot,
        loadsStock: line.loadsStock ?? defaultLoadsStock,
        isReference: line.isReference === true,
        supplierOrderLineId: line.supplierOrderLineId ?? null,
        lotCode: line.lotCode?.trim() || null,
        lotExpiryDate: line.lotExpiryDate ? new Date(line.lotExpiryDate) : null,
        serialNumbers: normalizeSerialNumbers(line.serialNumbers),
      };
    });
  }

  /**
   * Precarica il contesto di risoluzione Codice IVA per un set di righe
   * (§Piano IVA fase 2): Codici IVA richiesti esplicitamente, predefinito per
   * articolo (via variante → prodotto) e predefinito di fallback (fornitore
   * per i flussi acquisto, altrimenti predefinito aziendale).
   */
  private async buildLineVatContext(
    tenantId: string,
    supplierId: string | null | undefined,
    lines: readonly DocumentLineInputDto[],
  ): Promise<LineVatContext> {
    const variantIds = [
      ...new Set(lines.map((line) => line.variantId).filter((id): id is string => !!id)),
    ];

    const [variants, supplier, tenantSettings] = await Promise.all([
      variantIds.length > 0
        ? this.prisma.productVariant.findMany({
            where: { tenantId, id: { in: variantIds } },
            select: { id: true, product: { select: { defaultVatCodeId: true } } },
          })
        : Promise.resolve([]),
      supplierId
        ? this.prisma.supplier.findFirst({
            where: { id: supplierId, tenantId },
            select: { defaultVatCodeId: true },
          })
        : Promise.resolve(null),
      this.prisma.tenantFeatureSettings.findUnique({
        where: { tenantId },
        select: { defaultVatCodeId: true },
      }),
    ]);

    const productDefaultByVariantId = new Map<string, string | null>(
      variants.map((variant) => [variant.id, variant.product.defaultVatCodeId]),
    );
    const fallbackDefaultVatCodeId =
      supplier?.defaultVatCodeId ?? tenantSettings?.defaultVatCodeId ?? null;

    const idsToFetch = new Set<string>();
    for (const line of lines) {
      if (line.vatCodeId) idsToFetch.add(line.vatCodeId);
    }
    for (const id of productDefaultByVariantId.values()) {
      if (id) idsToFetch.add(id);
    }
    if (fallbackDefaultVatCodeId) idsToFetch.add(fallbackDefaultVatCodeId);

    const vatCodesById = new Map<string, VatCodeWithNature>();
    if (idsToFetch.size > 0) {
      const found = await this.prisma.vatCode.findMany({
        where: { tenantId, id: { in: [...idsToFetch] }, deletedAt: null },
        include: { nature: true },
      });
      for (const vatCode of found) {
        vatCodesById.set(vatCode.id, vatCode);
      }
    }

    for (const line of lines) {
      if (line.vatCodeId && !vatCodesById.has(line.vatCodeId)) {
        throw new UnprocessableEntityException(
          'Il Codice IVA selezionato per una riga non esiste o non è più disponibile.',
        );
      }
    }

    return { vatCodesById, productDefaultByVariantId, fallbackDefaultVatCodeId };
  }

  /** Converte una riga calcolata in dati Prisma: null JS su vatSnapshot deve
   * scrivere NULL SQL, non il letterale JSON "null" (Prisma.DbNull).
   *
   * I campi di appoggio del calcolo (vatRatePercent, lineNetExactMinor) NON
   * sono colonne: vanno tolti qui, o Prisma rifiuta l'intera scrittura con
   * «Unknown argument» e il salvataggio del documento fallisce con un 500.
   * Il tipo di ritorno è esplicito apposta: senza, `...rest` fa passare in
   * silenzio ogni campo di comodo aggiunto a ComputedLine. */
  private toLineCreateData(
    line: ComputedLine,
    tenantId: string,
  ): Prisma.DocumentLineUncheckedCreateWithoutDocumentInput {
    const {
      vatRatePercent: _vatRatePercent,
      lineNetExactMinor: _lineNetExactMinor,
      ...rest
    } = line;
    return { ...rest, tenantId, vatSnapshot: line.vatSnapshot ?? Prisma.DbNull };
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
    if (resolvedStatus !== SupplierOrderStatus.confirmed) {
      throw new ConflictException(
        'Solo ordini fornitore confermati (non ancora conclusi) possono essere agganciati a un arrivo merce.',
      );
    }
  }

  /**
   * Totali del documento a partire dall'IMPONIBILE di riga. La modalità
   * netto/ivato non compare: è come l'operatore guarda i prezzi, non cosa
   * contengono le righe — che è sempre il netto. Il totale è quindi lo stesso
   * qualunque modalità fosse attiva quando il documento è stato compilato.
   */
  private computeTotals(
    lines: readonly ComputedLine[],
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
      // Senza sconto documento l'imponibile di riga e' quello esatto: l'imposta
      // nasce da li', ed e' cosi' che il totale torna al prezzo ivato digitato
      // (§sei decimali). Su un imponibile intero il risultato non cambia.
      if (docDiscount === 0) {
        return sum + lineVatFromNetExact(line.lineNetExactMinor, line.vatRatePercent);
      }
      // Lo sconto extra documento si spalma sulle righe in proporzione, così la
      // somma delle imposte di riga coincide con l'imposta del documento. Qui
      // l'imponibile e' gia' ripartito e arrotondato: l'esattezza finisce.
      const lineShare = line.lineTotalMinor / lineSum;
      const discountedLineTotal = Math.round(discountedLineSum * lineShare);
      return sum + lineVatFromNetExact(discountedLineTotal, line.vatRatePercent);
    }, 0);

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
      select: { party: true },
    });
    if (!supplier) return null;
    return partyDisplayName(supplier.party) || null;
  }

  private async snapshotCustomerName(
    tenantId: string,
    customerId?: string,
  ): Promise<string | null> {
    if (!customerId) return null;
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId },
      select: { party: true },
    });
    if (!customer) return null;
    return partyDisplayName(customer.party) || null;
  }

  /**
   * Nome cliente al PATCH: con customerId lo snapshot anagrafica vince sempre;
   * senza customerId vale il testo libero solo-stampa (prompt Scarico
   * manuale) — `customerName: null` lo svuota, assente lo lascia invariato.
   */
  private async resolveUpdatedCustomerName(
    tenantId: string,
    doc: { customerId: string | null; customerName: string | null },
    dto: UpdateDocumentDto,
  ): Promise<string | null> {
    const nextCustomerId = dto.customerId !== undefined ? dto.customerId : doc.customerId;
    if (nextCustomerId) {
      return dto.customerId !== undefined
        ? await this.snapshotCustomerName(tenantId, dto.customerId ?? undefined)
        : doc.customerName;
    }
    if (dto.customerName !== undefined) {
      return dto.customerName?.trim() || null;
    }
    // Cliente anagrafica rimosso senza testo libero: lo snapshot decade.
    return dto.customerId !== undefined ? null : doc.customerName;
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
