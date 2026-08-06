import { inject, Injectable } from '@angular/core';
import { map, type Observable, timeout } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import type { EntityId } from '@core/models/common.model';

import type { ExternalDocumentType } from '../models/external-document-type.model';

const HTTP_TIMEOUT_MS = 15000;

interface ExternalDocumentTypeApiRow {
  readonly id: EntityId;
  readonly name: string;
  readonly shortLabel: string;
  readonly causalTemplate?: string | null;
  readonly isSystem: boolean;
  readonly isActive: boolean;
  readonly sortOrder: number;
}

export interface UpsertExternalDocumentTypeBody {
  readonly name?: string;
  readonly shortLabel?: string;
  readonly causalTemplate?: string;
  readonly isActive?: boolean;
}

function mapType(row: ExternalDocumentTypeApiRow): ExternalDocumentType {
  return {
    id: row.id,
    name: row.name,
    shortLabel: row.shortLabel,
    causalTemplate: row.causalTemplate ?? undefined,
    isSystem: row.isSystem,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  };
}

/** Accesso HTTP ai tipi documento fornitore (per tenant, seed lazy server-side). */
@Injectable({ providedIn: 'root' })
export class ExternalDocumentTypeService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  list(): Observable<readonly ExternalDocumentType[]> {
    return this.http.get<readonly ExternalDocumentTypeApiRow[]>(this.url('')).pipe(
      timeout(HTTP_TIMEOUT_MS),
      map((rows) => rows.map(mapType)),
    );
  }

  create(
    body: UpsertExternalDocumentTypeBody & { name: string },
  ): Observable<ExternalDocumentType> {
    return this.http
      .post<ExternalDocumentTypeApiRow>(this.url(''), body)
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapType));
  }

  update(id: EntityId, body: UpsertExternalDocumentTypeBody): Observable<ExternalDocumentType> {
    return this.http
      .patch<ExternalDocumentTypeApiRow>(this.url(`/${id}`), body)
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapType));
  }

  reorder(orderedIds: readonly EntityId[]): Observable<readonly ExternalDocumentType[]> {
    return this.http
      .post<readonly ExternalDocumentTypeApiRow[]>(this.url('/reorder'), { orderedIds })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        map((rows) => rows.map(mapType)),
      );
  }

  delete(id: EntityId): Observable<void> {
    return this.http.delete<void>(this.url(`/${id}`)).pipe(timeout(HTTP_TIMEOUT_MS));
  }

  private url(path: string): string {
    return `${this.config.apiBaseUrl}/external-document-types${path}`;
  }
}
