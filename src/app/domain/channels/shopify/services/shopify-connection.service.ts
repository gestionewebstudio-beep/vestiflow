import { inject, Injectable } from '@angular/core';
import { EMPTY, expand, map, type Observable, scan, tap, timeout } from 'rxjs';

import { AuthService } from '@core/auth';
import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import type { ShopifyConnection } from '@core/models/shopify-connection.model';
import { showShopifyIntegration } from '@core/models/tenant-channel-profile.model';
import { isPlatformOperator } from '@core/permissions/platform-operator.util';
import { canManageShopifyConnection } from '@core/permissions/tenant-permissions.util';

import { shopifyConnectionFromDto } from '../models/shopify-connection.mapper';
import type { ShopifyConnectionDto } from '../models/shopify-connection.dto';
import type {
  AvanzamentoAllineamentoDto,
  PosizioneAllineamentoDto,
  ShopifyAlignBloccoDto,
  ShopifyClearErrorsDto,
  ShopifyDisableWebhooksDto,
  ShopifySyncCustomersDto,
  ShopifySyncInventoryDto,
  ShopifySyncLocationsDto,
  ShopifySyncOrdersDto,
  ShopifySyncProductsDto,
  ShopifySyncWebhooksDto,
  ShopifyWebhookCheckDto,
} from '../models/shopify-sync.dto';
import type {
  PurgeShopifyDataRequestDto,
  ShopifyShopChangePreviewDto,
  ShopifyShopChangePurgeResultDto,
} from '../models/shopify-shop-change.dto';
import { ShopifyConnectionRefreshService } from './shopify-connection-refresh.service';

const HTTP_TIMEOUT_MS = 15000;
/** Import catalogo può richiedere più chiamate Shopify per ogni prodotto. */
const SYNC_PRODUCTS_TIMEOUT_MS = 180_000;
/** Import giacenze: batch per location e varianti collegate. */
const SYNC_INVENTORY_TIMEOUT_MS = 180_000;

/**
 * Il tempo massimo di UN BLOCCO, non del controllo intero.
 *
 * ⭐ **Ogni blocco è limitato nel LAVORO** — al massimo duecento coppie
 *    esaminate e cinquanta scritte — ed è per questo che il controllo di un
 *    catalogo grande non finisce in una richiesta sola.
 *
 * ⚠️ **Ma «poche righe» non garantisce «pochi secondi»**, e non va detto: la
 *    durata dipende da quanto risponde Shopify, che da qui non si governa. Il
 *    limite serve proprio ai casi in cui il canale è lento.
 */
const ALIGN_BLOCK_TIMEOUT_MS = 120_000;
/** Import clienti/ordini: paginazione REST su tutto lo storico. */
const SYNC_CUSTOMERS_ORDERS_TIMEOUT_MS = 180_000;

/**
 * Stato connessione Shopify (read-only) + avvio OAuth lato server.
 * Nessun token nel browser: solo URL di autorizzazione e metadati pubblici.
 */
