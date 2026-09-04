import { HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, timeout, type Observable } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import type { EntityId } from '@core/models/common.model';
import {
  mapDocumentLineApiRow,
  type DocumentLineApiRow,
} from '@domain/documents/services/document-api.mapper';

import type {
  CashCheckoutPayload,
  CashCheckoutResult,
  CashClosePayload,
  CashCloseResult,
  CashDeviceChange,
  CashOperationDetail,
  CashOperationsFilters,
  CashOperationsPage,
  CashReturnPayload,
  CashReturnResult,
  CashSession,
  CashSessionDetail,
  CashSessionMovement,
  CashSessionState,
  CashSessionsFilters,
  CashSessionsPage,
  CashMovementType,
  ReceiptSearchResult,
  ReturnLookup,
} from '@domain/cash/models/cash.model';

const HTTP_TIMEOUT_MS = 15000;

/**
 * L'unico accesso HTTP alla Cassa.
 *
 * ⛔ **Nessun calcolo qui, e nessuno nei componenti che lo usano.** Totali,
 * resto, quadratura e differenze li decide il server: il client mostra
 * un'anteprima prima della conferma, e dopo la conferma i numeri che tornano.
 *
 * ⭐ **Le rotte statiche stanno prima di quelle con `:id`** anche lato server:
 * `operations` e `sessions` sono percorsi, non identificativi.
 */
