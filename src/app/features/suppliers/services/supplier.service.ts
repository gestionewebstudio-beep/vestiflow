import { inject, Injectable } from '@angular/core';
import { map, type Observable, timeout } from 'rxjs';

import { toPaginatedResponse } from '@core/api/api-pagination.mapper';
import type { ApiPaginated } from '@core/api/api-paginated.model';
import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import type { PaginatedResponse } from '@core/models/api.model';
import type {
  Supplier,
  SupplierAttachment,
  SupplierInput,
  SupplierVariantLink,
  UpsertSupplierVariantLinkInput,
} from '@core/models/supplier.model';

const HTTP_TIMEOUT_MS = 15000;

export interface ListSuppliersParams {
  readonly page?: number;
  readonly pageSize?: number;
  readonly search?: string;
}

/** Accesso HTTP all'anagrafica fornitori (NestJS). */
@Injectable({ providedIn: 'root' })
export class SupplierService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  private baseUrl(): string {
    return `${this.config.apiBaseUrl}/suppliers`;
  }

  /** Elenco completo per select inline (ordini, arrivi merce). */
  getSuppliers(): Observable<readonly Supplier[]> {
    return this.http.get<Supplier[]>(`${this.baseUrl()}/all`).pipe(timeout(HTTP_TIMEOUT_MS));
  }

  list(params: ListSuppliersParams = {}): Observable<PaginatedResponse<Supplier>> {
    const query = new URLSearchParams();
    if (params.page) {
      query.set('page', String(params.page));
    }
    if (params.pageSize) {
      query.set('pageSize', String(params.pageSize));
    }
    if (params.search?.trim()) {
      query.set('search', params.search.trim());
    }
    const qs = query.toString();
    return this.http.get<ApiPaginated<Supplier>>(`${this.baseUrl()}${qs ? `?${qs}` : ''}`).pipe(
      timeout(HTTP_TIMEOUT_MS),
      map((response) => toPaginatedResponse(response)),
    );
  }

  getById(id: string): Observable<Supplier> {
    return this.http.get<Supplier>(`${this.baseUrl()}/${id}`).pipe(timeout(HTTP_TIMEOUT_MS));
  }

  createSupplier(input: SupplierInput): Observable<Supplier> {
    return this.http.post<Supplier>(this.baseUrl(), input).pipe(timeout(HTTP_TIMEOUT_MS));
  }

  updateSupplier(id: string, input: Partial<SupplierInput>): Observable<Supplier> {
    return this.http
      .patch<Supplier>(`${this.baseUrl()}/${id}`, input)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  deleteSupplier(id: string): Observable<{ readonly ok: true }> {
    return this.http
      .delete<{ readonly ok: true }>(`${this.baseUrl()}/${id}`)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  getVariantLinksBySupplier(supplierId: string): Observable<readonly SupplierVariantLink[]> {
    return this.http
      .get<SupplierVariantLink[]>(`${this.baseUrl()}/${supplierId}/variant-links`)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  getVariantLinksByProduct(productId: string): Observable<readonly SupplierVariantLink[]> {
    return this.http
      .get<SupplierVariantLink[]>(`${this.config.apiBaseUrl}/products/${productId}/supplier-links`)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  upsertVariantLink(input: UpsertSupplierVariantLinkInput): Observable<SupplierVariantLink> {
    return this.http
      .post<SupplierVariantLink>(`${this.baseUrl()}/variant-links`, input)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  deleteVariantLink(linkId: string): Observable<{ readonly ok: true }> {
    return this.http
      .delete<{ readonly ok: true }>(`${this.baseUrl()}/variant-links/${linkId}`)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  listAttachments(supplierId: string): Observable<readonly SupplierAttachment[]> {
    return this.http
      .get<readonly SupplierAttachment[]>(`${this.baseUrl()}/${supplierId}/attachments`)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  uploadAttachment(supplierId: string, file: File): Observable<SupplierAttachment> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return this.http
      .post<SupplierAttachment>(`${this.baseUrl()}/${supplierId}/attachments`, formData)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  deleteAttachment(supplierId: string, attachmentId: string): Observable<void> {
    return this.http
      .delete<void>(`${this.baseUrl()}/${supplierId}/attachments/${attachmentId}`)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }
}
