import { inject, Injectable } from '@angular/core';
import { type Observable, tap, timeout } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';

import type {
  ShopifySetupDirection,
  ShopifySetupDto,
  ShopifySetupLocationChoiceInput,
} from '../models/shopify-setup.dto';
import { ShopifyConnectionRefreshService } from './shopify-connection-refresh.service';

const HTTP_TIMEOUT_MS = 15000;
/** L’anteprima legge Shopify riga per riga: le si lascia più tempo. */
const ANTEPRIMA_TIMEOUT_MS = 120000;

/**
 * La PRIMA CONNESSIONE (`docs/27`): un servizio solo, un endpoint per fase.
 * Ogni comando restituisce lo stato intero del percorso, e le scelte sulle
 * sedi invalidano la connessione in cache (una sede nuova o collegata cambia
 * ciò che il resto delle Impostazioni mostra).
 */
@Injectable({ providedIn: 'root' })
export class ShopifySetupService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);
  private readonly connectionRefresh = inject(ShopifyConnectionRefreshService);

  stato(): Observable<ShopifySetupDto> {
    return this.http.get<ShopifySetupDto>(this.url('')).pipe(timeout(HTTP_TIMEOUT_MS));
  }

  scegliDirezione(direction: ShopifySetupDirection): Observable<ShopifySetupDto> {
    return this.http
      .put<ShopifySetupDto>(this.url('/direction'), { direction })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  scegliSede(
    shopifyLocationId: string,
    scelta: ShopifySetupLocationChoiceInput,
  ): Observable<ShopifySetupDto> {
    return this.http
      .put<ShopifySetupDto>(this.url(`/locations/${encodeURIComponent(shopifyLocationId)}`), scelta)
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        tap(() => this.connectionRefresh.notifyInvalidated()),
      );
  }

  anteprima(): Observable<ShopifySetupDto> {
    return this.http
      .post<ShopifySetupDto>(this.url('/preview'), {})
      .pipe(timeout(ANTEPRIMA_TIMEOUT_MS));
  }

  /** Avvia il trasferimento; l’esito si legge poi da `stato()`. */
  conferma(): Observable<ShopifySetupDto> {
    return this.http.post<ShopifySetupDto>(this.url('/confirm'), {}).pipe(timeout(HTTP_TIMEOUT_MS));
  }

  tornaA(fase: 'scelte' | 'sedi'): Observable<ShopifySetupDto> {
    return this.http
      .post<ShopifySetupDto>(this.url('/back'), { fase })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  attiva(): Observable<ShopifySetupDto> {
    return this.http.post<ShopifySetupDto>(this.url('/activate'), {}).pipe(
      timeout(HTTP_TIMEOUT_MS),
      tap(() => this.connectionRefresh.notifyInvalidated()),
    );
  }

  private url(coda: string): string {
    return `${this.config.apiBaseUrl}/shopify/setup${coda}`;
  }
}
