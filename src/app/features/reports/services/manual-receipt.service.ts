import { inject, Injectable } from '@angular/core';
import { timeout, type Observable } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';

import type {
  ManualReceipt,
  ManualReceiptLocation,
  SaveManualReceiptBody,
} from '../models/manual-receipt.model';

const HTTP_TIMEOUT_MS = 15000;

/**
 * Accesso HTTP al Corrispettivo manuale (`docs/10` §12).
 *
 * **Non c'è un `list()`**, ed è deliberato: le registrazioni non hanno un elenco
 * proprio — si consultano nel Registro Corrispettivi insieme alle altre tre
 * sorgenti, e da lì si aprono. Un secondo elenco sarebbe una vista parallela che
 * può solo divergere da quella vera.
 */
@Injectable({ providedIn: 'root' })
export class ManualReceiptService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  /**
   * Le sedi selezionabili in testata.
   *
   * ⚠️ **Non `GET /inventory/locations`**: quello chiede `section.inventory`, e
   * chi lavora sul Registro tipicamente non ce l'ha — la tendina sarebbe
   * arrivata vuota con un 403 assorbito in silenzio, e una sede obbligatoria che
   * non si può scegliere è una maschera che non salva.
   */
  listLocations(): Observable<readonly ManualReceiptLocation[]> {
    return this.http
      .get<readonly ManualReceiptLocation[]>(this.url('/locations'))
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  getById(id: string): Observable<ManualReceipt> {
    return this.http.get<ManualReceipt>(this.url(`/${id}`)).pipe(timeout(HTTP_TIMEOUT_MS));
  }

  create(body: SaveManualReceiptBody): Observable<ManualReceipt> {
    return this.http.post<ManualReceipt>(this.url(''), body).pipe(timeout(HTTP_TIMEOUT_MS));
  }

  /** La modifica aggiorna lo stesso record: `PATCH`, non un secondo `POST`. */
  update(id: string, body: SaveManualReceiptBody): Observable<ManualReceipt> {
    return this.http.patch<ManualReceipt>(this.url(`/${id}`), body).pipe(timeout(HTTP_TIMEOUT_MS));
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(this.url(`/${id}`)).pipe(timeout(HTTP_TIMEOUT_MS));
  }

  private url(path: string): string {
    return `${this.config.apiBaseUrl}/manual-receipts${path}`;
  }
}
