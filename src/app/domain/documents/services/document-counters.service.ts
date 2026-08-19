import { HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { type Observable, timeout } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import type { EntityId } from '@core/models/common.model';
import type { DocumentType } from '@core/models/document.model';

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

  /**
   * Contatori proponibili in testata per (tipo, sede) + quale proporre.
   *
   * **`documentDate` non è facoltativa per comodità**: il numero proposto è il
   * primo libero dopo i documenti di data ANTERIORE (§2). Senza, il server
   * calcola su oggi, e la testata mostra un numero che il salvataggio non userà
   * — la divergenza fra numero visto e numero assegnato che il §0 dichiara
   * inaccettabile. Chi apre una maschera documento la passa sempre; resta
   * omettibile per la schermata Numeratori, dove una data non esiste.
   */
  available(
    type: DocumentType,
    locationId: EntityId | null,
    documentDate?: string | null,
  ): Observable<{ counters: readonly DocumentCounterView[]; proposedCounterId: EntityId | null }> {
    let params = new HttpParams().set('type', type);
    if (locationId) {
      params = params.set('locationId', locationId);
    }
    if (documentDate) {
      params = params.set('documentDate', documentDate);
    }
    return this.http
      .get<{
        counters: DocumentCounterView[];
        proposedCounterId: EntityId | null;
      }>(this.url('/document-counters/available'), { params })
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
