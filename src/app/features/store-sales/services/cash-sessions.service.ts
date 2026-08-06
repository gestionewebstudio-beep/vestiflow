import { HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { timeout, type Observable } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import type { EntityId } from '@core/models/common.model';

import type {
  CashSessionSummary,
  CloseCashSessionPayload,
  CreateCashMovementPayload,
  ListCashSessionsQuery,
  OpenCashSessionPayload,
} from '../models/cash-session.model';

const HTTP_TIMEOUT_MS = 15000;

/**
 * Sessioni di cassa (Tranche 1.2): la cassa apre/chiude e registra i
 * movimenti di cassetto; la pagina «Chiusure di cassa» legge l'elenco.
 */
@Injectable({ providedIn: 'root' })
export class CashSessionsService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  list(query: ListCashSessionsQuery = {}): Observable<readonly CashSessionSummary[]> {
    let params = new HttpParams();
    if (query.locationId) {
      params = params.set('locationId', query.locationId);
    }
    if (query.from) {
      params = params.set('from', query.from);
    }
    if (query.to) {
      params = params.set('to', query.to);
    }
    return this.http
      .get<readonly CashSessionSummary[]>(this.url('/cash-sessions'), { params })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  /** Sessione aperta della sede (null = cassa chiusa). */
  current(locationId: EntityId): Observable<CashSessionSummary | null> {
    const params = new HttpParams().set('locationId', locationId);
    return this.http
      .get<CashSessionSummary | null>(this.url('/cash-sessions/current'), { params })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  open(payload: OpenCashSessionPayload): Observable<CashSessionSummary> {
    return this.http
      .post<CashSessionSummary>(this.url('/cash-sessions/open'), payload)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  addMovement(
    sessionId: EntityId,
    payload: CreateCashMovementPayload,
  ): Observable<CashSessionSummary> {
    return this.http
      .post<CashSessionSummary>(this.url(`/cash-sessions/${sessionId}/movements`), payload)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  close(sessionId: EntityId, payload: CloseCashSessionPayload): Observable<CashSessionSummary> {
    return this.http
      .post<CashSessionSummary>(this.url(`/cash-sessions/${sessionId}/close`), payload)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  private url(path: string): string {
    return `${this.config.apiBaseUrl}${path}`;
  }
}
