import { HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { timeout, type Observable } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import type { EntityId } from '@core/models/common.model';

import type {
  CreateStoreReturnPayload,
  CreateStoreSalePayload,
  RecentStoreSale,
  StoreSaleLookupItem,
  StoreSaleResult,
} from '../models/store-sale.model';

const HTTP_TIMEOUT_MS = 15000;

/**
 * Cassa negozio (fase 3 §7-§9). La UI non modifica mai quantità direttamente:
 * il backend crea documento + movimenti in un'unica transazione alla conferma.
 */
@Injectable({ providedIn: 'root' })
export class StoreSalesService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  /** Ricerca articolo per barcode/SKU/nome, con disponibilità alla location. */
  lookupItems(code: string, locationId: EntityId): Observable<readonly StoreSaleLookupItem[]> {
    const params = new HttpParams().set('code', code).set('locationId', locationId);
    return this.http
      .get<readonly StoreSaleLookupItem[]>(this.url('/store-sales/lookup'), { params })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  /** Vendite negozio recenti per collegare un reso alla vendita origine. */
  getRecentSales(search?: string): Observable<readonly RecentStoreSale[]> {
    let params = new HttpParams();
    if (search) {
      params = params.set('search', search);
    }
    return this.http
      .get<readonly RecentStoreSale[]>(this.url('/store-sales/recent'), { params })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  /** Concludi vendita: documento confermato + movimenti negativi (§7). */
  createSale(payload: CreateStoreSalePayload): Observable<StoreSaleResult> {
    return this.http
      .post<StoreSaleResult>(this.url('/store-sales'), payload)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  /** Reso vendita negozio: carico solo per merce rientrata vendibile (§9). */
  createReturn(payload: CreateStoreReturnPayload): Observable<StoreSaleResult> {
    return this.http
      .post<StoreSaleResult>(this.url('/store-sales/returns'), payload)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  private url(path: string): string {
    return `${this.config.apiBaseUrl}${path}`;
  }
}
