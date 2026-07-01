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
import {
  mapDocumentApiRow,
  type CreateDocumentBody,
  type DocumentApiRow,
  type UpdateDocumentBody,
} from './document-api.mapper';

const HTTP_TIMEOUT_MS = 15000;
const EXPORT_HTTP_TIMEOUT_MS = 60_000;

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
    if (query.status) params = params.set('status', query.status);
    if (query.dateFrom) params = params.set('dateFrom', query.dateFrom);
    if (query.dateTo) params = params.set('dateTo', query.dateTo);
    if (query.customerId) params = params.set('customerId', query.customerId);
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

  getDocumentById(id: EntityId): Observable<DocumentRecord> {
    return this.http
      .get<DocumentApiRow>(this.url(`/documents/${id}`))
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapDocumentApiRow));
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

  /** Crea bozza arrivo merce da ordine fornitore (§10.1). */
  createGoodsReceiptFromSupplierOrder(
    supplierOrderId: EntityId,
    body: { type?: DocumentType; documentDate?: string } = {},
  ): Observable<DocumentRecord> {
    return this.http
      .post<DocumentApiRow>(this.url(`/supplier-orders/${supplierOrderId}/goods-receipt`), body)
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapDocumentApiRow));
  }

  updateDocument(id: EntityId, body: UpdateDocumentBody): Observable<DocumentRecord> {
    return this.http
      .patch<DocumentApiRow>(this.url(`/documents/${id}`), body)
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapDocumentApiRow));
  }

  confirmDocument(id: EntityId): Observable<DocumentRecord> {
    return this.action(id, 'confirm');
  }

  markPrinted(id: EntityId): Observable<DocumentRecord> {
    return this.action(id, 'print');
  }

  exportPdf(id: EntityId): Observable<Blob> {
    return this.http
      .get(this.url(`/documents/${id}/export/pdf`), { responseType: 'blob' })
      .pipe(timeout(EXPORT_HTTP_TIMEOUT_MS));
  }

  markSent(id: EntityId): Observable<DocumentRecord> {
    return this.action(id, 'send');
  }

  registerExternal(
    id: EntityId,
    body: { externalDocNumber?: string; externalDocDate?: string; note?: string },
  ): Observable<DocumentRecord> {
    return this.http
      .post<DocumentApiRow>(this.url(`/documents/${id}/register-external`), body)
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapDocumentApiRow));
  }

  markExternallyIssued(
    id: EntityId,
    body: { externalDocNumber?: string; externalDocDate?: string },
  ): Observable<DocumentRecord> {
    return this.http
      .post<DocumentApiRow>(this.url(`/documents/${id}/mark-externally-issued`), body)
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

  deleteAttachment(id: EntityId, attachmentId: EntityId): Observable<void> {
    return this.http
      .delete<void>(this.url(`/documents/${id}/attachments/${attachmentId}`))
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  cancelDocument(id: EntityId): Observable<DocumentRecord> {
    return this.action(id, 'cancel');
  }

  convertDocument(id: EntityId, targetType: DocumentType): Observable<DocumentRecord> {
    return this.http
      .post<DocumentApiRow>(this.url(`/documents/${id}/convert`), { targetType })
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapDocumentApiRow));
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