@Injectable({ providedIn: 'root' })
export class ShopifyConnectionService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);
  private readonly connectionRefresh = inject(ShopifyConnectionRefreshService);
  private readonly authService = inject(AuthService);

  getConnection(): Observable<ShopifyConnection> {
    const user = this.authService.currentUser();
    if (isPlatformOperator(user) || !canManageShopifyConnection(user)) {
      return EMPTY;
    }
    // Il profilo canale del tenant, non solo il ruolo: su un tenant «solo
    // gestionale» l'intero controller Shopify risponde 403, e questa chiamata
    // parte da mezza dozzina di schermate all'apertura. Chiederlo per poi
    // ignorare l'errore è un giro di rete sprecato e una console rossa.
    if (!showShopifyIntegration(user?.tenantChannelProfile)) {
      return EMPTY;
    }

    return this.http
      .get<ShopifyConnectionDto>(`${this.config.apiBaseUrl}/shopify/connection`)
      .pipe(timeout(HTTP_TIMEOUT_MS), map(shopifyConnectionFromDto));
  }

  beginAuth(shop: string): Observable<{ authorizeUrl: string }> {
    return this.http
      .post<{ authorizeUrl: string }>(`${this.config.apiBaseUrl}/shopify/auth/begin`, { shop })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  disconnect(): Observable<{ disconnected: true }> {
    return this.http
      .delete<{ disconnected: true }>(`${this.config.apiBaseUrl}/shopify/connection`)
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        tap(() => this.connectionRefresh.notifyInvalidated()),
      );
  }

  syncLocations(): Observable<ShopifySyncLocationsDto> {
    return this.http
      .post<ShopifySyncLocationsDto>(`${this.config.apiBaseUrl}/shopify/sync/locations`, {})
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        tap(() => this.connectionRefresh.notifyInvalidated()),
      );
  }

  syncWebhooks(): Observable<ShopifySyncWebhooksDto> {
    return this.http
      .post<ShopifySyncWebhooksDto>(`${this.config.apiBaseUrl}/shopify/sync/webhooks`, {})
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  /**
   * «Verifica ora»: chiede a Shopify quali sottoscrizioni esistono davvero.
   *
   * Non registra e non cancella niente sul negozio — a garantirlo e' il servizio lato
   * server, che non ha fra le dipendenze niente capace di farlo. Invalida la connessione
   * perche' l'esito aggiorna l'osservazione salvata, e il pannello deve rileggerla.
   */
  checkWebhooks(): Observable<ShopifyWebhookCheckDto> {
    return this.http
      .post<ShopifyWebhookCheckDto>(`${this.config.apiBaseUrl}/shopify/webhooks/check`, {})
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        tap(() => this.connectionRefresh.notifyInvalidated()),
      );
  }

  /**
   * Registra le notifiche mancanti e restituisce il referto della **rilettura**.
   *
   * Una sola chiamata di proposito: incatenarne due qui lascerebbe vivo lo stato «ho
   * registrato e non so cosa e' successo», che e' il difetto di partenza in un'altra forma.
   */
  registerMissingWebhooks(): Observable<ShopifyWebhookCheckDto> {
    return this.http
      .post<ShopifyWebhookCheckDto>(
        `${this.config.apiBaseUrl}/shopify/webhooks/register-missing`,
        {},
      )
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        tap(() => this.connectionRefresh.notifyInvalidated()),
      );
  }

  disableWebhooks(): Observable<ShopifyDisableWebhooksDto> {
    return this.http
      .post<ShopifyDisableWebhooksDto>(
        `${this.config.apiBaseUrl}/shopify/sync/webhooks/disable`,
        {},
      )
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  syncProducts(): Observable<ShopifySyncProductsDto> {
    return this.http
      .post<ShopifySyncProductsDto>(`${this.config.apiBaseUrl}/shopify/sync/products`, {})
      .pipe(timeout(SYNC_PRODUCTS_TIMEOUT_MS));
  }

  syncInventory(): Observable<ShopifySyncInventoryDto> {
    return this.http
      .post<ShopifySyncInventoryDto>(`${this.config.apiBaseUrl}/shopify/sync/inventory`, {})
      .pipe(timeout(SYNC_INVENTORY_TIMEOUT_MS));
  }

  /**
   * ALLINEA LE DISPONIBILITÀ: una pressione, un controllo COMPLETO.
   *
   * ⭐ **Il gesto è uno solo.** Chi preme non deve premere di nuovo per
   *    proseguire: qui i blocchi si incatenano da soli seguendo `prossimo`,
   *    finché il server non dice `fine`.
   *
   * ⭐ **Emette dopo OGNI blocco**, così l’avanzamento si vede mentre va, e
   *    l’elenco delle non allineate si accumula senza perdere niente: ogni
   *    coppia è esaminata una volta sola in tutto il giro.
   *
   * ⛔ **Se la catena si interrompe, `completo` resta falso.** Non si dichiara
   *    concluso ciò che non lo è, e l’elenco parziale non va mostrato come
   *    finale. Una pressione nuova riparte dal principio: è il comportamento
   *    voluto, non uno spreco.
   */
  allineaDisponibilita(): Observable<AvanzamentoAllineamentoDto> {
    const blocco = (prossimo: PosizioneAllineamentoDto | null) =>
      this.http
        .post<ShopifyAlignBloccoDto>(`${this.config.apiBaseUrl}/shopify/sync/inventory/align`, {
          prossimo,
        })
        .pipe(timeout(ALIGN_BLOCK_TIMEOUT_MS));

    const inizio: AvanzamentoAllineamentoDto = {
      totale: 0,
      esaminate: 0,
      allineate: 0,
      giaAllineate: 0,
      nonAllineate: [],
      completo: false,
    };

    return blocco(null).pipe(
      expand((risposta) => (risposta.fine ? EMPTY : blocco(risposta.prossimo))),
      scan(
        (finora, risposta) => ({
          totale: risposta.totale,
          esaminate: finora.esaminate + risposta.esaminate,
          allineate: finora.allineate + risposta.allineate,
          giaAllineate: finora.giaAllineate + risposta.giaAllineate,
          nonAllineate: [...finora.nonAllineate, ...risposta.nonAllineate],
          // ⛔ Lo dice il SERVER, e solo per il blocco che ha appena chiuso
          //    il perimetro: non si deduce dal fatto che la catena si è fermata.
          completo: risposta.fine,
        }),
        inizio,
      ),
    );
  }

  syncCustomers(): Observable<ShopifySyncCustomersDto> {
    return this.http
      .post<ShopifySyncCustomersDto>(`${this.config.apiBaseUrl}/shopify/sync/customers`, {})
      .pipe(timeout(SYNC_CUSTOMERS_ORDERS_TIMEOUT_MS));
  }

  syncOrders(): Observable<ShopifySyncOrdersDto> {
    return this.http
      .post<ShopifySyncOrdersDto>(`${this.config.apiBaseUrl}/shopify/sync/orders`, {})
      .pipe(timeout(SYNC_CUSTOMERS_ORDERS_TIMEOUT_MS));
  }

  clearErrors(): Observable<ShopifyClearErrorsDto> {
    return this.http
      .post<ShopifyClearErrorsDto>(`${this.config.apiBaseUrl}/shopify/connection/clear-errors`, {})
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  previewShopChange(): Observable<ShopifyShopChangePreviewDto> {
    return this.http
      .get<ShopifyShopChangePreviewDto>(`${this.config.apiBaseUrl}/shopify/shop-change/preview`)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  purgeShopifyData(body: PurgeShopifyDataRequestDto): Observable<ShopifyShopChangePurgeResultDto> {
    return this.http
      .post<ShopifyShopChangePurgeResultDto>(
        `${this.config.apiBaseUrl}/shopify/shop-change/purge`,
        body,
      )
      .pipe(
        timeout(SYNC_PRODUCTS_TIMEOUT_MS),
        tap(() => this.connectionRefresh.notifyInvalidated()),
      );
  }
}
