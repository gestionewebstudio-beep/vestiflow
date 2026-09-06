import { HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { timeout, type Observable } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import type {
  CashSession,
  CashSessionDeviceChange,
  CashSessionMovement,
  CashSessionMovementType,
  CurrentCashSession,
} from '@core/models/cash-session.model';

const HTTP_TIMEOUT_MS = 15000;

/**
 * Sessione di cassa (tranche C3).
 *
 * ⛔ **Nessun metodo di chiusura, checkout, pagamento o ricevuta**: non
 * esistono le API corrispondenti, e la funzione resta incompleta fino a C4B.
 *
 * ⛔ **Nessun `delete`, nessun `update` su sessione o movimenti.** Una sessione
 * sbagliata si chiude, un movimento sbagliato si corregge con un movimento
 * opposto: è il contratto append-only di `docs/25` §10, tenuto da
 * `npm run check:cassa-append-only`.
 *
 * ⚠️ **La sede viaggia in querystring, la sessione nel percorso**: l'oggetto di
 * una rotta è la sessione, non la sede — il vecchio ramo aveva
 * `PUT /fiscal-devices/{locationId}`, che con più dispositivi non sa quale
 * modificare.
 */
@Injectable({ providedIn: 'root' })
export class CashSessionsService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  /** La sessione aperta della sede, con i totali del cassetto. */
  current(locationId: string): Observable<CurrentCashSession> {
    return this.http
      .get<CurrentCashSession>(`${this.url()}/current`, {
        params: new HttpParams().set('locationId', locationId),
      })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  /**
   * Apre la sessione.
   *
   * ⚠️ Il chiamante NON manda tenant, operatore né stato: li ricava il server
   * dal contesto autenticato.
   */
  open(input: {
    readonly locationId: string;
    readonly openingFloatMinor: number;
    readonly fiscalDeviceId?: string | null;
    readonly notes?: string | null;
  }): Observable<CashSession> {
    return this.http.post<CashSession>(`${this.url()}/open`, input).pipe(timeout(HTTP_TIMEOUT_MS));
  }

  listMovements(locationId: string, sessionId: string): Observable<CashSessionMovement[]> {
    return this.http
      .get<CashSessionMovement[]>(`${this.url()}/${sessionId}/movements`, {
        params: new HttpParams().set('locationId', locationId),
      })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  /** Versamento o prelievo. Richiede `retail.cash_drawer`. */
  addMovement(
    locationId: string,
    sessionId: string,
    input: {
      readonly type: CashSessionMovementType;
      readonly amountMinor: number;
      readonly reason: string;
    },
  ): Observable<CashSessionMovement> {
    return this.http
      .post<CashSessionMovement>(`${this.url()}/${sessionId}/movements`, input, {
        params: new HttpParams().set('locationId', locationId),
      })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  listDeviceChanges(locationId: string, sessionId: string): Observable<CashSessionDeviceChange[]> {
    return this.http
      .get<CashSessionDeviceChange[]>(`${this.url()}/${sessionId}/device-changes`, {
        params: new HttpParams().set('locationId', locationId),
      })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  /**
   * Cambia il dispositivo operativo, o lo toglie con `null`.
   *
   * ⛔ **Il precedente non si manda**: lo determina il server dentro la
   * transazione. Se nel frattempo è cambiato, la risposta è un conflitto.
   */
  changeDevice(
    locationId: string,
    sessionId: string,
    input: { readonly fiscalDeviceId: string | null; readonly reason: string },
  ): Observable<{ session: CashSession; change: CashSessionDeviceChange }> {
    return this.http
      .post<{ session: CashSession; change: CashSessionDeviceChange }>(
        `${this.url()}/${sessionId}/device`,
        input,
        { params: new HttpParams().set('locationId', locationId) },
      )
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  private url(): string {
    return `${this.config.apiBaseUrl}/cash-sessions`;
  }
}
