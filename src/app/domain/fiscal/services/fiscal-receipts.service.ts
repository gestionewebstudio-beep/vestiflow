import { HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { timeout, type Observable } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import type { EntityId } from '@core/models/common.model';

import type {
  PendingFiscalReceipt,
  ReportFiscalOutcomePayload,
} from '../models/fiscal-print.model';

const HTTP_TIMEOUT_MS = 15000;

/**
 * Esiti di emissione e coda «da fiscalizzare»: la cassa stampa (driver) e
 * riporta qui il risultato; da qui rilegge ciò che resta da emettere.
 */
@Injectable({ providedIn: 'root' })
export class FiscalReceiptsService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  listPending(locationId: EntityId): Observable<readonly PendingFiscalReceipt[]> {
    const params = new HttpParams().set('locationId', locationId);
    return this.http
      .get<readonly PendingFiscalReceipt[]>(this.url('/fiscal-receipts/pending'), { params })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  reportOutcome(
    documentId: EntityId,
    payload: ReportFiscalOutcomePayload,
  ): Observable<{ status: string; fiscalNumber: string | null }> {
    return this.http
      .post<{ status: string; fiscalNumber: string | null }>(
        this.url(`/fiscal-receipts/${documentId}/outcome`),
        payload,
      )
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  private url(path: string): string {
    return `${this.config.apiBaseUrl}${path}`;
  }
}
