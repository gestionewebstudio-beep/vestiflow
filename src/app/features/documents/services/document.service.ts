import { HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable, timeout } from 'rxjs';

import { toPaginatedResponse } from '@core/api/api-pagination.mapper';
import type { ApiPaginated } from '@core/api/api-paginated.model';
import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import type { PaginatedResponse } from '@core/models/api.model';
import type { EntityId } from '@core/models/common.model';
import type { DocumentRecord, DocumentRevision } from '@core/models/document.model';
import type { DocumentAttachment } from '@core/models/document.model';
import { DocumentType } from '@core/models/document.model';

import type { DocumentListQuery } from '../models/document-list-query.model';
import type { LinkableGoodsReceipt } from '../models/goods-receipt-causal.model';
import {
  mapDocumentApiRow,
  mapVatBreakdown,
  type CreateDocumentBody,
  type DocumentApiRow,
  type GoodsReceiptCreatedProductApiRow,
  type LinkableGoodsReceiptApiRow,
  type SaveAdjustmentBody,
  type SaveGoodsReceiptBody,
  type SavePurchaseInvoiceBody,
  type SaveTransferBody,
  type UpdateDocumentBody,
} from './document-api.mapper';

const HTTP_TIMEOUT_MS = 15000;
const EXPORT_HTTP_TIMEOUT_MS = 60_000;

/** Operatore che ha creato almeno un documento (filtro elenco). */
export interface DocumentOperator {
  readonly id: EntityId;
  readonly name: string;
}

/**
 * Accesso HTTP al registro documenti (NestJS). Numerazione e transizioni di
 * stato sono gestite server-side.
 */
@Injectable({ providedIn: 'root' })
export class DocumentService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  getDocuments(query: DocumentListQuery = {}): Observable<PaginatedResponse<DocumentRecord>> {
    let params = new HttpParams()
      .set('page', String(query.page ?? 1))
      .set('pageSize', String(query.pageSize ?? 20));

    if (query.search) params = params.set('search', query.search);
    if (query.type) params = params.set('type', query.type);
    if (query.types?.length) params = params.set('types', query.types.join(','));
    if (query.status) params = params.set('status', query.status);
    if (query.dateFrom) params = params.set('dateFrom', query.dateFrom);
    if (query.dateTo) params = params.set('dateTo', query.dateTo);
    if (query.customerId) params = params.set('customerId', query.customerId);
    if (query.locationId) params = params.set('locationId', query.locationId);
    if (query.supplierId) params = params.set('supplierId', query.supplierId);
    if (query.linkStatus) params = params.set('linkStatus', query.linkStatus);
    if (query.externalDocumentTypeId) {
      params = params.set('externalDocumentTypeId', query.externalDocumentTypeId);
    }
    if (query.settlement) params = params.set('settlement', query.settlement);
    if (query.paymentMethod) params = params.set('paymentMethod', query.paymentMethod);
    if (query.createdById) params = params.set('createdById', query.createdById);
    if (query.accountant) params = params.set('accountant', '1');
    if (query.pendingInvoice) params = params.set('pendingInvoice', '1');