@Injectable({ providedIn: 'root' })
export class CashApiService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  // ── Sessione ──────────────────────────────────────────────────────────────

  /** La sessione aperta di una sede, con i totali del cassetto. */
  current(locationId: EntityId): Observable<CashSessionState> {
    return this.http
      .get<CashSessionState>(this.url('/cash-sessions/current'), {
        params: new HttpParams().set('locationId', locationId),
      })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  open(payload: {
    readonly locationId: EntityId;
    readonly openingFloatMinor: number;
    readonly fiscalDeviceId?: EntityId | null;
    readonly notes?: string | null;
  }): Observable<CashSession> {
    return this.http
      .post<CashSession>(this.url('/cash-sessions/open'), payload)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  movements(locationId: EntityId, sessionId: EntityId): Observable<readonly CashSessionMovement[]> {
    return this.http
      .get<readonly CashSessionMovement[]>(this.url(`/cash-sessions/${sessionId}/movements`), {
        params: new HttpParams().set('locationId', locationId),
      })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  addMovement(
    locationId: EntityId,
    sessionId: EntityId,
    payload: {
      readonly type: CashMovementType;
      readonly amountMinor: number;
      readonly reason: string;
    },
  ): Observable<CashSessionMovement> {
    return this.http
      .post<CashSessionMovement>(this.url(`/cash-sessions/${sessionId}/movements`), payload, {
        params: new HttpParams().set('locationId', locationId),
      })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  deviceChanges(
    locationId: EntityId,
    sessionId: EntityId,
  ): Observable<readonly CashDeviceChange[]> {
    return this.http
      .get<readonly CashDeviceChange[]>(this.url(`/cash-sessions/${sessionId}/device-changes`), {
        params: new HttpParams().set('locationId', locationId),
      })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  /** ⚠️ `@Post` e non `@Patch`: è un evento che si aggiunge allo storico. */
  changeDevice(
    locationId: EntityId,
    sessionId: EntityId,
    payload: { readonly fiscalDeviceId: EntityId | null; readonly reason: string },
  ): Observable<{ session: CashSession; change: CashDeviceChange }> {
    return this.http
      .post<{ session: CashSession; change: CashDeviceChange }>(
        this.url(`/cash-sessions/${sessionId}/device`),
        payload,
        { params: new HttpParams().set('locationId', locationId) },
      )
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  /**
   * La chiusura, che è **cieca**: si manda quello che si è contato, e solo la
   * risposta porta attesi e differenze.
   */
  close(
    locationId: EntityId,
    sessionId: EntityId,
    payload: CashClosePayload,
  ): Observable<CashCloseResult> {
    return this.http
      .post<CashCloseResult>(this.url(`/cash-sessions/${sessionId}/close`), payload, {
        params: new HttpParams().set('locationId', locationId),
      })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  // ── Vendita e reso ────────────────────────────────────────────────────────

  checkout(payload: CashCheckoutPayload): Observable<CashCheckoutResult> {
    return this.http
      .post<CashCheckoutResult>(this.url('/cash-sessions/checkout'), payload)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  /**
   * La ricerca dello scontrino da rendere: numero, articolo, importo, cliente.
   *
   * ⛔ **Nessun UUID da digitare.** L'identificativo resta il modo con cui il
   * reso si aggancia, non quello con cui lo scontrino si TROVA.
   */
  searchReceipts(query: {
    readonly text?: string;
    readonly from?: string;
    readonly to?: string;
    readonly locationId?: EntityId;
    readonly totalMinor?: number;
    readonly limit?: number;
  }): Observable<readonly ReceiptSearchResult[]> {
    return this.http
      .get<readonly ReceiptSearchResult[]>(this.url('/cash-sessions/returns/search'), {
        params: toParams(query),
      })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  lookupReturn(locationId: EntityId, documentId: EntityId): Observable<ReturnLookup> {
    return this.http
      .get<ReturnLookup>(this.url(`/cash-sessions/returns/lookup/${documentId}`), {
        params: new HttpParams().set('locationId', locationId),
      })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  createReturn(payload: CashReturnPayload): Observable<CashReturnResult> {
    return this.http
      .post<CashReturnResult>(this.url('/cash-sessions/returns'), payload)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  // ── Consultazione ─────────────────────────────────────────────────────────

  operations(filters: CashOperationsFilters): Observable<CashOperationsPage> {
    return this.http
      .get<CashOperationsPage>(this.url('/cash-sessions/operations'), {
        params: toParams(filters),
      })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  /**
   * ⚠️ Le righe arrivano nella forma dell'API documenti e si traducono col
   * mapper CONDIVISO: è quello che permette di renderle con
   * `app-document-lines-table` invece di riscrivere una tabella.
   */
  operation(id: EntityId): Observable<CashOperationDetail> {
    return this.http.get<CashOperationDetailApi>(this.url(`/cash-sessions/operations/${id}`)).pipe(
      timeout(HTTP_TIMEOUT_MS),
      map((dettaglio) => ({
        ...dettaglio,
        lines: dettaglio.lines.map((riga) => mapDocumentLineApiRow(riga, 'EUR')),
      })),
    );
  }

  sessions(filters: CashSessionsFilters): Observable<CashSessionsPage> {
    return this.http
      .get<CashSessionsPage>(this.url('/cash-sessions/sessions'), { params: toParams(filters) })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  session(id: EntityId): Observable<CashSessionDetail> {
    return this.http
      .get<CashSessionDetail>(this.url(`/cash-sessions/sessions/${id}`))
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  private url(path: string): string {
    return `${this.config.apiBaseUrl}${path}`;
  }
}

/**
 * I filtri in `HttpParams`, saltando i vuoti.
 *
 * ⚠️ `undefined`, `null` e stringa vuota si OMETTONO: mandarli come testo
 * vuoto farebbe fallire la validazione del DTO, che li vorrebbe UUID o date.
 */
// ⚠️ `object` e non `Record<string, unknown>`: le interfacce dei filtri hanno
//    campi `readonly` e TypeScript non le considera assegnabili a un Record
//    mutabile. Il tipo largo qui non perde niente — la funzione legge e basta.
/** Il dettaglio come lo manda l_API: le righe non sono ancora tradotte. */
type CashOperationDetailApi = Omit<CashOperationDetail, 'lines'> & {
  readonly lines: readonly DocumentLineApiRow[];
};

function toParams(filtri: object): HttpParams {
  let params = new HttpParams();
  for (const [chiave, valore] of Object.entries(filtri)) {
    if (valore === undefined || valore === null || valore === '') {
      continue;
    }
    params = params.set(chiave, String(valore));
  }
  return params;
}
