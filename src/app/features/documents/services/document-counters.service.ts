import { inject, Injectable } from '@angular/core';
import { type Observable, timeout } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import type { EntityId } from '@core/models/common.model';

import type {
  DocumentCounterView,
  SaveDocumentCounterBody,
} from '../models/document-counter.model';

const HTTP_TIMEOUT_MS = 15000;

@Injectable({ providedIn: 'root' })
export class DocumentCountersService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  list(): Observable<readonly DocumentCounterView[]> {
    return this.http
      .get<DocumentCounterView[]>(this.url('/document-counters'))
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  create(body: SaveDocumentCounterBody): Observable<DocumentCounterView> {
    return this.http
      .post<DocumentCounterView>(this.url('/document-counters'), body)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  update(id: EntityId, body: SaveDocumentCounterBody): Observable<DocumentCounterView> {
    return this.http
      .patch<DocumentCounterView>(this.url(`/document-counters/${id}`), body)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  delete(id: EntityId): Observable<void> {
    return this.http
      .delete<void>(this.url(`/document-counters/${id}`))
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  private url(path: string): string {
    return `${this.config.apiBaseUrl}${path}`;
  }
}