    return this.http.get<ApiPaginated<DocumentApiRow>>(this.url('/documents'), { params }).pipe(
      timeout(HTTP_TIMEOUT_MS),
      map((response) => {
        const paginated = toPaginatedResponse(response);
        return {
          data: paginated.data.map(mapDocumentApiRow),
          meta: paginated.meta,
        };
      }),
    );
  }

  /**
   * Operatori da proporre nel filtro «Operatore» di una pagina elenco,
   * ristretti ai tipi documento che quella pagina mostra.
   */
  getOperators(types: readonly DocumentType[] = []): Observable<readonly DocumentOperator[]> {
    let params = new HttpParams();
    if (types.length > 0) {
      params = params.set('types', types.join(','));
    }
    return this.http
      .get<readonly DocumentOperator[]>(this.url('/documents/operators'), { params })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  getDocumentById(id: EntityId): Observable<DocumentRecord> {
    return this.http
      .get<DocumentApiRow>(this.url(`/documents/${id}`))
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapDocumentApiRow));
  }

  previewDocumentNumber(
    type: DocumentType,
    options: { series?: string | null } = {},
  ): Observable<{ reference: string; previewNumber: number; series: string | null }> {
    let params = new HttpParams().set('type', type);
    if (options.series) params = params.set('series', options.series);

    return this.http
      .get<{
        reference: string;
        previewNumber: number;
        series: string | null;
      }>(this.url('/documents/preview-number'), { params })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  getRevisions(id: EntityId): Observable<readonly DocumentRevision[]> {
    return this.http
      .get<readonly DocumentRevision[]>(this.url(`/documents/${id}/revisions`))
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  createDocument(body: CreateDocumentBody): Observable<DocumentRecord> {
    return this.http
      .post<DocumentApiRow>(this.url('/documents'), body)
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapDocumentApiRow));
  }

  /**
   * Salvataggio unico Arrivo merce (prompt §2.1): testata, righe, totali,
   * movimenti per riga e giacenze in un'unica operazione idempotente.
   */
  saveGoodsReceipt(body: SaveGoodsReceiptBody): Observable<{
    document: DocumentRecord;
    warnings: readonly string[];
    createdProducts: readonly GoodsReceiptCreatedProductApiRow[];
  }> {
    return this.http
      .post<{
        document: DocumentApiRow;
        warnings: string[];
        createdProducts?: GoodsReceiptCreatedProductApiRow[];
      }>(this.url('/documents/goods-receipt/save'), body)
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        map(({ document, warnings, createdProducts }) => ({
          document: mapDocumentApiRow(document),
          warnings,
          createdProducts: createdProducts ?? [],
        })),
      );
  }

  /**
   * Salvataggio dedicato di un Trasferimento GIÀ CONFERMATO: preserva gli id
   * riga stabili così i movimenti per riga si aggiornano invece di
   * duplicarsi (mirror saveGoodsReceipt, ma solo per l'edit di un documento
   * confermato — creazione e prima conferma restano sul flusso generico).
   */
  saveTransfer(body: SaveTransferBody): Observable<DocumentRecord> {
    return this.http
      .post<DocumentApiRow>(this.url('/documents/transfer/save'), body)
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapDocumentApiRow));
  }

  /**
   * Salvataggio dedicato di una Rettifica GIÀ CONFERMATA: preserva gli id
   * riga stabili così i movimenti per riga si aggiornano invece di
   * duplicarsi (mirror saveGoodsReceipt, ma solo per l'edit di un documento
   * confermato — creazione e prima conferma restano sul flusso generico).
   */
  saveAdjustment(body: SaveAdjustmentBody): Observable<DocumentRecord> {
    return this.http
      .post<DocumentApiRow>(this.url('/documents/adjustment/save'), body)
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapDocumentApiRow));
  }

  /** Registrazione fattura fornitore (prompt §5-6): mai movimenti di magazzino. */
  savePurchaseInvoice(body: SavePurchaseInvoiceBody): Observable<{
    document: DocumentRecord;
    receiptsTotalMinor: number;
    totalsMatch: boolean;
  }> {
    return this.http
      .post<{
        document: DocumentApiRow;
        receiptsTotalMinor: number;
        totalsMatch: boolean;
      }>(this.url('/documents/purchase-invoice/save'), body)
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        map((response) => ({
          document: mapDocumentApiRow(response.document),
          receiptsTotalMinor: response.receiptsTotalMinor,
          totalsMatch: response.totalsMatch,
        })),
      );
  }

  /** Arrivi merce includibili in una registrazione fattura (prompt §5.1). */
  listLinkableGoodsReceipts(
    supplierId: EntityId,
    excludeInvoiceId?: EntityId,
  ): Observable<readonly LinkableGoodsReceipt[]> {
    let params = new HttpParams().set('supplierId', supplierId);
    if (excludeInvoiceId) params = params.set('excludeInvoiceId', excludeInvoiceId);

    return this.http
      .get<
        readonly LinkableGoodsReceiptApiRow[]
      >(this.url('/documents/linkable-goods-receipts'), { params })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        map((rows) =>
          rows.map((row) => ({
            id: row.id,
            number: row.number ?? undefined,
            reference: row.reference ?? undefined,
            documentDate: row.documentDate,
            causalText: row.causalText ?? undefined,
            internalComment: row.internalComment ?? undefined,
            subtotal: { amountMinor: row.subtotalMinor, currencyCode: row.currency },
            tax: { amountMinor: row.taxMinor, currencyCode: row.currency },
            total: { amountMinor: row.totalMinor, currencyCode: row.currency },
            locationName: row.locationName ?? undefined,
            vatBreakdown: mapVatBreakdown(row.vatBreakdown, row.currency),
          })),
        ),
      );
  }

  updateDocument(id: EntityId, body: UpdateDocumentBody): Observable<DocumentRecord> {
    return this.http
      .patch<DocumentApiRow>(this.url(`/documents/${id}`), body)
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapDocumentApiRow));
  }

  listSupplierPriceDiffs(id: EntityId): Observable<{
    readonly items: readonly {
      variantId: string;
      previousMinor: number | null;
      nextMinor: number;
    }[];
    readonly policy: 'always' | 'ask' | 'never';
  }> {
    return this.http
      .get<{
        items: readonly { variantId: string; previousMinor: number | null; nextMinor: number }[];
        policy: 'always' | 'ask' | 'never';
      }>(this.url(`/documents/${id}/supplier-price-diffs`))
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  exportPdf(id: EntityId): Observable<Blob> {
    return this.http
      .get(this.url(`/documents/${id}/export/pdf`), { responseType: 'blob' })
      .pipe(timeout(EXPORT_HTTP_TIMEOUT_MS));
  }

  /** Export XML FatturaPA: disponibile solo per le fatture di vendita. */
  exportXml(id: EntityId): Observable<Blob> {
    return this.http
      .get(this.url(`/documents/${id}/export/xml`), { responseType: 'blob' })
      .pipe(timeout(EXPORT_HTTP_TIMEOUT_MS));
  }

  /** «Inviata al commercialista»: registrazione esterna del documento fiscale. */
  registerExternal(
    id: EntityId,
    body: { externalDocNumber?: string; externalDocDate?: string; note?: string },
  ): Observable<DocumentRecord> {
    return this.http
      .post<DocumentApiRow>(this.url(`/documents/${id}/register-external`), body)
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapDocumentApiRow));
  }

  listAttachments(id: EntityId): Observable<readonly DocumentAttachment[]> {
    return this.http
      .get<readonly DocumentAttachment[]>(this.url(`/documents/${id}/attachments`))
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  uploadAttachment(id: EntityId, file: File): Observable<DocumentAttachment> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return this.http
      .post<DocumentAttachment>(this.url(`/documents/${id}/attachments`), formData)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  /** Rinomina: cambia solo il nome mostrato, i byte restano dove sono. */
  renameAttachment(
    id: EntityId,
    attachmentId: EntityId,
    fileName: string,
  ): Observable<DocumentAttachment> {
    return this.http
      .patch<DocumentAttachment>(this.url(`/documents/${id}/attachments/${attachmentId}`), {
        fileName,
      })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  /** Byte dell'allegato: il bucket è privato, il download passa dall'API. */
  downloadAttachment(id: EntityId, attachmentId: EntityId): Observable<Blob> {
    return this.http
      .get(this.url(`/documents/${id}/attachments/${attachmentId}/download`), {
        responseType: 'blob',
      })
      .pipe(timeout(EXPORT_HTTP_TIMEOUT_MS));
  }

  deleteAttachment(id: EntityId, attachmentId: EntityId): Observable<void> {
    return this.http
      .delete<void>(this.url(`/documents/${id}/attachments/${attachmentId}`))
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  cancelDocument(id: EntityId): Observable<DocumentRecord> {
    return this.action(id, 'cancel');
  }

  /**
   * Prefill di conversione: dati del documento generato (testata + righe +
   * `sourceDocumentId`) SENZA crearlo. Il form di destinazione si apre già
   * precompilato e crea il documento solo al salvataggio.
   */
  convertPrefill(id: EntityId, targetType: DocumentType): Observable<CreateDocumentBody> {
    return this.http
      .post<CreateDocumentBody>(this.url(`/documents/${id}/convert-prefill`), { targetType })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  /**
   * Modalità prezzo (netto/ivato) da proporre alla creazione di un documento del
   * tipo indicato: preferenza ricordata dell'operatore ?? primo utilizzo.
   */
  getPriceModePreference(type: DocumentType): Observable<boolean> {
    return this.http
      .get<{ pricesIncludeVat: boolean }>(this.url(`/documents/price-mode-preference/${type}`))
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        map((response) => response.pricesIncludeVat),
      );
  }

  deleteDocument(id: EntityId): Observable<void> {
    return this.http.delete<void>(this.url(`/documents/${id}`)).pipe(timeout(HTTP_TIMEOUT_MS));
  }

  private action(id: EntityId, path: string): Observable<DocumentRecord> {
    return this.http
      .post<DocumentApiRow>(this.url(`/documents/${id}/${path}`), {})
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapDocumentApiRow));
  }

  private url(path: string): string {
    return `${this.config.apiBaseUrl}${path}`;
  }
}
