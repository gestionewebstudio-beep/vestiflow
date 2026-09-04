import { HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { timeout, type Observable } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import type {
  PaymentMethodCode,
  PaymentOption,
  PaymentOptionKind,
} from '@core/models/payment-option.model';

const HTTP_TIMEOUT_MS = 15000;

/**
 * Voci pagamento del tenant (modalità + condizioni, logica Danea):
 * lette dalle anagrafiche cliente/fornitore, gestite dalle Impostazioni.
 */
@Injectable({ providedIn: 'root' })
export class PaymentOptionsService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  list(kind?: PaymentOptionKind): Observable<readonly PaymentOption[]> {
    let params = new HttpParams();
    if (kind) {
      params = params.set('kind', kind);
    }
    return this.http
      .get<readonly PaymentOption[]>(this.url(), { params })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  create(kind: PaymentOptionKind, name: string): Observable<PaymentOption> {
    return this.http.post<PaymentOption>(this.url(), { kind, name }).pipe(timeout(HTTP_TIMEOUT_MS));
  }

  /**
   * Il catalogo normativo FatturaPA (MP01–MP23): globale, di sola lettura.
   * Non cambia per tenant, quindi non porta filtri.
   */
  listMethodCodes(): Observable<readonly PaymentMethodCode[]> {
    return this.http
      .get<readonly PaymentMethodCode[]>(`${this.url()}/method-codes`)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  /**
   * ⚠️ `methodCodeId: null` SCOLLEGA la Modalità, ometterlo la lascia com'è:
   * sono due intenzioni diverse, e l'API le distingue. Il tipo lo dichiara
   * con `| null` invece che con un secondo metodo.
   */
  update(
    id: string,
    input: {
      readonly name?: string;
      readonly isActive?: boolean;
      readonly sortOrder?: number;
      readonly methodCodeId?: string | null;
    },
  ): Observable<PaymentOption> {
    return this.http
      .patch<PaymentOption>(`${this.url()}/${id}`, input)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url()}/${id}`).pipe(timeout(HTTP_TIMEOUT_MS));
  }

  private url(): string {
    return `${this.config.apiBaseUrl}/payment-options`;
  }
}
