import { inject, Injectable } from '@angular/core';
import { map, type Observable, timeout } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import type { EntityId } from '@core/models/common.model';

import type { GoodsReceiptCausal } from '../models/goods-receipt-causal.model';

const HTTP_TIMEOUT_MS = 15000;

interface GoodsReceiptCausalApiRow {
  readonly id: EntityId;
  readonly label: string;
  readonly externalDocumentTypeId?: EntityId | null;
  readonly sortOrder: number;
  readonly isDefault: boolean;
  readonly isActive: boolean;
}

export interface UpsertGoodsReceiptCausalBody {
  readonly label?: string;
  readonly externalDocumentTypeId?: EntityId | null;
  readonly isDefault?: boolean;
  readonly isActive?: boolean;
}

function mapCausal(row: GoodsReceiptCausalApiRow): GoodsReceiptCausal {
  return {
    id: row.id,
    label: row.label,
    externalDocumentTypeId: row.externalDocumentTypeId ?? undefined,
    sortOrder: row.sortOrder,
    isDefault: row.isDefault,
    isActive: row.isActive,
  };
}

/** Accesso HTTP alle causali di carico Arrivo merce (per tenant, seed lazy server-side). */
@Injectable({ providedIn: 'root' })
export class GoodsReceiptCausalService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  list(): Observable<readonly GoodsReceiptCausal[]> {
    return this.http.get<readonly GoodsReceiptCausalApiRow[]>(this.url('')).pipe(
      timeout(HTTP_TIMEOUT_MS),
      map((rows) => rows.map(mapCausal)),
    );
  }

  create(body: UpsertGoodsReceiptCausalBody & { label: string }): Observable<GoodsReceiptCausal> {
    return this.http
      .post<GoodsReceiptCausalApiRow>(this.url(''), body)
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapCausal));
  }

  update(id: EntityId, body: UpsertGoodsReceiptCausalBody): Observable<GoodsReceiptCausal> {
    return this.http
      .patch<GoodsReceiptCausalApiRow>(this.url(`/${id}`), body)
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapCausal));
  }

  reorder(orderedIds: readonly EntityId[]): Observable<readonly GoodsReceiptCausal[]> {
    return this.http
      .post<readonly GoodsReceiptCausalApiRow[]>(this.url('/reorder'), { orderedIds })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        map((rows) => rows.map(mapCausal)),
      );
  }

  delete(id: EntityId): Observable<void> {
    return this.http.delete<void>(this.url(`/${id}`)).pipe(timeout(HTTP_TIMEOUT_MS));
  }

  private url(path: string): string {
    return `${this.config.apiBaseUrl}/goods-receipt-causals${path}`;
  }
}
